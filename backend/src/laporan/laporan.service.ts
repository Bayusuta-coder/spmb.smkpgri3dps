/**
 * LaporanService — generate daily report (registrasi baru + daftar ulang),
 * kirim via Email + WhatsApp ke recipient terverifikasi.
 *
 * Definisi:
 *   - "Registrasi baru" = Pendaftar.createdAt dalam window hari ini.
 *     Auto-include SEMUA status (termasuk DITOLAK) supaya admin tahu funnel.
 *   - "Daftar ulang" = Pendaftar.daftarUlangConfirmedAt dalam window hari ini.
 *     HANYA untuk status SISWA_AKTIF (sudah bayar + ukuran baju).
 *
 * PENTING (anti double-counting):
 *   - Daftar ulang HANYA dihitung dari `daftarUlangConfirmedAt` (tanggal
 *     fisik hadir), BUKAN dari tanggalBayar atau tanggalUkuranBaju. Itu
 *     timestamp event yang berbeda dan bisa di hari berbeda.
 *   - Registrasi baru HANYA dari `createdAt` (tanggal submit form online).
 *
 * Distribusi channel:
 *   - Email: ke addresses di `laporan_harian.email.recipients` setting,
 *     fallback ke env `LAPORAN_EMAIL_RECIPIENTS` (CSV).
 *   - WhatsApp: ke SEMUA user dengan `whatsappVerifiedAt IS NOT NULL`,
 *     dengan rate-limit per-user. Kalau WhatsApp provider belum configured
 *     atau setting off → skip channel itu entirely.
 *
 * Failure isolation:
 *   - Email error TIDAK stop WhatsApp (and vice versa).
 *   - Per-recipient error di-log, tidak stop recipient berikutnya.
 *   - Audit log di-write untuk setiap attempt.
 */

import { Injectable, Logger } from '@nestjs/common';
import ExcelJS from 'exceljs';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { WhatsappService } from '../whatsapp/whatsapp.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { renderMessageTemplate, maskPhone } from '../whatsapp/whatsapp.util';
import { promises as fs } from 'fs';
import * as path from 'path';

export interface ReportWindow {
  /** Inclusive start (00:00:00.000 in timezone) */
  startUtc: Date;
  /** Exclusive end (00:00:00.000 next day) */
  endUtc: Date;
  /** Display date string (mis. "25 Agustus 2026") */
  displayTanggal: string;
  /** ISO date YYYY-MM-DD (untuk filename) */
  isoDate: string;
}

export interface ReportData {
  window: ReportWindow;
  registrasiBaru: ReportPendaftarRow[];
  daftarUlang: ReportPendaftarRow[];
  totals: {
    registrasiBaruCount: number;
    daftarUlangCount: number;
    totalPembayaranHariIni: number;
    totalPembayaranSemuaHari: number;
  };
}

export interface ReportPendaftarRow {
  registrationNumber: string;
  namaLengkap: string;
  jenisKelamin: string;
  tanggalLahir: Date;
  sekolahAsal: string;
  noTelp: string;
  email: string | null;
  whatsappNumber: string | null;
  jurusan: string;
  gelombang: string;
  status: string;
  ukuranBaju: string | null;
  metodePembayaran: string | null;
  nominalPembayaran: number | null;
}

export interface ReportDeliveryResult {
  excelPath: string | null;
  excelBufferSize: number;
  email: { attempted: number; sent: number; failed: number; errors: string[] };
  whatsapp: { attempted: number; sent: number; failed: number; skipped: number; errors: string[] };
}

@Injectable()
export class LaporanService {
  private readonly logger = new Logger(LaporanService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
    private readonly whatsapp: WhatsappService,
    private readonly audit: AuditLogService,
  ) {}

  /**
   * Compute window for "today" in given timezone (default Asia/Makassar).
   * Returns UTC instants for DB query + display string.
   */
  static computeTodayWindow(
    timezone: string = 'Asia/Makassar',
    refDate: Date = new Date(),
  ): ReportWindow {
    // Pakai Intl.DateTimeFormat untuk dapet "year/month/day" di timezone target,
    // lalu reconstruct Date UTC midnight untuk start/end.
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

    // Asia/Makassar = UTC+8. Untuk generalisasi, hitung offset dari timezone.
    // Trick: bikin Date as if local = UTC, lalu cari offset via formatToParts.
    const tzFmt = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      timeZoneName: 'shortOffset',
    });
    const offsetStr = tzFmt.formatToParts(refDate).find((p) => p.type === 'timeZoneName')?.value ?? 'GMT+8';
    // offsetStr mis. "GMT+8" atau "GMT-3:30"
    const match = offsetStr.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/);
    let offsetMinutes = 0;
    if (match) {
      const sign = match[1] === '+' ? 1 : -1;
      const hours = Number(match[2] ?? 0);
      const mins = Number(match[3] ?? 0);
      offsetMinutes = sign * (hours * 60 + mins);
    }

    // startUtc = midnight local in target TZ
    const startUtc = new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0));
    startUtc.setTime(startUtc.getTime() - offsetMinutes * 60_000);
    const endUtc = new Date(startUtc.getTime() + 24 * 60 * 60 * 1000);

    // Display string
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
   * Build ReportData untuk window tertentu. TIDAK kirim — pure read.
   * Dipakai juga oleh preview UI di pengaturan halaman (kalau ditambah nanti).
   */
  async buildReport(window: ReportWindow): Promise<ReportData> {
    const registrasiBaru = await this.prisma.pendaftar.findMany({
      where: {
        createdAt: { gte: window.startUtc, lt: window.endUtc },
      },
      include: { jurusan: true, gelombang: true },
      orderBy: { createdAt: 'asc' },
    });

    // Daftar ulang: hanya SISWA_AKTIF (sudah bayar + ukuran baju) yang konfirmasi
    // hadir di window ini.
    const daftarUlang = await this.prisma.pendaftar.findMany({
      where: {
        status: 'SISWA_AKTIF',
        daftarUlangConfirmedAt: { gte: window.startUtc, lt: window.endUtc },
      },
      include: { jurusan: true, gelombang: true },
      orderBy: { daftarUlangConfirmedAt: 'asc' },
    });

    // Total pembayaran hari ini (registrasi baru, exclude yang BELUM)
    const todayPaid = await this.prisma.pendaftar.findMany({
      where: {
        statusPembayaran: 'LUNAS',
        tanggalBayar: { gte: window.startUtc, lt: window.endUtc },
      },
      select: { nominalPembayaran: true },
    });
    const totalBayarHariIni = todayPaid.reduce(
      (sum, p) => sum + Number(p.nominalPembayaran ?? 0),
      0,
    );

    const allPaid = await this.prisma.pendaftar.aggregate({
      _sum: { nominalPembayaran: true },
      where: { statusPembayaran: 'LUNAS' },
    });
    const totalBayarSemuaHari = Number(allPaid._sum.nominalPembayaran ?? 0);

    const toRow = (p: any): ReportPendaftarRow => ({
      registrationNumber: p.registrationNumber,
      namaLengkap: p.namaLengkap,
      jenisKelamin: p.jenisKelamin,
      tanggalLahir: p.tanggalLahir,
      sekolahAsal: p.sekolahAsal,
      noTelp: p.noTelp,
      email: p.email,
      whatsappNumber: p.whatsappNumber ?? null,
      jurusan: p.jurusan ? `${p.jurusan.code} — ${p.jurusan.name}` : '—',
      gelombang: p.gelombang?.name ?? '—',
      status: p.status,
      ukuranBaju: p.ukuranBaju,
      metodePembayaran: p.metodePembayaran,
      nominalPembayaran: p.nominalPembayaran ? Number(p.nominalPembayaran) : null,
    });

    return {
      window,
      registrasiBaru: registrasiBaru.map(toRow),
      daftarUlang: daftarUlang.map(toRow),
      totals: {
        registrasiBaruCount: registrasiBaru.length,
        daftarUlangCount: daftarUlang.length,
        totalPembayaranHariIni: totalBayarHariIni,
        totalPembayaranSemuaHari: totalBayarSemuaHari,
      },
    };
  }

  /**
   * Build Excel dari ReportData. Multi-sheet: ringkasan + registrasi baru
   * + daftar ulang. Return Buffer.
   */
  async buildExcelBuffer(data: ReportData): Promise<any> {
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
    ringkasan.addRows([
      { metric: 'Tanggal Laporan', value: data.window.displayTanggal },
      { metric: 'Registrasi Baru (online)', value: data.totals.registrasiBaruCount },
      { metric: 'Daftar Ulang (hadir fisik)', value: data.totals.daftarUlangCount },
      {
        metric: 'Total Pembayaran Hari Ini',
        value: `Rp ${data.totals.totalPembayaranHariIni.toLocaleString('id-ID')}`,
      },
      {
        metric: 'Total Pembayaran Kumulatif',
        value: `Rp ${data.totals.totalPembayaranSemuaHari.toLocaleString('id-ID')}`,
      },
    ]);

    // ── Sheet 2: Registrasi Baru ──
    const regBaru = wb.addWorksheet('Registrasi Baru', {
      properties: { tabColor: { argb: 'FF10B981' } },
    });
    regBaru.columns = this.pendaftarColumns();
    regBaru.getRow(1).font = { bold: true };
    regBaru.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFD1FAE5' },
    };
    for (const r of data.registrasiBaru) regBaru.addRow(this.pendaftarToExcelRow(r));

    // ── Sheet 3: Daftar Ulang ──
    const daftarUlang = wb.addWorksheet('Daftar Ulang', {
      properties: { tabColor: { argb: 'FF3B82F6' } },
    });
    daftarUlang.columns = this.pendaftarColumns();
    daftarUlang.getRow(1).font = { bold: true };
    daftarUlang.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFDBEAFE' },
    };
    for (const r of data.daftarUlang) daftarUlang.addRow(this.pendaftarToExcelRow(r));

    const buf = (await wb.xlsx.writeBuffer()) as any;
    return buf;
  }

  private pendaftarColumns(): Partial<ExcelJS.Column>[] {
    return [
      { header: 'No. Pendaftaran', key: 'regNum', width: 22 },
      { header: 'Nama Lengkap', key: 'nama', width: 28 },
      { header: 'JK', key: 'jk', width: 5 },
      { header: 'Tgl Lahir', key: 'tglLahir', width: 14 },
      { header: 'Sekolah Asal', key: 'sekolah', width: 26 },
      { header: 'No. Telp', key: 'noTelp', width: 16 },
      { header: 'Email', key: 'email', width: 26 },
      { header: 'WhatsApp', key: 'wa', width: 18 },
      { header: 'Jurusan', key: 'jurusan', width: 26 },
      { header: 'Gelombang', key: 'gelombang', width: 18 },
      { header: 'Status', key: 'status', width: 24 },
      { header: 'Ukuran Baju', key: 'ukuran', width: 10 },
      { header: 'Metode Bayar', key: 'metode', width: 14 },
      { header: 'Nominal Bayar', key: 'nominal', width: 16 },
    ];
  }

  private pendaftarToExcelRow(r: ReportPendaftarRow): Record<string, any> {
    return {
      regNum: r.registrationNumber,
      nama: r.namaLengkap,
      jk: r.jenisKelamin,
      tglLahir: r.tanggalLahir,
      sekolah: r.sekolahAsal,
      noTelp: r.noTelp,
      email: r.email ?? '—',
      wa: r.whatsappNumber ?? '—',
      jurusan: r.jurusan,
      gelombang: r.gelombang,
      status: r.status,
      ukuran: r.ukuranBaju ?? '—',
      metode: r.metodePembayaran ?? '—',
      nominal: r.nominalPembayaran ? `Rp ${r.nominalPembayaran.toLocaleString('id-ID')}` : '—',
    };
  }

  /**
   * Orchestrator: build + save Excel + kirim ke semua channel.
   * Dipanggil oleh scheduler (cron) ATAU manual trigger dari controller.
   */
  async generateAndDeliver(opts: {
    timezone?: string;
    trigger: 'cron' | 'manual';
    actorUserId?: string;
  }): Promise<ReportDeliveryResult> {
    const tz = opts.timezone ?? 'Asia/Makassar';
    const window = LaporanService.computeTodayWindow(tz);
    this.logger.log(
      `Generate laporan untuk window ${window.isoDate} (${window.displayTanggal}, tz=${tz})`,
    );

    const data = await this.buildReport(window);
    const buffer = await this.buildExcelBuffer(data);

    // Save ke disk (untuk email attachment)
    const uploadsDir = process.env.UPLOADS_DIR ?? 'uploads/spmb';
    const laporanDir = path.join(uploadsDir, 'laporan');
    await fs.mkdir(laporanDir, { recursive: true });
    const filename = `laporan-harian-${window.isoDate}.xlsx`;
    const fullPath = path.join(laporanDir, filename);
    await fs.writeFile(fullPath, Buffer.from(buffer as any));

    const result: ReportDeliveryResult = {
      excelPath: fullPath,
      excelBufferSize: (buffer as any).length,
      email: { attempted: 0, sent: 0, failed: 0, errors: [] },
      whatsapp: { attempted: 0, sent: 0, failed: 0, skipped: 0, errors: [] },
    };

    // Audit: generate
    await this.audit.create({
      userId: opts.actorUserId ?? null,
      action: 'laporan.generated',
      module: 'laporan',
      entityType: 'LaporanHarian',
      entityId: window.isoDate,
      meta: {
        trigger: opts.trigger,
        windowStartUtc: window.startUtc.toISOString(),
        windowEndUtc: window.endUtc.toISOString(),
        regBaru: data.totals.registrasiBaruCount,
        daftarUlang: data.totals.daftarUlangCount,
        totalBayarHariIni: data.totals.totalPembayaranHariIni,
        excelSizeBytes: result.excelBufferSize,
      },
    });

    // ── Channel: Email ──
    const emailEnabled = await this.whatsapp.getSetting('laporan_harian.aktif', 'true');
    const emailSubEnabled = await this.whatsapp.getSetting(
      'laporan_harian.email.aktif',
      'true',
    );
    if (emailEnabled !== 'false' && emailSubEnabled !== 'false') {
      const recipientsSetting = await this.whatsapp.getSetting(
        'laporan_harian.email.recipients',
        process.env.LAPORAN_EMAIL_RECIPIENTS,
      );
      const recipients = (recipientsSetting ?? '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);

      result.email.attempted = recipients.length;
      if (recipients.length === 0) {
        result.email.errors.push('Tidak ada email recipient (kosong di setting & env)');
      }
      for (const to of recipients) {
        try {
          const html = this.buildEmailHtml(data, to);
          const sent = await this.email.send({
            to,
            subject: `[SPMB] Laporan Harian ${window.displayTanggal}`,
            html,
            relatedType: 'LaporanHarian',
            relatedId: window.isoDate,
            attachments: [
              {
                filename,
                path: fullPath,
                contentType:
                  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
              },
            ],
          });
          if (sent.sent) result.email.sent++;
          else {
            result.email.failed++;
            result.email.errors.push(`${to}: ${sent.error ?? 'unknown'}`);
          }
        } catch (e: any) {
          result.email.failed++;
          result.email.errors.push(`${to}: ${e?.message ?? e}`);
          this.logger.error(`Email laporan gagal ke ${to}: ${e?.message ?? e}`);
        }
      }
    } else {
      result.email.errors.push('Channel email disabled by setting');
    }

    // ── Channel: WhatsApp ──
    const waEnabled =
      (await this.whatsapp.getSetting('laporan_harian.whatsapp.aktif', 'false')) !== 'false';
    if (waEnabled && this.whatsapp.isReady()) {
      // Ambil SEMUA user terverifikasi & aktif. Per spec: hanya yang verified.
      const recipients = await this.prisma.user.findMany({
        where: {
          isActive: true,
          whatsappNumber: { not: null },
          whatsappVerifiedAt: { not: null },
        },
        select: { id: true, name: true, whatsappNumber: true },
      });
      result.whatsapp.attempted = recipients.length;
      for (const r of recipients) {
        try {
          const msgTpl = await this.whatsapp.getSetting(
            'laporan_harian.format_pesan',
            'Laporan tersedia: registrasi baru {regBaru}, daftar ulang {daftarUlang}',
          );
          const link = this.buildLaporanLink(window.isoDate);
          const rendered = renderMessageTemplate(msgTpl ?? '', {
            tanggal: window.displayTanggal,
            regBaru: data.totals.registrasiBaruCount,
            daftarUlang: data.totals.daftarUlangCount,
            totalBayar: data.totals.totalPembayaranHariIni.toLocaleString('id-ID'),
            link,
          });
          const sent = await this.whatsapp.sendMessage(r.whatsappNumber!, rendered);
          if (sent.ok) result.whatsapp.sent++;
          else {
            result.whatsapp.failed++;
            result.whatsapp.errors.push(`${maskPhone(r.whatsappNumber)}: ${sent.error}`);
            this.logger.warn(
              `WA laporan gagal ke user ${r.id} (${maskPhone(r.whatsappNumber)}): ${sent.error}`,
            );
          }
        } catch (e: any) {
          result.whatsapp.failed++;
          result.whatsapp.errors.push(`${maskPhone(r.whatsappNumber)}: ${e?.message ?? e}`);
        }
      }
    } else if (waEnabled && !this.whatsapp.isReady()) {
      result.whatsapp.skipped = 1;
      result.whatsapp.errors.push('WhatsApp provider belum configured (env WHATSAPP_* missing)');
    } else {
      result.whatsapp.skipped = 1;
      result.whatsapp.errors.push('Channel WhatsApp disabled by setting');
    }

    // Audit: delivery summary
    await this.audit.create({
      userId: opts.actorUserId ?? null,
      action: 'laporan.delivered',
      module: 'laporan',
      entityType: 'LaporanHarian',
      entityId: window.isoDate,
      meta: {
        trigger: opts.trigger,
        email: result.email,
        whatsapp: {
          attempted: result.whatsapp.attempted,
          sent: result.whatsapp.sent,
          failed: result.whatsapp.failed,
          skipped: result.whatsapp.skipped,
        },
      },
    });

    return result;
  }

  private buildEmailHtml(data: ReportData, to: string): string {
    const rows = (arr: ReportPendaftarRow[]) =>
      arr.length === 0
        ? '<tr><td colspan="4" style="text-align:center;color:#64748b;padding:1rem">Tidak ada data</td></tr>'
        : arr
            .slice(0, 50) // batasi preview di email; full data di attachment
            .map(
              (r) => `<tr>
                <td style="padding:.4rem;border:1px solid #e2e8f0">${escapeHtml(r.registrationNumber)}</td>
                <td style="padding:.4rem;border:1px solid #e2e8f0">${escapeHtml(r.namaLengkap)}</td>
                <td style="padding:.4rem;border:1px solid #e2e8f0">${escapeHtml(r.jurusan)}</td>
                <td style="padding:.4rem;border:1px solid #e2e8f0">${escapeHtml(r.status)}</td>
              </tr>`,
            )
            .join('');
    return `<!doctype html><html><body style="font-family:system-ui,sans-serif;max-width:720px;margin:auto;padding:1rem">
      <h2 style="color:#1e40af">📊 Laporan Harian SPMB</h2>
      <p>Halo,</p>
      <p>Berikut ringkasan laporan harian SPMB untuk tanggal <b>${escapeHtml(data.window.displayTanggal)}</b>.</p>
      <ul>
        <li>🆕 Registrasi baru: <b>${data.totals.registrasiBaruCount}</b> siswa</li>
        <li>🔄 Daftar ulang: <b>${data.totals.daftarUlangCount}</b> siswa</li>
        <li>💰 Pembayaran hari ini: <b>Rp ${data.totals.totalPembayaranHariIni.toLocaleString('id-ID')}</b></li>
        <li>💼 Pembayaran kumulatif: <b>Rp ${data.totals.totalPembayaranSemuaHari.toLocaleString('id-ID')}</b></li>
      </ul>
      <h3 style="margin-top:1.5rem">Registrasi Baru (preview 50 pertama)</h3>
      <table style="border-collapse:collapse;width:100%;font-size:13px">
        <thead><tr style="background:#dbeafe">
          <th style="padding:.4rem;border:1px solid #e2e8f0">No. Pendaftaran</th>
          <th style="padding:.4rem;border:1px solid #e2e8f0">Nama</th>
          <th style="padding:.4rem;border:1px solid #e2e8f0">Jurusan</th>
          <th style="padding:.4rem;border:1px solid #e2e8f0">Status</th>
        </tr></thead>
        <tbody>${rows(data.registrasiBaru)}</tbody>
      </table>
      <h3 style="margin-top:1.5rem">Daftar Ulang (preview 50 pertama)</h3>
      <table style="border-collapse:collapse;width:100%;font-size:13px">
        <thead><tr style="background:#dbeafe">
          <th style="padding:.4rem;border:1px solid #e2e8f0">No. Pendaftaran</th>
          <th style="padding:.4rem;border:1px solid #e2e8f0">Nama</th>
          <th style="padding:.4rem;border:1px solid #e2e8f0">Jurusan</th>
          <th style="padding:.4rem;border:1px solid #e2e8f0">Status</th>
        </tr></thead>
        <tbody>${rows(data.daftarUlang)}</tbody>
      </table>
      <p style="margin-top:1.5rem">Laporan lengkap (semua data + 2 sheet) tersedia di attachment <code>${data.window.isoDate}-laporan-harian.xlsx</code>.</p>
      <hr style="margin-top:1.5rem"/>
      <p style="color:#64748b;font-size:12px">Dikirim otomatis oleh sistem SPMB SMK PGRI 3 Denpasar ke ${escapeHtml(to)}.</p>
    </body></html>`;
  }

  private buildLaporanLink(isoDate: string): string {
    const adminOrigin = process.env.FRONTEND_ADMIN_ORIGIN ?? 'http://localhost:5174';
    return `${adminOrigin}/laporan-harian/${isoDate}`;
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}