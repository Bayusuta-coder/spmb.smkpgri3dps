import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { WhatsappService } from '../whatsapp/whatsapp.service';
import { RekapHarianService } from './rekap-harian.service';

/**
 * RekapHarianScheduler — trigger harian otomatis rekap harian via Fonnte.
 *
 * Pattern: cron tiap menit (cron expression "every minute") yang cek
 * apakah sekarang cocok dengan `rekap_harian.fonnte.jam_kirim` setting
 * (DB) dengan toleransi ±2 menit. Trigger SEKALI per hari per tanggal
 * (in-memory `lastTriggeredDate`).
 *
 * Setting DB:
 *   - `rekap_harian.fonnte.aktif`       (default 'true')   master on/off
 *   - `rekap_harian.fonnte.jam_kirim`   (default '21:00')  HH:MM (WITA)
 *   - `rekap_harian.fonnte.timezone`    (default 'Asia/Makassar')
 */
@Injectable()
export class RekapHarianScheduler {
  private readonly logger = new Logger(RekapHarianScheduler.name);
  private lastTriggeredDate: string | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly whatsapp: WhatsappService,
    private readonly rekapHarian: RekapHarianService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE, {
    name: 'rekap-harian-fonnte-check',
    timeZone: 'Asia/Makassar',
  })
  async checkAndTrigger() {
    // DEBUG: log setiap tick supaya kelihatan scheduler firing di konsol.
    // Hapus setelah yakin scheduler hidup normal.
    const _tickStart = new Date();

    // Master toggle — escape hatch kalau superadmin disable.
    const aktif = await this.whatsapp.getSetting(
      'rekap_harian.fonnte.aktif',
      'true',
    );
    if (aktif === 'false') {
      this.logger.log(`[tick] aktif=false (skip) @ ${_tickStart.toISOString()}`);
      return;
    }

    const tz =
      (await this.whatsapp.getSetting(
        'rekap_harian.fonnte.timezone',
        this.config.get<string>('REKAP_HARIAN_TIMEZONE') ?? 'Asia/Makassar',
      )) ?? 'Asia/Makassar';

    const jamKirimSetting = await this.whatsapp.getSetting(
      'rekap_harian.fonnte.jam_kirim',
      this.config.get<string>('REKAP_HARIAN_CRON_JAM') ?? '21:00',
    );
    const [hh, mm] = (jamKirimSetting ?? '21:00').split(':').map(Number);
    if (Number.isNaN(hh) || Number.isNaN(mm)) {
      this.logger.warn(
        `[tick] jam_kirim invalid: ${jamKirimSetting} (skip)`,
      );
      return;
    }

    const window = RekapHarianService.computeTodayWindow(tz);

    // "Sekarang" di TZ target
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
    const nowMinutes = nowHour * 60 + nowMin;
    const settingMinutes = hh * 60 + mm;
    const diff = Math.abs(nowMinutes - settingMinutes);

    // Log detail supaya kelihatan kenapa skip atau fire.
    this.logger.log(
      `[tick] aktif=true, tz=${tz}, jamKirim=${jamKirimSetting}, ` +
        `now=${nowYmd} ${get('hour')}:${get('minute')}, ` +
        `window=${window.isoDate}, diff=${diff}m, lastTriggeredDate=${this.lastTriggeredDate ?? '-'}`,
    );

    // Trigger hanya kalau tanggal = window hari ini & jam cocok (±2 menit).
    if (nowYmd !== window.isoDate) return;
    if (diff > 2) return;

    // Anti double-trigger per hari.
    if (this.lastTriggeredDate === nowYmd) {
      this.logger.log(`[tick] sudah trigger hari ini (skip)`);
      return;
    }
    this.lastTriggeredDate = nowYmd;

    this.logger.log(
      `[RekapHarianScheduler] Memicu rekap harian via Fonnte @ ${nowYmd} ` +
        `${get('hour')}:${get('minute')} (tz=${tz})`,
    );

    try {
      const result = await this.rekapHarian.generateAndDeliver({
        timezone: tz,
        trigger: 'cron',
      });
      this.logger.log(
        `[RekapHarianScheduler] Selesai: pendaftarBaru=${result.totals.pendaftarBaru}, ` +
          `siswaAktif=${result.totals.siswaAktif}, ` +
          `fonnte sent=${result.fonnte.sent}/${result.fonnte.attempted}` +
          (result.fonnte.skipped > 0
            ? `, skipped=${result.fonnte.skipped}`
            : ''),
      );
    } catch (e: any) {
      this.logger.error(
        `[RekapHarianScheduler] Gagal generate rekap harian: ${e?.message ?? e}`,
        e?.stack,
      );
    }
  }
}
