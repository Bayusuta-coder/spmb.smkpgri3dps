import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from '../audit-log/audit-log.service';

@Injectable()
export class JurusanService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogService,
  ) {}

  /**
   * findAll default mengecualikan jurusan yang sudah di-soft-delete.
   * Pakai includeDeleted=true untuk melihat termasuk yang sudah dihapus.
   */
  async findAll(opts: { activeOnly?: boolean; includeDeleted?: boolean } = {}) {
    const where: Prisma.JurusanWhereInput = {};
    if (!opts.includeDeleted) where.deletedAt = null;
    if (opts.activeOnly) where.isActive = true;
    return this.prisma.jurusan.findMany({
      where,
      orderBy: { code: 'asc' },
    });
  }

  async findOne(id: string) {
    const j = await this.prisma.jurusan.findUnique({ where: { id } });
    if (!j) throw new NotFoundException('Jurusan tidak ditemukan');
    return j;
  }

  async create(opts: { code: string; name: string }, actorUserId: string) {
    const exists = await this.prisma.jurusan.findUnique({ where: { code: opts.code } });
    if (exists) throw new ConflictException('Kode jurusan sudah digunakan');
    const created = await this.prisma.jurusan.create({ data: { ...opts, isActive: true } });

    await this.audit.create({
      userId: actorUserId,
      action: 'jurusan.created',
      module: 'jurusan',
      entityType: 'Jurusan',
      entityId: created.id,
      meta: { code: created.code, name: created.name },
    }).catch(() => null);

    return created;
  }

  async update(
    id: string,
    opts: { code?: string; name?: string; isActive?: boolean },
    actorUserId?: string,
  ) {
    const before = await this.prisma.jurusan.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('Jurusan tidak ditemukan');
    const updated = await this.prisma.jurusan.update({ where: { id }, data: opts });

    await this.audit.create({
      userId: actorUserId ?? null,
      action: 'jurusan.updated',
      module: 'jurusan',
      entityType: 'Jurusan',
      entityId: updated.id,
      meta: {
        before: { code: before.code, name: before.name, isActive: before.isActive },
        after: { code: updated.code, name: updated.name, isActive: updated.isActive },
      },
    }).catch(() => null);

    return updated;
  }

  /**
   * Soft delete: Jurusan yang pernah dipilih pendaftar tidak boleh hilang
   * dari DB karena foreign key. Kita set deletedAt + deletedByUserId, dan
   * sembunyikan dari list default.
   */
  async remove(id: string, actorUserId: string) {
    const before = await this.prisma.jurusan.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('Jurusan tidak ditemukan');
    if (before.deletedAt) {
      throw new BadRequestException('Jurusan ini sudah dihapus sebelumnya');
    }

    const used = await this.prisma.pendaftar.count({
      where: { jurusanId: id, status: { not: 'DITOLAK' } },
    });

    const updated = await this.prisma.jurusan.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        deletedByUserId: actorUserId,
        isActive: false,
      },
    });

    await this.audit.create({
      userId: actorUserId,
      action: 'jurusan.deleted',
      module: 'jurusan',
      entityType: 'Jurusan',
      entityId: updated.id,
      meta: {
        code: before.code,
        name: before.name,
        pendaftarCount: used,
        note: 'Soft delete. Data pendaftar yang terlanjur memilih jurusan ini tetap tersimpan.',
      },
    }).catch(() => null);

    return { ...updated, pendaftarCount: used };
  }

  /**
   * Restore soft-deleted jurusan (untuk recovery).
   */
  async restore(id: string, actorUserId: string) {
    const before = await this.prisma.jurusan.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('Jurusan tidak ditemukan');
    if (!before.deletedAt) {
      throw new BadRequestException('Jurusan ini belum dihapus');
    }
    const updated = await this.prisma.jurusan.update({
      where: { id },
      data: { deletedAt: null, deletedByUserId: null, isActive: true },
    });

    await this.audit.create({
      userId: actorUserId,
      action: 'jurusan.restored',
      module: 'jurusan',
      entityType: 'Jurusan',
      entityId: updated.id,
      meta: { code: before.code, name: before.name },
    }).catch(() => null);

    return updated;
  }
}
