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

  /**
   * Fetch snapshot nama & email user — disimpan ke kolom `*Nama`/`*Email`
   * di row. Gunanya supaya kalau user di-hard-delete, FK akan di-set NULL
   * tapi text snapshot tetap readable.
   */
  private async snapshotUser(
    userId: string,
  ): Promise<{ name: string | null; email: string | null }> {
    const u = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { name: true, email: true },
    });
    return { name: u?.name ?? null, email: u?.email ?? null };
  }

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
   * Public — hanya yang SEDANG tayang.
   *
   * Penentuan "tayang" dihitung on-the-fly setiap kali endpoint dipanggil,
   * dengan membandingkan waktu sekarang terhadap kolom tanggalMulai dan
   * tanggalSelesai. Tidak ada cron job, tidak ada field status terpisah.
   *
   * Syarat tampil:
   *   - aktif = true
   *   - deletedAt = null
   *   - tanggalMulai kosong || now >= tanggalMulai
   *   - tanggalSelesai kosong || now <= tanggalSelesai
   *
   * Response ditambah field `status` ('aktif' | 'terjadwal' | 'berakhir' |
   * 'unlimited') supaya FE bisa render badge tanpa Date logic di klien.
   */
  async findActive() {
    const now = new Date();
    const rows = await this.prisma.pengumuman.findMany({
      where: {
        aktif: true,
        deletedAt: null,
        AND: [
          {
            OR: [{ tanggalMulai: null }, { tanggalMulai: { lte: now } }],
          },
          {
            OR: [{ tanggalSelesai: null }, { tanggalSelesai: { gte: now } }],
          },
        ],
      },
      orderBy: [{ urutan: 'asc' }, { createdAt: 'desc' }],
    });
    return rows.map((p) => ({
      ...p,
      computedStatus: computeStatus(p, now),
    }));
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
      tanggalMulai?: string | null;
      tanggalSelesai?: string | null;
    },
    actorUserId: string,
  ) {
    if (!opts.judul?.trim()) throw new BadRequestException('Judul wajib diisi');
    if (!opts.foto?.trim()) throw new BadRequestException('Foto wajib diisi');

    const { tanggalMulai, tanggalSelesai } = parseJadwal(opts);
    validateJadwal(tanggalMulai, tanggalSelesai);

    // Snapshot nama/email author — readable walau user dihapus.
    const authorSnap = await this.snapshotUser(actorUserId);

    const created = await this.prisma.pengumuman.create({
      data: {
        judul: opts.judul.trim(),
        foto: opts.foto,
        aktif: opts.aktif ?? true,
        urutan: opts.urutan ?? 0,
        tanggalMulai,
        tanggalSelesai,
        createdByUserId: actorUserId,
        createdByNama: authorSnap.name,
        createdByEmail: authorSnap.email,
      },
    });

    await this.audit.create({
      userId: actorUserId,
      action: 'pengumuman.created',
      module: 'pengumuman',
      entityType: 'Pengumuman',
      entityId: created.id,
      meta: {
        judul: created.judul,
        aktif: created.aktif,
        urutan: created.urutan,
        tanggalMulai: created.tanggalMulai,
        tanggalSelesai: created.tanggalSelesai,
      },
    }).catch(() => null);

    return created;
  }

  async update(
    id: string,
    opts: {
      judul?: string;
      foto?: string;
      aktif?: boolean;
      urutan?: number;
      tanggalMulai?: string | null;
      tanggalSelesai?: string | null;
    },
    actorUserId: string,
  ) {
    const before = await this.prisma.pengumuman.findUnique({ where: { id } });
    if (!before || before.deletedAt) {
      throw new NotFoundException('Pengumuman tidak ditemukan');
    }

    // Partial update — jika field jadwal dikirim, merge dengan existing
    // (frontend bisa kirim satu field tanpa kirim yang lain).
    const merged = {
      tanggalMulai:
        opts.tanggalMulai === undefined
          ? before.tanggalMulai
          : parseDateOnly(opts.tanggalMulai),
      tanggalSelesai:
        opts.tanggalSelesai === undefined
          ? before.tanggalSelesai
          : parseDateOnly(opts.tanggalSelesai),
    };
    validateJadwal(merged.tanggalMulai, merged.tanggalSelesai);

    const data: Prisma.PengumumanUpdateInput = {};
    if (opts.judul !== undefined) data.judul = opts.judul.trim();
    if (opts.foto !== undefined) data.foto = opts.foto;
    if (opts.aktif !== undefined) data.aktif = opts.aktif;
    if (opts.urutan !== undefined) data.urutan = opts.urutan;
    if (opts.tanggalMulai !== undefined) data.tanggalMulai = merged.tanggalMulai;
    if (opts.tanggalSelesai !== undefined) data.tanggalSelesai = merged.tanggalSelesai;

    const updated = await this.prisma.pengumuman.update({ where: { id }, data });

    await this.audit.create({
      userId: actorUserId,
      action: 'pengumuman.updated',
      module: 'pengumuman',
      entityType: 'Pengumuman',
      entityId: updated.id,
      meta: {
        before: {
          judul: before.judul,
          aktif: before.aktif,
          urutan: before.urutan,
          tanggalMulai: before.tanggalMulai,
          tanggalSelesai: before.tanggalSelesai,
        },
        after: {
          judul: updated.judul,
          aktif: updated.aktif,
          urutan: updated.urutan,
          tanggalMulai: updated.tanggalMulai,
          tanggalSelesai: updated.tanggalSelesai,
        },
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

// =========================================================================
// HELPERS
// =========================================================================

/** Tanggal "YYYY-MM-DD" → Date (00:00 UTC). Null/undefined → null. */
function parseDateOnly(s: string | null | undefined): Date | null {
  if (s === null || s === undefined || s === '') return null;
  // Input dari FE adalah <input type="date"> → "YYYY-MM-DD"
  const d = new Date(`${s}T00:00:00.000Z`);
  if (isNaN(d.getTime())) {
    throw new BadRequestException(`Format tanggal tidak valid: ${s}`);
  }
  return d;
}

/** Ambil & parse jadwal dari create payload (semua field string|null). */
function parseJadwal(opts: {
  tanggalMulai?: string | null;
  tanggalSelesai?: string | null;
}) {
  return {
    tanggalMulai: parseDateOnly(opts.tanggalMulai),
    tanggalSelesai: parseDateOnly(opts.tanggalSelesai),
  };
}

/** Validasi: tanggalSelesai harus >= tanggalMulai (kalau dua-duanya diisi). */
function validateJadwal(
  tanggalMulai: Date | null,
  tanggalSelesai: Date | null,
) {
  if (tanggalMulai && tanggalSelesai && tanggalSelesai < tanggalMulai) {
    throw new BadRequestException(
      'Tanggal selesai tidak boleh sebelum tanggal mulai',
    );
  }
}

/**
 * Status on-the-fly untuk badge di FE (admin list & public response).
 *   - 'unlimited' : aktif=true, tidak ada tanggal selesai
 *   - 'berakhir'  : tanggalSelesai sudah lewat (tidak tayang, walau aktif=true)
 *   - 'terjadwal' : tanggalMulai masih di masa depan
 *   - 'aktif'     : sedang tayang sekarang
 *   - 'nonaktif'  : aktif=false
 */
export type ComputedStatus = 'aktif' | 'terjadwal' | 'berakhir' | 'unlimited' | 'nonaktif';

export function computeStatus(
  p: { aktif: boolean; tanggalMulai: Date | null; tanggalSelesai: Date | null },
  now: Date = new Date(),
): ComputedStatus {
  if (!p.aktif) return 'nonaktif';
  if (p.tanggalMulai && now < p.tanggalMulai) return 'terjadwal';
  if (p.tanggalSelesai && now > p.tanggalSelesai) return 'berakhir';
  if (!p.tanggalSelesai) return 'unlimited';
  return 'aktif';
}
