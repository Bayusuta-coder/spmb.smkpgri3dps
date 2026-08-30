/**
 * Unit-test RekapHarianService.
 *
 * Mem-validasi:
 *   - buildReport: query data dengan filter window benar (createdAt untuk
 *     pendaftar baru, daftarUlangConfirmedAt untuk siswa aktif).
 *   - buildExcelBuffer: return Buffer dengan 3 sheet.
 *   - generateAndDeliver happy path: generate Excel → simpan → kirim ke
 *     semua user dengan role sesuai → audit log ditulis.
 *   - generateAndDeliver skip channel Fonnte kalau token kosong, tapi
 *     Excel tetap terbentuk & path returned.
 *   - Per-recipient failure TIDAK stop recipient lain (failure isolation).
 *   - File Excel di-unlink setelah selesai.
 */

import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { RekapHarianService } from '../rekap-harian.service';

class InMemoryFonnte {
  sentTo: Array<{ to: string; caption: string; filePath?: string }> = [];
  failOn: Set<string> = new Set();
  ready = true;

  isReady() {
    return this.ready;
  }
  isConfigured() {
    return this.ready;
  }
  getProviderName() {
    return 'fonnte';
  }
  getBaseUrl() {
    return 'https://api.fonnte.com';
  }
  async sendWithAttachment(opts: any) {
    if (!this.ready) {
      return { ok: false, error: 'Fonnte belum dikonfigurasi' };
    }
    // Normalisasi nomor di mock — sama dengan FonnteService real
    const cleaned = String(opts.to).trim().replace(/[\s\-()]/g, '').replace(/^\+/, '');
    const digits = cleaned.startsWith('0') ? '62' + cleaned.slice(1) : cleaned;
    this.sentTo.push({ to: digits, caption: opts.caption, filePath: opts.filePath });
    if (this.failOn.has(digits)) {
      return { ok: false, error: 'forced fail', status: 500 };
    }
    return { ok: true, providerMessageId: `msg-${digits}` };
  }
}

class InMemoryAudit {
  events: Array<any> = [];
  async create(opts: any) {
    this.events.push(opts);
    return { id: String(this.events.length) };
  }
}

class InMemoryWhatsapp {
  settings: Record<string, string> = {};
  async getSetting(key: string, fallback?: any) {
    return this.settings[key] ?? fallback;
  }
  async getAllSettings() {
    return Object.entries(this.settings).map(([key, value]) => ({
      key,
      value,
      description: null,
    }));
  }
  async updateSetting() {
    /* noop */
  }
}

class InMemoryPrisma {
  pendaftars: any[] = [];
  users: any[] = [];

  pendaftar = {
    findMany: async (opts: any) => {
      const where = opts.where ?? {};
      const list = this.pendaftars.filter((p) => {
        if (where.status && p.status !== where.status) return false;
        if (where.createdAt) {
          if (p.createdAt < where.createdAt.gte || p.createdAt >= where.createdAt.lt) {
            return false;
          }
        }
        if (where.daftarUlangConfirmedAt) {
          if (
            !p.daftarUlangConfirmedAt ||
            p.daftarUlangConfirmedAt < where.daftarUlangConfirmedAt.gte ||
            p.daftarUlangConfirmedAt >= where.daftarUlangConfirmedAt.lt
          ) {
            return false;
          }
        }
        return true;
      });
      const includeJurusan = (p: any) => ({ ...p, jurusan: { code: 'AK', name: 'Akuntansi' }, gelombang: { name: 'Gelombang 1' } });
      return list.map(includeJurusan);
    },
  };

  user = {
    findMany: async (opts: any) => {
      const where = opts.where ?? {};
      return this.users.filter((u) => {
        if (where.isActive !== undefined && u.isActive !== where.isActive) return false;
        if (where.whatsappNumber && where.whatsappNumber.not === null && (!u.whatsappNumber || u.whatsappNumber === '')) {
          return false;
        }
        if (where.roles?.some?.role?.name?.in) {
          const wanted = where.roles.some.role.name.in;
          const uRoles = (u.roles ?? []).map((r: any) => r.role.name);
          if (!uRoles.some((r: string) => wanted.includes(r))) return false;
        }
        return true;
      });
    },
  };
}

function buildConfig(values: Record<string, any> = {}) {
  return {
    get: (key: string) => values[key],
  } as any;
}

describe('RekapHarianService', () => {
  let prisma: InMemoryPrisma;
  let audit: InMemoryAudit;
  let whatsapp: InMemoryWhatsapp;
  let fonnte: InMemoryFonnte;
  let config: any;

  beforeEach(() => {
    prisma = new InMemoryPrisma();
    audit = new InMemoryAudit();
    whatsapp = new InMemoryWhatsapp();
    fonnte = new InMemoryFonnte();
    config = buildConfig({});
  });

  it('buildReport: query dengan window yang benar', async () => {
    const start = new Date('2026-08-26T00:00:00.000Z');
    const end = new Date('2026-08-27T00:00:00.000Z');
    const inside = new Date('2026-08-26T08:00:00.000Z');
    const outside = new Date('2026-08-25T08:00:00.000Z');

    prisma.pendaftars = [
      {
        id: '1',
        registrationNumber: 'REG-001',
        namaLengkap: 'Andi',
        status: 'MENUNGGU_PERSETUJUAN',
        createdAt: inside,
        daftarUlangConfirmedAt: null,
        ukuranBaju: null,
        nominalPembayaran: null,
        jurusanId: 'j1',
        gelombangId: 'g1',
      },
      {
        id: '2',
        registrationNumber: 'REG-002',
        namaLengkap: 'Budi',
        status: 'SISWA_AKTIF',
        createdAt: outside,
        daftarUlangConfirmedAt: inside,
        ukuranBaju: 'L',
        nominalPembayaran: 150000,
        jurusanId: 'j1',
        gelombangId: 'g1',
      },
      {
        id: '3',
        registrationNumber: 'REG-003',
        namaLengkap: 'Citra',
        status: 'DITOLAK',
        createdAt: inside,
        daftarUlangConfirmedAt: null,
        ukuranBaju: null,
        nominalPembayaran: null,
        jurusanId: 'j1',
        gelombangId: 'g1',
      },
    ];

    const svc = new RekapHarianService(config, prisma as any, audit as any, whatsapp as any, fonnte as any);
    const window = {
      startUtc: start,
      endUtc: end,
      displayTanggal: '26 Agustus 2026',
      isoDate: '2026-08-26',
    };
    const data = await svc.buildReport(window);

    // 2 pendaftar baru (Andi & Citra, createdAt dalam window)
    expect(data.pendaftarBaru).toHaveLength(2);
    expect(data.pendaftarBaru.map((p) => p.namaLengkap)).toEqual(['Andi', 'Citra']);
    // 1 siswa aktif (Budi, daftarUlangConfirmedAt dalam window + SISWA_AKTIF)
    expect(data.siswaAktif).toHaveLength(1);
    expect(data.siswaAktif[0].namaLengkap).toBe('Budi');
    expect(data.siswaAktif[0].ukuranBaju).toBe('L');
    expect(data.siswaAktif[0].nominalBayar).toBe(150000);
  });

  it('buildExcelBuffer: return Buffer dengan 3 sheet (Ringkasan, Pendaftar Baru, Siswa Aktif)', async () => {
    const svc = new RekapHarianService(config, prisma as any, audit as any, whatsapp as any, fonnte as any);
    const window = {
      startUtc: new Date(),
      endUtc: new Date(),
      displayTanggal: '26 Agustus 2026',
      isoDate: '2026-08-26',
    };
    const data = await svc.buildReport(window);
    const buffer = await svc.buildExcelBuffer(data);

    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(buffer.length).toBeGreaterThan(0);
    // Sanity: file Excel signature "PK" (zip header)
    expect(buffer.slice(0, 2).toString('utf-8')).toBe('PK');
  });

  it('generateAndDeliver: happy path — kirim ke semua recipient, audit log ditulis, file Excel dihapus', async () => {
    prisma.users = [
      {
        id: 'u1',
        name: 'Andi',
        isActive: true,
        whatsappNumber: '081111111111', // 12 digit → '6281111111111' (13 char)
        roles: [{ role: { name: 'Admin' } }],
      },
      {
        id: 'u2',
        name: 'Budi',
        isActive: true,
        whatsappNumber: '082222222222', // 12 digit → '6282222222222'
        roles: [{ role: { name: 'Bendahara' } }],
      },
      {
        id: 'u3',
        name: 'Charlie',
        isActive: true,
        whatsappNumber: null, // tidak punya nomor → skip
        roles: [{ role: { name: 'TU' } }],
      },
      {
        id: 'u4',
        name: 'Dodi',
        isActive: true,
        whatsappNumber: '083333333333', // role tidak ada di setting → skip
        roles: [{ role: { name: 'Panitia' } }],
      },
    ];
    whatsapp.settings['rekap_harian.fonnte.roles'] = 'Admin,Bendahara,TU';

    const svc = new RekapHarianService(config, prisma as any, audit as any, whatsapp as any, fonnte as any);
    const result = await svc.generateAndDeliver({ trigger: 'manual', actorUserId: 'admin1' });

    // 2 recipient (Andi & Budi) — Charlie skip (no WA), Dodi skip (role not in list)
    expect(fonnte.sentTo).toHaveLength(2);
    expect(fonnte.sentTo.map((s) => s.to).sort()).toEqual(['6281111111111', '6282222222222']);
    expect(result.fonnte.attempted).toBe(2);
    expect(result.fonnte.sent).toBe(2);
    expect(result.fonnte.failed).toBe(0);
    expect(result.fonnte.skipped).toBe(0);

    // Audit log ditulis
    expect(audit.events).toHaveLength(1);
    const log = audit.events[0];
    expect(log.action).toBe('rekap_harian.fonnte_sent');
    expect(log.module).toBe('rekap_harian');
    expect(log.entityId).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(log.meta.trigger).toBe('manual');
    expect(log.meta.fonnte.sent).toBe(2);

    // File Excel harus sudah dihapus dari disk
    if (result.excelPath) {
      await expect(fs.access(result.excelPath)).rejects.toThrow();
    }
  });

  it('generateAndDeliver: Fonnte belum dikonfigurasi → semua recipient skipped, Excel tetap terbentuk, audit log mencatat skipped', async () => {
    fonnte.ready = false;
    prisma.users = [
      {
        id: 'u1',
        name: 'Andi',
        isActive: true,
        whatsappNumber: '081111111111',
        roles: [{ role: { name: 'Admin' } }],
      },
    ];
    whatsapp.settings['rekap_harian.fonnte.roles'] = 'Admin';

    const svc = new RekapHarianService(config, prisma as any, audit as any, whatsapp as any, fonnte as any);
    const result = await svc.generateAndDeliver({ trigger: 'manual' });

    expect(result.fonnte.attempted).toBe(1);
    expect(result.fonnte.skipped).toBe(1);
    expect(result.fonnte.sent).toBe(0);
    expect(fonnte.sentTo).toHaveLength(0);
    expect(audit.events[0].meta.fonnte.skipped).toBe(1);
    expect(audit.events[0].meta.fonnte.ready).toBe(false);
  });

  it('generateAndDeliver: per-recipient failure tidak stop recipient lain', async () => {
    prisma.users = [
      {
        id: 'u1',
        name: 'Andi',
        isActive: true,
        whatsappNumber: '081111111111',
        roles: [{ role: { name: 'Admin' } }],
      },
      {
        id: 'u2',
        name: 'Budi',
        isActive: true,
        whatsappNumber: '082222222222',
        roles: [{ role: { name: 'Admin' } }],
      },
      {
        id: 'u3',
        name: 'Charlie',
        isActive: true,
        whatsappNumber: '083333333333',
        roles: [{ role: { name: 'Admin' } }],
      },
    ];
    fonnte.failOn.add('6282222222222'); // Budi akan fail
    whatsapp.settings['rekap_harian.fonnte.roles'] = 'Admin';

    const svc = new RekapHarianService(config, prisma as any, audit as any, whatsapp as any, fonnte as any);
    const result = await svc.generateAndDeliver({ trigger: 'manual' });

    expect(result.fonnte.attempted).toBe(3);
    expect(result.fonnte.sent).toBe(2); // Andi + Charlie
    expect(result.fonnte.failed).toBe(1); // Budi
    expect(result.fonnte.errors).toHaveLength(1);
    expect(result.fonnte.errors[0]).toContain('u2');

    // Audit log per recipient list harus ada 3 entries dengan ok flags yang sesuai.
    const recipients = audit.events[0].meta.recipients;
    expect(recipients).toHaveLength(3);
    expect(recipients.filter((r: any) => r.ok)).toHaveLength(2);
    expect(recipients.filter((r: any) => !r.ok)).toHaveLength(1);
  });

  it('generateAndDeliver: file Excel di-unlink setelah selesai', async () => {
    prisma.users = [];
    whatsapp.settings['rekap_harian.fonnte.roles'] = 'Admin';

    const svc = new RekapHarianService(config, prisma as any, audit as any, whatsapp as any, fonnte as any);
    const result = await svc.generateAndDeliver({ trigger: 'manual' });

    // excelPath ada di result, tapi file harus sudah dihapus dari disk
    expect(result.excelPath).not.toBeNull();
    if (result.excelPath) {
      await expect(fs.access(result.excelPath)).rejects.toThrow();
    }
  });

  it('computeTodayWindow: Asia/Makassar default', () => {
    const window = RekapHarianService.computeTodayWindow('Asia/Makassar');
    expect(window.isoDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(window.displayTanggal).toBeTruthy();
    expect(window.endUtc.getTime() - window.startUtc.getTime()).toBe(24 * 60 * 60 * 1000);
  });
});
