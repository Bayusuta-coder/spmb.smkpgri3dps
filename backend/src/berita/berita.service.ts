import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, StatusBerita } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from '../audit-log/audit-log.service';

/**
 * Slug generator: lowercase, ASCII-only, spasi -> dash, max 60 char.
 */
function makeSlug(judul: string): string {
  const s = (judul || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // hapus diakritik
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 60);
  return s || 'berita';
}

/**
 * Tambah suffix random kecil kalau slug bentrok, supaya tidak mudah ditebak
 * tapi tetap deterministik pada retry.
 */
async function uniqueSlug(prisma: PrismaService, base: string): Promise<string> {
  let s = base;
  let attempt = 0;
  while (await prisma.berita.findUnique({ where: { slug: s } })) {
    attempt += 1;
    s = `${base}-${Math.random().toString(36).slice(2, 7)}`;
    if (attempt > 5) {
      // Fallback ke cuid suffix
      s = `${base}-${Date.now().toString(36)}`;
      break;
    }
  }
  return s;
}

@Injectable()
export class BeritaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogService,
  ) {}

  /**
   * Fetch snapshot nama & email user — disimpan ke kolom `*Nama`/`*Email`
   * di row Berita/Pengumuman. Gunanya supaya kalau user di-hard-delete
   * nanti, FK akan di-set NULL tapi text snapshot tetap readable.
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

  /**
   * List untuk admin — paginated, filter status/search.
   * Termasuk soft-deleted (deletedAt != null) supaya bisa di-restore.
   */
  async findAllForAdmin(opts: {
    status?: StatusBerita;
    search?: string;
    includeDeleted?: boolean;
    page?: number;
    pageSize?: number;
  }) {
    const page = Math.max(1, opts.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, opts.pageSize ?? 20));
    const where: Prisma.BeritaWhereInput = {};
    if (!opts.includeDeleted) where.deletedAt = null;
    if (opts.status) where.status = opts.status;
    if (opts.search) {
      where.OR = [
        { judul: { contains: opts.search, mode: 'insensitive' } },
        { slug: { contains: opts.search, mode: 'insensitive' } },
      ];
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.berita.findMany({
        where,
        include: { createdBy: { select: { id: true, name: true, email: true } } },
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.berita.count({ where }),
    ]);

    return { items, total, page, pageSize };
  }

  /**
   * List untuk publik — hanya PUBLISHED, exclude soft-deleted.
   * Field isi tidak dikembalikan di sini (ringkas), cukup cuplikan.
   */
  async findPublic(opts: { page?: number; pageSize?: number } = {}) {
    const page = Math.max(1, opts.page ?? 1);
    const pageSize = Math.min(50, Math.max(1, opts.pageSize ?? 6));
    const where: Prisma.BeritaWhereInput = {
      status: 'PUBLISHED',
      deletedAt: null,
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.berita.findMany({
        where,
        orderBy: { publishedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          judul: true,
          slug: true,
          foto: true,
          hashtag: true,
          publishedAt: true,
          createdAt: true,
          // snippet 160 char, biar UI tidak render isi penuh di list
          isi: true,
        },
      }),
      this.prisma.berita.count({ where }),
    ]);

    // Hitung snippet per item — 160 char pertama + ellipsis
    const itemsWithSnippet = items.map((b) => ({
      ...b,
      snippet: (b.isi || '').slice(0, 160).trim() + ((b.isi || '').length > 160 ? '…' : ''),
      isi: undefined,
    }));

    return { items: itemsWithSnippet, total, page, pageSize };
  }

  /**
   * Detail publik via slug. Hanya PUBLISHED yang bisa diakses publik.
   */
  async findPublicBySlug(slug: string) {
    const b = await this.prisma.berita.findUnique({
      where: { slug },
      include: { createdBy: { select: { name: true } } },
    });
    if (!b || b.deletedAt || b.status !== 'PUBLISHED') {
      throw new NotFoundException('Berita tidak ditemukan');
    }
    return {
      id: b.id,
      judul: b.judul,
      slug: b.slug,
      foto: b.foto,
      isi: b.isi,
      hashtag: b.hashtag,
      publishedAt: b.publishedAt,
      authorName: b.createdBy?.name ?? null,
    };
  }

  async findOneForAdmin(id: string) {
    const b = await this.prisma.berita.findUnique({
      where: { id },
      include: { createdBy: { select: { id: true, name: true, email: true } } },
    });
    if (!b) throw new NotFoundException('Berita tidak ditemukan');
    return b;
  }

  async create(
    opts: {
      judul: string;
      foto: string;
      isi: string;
      hashtag?: string[];
      status?: StatusBerita;
    },
    actorUserId: string,
  ) {
    if (!opts.judul?.trim()) throw new BadRequestException('Judul wajib diisi');
    if (!opts.foto?.trim()) throw new BadRequestException('Foto wajib diisi');
    if (!opts.isi?.trim()) throw new BadRequestException('Isi wajib diisi');

    const slug = await uniqueSlug(this.prisma, makeSlug(opts.judul));
    const status = opts.status ?? 'DRAFT';
    const publishedAt = status === 'PUBLISHED' ? new Date() : null;

    // Snapshot nama/email author — readable walau user dihapus.
    const authorSnap = await this.snapshotUser(actorUserId);

    const created = await this.prisma.berita.create({
      data: {
        judul: opts.judul.trim(),
        slug,
        foto: opts.foto,
        isi: opts.isi,
        hashtag: opts.hashtag ?? [],
        status,
        publishedAt,
        createdByUserId: actorUserId,
        createdByNama: authorSnap.name,
        createdByEmail: authorSnap.email,
      },
    });

    await this.audit.create({
      userId: actorUserId,
      action: 'berita.created',
      module: 'berita',
      entityType: 'Berita',
      entityId: created.id,
      meta: {
        judul: created.judul,
        slug: created.slug,
        status: created.status,
        hashtag: created.hashtag,
      },
    }).catch(() => null);

    return created;
  }

  async update(
    id: string,
    opts: {
      judul?: string;
      foto?: string;
      isi?: string;
      hashtag?: string[];
      status?: StatusBerita;
    },
    actorUserId: string,
  ) {
    const before = await this.prisma.berita.findUnique({ where: { id } });
    if (!before || before.deletedAt) {
      throw new NotFoundException('Berita tidak ditemukan');
    }

    // Hitung publishedAt:
    //  - transisi DRAFT -> PUBLISHED: set publishedAt = now() (kalau belum pernah)
    //  - transisi PUBLISHED -> DRAFT: keep publishedAt (sebagai jejak),
    //    atau bisa di-null. Kita keep supaya sort publik stabil.
    const data: Prisma.BeritaUpdateInput = {};
    if (opts.judul !== undefined) data.judul = opts.judul.trim();
    if (opts.foto !== undefined) data.foto = opts.foto;
    if (opts.isi !== undefined) data.isi = opts.isi;
    if (opts.hashtag !== undefined) data.hashtag = opts.hashtag;
    if (opts.status !== undefined) {
      data.status = opts.status;
      if (opts.status === 'PUBLISHED' && !before.publishedAt) {
        data.publishedAt = new Date();
      }
    }

    // Slug: regenerate kalau judul berubah, dan hanya kalau slug lama
    // belum pernah dipakai eksternal (heuristik: publishedAt != null = sudah tayang)
    // Untuk simpel, kita JANGAN ubah slug setelah publish — supaya link publik
    // tidak rusak. Slug hanya di-set saat create.

    const updated = await this.prisma.berita.update({ where: { id }, data });

    await this.audit.create({
      userId: actorUserId,
      action: 'berita.updated',
      module: 'berita',
      entityType: 'Berita',
      entityId: updated.id,
      meta: {
        before: {
          judul: before.judul,
          status: before.status,
          publishedAt: before.publishedAt,
          hashtag: before.hashtag,
        },
        after: {
          judul: updated.judul,
          status: updated.status,
          publishedAt: updated.publishedAt,
          hashtag: updated.hashtag,
        },
      },
    }).catch(() => null);

    return updated;
  }

  async remove(id: string, actorUserId: string) {
    const before = await this.prisma.berita.findUnique({ where: { id } });
    if (!before || before.deletedAt) {
      throw new NotFoundException('Berita tidak ditemukan');
    }
    const updated = await this.prisma.berita.update({
      where: { id },
      data: { deletedAt: new Date(), status: 'DRAFT' },
    });
    await this.audit.create({
      userId: actorUserId,
      action: 'berita.deleted',
      module: 'berita',
      entityType: 'Berita',
      entityId: updated.id,
      meta: { judul: before.judul, slug: before.slug },
    }).catch(() => null);
    return updated;
  }

  async restore(id: string, actorUserId: string) {
    const before = await this.prisma.berita.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('Berita tidak ditemukan');
    if (!before.deletedAt) {
      throw new BadRequestException('Berita ini belum dihapus');
    }
    const updated = await this.prisma.berita.update({
      where: { id },
      data: { deletedAt: null },
    });
    await this.audit.create({
      userId: actorUserId,
      action: 'berita.restored',
      module: 'berita',
      entityType: 'Berita',
      entityId: updated.id,
      meta: { judul: before.judul, slug: before.slug },
    }).catch(() => null);
    return updated;
  }
}
