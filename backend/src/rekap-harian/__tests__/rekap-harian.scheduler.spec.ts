/**
 * Unit-test RekapHarianScheduler.
 *
 * Mem-validasi:
 *   - Tidak trigger kalau `rekap_harian.fonnte.aktif` = 'false'.
 *   - Tidak trigger kalau jam tidak cocok dengan setting.
 *   - Trigger SEKALI per hari (idempotent — panggil 2× dalam window yang
 *     sama → hanya 1× panggil service).
 */

import { RekapHarianScheduler } from '../rekap-harian.scheduler';

class InMemoryWhatsapp {
  settings: Record<string, string> = {};
  async getSetting(key: string, fallback?: any) {
    return this.settings[key] ?? fallback;
  }
}

class InMemoryRekap {
  calls = 0;
  async generateAndDeliver(opts: any) {
    this.calls++;
    return {
      excelPath: null,
      excelBufferSize: 0,
      totals: { pendaftarBaru: 0, siswaAktif: 0 },
      fonnte: { attempted: 0, sent: 0, failed: 0, skipped: 0, errors: [] },
    };
  }
}

function buildConfig(values: Record<string, any> = {}) {
  return { get: (key: string) => values[key] } as any;
}

describe('RekapHarianScheduler', () => {
  let whatsapp: InMemoryWhatsapp;
  let rekap: InMemoryRekap;
  let config: any;

  beforeEach(() => {
    whatsapp = new InMemoryWhatsapp();
    rekap = new InMemoryRekap();
    config = buildConfig({});
  });

  it('tidak trigger kalau aktif=false', async () => {
    whatsapp.settings['rekap_harian.fonnte.aktif'] = 'false';
    const scheduler = new RekapHarianScheduler(config, whatsapp as any, rekap as any);
    await scheduler.checkAndTrigger();
    expect(rekap.calls).toBe(0);
  });

  it('tidak trigger kalau jam setting tidak valid', async () => {
    whatsapp.settings['rekap_harian.fonnte.aktif'] = 'true';
    whatsapp.settings['rekap_harian.fonnte.jam_kirim'] = 'invalid'; // NaN
    const scheduler = new RekapHarianScheduler(config, whatsapp as any, rekap as any);
    await scheduler.checkAndTrigger();
    expect(rekap.calls).toBe(0);
  });

  it('trigger idempotent per hari (panggil 2× → hanya 1× generateAndDeliver)', async () => {
    whatsapp.settings['rekap_harian.fonnte.aktif'] = 'true';
    // Set jam kirim ke jam sekarang (Asia/Makassar)
    const now = new Date();
    const tzFmt = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Makassar',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    const parts = tzFmt.formatToParts(now);
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
    const hh = Number(get('hour'));
    const mm = Number(get('minute'));
    whatsapp.settings['rekap_harian.fonnte.jam_kirim'] = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;

    const scheduler = new RekapHarianScheduler(config, whatsapp as any, rekap as any);

    await scheduler.checkAndTrigger();
    await scheduler.checkAndTrigger();
    await scheduler.checkAndTrigger();

    // Cuma 1× generateAndDeliver (anti-double-trigger)
    expect(rekap.calls).toBe(1);
  });
});
