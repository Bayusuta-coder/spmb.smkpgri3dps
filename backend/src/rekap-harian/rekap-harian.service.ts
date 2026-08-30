/**
 * RekapHarianService — generate Excel rekap harian & kirim via Fonnte.
 *
 * INDEPENDENT dari LaporanService (laporan harian via Email + Meta WA).
 * Service ini KHUSUS untuk notifikasi rekap harian via Fonnte ke user
 * panitia sekolah (Admin, Bendahara, TU). Beda deliverable (Excel recap,
 * bukan summary text), beda channel (Fonnte, bukan Email/Meta WA),
 * beda recipient filter (role panitia, bukan global verified users).
 *
 * Definisi:
 *   - "Pendaftar Baru" = Pendaftar.createdAt dalam window hari ini.
 *     Auto-include SEMUA status (termasuk DITOLAK) supaya admin tahu funnel.
 *   - "Siswa Aktif" = Pendaftar.daftarUlangConfirmedAt dalam window hari ini.
 *     HANYA untuk status SISWA_AKTIF (sudah bayar + ukuran baju).
 *
 * Recipient filter:
 *   - User aktif dengan whatsappNumber != null
 *   - Role termasuk dalam setting DB `rekap_harian.fonnte.roles` (CSV nama
 *     role, default "Superadmin,Admin,Bendahara,TU").
 *   - TIDAK perlu whatsappVerifiedAt — panitia internal dipercaya.
 *
 * Failure isolation: per-recipient error di-log, tidak stop recipient lain.
 * Per-delivery audit log: ditulis sekali per generateAndDeliver call dengan
 * ringkasan meta (recipient list + status per-nomor, masked).
 */

import { Injectable, Logger } from '@nestjs/common';
import ExcelJS from 'exceljs';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { WhatsappService } from '../whatsapp/whatsapp.service';
import { FonnteService } from '../fonnte/fonnte.service';
import { maskPhone } from '../whatsapp/whatsapp.util';
import { promises as fs } from 'fs';
import * as path from 'path';

export interface RekapWindow {
  /** Inclusive start (00:00:00.000 in timezone) */
  startUtc: Date;
  /** Exclusive end (00:00:00.000 next day) */
  endUtc: Date;
  /** Display date string (mis. "25 Agustus 2026") */
  displayTanggal: string;
  /** ISO date YYYY-MM-DD (untuk filename) */
  isoDate: string;
}

export interface RekapPendaftarBaruRow {
  registrationNumber: string;
  namaLengkap: string;
  jurusan: string;
  gelombang: string;
  jamDaftar: string; // HH:mm:ss
}

export interface RekapSiswaAktifRow {
  registrationNumber: string;
  namaLengkap: string;
  jurusan: string;
  nominalBayar: number | null;
  ukuranBaju: string | null;
}

export interface RekapHarianData {
  window: RekapWindow;
  pendaftarBaru: RekapPendaftarBaruRow[];
  siswaAktif: RekapSiswaAktifRow[];
  totals: {
    pendaftarBaruCount: number;
    siswaAktifCount: number;
  };
}

export interface RekapHarianDeliveryResult {
  excelPath: string | null;
  excelBufferSize: number;
  totals: { pendaftarBaru: number; siswaAktif: number };
  fonnte: {
    attempted: number;
    sent: number;
    failed: number;
    skipped: number;
    errors: string[];
  };
}

interface RecipientInfo {
  userId: string;
  name: string;
  whatsappNumber: string;
}

@Injectable()
export class RekapHarianService {
  private readonly logger = new Logger(RekapHarianService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogService,
    private readonly whatsapp: WhatsappService,
    private readonly fonnte: FonnteService,
  ) {}

  /**
   * Compute window for "today" in given timezone (default Asia/Makassar).
   * Sama logic dengan LaporanService.computeTodayWindow — di-copy (bukan
   * reuse) supaya service ini independen total.
   */
  static computeTodayWindow(
    timezone: string = 'Asia/Makassar',
    refDate: Date = new Date(),
  ): RekapWindow {
    const fmt = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    const parts = fmt.formatToParts(refDate);
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
    const y = Number(get('year'));
    const m = Number(get('month'));
    const d = Number(get('day'));

    const tzFmt = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      timeZoneName: 'shortOffset',
    });
    const offsetStr =
      tzFmt.formatToParts(refDate).find((p) => p.type === 'timeZoneName')?.value ??
      'GMT+8';
    const match = offsetStr.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/);
    let offsetMinutes = 0;
    if (match) {
      const sign = match[1] === '+' ? 1 : -1;
      const hours = Number(match[2] ?? 0);
      const mins = Number(match[3] ?? 0);
      offsetMinutes = sign * (hours * 60 + mins);
    }

    const startUtc = new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0));
    startUtc.setTime(startUtc.getTime() - offsetMinutes * 60_000);
    const endUtc = new Date(startUtc.getTime() + 24 * 60 * 60 * 1000);

    const display = new Intl.DateTimeFormat('id-ID', {
      timeZone: timezone,
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(refDate);

    const isoDate = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

    return { startUtc, endUtc, displayTanggal: display, isoDate };
  }

  /**
   * Build RekapHarianData untuk window tertentu. TIDAK kirim — pure read.
   */
  async buildReport(window: RekapWindow): Promise<RekapHarianData> {
    const registrasiBaru = await this.prisma.pendaftar.findMany({
      where: {
        createdAt: { gte: window.startUtc, lt: window.endUtc },
      },
      include: { jurusan: true, gelombang: true },
      orderBy: { createdAt: 'asc' },
    });

    const siswaAktif = await this.prisma.pendaftar.findMany({
      where: {
        status: 'SISWA_AKTIF',
        daftarUlangConfirmedAt: { gte: window.startUtc, lt: window.endUtc },
      },
      include: { jurusan: true },
      orderBy: { daftarUlangConfirmedAt: 'asc' },
    });

    const toBaruRow = (p: any): RekapPendaftarBaruRow => ({
      registrationNumber: p.registrationNumber,
      namaLengkap: p.namaLengkap,
      jurusan: p.jurusan ? `${p.jurusan.code} — ${p.jurusan.name}` : '—',
      gelombang: p.gelombang?.name ?? '—',
      jamDaftar: this.formatTimeInTz(p.createdAt, 'Asia/Makassar'),
    });

    const toAktifRow = (p: any): RekapSiswaAktifRow => ({
      registrationNumber: p.registrationNumber,
      namaLengkap: p.namaLengkap,
      jurusan: p.jurusan ? `${p.jurusan.code} — ${p.jurusan.name}` : '—',
      nominalBayar: p.nominalPembayaran ? Number(p.nominalPembayaran) : null,
      ukuranBaju: p.ukuranBaju ?? null,
    });

    return {
      window,
      pendaftarBaru: registrasiBaru.map(toBaruRow),
      siswaAktif: siswaAktif.map(toAktifRow),
      totals: {
        pendaftarBaruCount: registrasiBaru.length,
        siswaAktifCount: siswaAktif.length,
      },
    };
  }

  /**
   * Build Excel dari RekapHarianData. Multi-sheet: ringkasan +
   * pendaftar baru + siswa aktif. Return Buffer.
   */
  async buildExcelBuffer(data: RekapHarianData): Promise<Buffer> {
    const wb = new ExcelJS.Workbook();
    wb.creator = 'SPMB SMK PGRI 3 Denpasar';
    wb.created = new Date();

    // ── Sheet 1: Ringkasan ──
    const ringkasan = wb.addWorksheet('Ringkasan', {
      properties: { tabColor: { argb: 'FF1E40AF' } },
    });
    ringkasan.columns = [
      { header: 'Metrik', key: 'metric', width: 36 },
      { header: 'Nilai', key: 'value', width: 22 },
    ];
    ringkasan.getRow(1).font = { bold: true };
    ringkasan.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFD1FAE5' },
    };
    ringkasan.addRows([
      { metric: 'Tanggal', value: data.window.displayTanggal },
      { metric: 'Total Pendaftar Isi Form', value: data.totals.pendaftarBaruCount },
      {
        metric: 'Total Daftar Ulang / Siswa Aktif',
        value: data.totals.siswaAktifCount,
      },
    ]);

    // ── Sheet 2: Pendaftar Baru ──
    const sheetBaru = wb.addWorksheet('Pendaftar Baru', {
      properties: { tabColor: { argb: 'FF10B981' } },
    });
    sheetBaru.columns = [
      { header: 'No. Pendaftaran', key: 'regNum', width: 22 },
      { header: 'Nama Lengkap', key: 'nama', width: 28 },
      { header: 'Jurusan', key: 'jurusan', width: 32 },
      { header: 'Gelombang', key: 'gelombang', width: 18 },
      { header: 'Jam Daftar', key: 'jamDaftar', width: 14 },
    ];
    sheetBaru.getRow(1).font = { bold: true };
    sheetBaru.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFD1FAE5' },
    };
    for (const r of data.pendaftarBaru) {
      sheetBaru.addRow({
        regNum: r.registrationNumber,
        nama: r.namaLengkap,
        jurusan: r.jurusan,
        gelombang: r.gelombang,
        jamDaftar: r.jamDaftar,
      });
    }

    // ── Sheet 3: Siswa Aktif ──
    const sheetAktif = wb.addWorksheet('Siswa Aktif', {
      properties: { tabColor: { argb: 'FF3B82F6' } },
    });
    sheetAktif.columns = [
      { header: 'No. Pendaftaran', key: 'regNum', width: 22 },
      { header: 'Nama Lengkap', key: 'nama', width: 28 },
      { header: 'Jurusan', key: 'jurusan', width: 32 },
      { header: 'Nominal Bayar (Rp)', key: 'nominal', width: 18 },
      { header: 'Ukuran Baju', key: 'ukuran', width: 14 },
    ];
    sheetAktif.getRow(1).font = { bold: true };
    sheetAktif.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFDBEAFE' },
    };
    for (const r of data.siswaAktif) {
      sheetAktif.addRow({
        regNum: r.registrationNumber,
        nama: r.namaLengkap,
        jurusan: r.jurusan,
        nominal: r.nominalBayar ?? 0,
        ukuran: r.ukuranBaju ?? '—',
      });
    }

    const buf = (await wb.xlsx.writeBuffer()) as ArrayBuffer;
    return Buffer.from(buf);
  }

  /**
   * Generate Excel recap, simpan ke disk, kirim via Fonnte ke user panitia,
   * lalu hapus file dari disk. Tulis audit log untuk delivery.
   */
  async generateAndDeliver(opts: {
    timezone?: string;
    trigger: 'cron' | 'manual';
    actorUserId?: string;
  }): Promise<RekapHarianDeliveryResult> {
    const tz =
      opts.timezone ??
      (await this.whatsapp.getSetting(
        'rekap_harian.fonnte.timezone',
        this.config.get<string>('REKAP_HARIAN_TIMEZONE') ?? 'Asia/Makassar',
      )) ??
      'Asia/Makassar';

    const window = RekapHarianService.computeTodayWindow(tz);

    // 1. Build report data
    const data = await this.buildReport(window);

    // 2. Generate Excel buffer
    const buffer = await this.buildExcelBuffer(data);

    // 3. Simpan ke disk (sementara)
    const uploadsDir = process.env.UPLOADS_DIR ?? 'uploads/spmb';
    const rekapDir = path.join(uploadsDir, 'rekap-harian');
    await fs.mkdir(rekapDir, { recursive: true });
    const filename = `rekap-harian-fonnte-${window.isoDate}.xlsx`;
    const excelPath = path.join(rekapDir, filename);
    await fs.writeFile(excelPath, buffer);

    this.logger.log(
      `[RekapHarian] Excel generated: ${excelPath} (${buffer.length} bytes, ` +
        `pendaftarBaru=${data.totals.pendaftarBaruCount}, siswaAktif=${data.totals.siswaAktifCount})`,
    );

    // 4. Ambil recipients
    const recipients = await this.getRecipients();

    // 5. Kirim via Fonnte per recipient (failure isolation)
    const fonnteResult = {
      attempted: 0,
      sent: 0,
      failed: 0,
      skipped: 0,
      errors: [] as string[],
    };
    const recipientLog: Array<{
      userId: string;
      name: string;
      whatsappNumberMasked: string;
      ok: boolean;
      error?: string;
    }> = [];

    // Cek Fonnte ready — kalau tidak, semua recipient di-skip.
    const fonnteReady = this.fonnte.isReady();

    const caption = this.buildCaption(data);

    for (const rcpt of recipients) {
      fonnteResult.attempted++;
      if (!fonnteReady) {
        fonnteResult.skipped++;
        recipientLog.push({
          userId: rcpt.userId,
          name: rcpt.name,
          whatsappNumberMasked: maskPhone(rcpt.whatsappNumber),
          ok: false,
          error: 'Fonnte belum dikonfigurasi',
        });
        continue;
      }

      try {
        const send = await this.fonnte.sendWithAttachment({
          to: rcpt.whatsappNumber,
          caption,
          filePath: excelPath,
          fileName: filename,
        });
        if (send.ok) {
          fonnteResult.sent++;
          recipientLog.push({
            userId: rcpt.userId,
            name: rcpt.name,
            whatsappNumberMasked: maskPhone(rcpt.whatsappNumber),
            ok: true,
          });
        } else {
          fonnteResult.failed++;
          recipientLog.push({
            userId: rcpt.userId,
            name: rcpt.name,
            whatsappNumberMasked: maskPhone(rcpt.whatsappNumber),
            ok: false,
            error: send.error,
          });
          fonnteResult.errors.push(`${rcpt.userId}: ${send.error}`);
        }
      } catch (e: any) {
        // Extra defensive — fonnte.sendWithAttachment seharusnya tidak throw.
        fonnteResult.failed++;
        recipientLog.push({
          userId: rcpt.userId,
          name: rcpt.name,
          whatsappNumberMasked: maskPhone(rcpt.whatsappNumber),
          ok: false,
          error: e?.message ?? String(e),
        });
        fonnteResult.errors.push(`${rcpt.userId}: ${e?.message ?? e}`);
      }
    }

    // 6. Audit log
    await this.audit.create({
      userId: opts.actorUserId ?? null,
      action: 'rekap_harian.fonnte_sent',
      module: 'rekap_harian',
      entityType: 'RekapHarianFonnte',
      entityId: window.isoDate,
      meta: {
        trigger: opts.trigger,
        totals: {
          pendaftarBaru: data.totals.pendaftarBaruCount,
          siswaAktif: data.totals.siswaAktifCount,
        },
        recipients: recipientLog,
        fonnte: {
          ready: fonnteReady,
          attempted: fonnteResult.attempted,
          sent: fonnteResult.sent,
          failed: fonnteResult.failed,
          skipped: fonnteResult.skipped,
        },
        excelSize: buffer.length,
      },
    });

    // 7. Cleanup file dari disk
    try {
      await fs.unlink(excelPath);
      this.logger.log(`[RekapHarian] Cleanup Excel: ${excelPath}`);
    } catch (e: any) {
      this.logger.warn(
        `[RekapHarian] Gagal hapus Excel ${excelPath}: ${e?.message ?? e}`,
      );
    }

    return {
      excelPath,
      excelBufferSize: buffer.length,
      totals: {
        pendaftarBaru: data.totals.pendaftarBaruCount,
        siswaAktif: data.totals.siswaAktifCount,
      },
      fonnte: fonnteResult,
    };
  }

  /**
   * Ambil list recipients: user aktif dengan whatsappNumber != null dan
   * role termasuk dalam setting DB `rekap_harian.fonnte.roles`.
   */
  private async getRecipients(): Promise<RecipientInfo[]> {
    const rolesSetting =
      (await this.whatsapp.getSetting(
        'rekap_harian.fonnte.roles',
        'Superadmin,Admin,Bendahara,TU',
      )) ?? 'Superadmin,Admin,Bendahara,TU';
    const roleNames = rolesSetting
      .split(',')
      .map((r) => r.trim())
      .filter((r) => r.length > 0);

    const users = await this.prisma.user.findMany({
      where: {
        isActive: true,
        whatsappNumber: { not: null },
        roles: {
          some: { role: { name: { in: roleNames } } },
        },
      },
      select: {
        id: true,
        name: true,
        whatsappNumber: true,
        roles: { select: { role: { select: { name: true } } } },
      },
    });

    return users
      .filter((u) => u.whatsappNumber != null && u.whatsappNumber !== '')
      .map((u) => ({
        userId: u.id,
        name: u.name,
        whatsappNumber: u.whatsappNumber!,
      }));
  }

  /**
   * Build caption singkat untuk pesan WhatsApp.
   * Format: "Rekap Pendaftaran SPMB - [tanggal]: X pendaftar baru, Y siswa aktif hari ini"
   */
  private buildCaption(data: RekapHarianData): string {
    return (
      `Rekap Pendaftaran SPMB - ${data.window.displayTanggal}: ` +
      `${data.totals.pendaftarBaruCount} pendaftar baru, ` +
      `${data.totals.siswaAktifCount} siswa aktif hari ini.`
    );
  }

  /**
   * Format time-in-tz helper. Dipakai untuk kolom "Jam Daftar".
   */
  private formatTimeInTz(date: Date, timezone: string): string {
    return new Intl.DateTimeFormat('id-ID', {
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).format(date);
  }
}
