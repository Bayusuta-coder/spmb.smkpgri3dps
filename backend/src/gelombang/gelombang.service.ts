import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from '../audit-log/audit-log.service';

@Injectable()
export class GelombangService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogService,
  ) {}

  /**
   * Kembalikan gelombang yang sedang AKTIF untuk publik.
   */
  async getActive() {
    const all = await this.prisma.gelombang.findMany({
      where: { isActive: true },
      include: {
        kuota: {
          include: { jurusan: { select: { id: true, code: true, name: true, deletedAt: true } } },
        },
      },
      orderBy: { startDate: 'asc' },
    });

    const now = new Date();
    for (const g of all) {
      if (g.startDate > now) continue;
      if (g.endDate && g.endDate < now) continue;

      // Hanya hitung kuota untuk jurusan yang masih aktif
      const activeJurusanIds = g.kuota
        .filter((k) => !k.jurusan.deletedAt && k.jurusan.deletedAt === null)
        .map((k) => k.jurusanId);

      const used = await this.prisma.pendaftar.groupBy({
        by: ['jurusanId'],
        where: {
          gelombangId: g.id,
          status: { not: 'DITOLAK' },
          jurusanId: { in: activeJurusanIds },
        },
        _count: { _all: true },
      });
      const usedMap = new Map(used.map((u) => [u.jurusanId, u._count._all]));

      const details = g.kuota
        .filter((k) => !k.jurusan.deletedAt)
        .map((k) => {
          const u = usedMap.get(k.jurusanId) || 0;
          return {
            jurusanId: k.jurusanId,
            jurusanCode: k.jurusan.code,
            jurusanName: k.jurusan.name,
            quota: k.quota,
            used: u,
            remaining: Math.max(0, k.quota - u),
          };
        });

      if (details.length === 0) continue;
      const isFull = details.every((d) => d.remaining === 0);
      if (isFull) continue;

      return {
        id: g.id,
        name: g.name,
        startDate: g.startDate,
        endDate: g.endDate,
        tanggalDaftarUlang: g.tanggalDaftarUlang,
        jamDaftarUlang: g.jamDaftarUlang,
        details,
      };
    }
    return null;
  }

  async findAll(opts: { activeOnly?: boolean } = {}) {
    const list = await this.prisma.gelombang.findMany({
      where: opts.activeOnly ? { isActive: true } : undefined,
      include: { kuota: { include: { jurusan: true } } },
      orderBy: { startDate: 'desc' },
    });

    const usedByGelombang = await this.prisma.pendaftar.groupBy({
      by: ['gelombangId', 'jurusanId'],
      where: { status: { not: 'DITOLAK' } },
      _count: { _all: true },
    });
    const usedMap = new Map<string, number>();
    for (const u of usedByGelombang) {
      const key = `${u.gelombangId}__${u.jurusanId}`;
      usedMap.set(key, u._count._all);
    }

    return list.map((g) => ({
      id: g.id,
      name: g.name,
      startDate: g.startDate,
      endDate: g.endDate,
      isActive: g.isActive,
      tanggalDaftarUlang: g.tanggalDaftarUlang,
      jamDaftarUlang: g.jamDaftarUlang,
      kuota: g.kuota.map((k) => {
        const used = usedMap.get(`${g.id}__${k.jurusanId}`) || 0;
        return {
          id: k.id,
          jurusanId: k.jurusanId,
          jurusanCode: k.jurusan.code,
          jurusanName: k.jurusan.name,
          quota: k.quota,
          used,
          remaining: Math.max(0, k.quota - used),
        };
      }),
      createdAt: g.createdAt,
    }));
  }

  async findOne(id: string) {
    const g = await this.prisma.gelombang.findUnique({
      where: { id },
      include: { kuota: { include: { jurusan: true } } },
    });
    if (!g) throw new NotFoundException('Gelombang tidak ditemukan');
    return g;
  }

  async create(
    opts: {
      name: string;
      startDate: string;
      endDate?: string;
      isActive?: boolean;
      tanggalDaftarUlang?: string;
      jamDaftarUlang?: string;
      kuota: Array<{ jurusanId: string; quota: number }>;
    },
    actorUserId: string,
  ) {
    if (!opts.kuota?.length) {
      throw new BadRequestException('Minimal harus ada 1 kuota jurusan');
    }
    // Validasi: tidak boleh ada 2 gelombang aktif simultan
    if (opts.isActive !== false) {
      const anotherActive = await this.prisma.gelombang.findFirst({
        where: { isActive: true },
      });
      if (anotherActive) {
        throw new BadRequestException(
          `Gelombang aktif lain sudah ada (${anotherActive.name}). Nonaktifkan dulu jika ingin mengaktifkan gelombang ini.`,
        );
      }
    }

    const created = await this.prisma.gelombang.create({
      data: {
        name: opts.name,
        startDate: new Date(opts.startDate),
        endDate: opts.endDate ? new Date(opts.endDate) : null,
        isActive: opts.isActive ?? true,
        tanggalDaftarUlang: opts.tanggalDaftarUlang
          ? new Date(opts.tanggalDaftarUlang)
          : null,
        jamDaftarUlang: opts.jamDaftarUlang || null,
        kuota: {
          create: opts.kuota.map((k) => ({ jurusanId: k.jurusanId, quota: k.quota })),
        },
      },
      include: { kuota: { include: { jurusan: true } } },
    });

    await this.audit.create({
      userId: actorUserId,
      action: 'gelombang.created',
      module: 'gelombang',
      entityType: 'Gelombang',
      entityId: created.id,
      meta: {
        name: created.name,
        startDate: created.startDate,
        endDate: created.endDate,
        isActive: created.isActive,
        tanggalDaftarUlang: created.tanggalDaftarUlang,
        jamDaftarUlang: created.jamDaftarUlang,
        kuota: created.kuota.map((k) => ({
          jurusanCode: k.jurusan.code,
          jurusanName: k.jurusan.name,
          quota: k.quota,
        })),
      },
    }).catch(() => null);

    return created;
  }

  async update(
    id: string,
    opts: {
      name?: string;
      startDate?: string;
      endDate?: string | null;
      isActive?: boolean;
      tanggalDaftarUlang?: string | null;
      jamDaftarUlang?: string | null;
      kuota?: Array<{ jurusanId: string; quota: number }>;
    },
    actorUserId?: string,
  ) {
    const existing = await this.prisma.gelombang.findUnique({
      where: { id },
      include: { kuota: { include: { jurusan: true } } },
    });
    if (!existing) throw new NotFoundException('Gelombang tidak ditemukan');

    if (opts.isActive === true) {
      const anotherActive = await this.prisma.gelombang.findFirst({
        where: { isActive: true, id: { not: id } },
      });
      if (anotherActive) {
        throw new BadRequestException(
          `Gelombang aktif lain sudah ada (${anotherActive.name}). Nonaktifkan dulu.`,
        );
      }
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.gelombang.update({
        where: { id },
        data: {
          ...(opts.name !== undefined ? { name: opts.name } : {}),
          ...(opts.startDate !== undefined ? { startDate: new Date(opts.startDate) } : {}),
          ...(opts.endDate !== undefined
            ? { endDate: opts.endDate ? new Date(opts.endDate) : null }
            : {}),
          ...(opts.isActive !== undefined ? { isActive: opts.isActive } : {}),
          ...(opts.tanggalDaftarUlang !== undefined
            ? {
                tanggalDaftarUlang: opts.tanggalDaftarUlang
                  ? new Date(opts.tanggalDaftarUlang)
                  : null,
              }
            : {}),
          ...(opts.jamDaftarUlang !== undefined
            ? { jamDaftarUlang: opts.jamDaftarUlang || null }
            : {}),
        },
      });

      if (opts.kuota) {
        await tx.kuotaGelombang.deleteMany({ where: { gelombangId: id } });
        if (opts.kuota.length) {
          await tx.kuotaGelombang.createMany({
            data: opts.kuota.map((k) => ({
              gelombangId: id,
              jurusanId: k.jurusanId,
              quota: k.quota,
            })),
          });
        }
      }
      return tx.gelombang.findUnique({
        where: { id },
        include: { kuota: { include: { jurusan: true } } },
      });
    });

    await this.audit.create({
      userId: actorUserId ?? null,
      action: 'gelombang.updated',
      module: 'gelombang',
      entityType: 'Gelombang',
      entityId: id,
      meta: {
        before: {
          name: existing.name,
          isActive: existing.isActive,
          startDate: existing.startDate,
          endDate: existing.endDate,
          tanggalDaftarUlang: existing.tanggalDaftarUlang,
          jamDaftarUlang: existing.jamDaftarUlang,
        },
        after: updated
          ? {
              name: updated.name,
              isActive: updated.isActive,
              startDate: updated.startDate,
              endDate: updated.endDate,
              tanggalDaftarUlang: updated.tanggalDaftarUlang,
              jamDaftarUlang: updated.jamDaftarUlang,
            }
          : null,
      },
    }).catch(() => null);

    return updated;
  }

  /**
   * HARD DELETE gelombang — dengan safety check: TOLAK hapus kalau masih ada
   * pendaftar yang referensi gelombang ini (foreign key Pendaftar.gelombangId
   * dengan onDelete default = NoAction akan meledak anyway, tapi kita kasih
   * pesan yang jelas supaya frontend bisa tampilkan warning yang helpful).
   *
   * Alur:
   *   1. Cari gelombang → 404 kalau tidak ada
   *   2. Hitung pendaftar yang masih reference gelombang ini (exclude DITOLAK
   *      tidak dipakai di sini — semua pendaftar dihitung, karena DITOLAK
   *      pun masih historical data yang harus dilindungi).
   *   3. Kalau count > 0 → throw BadRequestException dengan detail count + nama
   *      gelombang + sample 5 nomor pendaftaran yang terdampak.
   *   4. Kalau count = 0 → hard-delete (KuotaGelombang ikut cascade via schema)
   *      + audit log action `gelombang.deleted`.
   *
   * Endpoint: DELETE /gelombang/:id  (permission: gelombang.manage)
   * Note: "soft-deactivate" tidak dipakai lagi di sini — kalau admin cuma mau
   * nonaktifkan sementara, pakai PATCH /gelombang/:id dengan isActive=false.
   */
  async remove(id: string, actorUserId?: string) {
    const existing = await this.prisma.gelombang.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Gelombang tidak ditemukan');

    // Hitung pendaftar yang reference gelombang ini
    const pendaftarCount = await this.prisma.pendaftar.count({
      where: { gelombangId: id },
    });
    if (pendaftarCount > 0) {
      // Ambil sample nomor pendaftaran supaya user tahu data apa yang akan
      // ter-orphan kalau dipaksa hapus (untuk warning message).
      const sample = await this.prisma.pendaftar.findMany({
        where: { gelombangId: id },
        select: { registrationNumber: true, namaLengkap: true },
        orderBy: { createdAt: 'asc' },
        take: 5,
      });
      const sampleText = sample
        .map((s) => `${s.registrationNumber} (${s.namaLengkap})`)
        .join(', ');
      throw new BadRequestException(
        `Gelombang "${existing.name}" tidak bisa dihapus karena masih ada ` +
          `${pendaftarCount} pendaftar yang terkait. Hapus / pindahkan pendaftar ` +
          `terlebih dahulu. Contoh: ${sampleText}${pendaftarCount > 5 ? ', …' : ''}.`,
      );
    }

    // Safe to hard-delete — KuotaGelombang auto-cascade via Prisma schema.
    await this.prisma.gelombang.delete({ where: { id } });

    await this.audit
      .create({
        userId: actorUserId ?? null,
        action: 'gelombang.deleted',
        module: 'gelombang',
        entityType: 'Gelombang',
        entityId: id,
        meta: {
          name: existing.name,
          startDate: existing.startDate,
          endDate: existing.endDate,
          isActive: existing.isActive,
        },
      })
      .catch(() => null);

    return {
      deleted: true,
      id,
      name: existing.name,
    };
  }
}
