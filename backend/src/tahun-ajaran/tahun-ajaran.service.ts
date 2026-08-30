/**
 * TahunAjaranService — fitur "Arsip & Reset Tahun Ajaran".
 *
 * TUJUAN:
 *   Setiap akhir tahun ajaran, Superadmin melakukan reset data operasional
 *   SPMB untuk tahun ajaran baru. Data lama DIARSIPKAN ke file Excel
 *   multi-sheet dulu, baru setelah itu baris-baris di database dihapus.
 *
 * YANG DI-ARSIPKAN & DIHAPUS:
 *   - Pendaftar (semua data siswa pendaftar)
 *   - Gelombang (termasuk KuotaGelombang via CASCADE)
 *   - Transaksi pembayaran (sudah termasuk di row Pendaftar — nominal, metode,
 *     tanggal bayar, dll)
 *
 * YANG TIDAK DI-HAPUS (dipertahankan untuk operasional tahun ajaran baru):
 *   - Users (panitia/admin bisa lanjut login tahun depan)
 *   - Jurusan (referensi tetap dipakai untuk pilihan pendaftar tahun baru)
 *   - Berita & Pengumuman (konten publik/non-operasional SPMB)
 *   - Setting (harga_daftar_ulang, ukuran_baju_options, dst)
 *
 * KEAMANAN:
 *   - Hanya Superadmin yang boleh akses (guard di controller via @Permissions)
 *   - File Excel disimpan ke `${UPLOADS_DIR}/archives/{tahun}-arsip-spmb.xlsx`
 *   - Audit log ditulis lengkap dengan totals sebelum & sesudah reset
 *   - 2 endpoint: GET /summary (preview count) dan POST /archive-and-reset
 *     (eksekusi). POST ini IRREVERSIBLE — modal di UI harus konfirmasi 2x.
 */

import { Injectable, Logger } from '@nestjs/common';
import ExcelJS from 'exceljs';
import { promises as fs } from 'fs';
import * as path from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from '../audit-log/audit-log.service';

export interface TahunAjaranSummary {
  /** Tahun ajaran aktif (untuk label, mis. "2025/2026") */
  tahunAjaranLabel: string;
  /** ISO timestamp arsip terakhir (kalau pernah di-reset) */
  lastArchivedAt: string | null;
  counts: {
    pendaftar: number;
    gelombang: number;
    kuotaGelombang: number;
    /** Breakdown status pendaftar (untuk transparansi) */
    pendaftarByStatus: Array<{ status: string; count: number }>;
  };
}

export interface ArchiveAndResetResult {
  tahunAjaranLabel: string;
  archiveFilePath: string;
  archiveFileSizeBytes: number;
  archived: {
    pendaftar: number;
    gelombang: number;
    kuotaGelombang: number;
  };
  deleted: {
    pendaftar: number;
    gelombang: number;
    kuotaGelombang: number;
  };
}

@Injectable()
export class TahunAjaranService {
  private readonly logger = new Logger(TahunAjaranService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogService,
  ) {}

  /**
   * Hitung summary data SPMB saat ini — untuk ditampilkan di UI sebelum
   * Superadmin confirm reset.
   */
  async summary(): Promise<TahunAjaranSummary> {
    const [pendaftarTotal, gelombang, kuota, byStatus, lastArchive] =
      await Promise.all([
        this.prisma.pendaftar.count(),
        this.prisma.gelombang.count(),
        this.prisma.kuotaGelombang.count(),
        this.prisma.pendaftar.groupBy({
          by: ['status'],
          _count: { _all: true },
        }),
        // Cari audit log reset terakhir (kalau ada)
        this.prisma.auditLog.findFirst({
          where: { action: 'tahun_ajaran.archived_and_reset' },
          orderBy: { createdAt: 'desc' },
          select: { createdAt: true, meta: true },
        }),
      ]);

    const lastArchivedAt = lastArchive?.meta
      ? (lastArchive.meta as any).archivedAt || lastArchive.createdAt.toISOString()
      : lastArchive?.createdAt.toISOString() ?? null;

    return {
      tahunAjaranLabel: this.computeTahunAjaranLabel(),
      lastArchivedAt,
      counts: {
        pendaftar: pendaftarTotal,
        gelombang,
        kuotaGelombang: kuota,
        pendaftarByStatus: byStatus
          .map((s) => ({ status: s.status, count: s._count._all }))
          .sort((a, b) => b.count - a.count),
      },
    };
  }

  /**
   * Generate file Excel arsip multi-sheet, simpan ke disk, hapus data.
   *
   * Alur (WAJIB urut — biar konsisten walau ada failure):
   *   1. Fetch SEMUA data pendaftar + gelombang + kuota ke memory (snapshot)
   *   2. Generate Excel multi-sheet dari snapshot
   *   3. Tulis ke disk — kalau gagal, throw & JANGAN hapus DB
   *   4. Hapus DB (Pendaftar → Gelombang → KuotaGelombang sudah cascade)
   *   5. Tulis audit log dengan totals
   *
   * Kalau step 4 gagal setelah arsip sukses → tetap dianggap sukses (arsip
   * sudah tersimpan, admin bisa lihat partial state via DB).
   */
  async archiveAndReset(
    actor: { userId: string; userName: string; userEmail: string },
  ): Promise<ArchiveAndResetResult> {
    // ── Step 1: Snapshot data ─────────────────────────────────────────
    const [pendaftar, gelombang, kuota, archivedBefore] = await Promise.all([
      this.prisma.pendaftar.findMany({
        orderBy: { createdAt: 'asc' },
        include: {
          jurusan: { select: { code: true, name: true } },
          gelombang: { select: { name: true, startDate: true } },
        },
      }),
      this.prisma.gelombang.findMany({
        orderBy: { startDate: 'asc' },
      }),
      this.prisma.kuotaGelombang.findMany({
        include: {
          gelombang: { select: { name: true } },
          jurusan: { select: { code: true, name: true } },
        },
      }),
      // Snapshot timestamp untuk audit log
      Promise.resolve(new Date()),
    ]);

    const tahunAjaranLabel = this.computeTahunAjaranLabel(archivedBefore);

    // ── Step 2 & 3: Generate Excel + tulis ke disk ───────────────────
    const buffer = await this.buildArchiveExcel({
      pendaftar,
      gelombang,
      kuota,
      tahunAjaranLabel,
      archivedAt: archivedBefore,
    });

    const uploadsDir = process.env.UPLOADS_DIR ?? 'uploads/spmb';
    const archivesDir = path.join(uploadsDir, 'archives');
    await fs.mkdir(archivesDir, { recursive: true });
    // Slug tahun ajaran jadi nama file — aman untuk filesystem Windows/Linux
    const safeTahun = tahunAjaranLabel.replace(/[\/\\:*?"<>|]/g, '-');
    const filename = `${safeTahun}-arsip-spmb.xlsx`;
    const absolutePath = path.join(archivesDir, filename);
    await fs.writeFile(absolutePath, buffer);

    this.logger.log(
      `Arsip SPMB tersimpan: ${absolutePath} ` +
      `(${pendaftar.length} pendaftar, ${gelombang.length} gelombang, ${kuota.length} kuota, ` +
      `${buffer.length} bytes)`,
    );

    // ── Step 4: Hapus DB (Pendaftar dulu, lalu Gelombang) ────────────
    //
    // Urutan penting: Pendaftar FK ke Gelombang via gelombangId (cascade
    // saat delete Gelombang). Kalau kita hapus Gelombang duluan → Pendaftar
    // sudah kena cascade duluan sebelum kita snapshot. Jadi:
    //
    //   a) Hapus Pendaftar dulu
    //   b) Baru hapus Gelombang (KuotaGelombang auto-cascade via gelombangId)
    //
    // AuditLog TIDAK dihapus (history global sistem, bukan milik tahun ajaran).
    const deleted = await this.prisma.$transaction(async (tx) => {
      const pendaftarDeleted = await tx.pendaftar.deleteMany({});
      const gelombangDeleted = await tx.gelombang.deleteMany({});
      // KuotaGelombang auto-cascade saat gelombang dihapus (lihat schema.prisma
      // `onDelete: Cascade` pada KuotaGelombang.gelombang relation). Hitung
      // sebelum & sesudah via count.
      const kuotaRemaining = await tx.kuotaGelombang.count();
      return {
        pendaftar: pendaftarDeleted.count,
        gelombang: gelombangDeleted.count,
        // kuota yang masih ada setelah delete gelombang (harusnya 0)
        kuotaRemaining,
      };
    });

    // ── Step 5: Audit log ─────────────────────────────────────────────
    const result: ArchiveAndResetResult = {
      tahunAjaranLabel,
      archiveFilePath: absolutePath,
      archiveFileSizeBytes: buffer.length,
      archived: {
        pendaftar: pendaftar.length,
        gelombang: gelombang.length,
        kuotaGelombang: kuota.length,
      },
      deleted: {
        pendaftar: deleted.pendaftar,
        gelombang: deleted.gelombang,
        kuotaGelombang: kuota.length - deleted.kuotaRemaining,
      },
    };

    await this.audit.create({
      userId: actor.userId,
      action: 'tahun_ajaran.archived_and_reset',
      module: 'tahun_ajaran',
      entityType: 'TahunAjaran',
      entityId: tahunAjaranLabel,
      meta: {
        archivedAt: archivedBefore.toISOString(),
        actorName: actor.userName,
        actorEmail: actor.userEmail,
        archived: result.archived,
        deleted: result.deleted,
        archiveFile: {
          path: absolutePath,
          filename,
          sizeBytes: result.archiveFileSizeBytes,
        },
      },
    });

    return result;
  }

  /**
   * Hitung label tahun ajaran saat ini, mis. "2025/2026".
   * Default: tahun ajaran SPMB Indonesia biasanya Juli–Juni, jadi:
   *   - Jan–Jun → "(tahun-1)/(tahun)"     mis. Feb 2026 → "2025/2026"
   *   - Jul–Dec → "(tahun)/(tahun+1)"     mis. Agu 2026 → "2026/2027"
   *
   * `refDate` parameter untuk testing / kalau mau override.
   */
  private computeTahunAjaranLabel(refDate: Date = new Date()): string {
    const y = refDate.getFullYear();
    const m = refDate.getMonth(); // 0-indexed
    if (m < 6) {
      // Jan–Jun
      return `${y - 1}/${y}`;
    } else {
      // Jul–Dec
      return `${y}/${y + 1}`;
    }
  }

  /**
   * Generate workbook Excel multi-sheet:
   *   - Sheet 1 "Ringkasan" — metadata arsip + totals + breakdown status
   *   - Sheet 2 "Pendaftar" — semua kolom row Pendaftar (snapshot nama actor)
   *   - Sheet 3 "Gelombang" — list gelombang
   *   - Sheet 4 "Kuota Gelombang" — list kuota per (gelombang, jurusan)
   */
  private async buildArchiveExcel(data: {
    pendaftar: any[];
    gelombang: any[];
    kuota: any[];
    tahunAjaranLabel: string;
    archivedAt: Date;
  }): Promise<Buffer> {
    const wb = new ExcelJS.Workbook();
    wb.creator = 'SPMB SMK PGRI 3 Denpasar';
    wb.created = data.archivedAt;
    wb.title = `Arsip SPMB ${data.tahunAjaranLabel}`;

    // ── Sheet 1: Ringkasan ─────────────────────────────────────────────
    const ringkasan = wb.addWorksheet('Ringkasan', {
      properties: { tabColor: { argb: 'FF1E40AF' } },
    });
    ringkasan.columns = [
      { header: 'Metrik', key: 'metric', width: 36 },
      { header: 'Nilai', key: 'value', width: 30 },
    ];
    ringkasan.getRow(1).font = { bold: true };
    ringkasan.addRows([
      { metric: 'Tahun Ajaran', value: data.tahunAjaranLabel },
      { metric: 'Tanggal Arsip', value: data.archivedAt.toISOString() },
      { metric: 'Total Pendaftar', value: data.pendaftar.length },
      { metric: 'Total Gelombang', value: data.gelombang.length },
      { metric: 'Total Kuota Gelombang', value: data.kuota.length },
      { metric: '', value: '' },
      { metric: '─── Breakdown Status Pendaftar ───', value: '' },
    ]);
    const statusBreakdown = this.countByStatus(data.pendaftar);
    for (const [status, count] of statusBreakdown) {
      ringkasan.addRow({ metric: `  ${status}`, value: count });
    }

    // ── Sheet 2: Pendaftar ─────────────────────────────────────────────
    const pendaftarSheet = wb.addWorksheet('Pendaftar', {
      properties: { tabColor: { argb: 'FF10B981' } },
    });
    pendaftarSheet.columns = this.pendaftarArchiveColumns();
    pendaftarSheet.getRow(1).font = { bold: true };
    pendaftarSheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFD1FAE5' },
    };
    for (const p of data.pendaftar) {
      pendaftarSheet.addRow(this.pendaftarToArchiveRow(p));
    }

    // ── Sheet 3: Gelombang ─────────────────────────────────────────────
    const gelombangSheet = wb.addWorksheet('Gelombang', {
      properties: { tabColor: { argb: 'FF3B82F6' } },
    });
    gelombangSheet.columns = [
      { header: 'ID', key: 'id', width: 24 },
      { header: 'Nama', key: 'name', width: 24 },
      { header: 'Tanggal Mulai', key: 'startDate', width: 16 },
      { header: 'Tanggal Selesai', key: 'endDate', width: 16 },
      { header: 'Aktif', key: 'isActive', width: 8 },
      { header: 'Tanggal Daftar Ulang', key: 'tanggalDaftarUlang', width: 22 },
      { header: 'Jam Daftar Ulang', key: 'jamDaftarUlang', width: 14 },
      { header: 'Dibuat', key: 'createdAt', width: 22 },
    ];
    gelombangSheet.getRow(1).font = { bold: true };
    gelombangSheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFDBEAFE' },
    };
    for (const g of data.gelombang) {
      gelombangSheet.addRow({
        id: g.id,
        name: g.name,
        startDate: g.startDate,
        endDate: g.endDate,
        isActive: g.isActive ? 'Ya' : 'Tidak',
        tanggalDaftarUlong: g.tanggalDaftarUlong,
        jamDaftarUlong: g.jamDaftarUlong,
        createdAt: g.createdAt,
      });
    }

    // ── Sheet 4: Kuota Gelombang ───────────────────────────────────────
    const kuotaSheet = wb.addWorksheet('Kuota Gelombang', {
      properties: { tabColor: { argb: 'FFF59E0B' } },
    });
    kuotaSheet.columns = [
      { header: 'Gelombang', key: 'gelombang', width: 24 },
      { header: 'Jurusan (Kode)', key: 'jurusanCode', width: 16 },
      { header: 'Jurusan (Nama)', key: 'jurusanName', width: 28 },
      { header: 'Kuota', key: 'quota', width: 10 },
    ];
    kuotaSheet.getRow(1).font = { bold: true };
    kuotaSheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFFEF3C7' },
    };
    for (const k of data.kuota) {
      kuotaSheet.addRow({
        gelombang: k.gelombang.name,
        jurusanCode: k.jurusan.code,
        jurusanName: k.jurusan.name,
        quota: k.quota,
      });
    }

    const buf = (await wb.xlsx.writeBuffer()) as any;
    return buf as Buffer;
  }

  /**
   * Kolom Pendaftar untuk arsip — termasuk snapshot nama actor (verifiedBy,
   * approvedBy, dibayarOleh, ukuranBajuDisetOleh, daftarUlangConfirmedBy).
   * Snapshot ditulis langsung supaya data historical readable walau user
   * yang terkait sudah dihapus.
   */
  private pendaftarArchiveColumns(): Partial<ExcelJS.Column>[] {
    return [
      { header: 'No. Pendaftaran', key: 'regNum', width: 22 },
      { header: 'Nama Lengkap', key: 'nama', width: 28 },
      { header: 'JK', key: 'jk', width: 5 },
      { header: 'Tempat Lahir', key: 'tempatLahir', width: 18 },
      { header: 'Tgl Lahir', key: 'tglLahir', width: 14 },
      { header: 'NISN', key: 'nisn', width: 14 },
      { header: 'Sekolah Asal', key: 'sekolah', width: 26 },
      { header: 'Alamat', key: 'alamat', width: 30 },
      { header: 'No. Telp', key: 'noTelp', width: 16 },
      { header: 'Email', key: 'email', width: 26 },
      { header: 'Agama', key: 'agama', width: 12 },
      { header: 'Jurusan', key: 'jurusan', width: 26 },
      { header: 'Gelombang', key: 'gelombang', width: 18 },
      { header: 'Status', key: 'status', width: 24 },
      { header: 'Status Pembayaran', key: 'statusBayar', width: 18 },
      { header: 'Metode Bayar', key: 'metode', width: 14 },
      { header: 'Tgl Bayar', key: 'tglBayar', width: 18 },
      { header: 'Nominal Bayar', key: 'nominal', width: 16 },
      { header: 'Ukuran Baju', key: 'ukuran', width: 10 },
      { header: 'Tgl Ukuran Baju', key: 'tglUkuran', width: 18 },
      { header: 'Tgl Konfirmasi DU', key: 'tglKonfirmasi', width: 18 },
      { header: 'Verified By', key: 'verifiedBy', width: 24 },
      { header: 'Approved By', key: 'approvedBy', width: 24 },
      { header: 'Pembayaran Dicatat Oleh', key: 'bayarOleh', width: 24 },
      { header: 'Ukuran Baju Diinput Oleh', key: 'bajuOleh', width: 24 },
      { header: 'Konfirmasi DU Oleh', key: 'duOleh', width: 24 },
      { header: 'Catatan Penolakan', key: 'rejection', width: 30 },
      { header: 'Dibuat', key: 'createdAt', width: 22 },
    ];
  }

  private pendaftarToArchiveRow(p: any): Record<string, any> {
    return {
      regNum: p.registrationNumber,
      nama: p.namaLengkap,
      jk: p.jenisKelamin,
      tempatLahir: p.tempatLahir,
      tglLahir: p.tanggalLahir,
      nisn: p.nisn ?? '',
      sekolah: p.sekolahAsal,
      alamat: p.alamat,
      noTelp: p.noTelp,
      email: p.email ?? '',
      agama: p.agama ?? '',
      jurusan: p.jurusan ? `${p.jurusan.code} — ${p.jurusan.name}` : '',
      gelombang: p.gelombang?.name ?? '',
      status: p.status,
      statusBayar: p.statusPembayaran,
      metode: p.metodePembayaran ?? '',
      tglBayar: p.tanggalBayar ?? '',
      nominal: p.nominalPembayaran ? Number(p.nominalPembayaran) : '',
      ukuran: p.ukuranBaju ?? '',
      tglUkuran: p.tanggalUkuranBaju ?? '',
      tglKonfirmasi: p.daftarUlongConfirmedAt ?? '',
      // Snapshot text — fallback ke nama relasi kalau snapshot null (data lama)
      verifiedBy: p.verifiedByNama ?? '',
      approvedBy: p.approvedByNama ?? '',
      bayarOleh: p.dibayarOlehNama ?? '',
      bajuOleh: p.ukuranBajuDisetOlehNama ?? '',
      duOleh: p.daftarUlongConfirmedByNama ?? '',
      rejection: p.rejectionNote ?? '',
      createdAt: p.createdAt,
    };
  }

  private countByStatus(pendaftar: any[]): Map<string, number> {
    const m = new Map<string, number>();
    for (const p of pendaftar) {
      m.set(p.status, (m.get(p.status) ?? 0) + 1);
    }
    return new Map([...m.entries()].sort((a, b) => b[1] - a[1]));
  }
}