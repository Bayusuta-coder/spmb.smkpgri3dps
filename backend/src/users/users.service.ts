import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { normalizePhoneNumber } from '../whatsapp/whatsapp.util';

const SUPERADMIN_ROLE_NAME = 'Superadmin';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogService,
  ) {}

  /**
   * Hitung jumlah Superadmin AKTIF. Dipakai oleh guard agar minimal 1
   * Superadmin selalu tersisa di sistem (mencegah lock-out total).
   */
  private async countActiveSuperadmins(excludeUserId?: string): Promise<number> {
    return this.prisma.user.count({
      where: {
        isActive: true,
        roles: { some: { role: { name: SUPERADMIN_ROLE_NAME } } },
        ...(excludeUserId ? { id: { not: excludeUserId } } : {}),
      },
    });
  }

  /**
   * Cek apakah user (by id) punya role Superadmin.
   */
  private async isSuperadmin(userId: string): Promise<boolean> {
    const u = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { roles: { include: { role: true } } },
    });
    return !!u?.roles.some((r) => r.role.name === SUPERADMIN_ROLE_NAME);
  }

  async findOne(id: string) {
    const u = await this.prisma.user.findUnique({
      where: { id },
      include: { roles: { include: { role: true } } },
    });
    if (!u) throw new NotFoundException('User tidak ditemukan');
    return {
      id: u.id,
      email: u.email,
      name: u.name,
      isActive: u.isActive,
      roles: u.roles.map((r) => ({ id: r.role.id, name: r.role.name })),
      whatsappNumber: u.whatsappNumber ?? null,
      whatsappVerifiedAt: u.whatsappVerifiedAt ?? null,
      createdAt: u.createdAt,
      updatedAt: u.updatedAt,
    };
  }

  async findAll(opts: { search?: string; roleId?: string; isActive?: boolean; page?: number; pageSize?: number }) {
    const page = Math.max(1, opts.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, opts.pageSize ?? 20));
    const where: any = {};
    if (opts.search) {
      where.OR = [
        { email: { contains: opts.search, mode: 'insensitive' } },
        { name: { contains: opts.search, mode: 'insensitive' } },
      ];
    }
    if (typeof opts.isActive === 'boolean') where.isActive = opts.isActive;
    if (opts.roleId) where.roles = { some: { roleId: opts.roleId } };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        include: { roles: { include: { role: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      items: items.map((u) => ({
        id: u.id,
        email: u.email,
        name: u.name,
        isActive: u.isActive,
        roles: u.roles.map((r) => ({ id: r.role.id, name: r.role.name })),
        whatsappNumber: u.whatsappNumber ?? null,
        whatsappVerifiedAt: u.whatsappVerifiedAt ?? null,
        createdAt: u.createdAt,
      })),
      total,
      page,
      pageSize,
    };
  }

  async create(opts: {
    email: string;
    name: string;
    password: string;
    roleIds: string[];
    whatsappNumber?: string;
  }) {
    const exists = await this.prisma.user.findUnique({ where: { email: opts.email } });
    if (exists) throw new ConflictException('Email sudah digunakan');

    const hashed = await bcrypt.hash(opts.password, 12);

    // Normalisasi WhatsApp number kalau di-set. User baru BOLEH dibuat tanpa
    // nomor (untuk Bendahara/TU yang tidak menerima laporan) — status akan
    // null (belum terverifikasi) sampai mereka tambahkan & verifikasi.
    let normalizedWhatsapp: string | null = null;
    if (opts.whatsappNumber) {
      const norm = normalizePhoneNumber(opts.whatsappNumber);
      if (!norm.ok) throw new ConflictException(`Nomor WhatsApp tidak valid: ${norm.error}`);
      normalizedWhatsapp = norm.normalized!;
    }

    const user = await this.prisma.user.create({
      data: {
        email: opts.email,
        name: opts.name,
        password: hashed,
        whatsappNumber: normalizedWhatsapp,
        whatsappVerifiedAt: null, // selalu null saat create; user harus verify manual
        roles: {
          create: opts.roleIds.map((roleId) => ({ roleId })),
        },
      },
      include: { roles: { include: { role: true } } },
    });

    // Audit log: user.created
    await this.audit.create({
      action: 'user.created',
      module: 'users',
      entityType: 'User',
      entityId: user.id,
      meta: {
        email: user.email,
        name: user.name,
        roles: user.roles.map((r) => r.role.name),
        whatsappNumber: user.whatsappNumber ? '<set>' : null,
      },
    });

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      isActive: user.isActive,
      roles: user.roles.map((r) => ({ id: r.role.id, name: r.role.name })),
      whatsappNumber: user.whatsappNumber,
      whatsappVerifiedAt: user.whatsappVerifiedAt,
    };
  }

  async update(
    id: string,
    opts: {
      name?: string;
      email?: string;
      isActive?: boolean;
      roleIds?: string[];
      whatsappNumber?: string;
    },
    actor: { userId: string; ipAddress?: string; userAgent?: string },
  ) {
    // Ambil state sebelum (untuk audit diff + last-superadmin guard).
    const before = await this.prisma.user.findUnique({
      where: { id },
      include: { roles: { include: { role: true } } },
    });
    if (!before) throw new NotFoundException('User tidak ditemukan');

    const beforeRoles = before.roles.map((r) => r.role.name);
    const wasSuperadmin = beforeRoles.includes(SUPERADMIN_ROLE_NAME);

    // Email uniqueness check kalau email di-set & berbeda dari existing.
    if (opts.email !== undefined && opts.email !== before.email) {
      const dup = await this.prisma.user.findUnique({ where: { email: opts.email } });
      if (dup) throw new ConflictException('Email sudah digunakan user lain');
    }

    // Normalisasi & auto-reset verified kalau nomor berubah dari existing.
    let normalizedWhatsapp: string | null | undefined = undefined;
    let whatsappChanged = false;
    if (opts.whatsappNumber !== undefined) {
      if (opts.whatsappNumber === '') {
        // Empty string → admin mau clear nomor
        normalizedWhatsapp = null;
      } else {
        const norm = normalizePhoneNumber(opts.whatsappNumber);
        if (!norm.ok) throw new ConflictException(`Nomor WhatsApp tidak valid: ${norm.error}`);
        normalizedWhatsapp = norm.normalized!;
      }
      // Reset verified kalau nomor berubah dari nilai existing
      if (normalizedWhatsapp !== before.whatsappNumber) {
        whatsappChanged = true;
      }
    }

    // Last-Superadmin guard: kalau user ini Superadmin & operasi akan
    // mengurangi jumlah Superadmin aktif (deactivate, atau role berubah
    // sampai tidak punya Superadmin lagi), harus ada Superadmin AKTIF lain
    // yang tersisa.
    if (wasSuperadmin) {
      const willBeDeactivated =
        opts.isActive === false && before.isActive === true;
      const willLoseSuperadminRole =
        opts.roleIds !== undefined &&
        !before.roles
          .filter((r) => r.role.name === SUPERADMIN_ROLE_NAME)
          .some((r) => opts.roleIds!.includes(r.role.id));
      if (willBeDeactivated || willLoseSuperadminRole) {
        const remaining = await this.countActiveSuperadmins(id);
        if (remaining < 1) {
          throw new ForbiddenException(
            'Tidak dapat menonaktifkan/mengubah role Superadmin terakhir. ' +
              'Minimal harus ada 1 akun Superadmin aktif di sistem.',
          );
        }
      }
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const updateData: any = {
        ...(opts.name !== undefined ? { name: opts.name } : {}),
        ...(opts.email !== undefined ? { email: opts.email } : {}),
        ...(opts.isActive !== undefined ? { isActive: opts.isActive } : {}),
      };
      if (normalizedWhatsapp !== undefined) {
        updateData.whatsappNumber = normalizedWhatsapp;
        // Reset verifikasi kalau nomor berubah (sesuai spec user point 1)
        if (whatsappChanged) {
          updateData.whatsappVerifiedAt = null;
        }
      }

      await tx.user.update({ where: { id }, data: updateData });

      // Cancel OTP lama kalau nomor berubah — supaya OTP lama untuk nomor
      // lama tidak bisa dipakai oleh attacker (kalau ada)
      if (whatsappChanged) {
        await tx.whatsAppOtp.updateMany({
          where: { userId: id, status: 'pending' },
          data: { status: 'cancelled', cancelledAt: new Date() },
        });
      }

      if (opts.roleIds) {
        await tx.userRole.deleteMany({ where: { userId: id } });
        if (opts.roleIds.length) {
          await tx.userRole.createMany({
            data: opts.roleIds.map((roleId) => ({ userId: id, roleId })),
          });
        }
      }
      const user = await tx.user.findUnique({
        where: { id },
        include: { roles: { include: { role: true } } },
      });
      return user;
    });

    // Audit log: user.updated dengan before/after diff
    const afterRoles = result!.roles.map((r) => r.role.name);
    const changes: Record<string, { before: any; after: any }> = {};
    if (opts.name !== undefined && opts.name !== before.name) {
      changes.name = { before: before.name, after: opts.name };
    }
    if (opts.email !== undefined && opts.email !== before.email) {
      changes.email = { before: before.email, after: opts.email };
    }
    if (opts.isActive !== undefined && opts.isActive !== before.isActive) {
      changes.isActive = { before: before.isActive, after: opts.isActive };
    }
    if (opts.roleIds !== undefined) {
      const sortedBefore = [...beforeRoles].sort().join(',');
      const sortedAfter = [...afterRoles].sort().join(',');
      if (sortedBefore !== sortedAfter) {
        changes.roles = { before: beforeRoles, after: afterRoles };
      }
    }
    if (whatsappChanged) {
      changes.whatsappNumber = {
        before: maskPhoneNumber(before.whatsappNumber),
        after: normalizedWhatsapp ? maskPhoneNumber(normalizedWhatsapp) : null,
      };
    }
    if (Object.keys(changes).length > 0) {
      await this.audit.create({
        userId: actor.userId,
        action: 'user.updated',
        module: 'users',
        entityType: 'User',
        entityId: id,
        ipAddress: actor.ipAddress,
        userAgent: actor.userAgent,
        meta: {
          targetEmail: before.email,
          targetName: before.name,
          changes,
        },
      });
    }

    return {
      id: result!.id,
      email: result!.email,
      name: result!.name,
      isActive: result!.isActive,
      roles: result!.roles.map((r) => ({ id: r.role.id, name: r.role.name })),
      whatsappNumber: result!.whatsappNumber,
      whatsappVerifiedAt: result!.whatsappVerifiedAt,
      whatsappNumberChanged: whatsappChanged,
    };
  }

  async resetPassword(
    id: string,
    newPassword: string,
    actor: { userId: string; ipAddress?: string; userAgent?: string },
  ) {
    const exists = await this.prisma.user.findUnique({ where: { id } });
    if (!exists) throw new NotFoundException('User tidak ditemukan');
    const hashed = await bcrypt.hash(newPassword, 12);
    await this.prisma.user.update({ where: { id }, data: { password: hashed } });
    // Audit log: user.password_reset
    await this.audit.create({
      userId: actor.userId,
      action: 'user.password_reset',
      module: 'users',
      entityType: 'User',
      entityId: id,
      ipAddress: actor.ipAddress,
      userAgent: actor.userAgent,
      meta: {
        targetEmail: exists.email,
        targetName: exists.name,
      },
    });
    return { ok: true };
  }

  async remove(
    id: string,
    actor: { userId: string; ipAddress?: string; userAgent?: string },
  ) {
    const exists = await this.prisma.user.findUnique({
      where: { id },
      include: { roles: { include: { role: true } } },
    });
    if (!exists) throw new NotFoundException('User tidak ditemukan');

    // Last-Superadmin guard: tidak boleh hard-delete Superadmin terakhir.
    if (exists.isActive) {
      const isSuperadmin = exists.roles.some(
        (r) => r.role.name === SUPERADMIN_ROLE_NAME,
      );
      if (isSuperadmin) {
        const remaining = await this.countActiveSuperadmins(id);
        if (remaining < 1) {
          throw new ForbiddenException(
            'Tidak dapat menghapus Superadmin terakhir. ' +
              'Minimal harus ada 1 akun Superadmin aktif di sistem.',
          );
        }
      }
    }

    // Snapshot target user (nama/email) sebelum dihapus — masuk ke audit log
    // supaya ada jejak siapa yang dihapus walaupun row User hilang. Karena
    // semua FK User di tabel lain sudah ON DELETE SET NULL + sudah punya
    // snapshot nama/email, history transaksi/log/pendaftar tetap readable.
    const targetSnapshot = {
      targetEmail: exists.email,
      targetName: exists.name,
      roles: exists.roles.map((r) => r.role.name),
      whatsappNumber: exists.whatsappNumber
        ? maskPhoneNumber(exists.whatsappNumber)
        : null,
    };

    // Audit log DITULIS DULU sebelum delete — karena FK ke audit_logs.userId
    // sudah SetNull, audit log akan kehilangan relasi tapi snapshot text
    // `userName`/`userEmail` (di-set oleh AuditLogService) tetap readable.
    await this.audit.create({
      userId: actor.userId,
      action: 'user.deleted',
      module: 'users',
      entityType: 'User',
      entityId: id,
      ipAddress: actor.ipAddress,
      userAgent: actor.userAgent,
      meta: {
        ...targetSnapshot,
        reason: 'hard delete via admin',
        note: 'Riwayat aktivitas (transaksi, audit log, snapshot pendaftar) tetap tersimpan. ' +
              'FK ke user ini di-set NULL, tapi snapshot nama/email sudah tertulis di tiap row terkait.',
      },
    });

    // Hard delete. Cascade otomatis untuk:
    //   - UserRole (CASCADE)
    //   - WhatsAppOtp (CASCADE)
    // SetNull untuk relasi lain (Pendaftar.verifiedBy/dll, AuditLog.userId,
    //   Jurusan.deletedByUserId, Berita/Pengumuman.createdByUserId,
    //   Setting.updatedByUserId) — snapshot text sudah menghandle data integrity.
    await this.prisma.user.delete({ where: { id } });

    return { ok: true, deletedEmail: exists.email, deletedName: exists.name };
  }
}

/**
 * Mask nomor telepon untuk audit log (privacy). Kalau null → null.
 * Pakai 3-char prefix + 5 asterisk + 3-char suffix sama dengan whatsapp.util.maskPhone.
 */
function maskPhoneNumber(p: string | null): string | null {
  if (!p) return null;
  if (p.length <= 8) return '***';
  return `${p.slice(0, 4)}*****${p.slice(-3)}`;
}