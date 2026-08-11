import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AuditLogService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(opts: { module?: string; userId?: string; page?: number; pageSize?: number }) {
    const page = Math.max(1, opts.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, opts.pageSize ?? 30));
    const where: Prisma.AuditLogWhereInput = {};
    if (opts.module) where.module = opts.module;
    if (opts.userId) where.userId = opts.userId;

    const [items, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({
        where,
        include: { user: { select: { id: true, name: true, email: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return { items, total, page, pageSize };
  }

  /**
   * Buat audit log entry. Dipakai oleh service lain (Pendaftar, Jurusan,
   * Gelombang, dll) untuk mencatat aksi sensitif.
   */
  async create(opts: {
    userId?: string | null;
    action: string;
    module: string;
    entityType?: string;
    entityId?: string;
    ipAddress?: string;
    userAgent?: string;
    meta?: any;
  }) {
    return this.prisma.auditLog.create({
      data: {
        userId: opts.userId ?? null,
        action: opts.action,
        module: opts.module,
        entityType: opts.entityType,
        entityId: opts.entityId,
        ipAddress: opts.ipAddress,
        userAgent: opts.userAgent,
        meta: opts.meta ?? undefined,
      },
    });
  }
}
