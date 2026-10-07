import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { JwtUserPayload } from '../common/decorators/current-user.decorator';

/**
 * IP + UA helper — mirror dari auth.controller.ts supaya audit log
 * permission change tercatat dengan konteks request yang sama.
 */
function reqMeta(req?: Request) {
  if (!req) return { ipAddress: undefined, userAgent: undefined };
  const ip =
    (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() ||
    req.ip ||
    req.socket?.remoteAddress ||
    undefined;
  const ua = (req.headers['user-agent'] as string | undefined) || undefined;
  return { ipAddress: ip, userAgent: ua };
}

@Injectable()
export class RolesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogService,
  ) {}

  /**
   * List semua role + permission mereka.
   *
   * Response shape (F5 — explicit true/false untuk SEMUA permission code):
   *   - `permissions`: array permission yang role punya (untuk display ringkas).
   *   - `permissionCodes`: array code permission yang role punya (kompatibel).
   *   - `permissionMatrix`: object `{ [code]: boolean }` yang memuat SETIAP
   *     permission code yang ada di tabel permission, dengan value `true`/
   *     `false` eksplisit. Tidak ada key yang di-omit untuk value `false` —
   *     supaya debug lebih mudah dan FE bisa cross-check langsung.
   *
   *   Performance: 1 query untuk roles + permissions + _count users, 1 query
   *   untuk semua permission (untuk baseline matrix). Bisa di-cache kalau
   *   trafik tinggi, tapi saat ini skala rendah jadi OK.
   */
  async findAll() {
    const [roles, allPerms] = await Promise.all([
      this.prisma.role.findMany({
        orderBy: { name: 'asc' },
        include: {
          permissions: { include: { permission: true } },
          _count: { select: { users: true } },
        },
      }),
      this.prisma.permission.findMany({ select: { code: true } }),
    ]);

    // Set semua permission code untuk baseline matrix
    const allCodes = allPerms.map((p) => p.code).sort();

    return roles.map((r) => {
      const grantedCodes = new Set(r.permissions.map((rp) => rp.permission.code));
      // Bangun matrix explicit true/false untuk SEMUA code
      const permissionMatrix: Record<string, boolean> = {};
      for (const code of allCodes) {
        permissionMatrix[code] = grantedCodes.has(code);
      }
      return {
        id: r.id,
        name: r.name,
        description: r.description,
        isSystem: r.isSystem,
        userCount: r._count.users,
        permissions: r.permissions.map((rp) => ({
          id: rp.permission.id,
          code: rp.permission.code,
          module: rp.permission.module,
          action: rp.permission.action,
          description: rp.permission.description,
        })),
        // F5: explicit permissionCodes (true) + permissionMatrix (true/false semua)
        permissionCodes: Array.from(grantedCodes).sort(),
        permissionMatrix,
        createdAt: r.createdAt,
      };
    });
  }

  async findOne(id: string) {
    const r = await this.prisma.role.findUnique({
      where: { id },
      include: { permissions: { include: { permission: true } } },
    });
    if (!r) throw new NotFoundException('Role tidak ditemukan');
    return r;
  }

  async create(
    opts: { name: string; description?: string; permissionIds: string[] },
    actor: JwtUserPayload,
    req?: Request,
  ) {
    const exists = await this.prisma.role.findUnique({ where: { name: opts.name } });
    if (exists) throw new ConflictException('Nama role sudah digunakan');

    const role = await this.prisma.role.create({
      data: {
        name: opts.name,
        description: opts.description,
        permissions: {
          create: opts.permissionIds.map((permissionId) => ({ permissionId })),
        },
      },
      include: { permissions: { include: { permission: true } } },
    });

    // Audit log — role baru dibuat. Permission yang terpasang ikut dicatat
    // supaya forensik jelas tanpa harus join ke tabel lain.
    await this.audit.create({
      userId: actor.sub,
      action: 'role.created',
      module: 'role',
      entityType: 'Role',
      entityId: role.id,
      ...reqMeta(req),
      meta: {
        name: role.name,
        description: role.description,
        permissionIds: opts.permissionIds,
      },
    });

    return role;
  }

  async update(
    id: string,
    opts: { name?: string; description?: string; permissionIds?: string[] },
    actor: JwtUserPayload,
    req?: Request,
  ) {
    const existing = await this.prisma.role.findUnique({
      where: { id },
      include: { permissions: { include: { permission: true } } },
    });
    if (!existing) throw new NotFoundException('Role tidak ditemukan');
    if (existing.isSystem && opts.name && opts.name !== existing.name) {
      throw new BadRequestException('Role sistem tidak boleh diubah namanya');
    }

    // Snapshot BEFORE permission set (untuk audit diff)
    const beforePermIds = existing.permissions.map((p) => p.permissionId);
    const beforePermCodes = existing.permissions.map((p) => p.permission.code).sort();

    const result = await this.prisma.$transaction(async (tx) => {
      await tx.role.update({
        where: { id },
        data: {
          ...(opts.name !== undefined ? { name: opts.name } : {}),
          ...(opts.description !== undefined ? { description: opts.description } : {}),
        },
      });
      if (opts.permissionIds) {
        await tx.rolePermission.deleteMany({ where: { roleId: id } });
        if (opts.permissionIds.length) {
          await tx.rolePermission.createMany({
            data: opts.permissionIds.map((permissionId) => ({ roleId: id, permissionId })),
          });
        }
      }
      return tx.role.findUnique({
        where: { id },
        include: { permissions: { include: { permission: true } } },
      });
    });

    // Audit diff — kalau ada perubahan permission, catat kode permission
    // yang ditambah/dihapus supaya admin bisa lihat history tanpa query DB.
    if (opts.permissionIds) {
      const afterPermIds = (result?.permissions || []).map((p) => p.permissionId);
      const afterPermCodes = (result?.permissions || [])
        .map((p) => p.permission.code)
        .sort();

      const beforeSet = new Set(beforePermCodes);
      const afterSet = new Set(afterPermCodes);
      const added = afterPermCodes.filter((c) => !beforeSet.has(c));
      const removed = beforePermCodes.filter((c) => !afterSet.has(c));

      // Hanya log kalau ada perubahan (skip no-op save)
      if (added.length > 0 || removed.length > 0) {
        await this.audit.create({
          userId: actor.sub,
          action: 'role.permissions_updated',
          module: 'role',
          entityType: 'Role',
          entityId: id,
          ...reqMeta(req),
          meta: {
            roleName: result?.name,
            before: { permissionIds: beforePermIds, permissionCodes: beforePermCodes },
            after: { permissionIds: afterPermIds, permissionCodes: afterPermCodes },
            addedPermissionCodes: added,
            removedPermissionCodes: removed,
          },
        });
      }
    }

    return result;
  }

  async remove(id: string, actor: JwtUserPayload, req?: Request) {
    const existing = await this.prisma.role.findUnique({
      where: { id },
      include: {
        _count: { select: { users: true } },
        permissions: { include: { permission: true } },
      },
    });
    if (!existing) throw new NotFoundException('Role tidak ditemukan');
    if (existing.isSystem) {
      throw new BadRequestException('Role sistem tidak boleh dihapus');
    }
    if (existing._count.users > 0) {
      throw new BadRequestException(
        `Role masih dipakai oleh ${existing._count.users} user. Pindahkan user terlebih dahulu.`,
      );
    }

    // Audit log snapshot — supaya forensik tahu permission apa saja yang
    // ikut hilang saat role dihapus.
    await this.audit.create({
      userId: actor.sub,
      action: 'role.deleted',
      module: 'role',
      entityType: 'Role',
      entityId: id,
      ...reqMeta(req),
      meta: {
        name: existing.name,
        description: existing.description,
        permissionCodes: existing.permissions.map((p) => p.permission.code),
      },
    });

    return this.prisma.role.delete({ where: { id } });
  }
}
