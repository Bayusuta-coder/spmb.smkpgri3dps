import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Window (days) — gelombang yang baru dimulai dalam window ini tetap ditampilkan
 * di dashboard meskipun tidak aktif lagi. Mencegah hilangnya konteks saat admin
 * ingin lihat pendaftar gelombang yang baru saja ditutup.
 */
const GELOMBANG_RECENT_DAYS = 60;

@Injectable()
export class StatistikService {
  constructor(private readonly prisma: PrismaService) {}

  async summary() {
    const [total, byStatusRaw, byJurusan, byGelombang] = await Promise.all([
      this.prisma.pendaftar.count(),
      this.prisma.pendaftar.groupBy({
        by: ['status'],
        _count: { _all: true },
      }),
      this.prisma.pendaftar.groupBy({
        by: ['jurusanId'],
        _count: { _all: true },
      }),
      this.prisma.pendaftar.groupBy({
        by: ['gelombangId'],
        _count: { _all: true },
      }),
    ]);

    // Resolve names
    const [jurusanList, gelombangList] = await Promise.all([
      this.prisma.jurusan.findMany(),
      this.prisma.gelombang.findMany(),
    ]);
    const jMap = new Map(jurusanList.map((j) => [j.id, j]));
    const gMap = new Map(gelombangList.map((g) => [g.id, g]));

    // Filter gelombang: hanya tampilkan yang masih aktif ATAU baru mulai
    // dalam window terakhir. Ini mencegah data testing/histori yang sudah
    // tidak relevan muncul di dashboard harian.
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - GELOMBANG_RECENT_DAYS);
    const isWaveRelevant = (g: { isActive: boolean; startDate: Date } | undefined) => {
      if (!g) return false;
      if (g.isActive) return true;
      return g.startDate >= cutoff;
    };

    return {
      total,
      byStatus: byStatusRaw.map((s) => ({ status: s.status, count: s._count._all })),
      byJurusan: byJurusan
        .map((b) => ({
          jurusanId: b.jurusanId,
          code: jMap.get(b.jurusanId)?.code,
          name: jMap.get(b.jurusanId)?.name,
          count: b._count._all,
        }))
        .sort((a, b) => b.count - a.count),
      byGelombang: byGelombang
        .map((b) => {
          const g = gMap.get(b.gelombangId);
          return {
            gelombangId: b.gelombangId,
            name: g?.name,
            count: b._count._all,
            isActive: g?.isActive ?? false,
            startDate: g?.startDate,
          };
        })
        // Filter: gelombang aktif ATAU yang baru mulai (window 60 hari)
        .filter((x) =>
          x.isActive ||
          (x.startDate && new Date(x.startDate) >= cutoff),
        )
        // Sort: gelombang aktif duluan, lalu berdasarkan yang paling baru
        .sort((a, b) => {
          if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
          return (
            new Date(b.startDate ?? 0).getTime() -
            new Date(a.startDate ?? 0).getTime()
          );
        }),
    };
  }
}
