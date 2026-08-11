import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from '../audit-log/audit-log.service';

@Injectable()
export class PengumumanService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogService,
  ) {}

  async findAllForAdmin(opts: {
    search?: string;
    aktif?: boolean;
    includeDeleted?: boolean;
    page?: number;
    pageSize?: number;
  }) {
    const page = Math.max(1, opts.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, opts.pageSize ?? 20));
    const where: Prisma.PengumumanWhereInput = {};
    if (!opts.includeDeleted) where.deletedAt = null;
    if (typeof opts.aktif === 'boolean') where.aktif = opts.aktif;
    if (opts.search) {
      where.judul = { contains: opts.search, mode: 'insensitive' };
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.pengumuman.findMany({
        where,
        include: { createdBy: { select: { id: true, name: true, email: true } } },
        orderBy: [{ urutan: 'asc' }, { createdAt: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.pengumuman.count({ where }),
    ]);
    return { items, total, page, pageSize };
  }

  /**
   * Public — hanya yang aktif. Tidak ada pagination supaya popup bisa
   * carousel semua sekaligus. Kalau lebih dari ~5, frontend pilih.
   */
  async findActive() {
    return this.prisma.pengumuman.findMany({
      where: { aktif: true, deletedAt: null },
      orderBy: [{ urutan: 'asc' }, { createdAt: 'desc' }],
      select: {
        id: true,
        judul: true,
        foto: true,
        urutan: true,
        createdAt: true,
      },
    });
  }

  async findOne(id: string) {
    const p = await this.prisma.pengumuman.findUnique({
      where: { id },
      include: { createdBy: { select: { id: true, name: true, email: true } } },
    });
    if (!p) throw new NotFoundException('Pengumuman tidak ditemukan');
    return p;
  }

  async create(
    opts: {
      judul: string;
      foto: string;
      aktif?: boolean;
      urutan?: number;
    },
    actorUserId: string,
  ) {
    if (!opts.judul?.trim()) throw new BadRequestException('Judul wajib diisi');
    if (!opts.foto?.trim()) throw new BadRequestException('Foto wajib diisi');

    const created = await this.prisma.pengumuman.create({
      data: {
        judul: opts.judul.trim(),
        foto: opts.foto,
        aktif: opts.aktif ?? true,
        urutan: opts.urutan ?? 0,
        createdByUserId: actorUserId,
      },
    });

    await this.audit.create({
      userId: actorUserId,
      action: 'pengumuman.created',
      module: 'pengumuman',
      entityType: 'Pengumuman',
      entityId: created.id,
      meta: { judul: created.judul, aktif: created.aktif, urutan: created.urutan },
    }).catch(() => null);

    return created;
  }

  async update(
    id: string,
    opts: { judul?: string; foto?: string; aktif?: boolean; urutan?: number },
    actorUserId: string,
  ) {
    const before = await this.prisma.pengumuman.findUnique({ where: { id } });
    if (!before || before.deletedAt) {
      throw new NotFoundException('Pengumuman tidak ditemukan');
    }
    const updated = await this.prisma.pengumuman.update({ where: { id }, data: opts });

    await this.audit.create({
      userId: actorUserId,
      action: 'pengumuman.updated',
      module: 'pengumuman',
      entityType: 'Pengumuman',
      entityId: updated.id,
      meta: {
        before: { judul: before.judul, aktif: before.aktif, urutan: before.urutan },
        after: { judul: updated.judul, aktif: updated.aktif, urutan: updated.urutan },
      },
    }).catch(() => null);

    return updated;
  }

  async remove(id: string, actorUserId: string) {
    const before = await this.prisma.pengumuman.findUnique({ where: { id } });
    if (!before || before.deletedAt) {
      throw new NotFoundException('Pengumuman tidak ditemukan');
    }
    const updated = await this.prisma.pengumuman.update({
      where: { id },
      data: { deletedAt: new Date(), aktif: false },
    });
    await this.audit.create({
      userId: actorUserId,
      action: 'pengumuman.deleted',
      module: 'pengumuman',
      entityType: 'Pengumuman',
      entityId: updated.id,
      meta: { judul: before.judul },
    }).catch(() => null);
    return updated;
  }

  async restore(id: string, actorUserId: string) {
    const before = await this.prisma.pengumuman.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('Pengumuman tidak ditemukan');
    if (!before.deletedAt) {
      throw new BadRequestException('Pengumuman ini belum dihapus');
    }
    const updated = await this.prisma.pengumuman.update({
      where: { id },
      data: { deletedAt: null },
    });
    await this.audit.create({
      userId: actorUserId,
      action: 'pengumuman.restored',
      module: 'pengumuman',
      entityType: 'Pengumuman',
      entityId: updated.id,
      meta: { judul: before.judul },
    }).catch(() => null);
    return updated;
  }
}
