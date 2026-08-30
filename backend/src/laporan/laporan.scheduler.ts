import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { WhatsappService } from '../whatsapp/whatsapp.service';
import { LaporanService } from './laporan.service';

/**
 * LaporanScheduler — trigger harian otomatis laporan SPMB.
 *
 * Konfigurasi via env var:
 *   LAPORAN_HARIAN_CRON          — default "0 18 * * *" (18:00 setiap hari)
 *   LAPORAN_HARIAN_TIMEZONE      — default "Asia/Makassar"
 *   LAPORAN_HARIAN_ENABLED       — default "true" (untuk disable darurat)
 *
 * Setting DB `laporan_harian.jam_kirim` & `laporan_harian.timezone` override
 * env kalau ada (superadmin bisa edit dari UI Pengaturan Laporan).
 *
 * Pattern: schedule dua cron sekaligus — satu cron "setiap jam" yang cek
 * apakah jam sekarang == jam_kirim; atau pakai cron spesifik kalau jam
 * tetap. Di sini pakai pattern hybrid:
 *   1. Cron setiap jam (default) cek apakah sekarang == jam_kirim (mode env)
 *   2. Atau cron spesifik kalau user set lewat setting DB (di-rebuild)
 *
 * Implementasi simpel: cron setiap 5 menit (cek overhead rendah), di-trigger
 * kalau sekarang cocok dengan jam_kirim (timezone-aware).
 */
@Injectable()
export class LaporanScheduler {
  private readonly logger = new Logger(LaporanScheduler.name);
  private lastTriggeredDate: string | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly whatsapp: WhatsappService,
    private readonly laporan: LaporanService,
  ) {}

  /**
   * Cron setiap 5 menit. Cek apakah sekarang waktunya trigger berdasarkan
   * setting (DB) atau env. Trigger SEKALI per hari per tanggal.
   */
  @Cron('*/5 * * * *', { name: 'laporan-harian-check', timeZone: 'Asia/Makassar' })
  async checkAndTrigger() {
    if (process.env.LAPORAN_HARIAN_ENABLED === 'false') return;

    // Ambil timezone dari setting DB (fallback env)
    const tz =
      (await this.whatsapp.getSetting('laporan_harian.timezone')) ??
      this.config.get<string>('LAPORAN_HARIAN_TIMEZONE') ??
      'Asia/Makassar';

    // Cek apakah channel on
    const masterAktif = await this.whatsapp.getSetting('laporan_harian.aktif', 'true');
    if (masterAktif === 'false') return;

    const window = LaporanService.computeTodayWindow(tz);

    // Ambil jam_kirim dari setting (format HH:MM)
    const jamKirimSetting = await this.whatsapp.getSetting(
      'laporan_harian.jam_kirim',
      this.config.get<string>('LAPORAN_HARIAN_CRON_JAM') ?? '18:00',
    );
    const [hh, mm] = (jamKirimSetting ?? '18:00').split(':').map(Number);
    if (Number.isNaN(hh) || Number.isNaN(mm)) return;

    // Cek apakah "sekarang" (in target TZ) == jam_kirim, dan tanggal == window.isoDate
    const nowInTz = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(new Date());
    const get = (t: string) => nowInTz.find((p) => p.type === t)?.value ?? '';
    const nowYmd = `${get('year')}-${get('month')}-${get('day')}`;
    const nowHour = Number(get('hour'));
    const nowMin = Number(get('minute'));

    // Trigger kalau tanggal sama window.isoDate (hari yang sama) + jam+menit cocok
    // (rentang 5 menit cron — match jam+menit dengan toleransi)
    if (nowYmd !== window.isoDate) return;
    if (Math.abs(nowHour * 60 + nowMin - (hh * 60 + mm)) > 2) return;

    // Sudah trigger hari ini?
    if (this.lastTriggeredDate === nowYmd) return;
    this.lastTriggeredDate = nowYmd;

    this.logger.log(
      `[Scheduler] Memicu laporan harian @ ${nowYmd} ${get('hour')}:${get('minute')} (tz=${tz})`,
    );
    try {
      const result = await this.laporan.generateAndDeliver({
        timezone: tz,
        trigger: 'cron',
      });
      this.logger.log(
        `[Scheduler] Laporan selesai: email ${result.email.sent}/${result.email.attempted}, ` +
          `wa ${result.whatsapp.sent}/${result.whatsapp.attempted} ` +
          `(${result.whatsapp.skipped > 0 ? `skipped=${result.whatsapp.skipped}` : 'all sent'})`,
      );
    } catch (e: any) {
      this.logger.error(`[Scheduler] Gagal generate laporan: ${e?.message ?? e}`, e?.stack);
    }
  }
}