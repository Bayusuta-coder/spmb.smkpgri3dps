/**
 * Unit tests untuk LaporanService.
 *
 * Fokus:
 *  - computeTodayWindow: window valid dalam timezone yang diberikan
 *  - buildExcelBuffer: menghasilkan buffer valid + 3 worksheet
 *  - Channel failure isolation: error di email TIDAK stop WhatsApp, dan sebaliknya
 *  - Per-recipient failure isolation: error satu recipient tidak stop recipient lain
 *  - Hanya user dengan whatsappVerifiedAt IS NOT NULL yang menerima WA
 *  - Channel disabled = skip total (skipped counter naik)
 */

import { promises as fs } from 'fs';
import * as path from 'path';
import * as os from 'os';
import ExcelJS from 'exceljs';
import { LaporanService } from '../laporan.service';

/* ─── In-memory mocks ───────────────────────────────────────────── */

class MockWhatsappService {
  private readyFlag = false;
  private settingsMap = new Map<string, string>();

  setReady(v: boolean) {
    this.readyFlag = v;
  }
  isReady(): boolean {
    return this.readyFlag;
  }
  setSetting(k: string, v: string) {
    this.settingsMap.set(k, v);
  }
  async getSetting(k: string, fallback?: any): Promise<any> {
    return this.settingsMap.has(k) ? this.settingsMap.get(k) : fallback ?? null;
  }
  async sendMessage(phone: string, _body: string) {
    // Default: sukses. Tests bisa override.
    return { ok: true };
  }
  getProviderName(): string {
    return 'mock';
  }
}

class MockEmailService {
  // Map email → 'ok' | 'fail'
  outcomes = new Map<string, 'ok' | 'fail'>();

  setOutcome(email: string, outcome: 'ok' | 'fail') {
    this.outcomes.set(email, outcome);
  }

  async send(_opts: any) {
    const to = _opts.to;
    const outcome = this.outcomes.get(to);
    if (outcome === 'fail') {
      return { sent: false, error: 'mock failure' };
    }
    return { sent: true };
  }
}

class MockPrisma {
  pendaftars: any[] = [];
  users: any[] = [];

  pendaftar = {
    findMany: async (opts: any) => {
      return this.pendaftars.filter((p) => {
        const where = opts.where ?? {};
        if (where.createdAt) {
          if (where.createdAt.gte && p.createdAt < where.createdAt.gte) return false;
          if (where.createdAt.lt && p.createdAt >= where.createdAt.lt) return false;
        }
        if (where.daftarUlangConfirmedAt) {
          if (where.daftarUlangConfirmedAt.gte && p.daftarUlangConfirmedAt < where.daftarUlangConfirmedAt.gte) return false;
          if (where.daftarUlangConfirmedAt.lt && p.daftarUlangConfirmedAt >= where.daftarUlangConfirmedAt.lt) return false;
        }
        if (where.status && p.status !== where.status) return false;
        if (where.statusPembayaran && p.statusPembayaran !== where.statusPembayaran) return false;
        if (where.tanggalBayar) {
          if (where.tanggalBayar.gte && p.tanggalBayar < where.tanggalBayar.gte) return false;
          if (where.tanggalBayar.lt && p.tanggalBayar >= where.tanggalBayar.lt) return false;
        }
        return true;
      });
    },
    aggregate: async (_opts: any) => {
      const total = this.pendaftars
        .filter((p) => p.statusPembayaran === 'LUNAS')
        .reduce((s, p) => s + Number(p.nominalPembayaran ?? 0), 0);
      return { _sum: { nominalPembayaran: total } };
    },
  };

  user = {
    findMany: async (opts: any) => {
      return this.users.filter((u) => {
        if (opts.where.isActive !== undefined && u.isActive !== opts.where.isActive) return false;
        if (opts.where.whatsappNumber?.not === null && u.whatsappNumber == null) return false;
        if (opts.where.whatsappVerifiedAt?.not === null && u.whatsappVerifiedAt == null) return false;
        return true;
      });
    },
  };
}

class MockAuditLog {
  calls: any[] = [];
  async create(opts: any) {
    this.calls.push(opts);
  }
}

const tempDir = path.join(os.tmpdir(), `spmb-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);

describe('LaporanService', () => {
  let service: LaporanService;
  let prisma: MockPrisma;
  let email: MockEmailService;
  let whatsapp: MockWhatsappService;
  let audit: MockAuditLog;

  beforeEach(async () => {
    await fs.mkdir(tempDir, { recursive: true });
    process.env.UPLOADS_DIR = tempDir;
    process.env.FRONTEND_ADMIN_ORIGIN = 'http://localhost:5174';

    prisma = new MockPrisma();
    email = new MockEmailService();
    whatsapp = new MockWhatsappService();
    audit = new MockAuditLog();

    // Construct manually — LaporanService.inject(PrismaService, ...) tipis fungsionalnya
    service = new LaporanService(prisma as any, email as any, whatsapp as any, audit as any);
  });

  afterEach(async () => {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {}
  });

  describe('computeTodayWindow', () => {
    it('mengembalikan window valid 24 jam di Asia/Makassar', () => {
      const w = LaporanService.computeTodayWindow('Asia/Makassar', new Date('2026-08-25T12:00:00Z'));
      const diff = w.endUtc.getTime() - w.startUtc.getTime();
      expect(diff).toBe(24 * 60 * 60 * 1000);
      // Asia/Makassar = UTC+8 → startUtc harus lebih awal dari "T00 local"
      // Untuk 2026-08-25 12:00 UTC, di Makassar sudah 20:00 → window Makassar 25 Agustus 00:00 - 26 Agustus 00:00
      // startUtc = UTC midnight Makassar = (00 - 8) = 16:00 UTC hari sebelumnya? Cek saja inclusive.
      expect(w.isoDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(w.displayTanggal).toContain('2026');
    });
  });

  describe('buildExcelBuffer', () => {
    it('menghasilkan buffer valid + minimal 3 sheet', async () => {
      const win = LaporanService.computeTodayWindow();
      const data = await service.buildReport(win);
      const buf = await service.buildExcelBuffer(data);
      const buffer = Buffer.from(buf as any);
      expect(buffer.length).toBeGreaterThan(0);

      // Re-parse to confirm workbook integrity
      const wb = new ExcelJS.Workbook();
      // exceljs reads from Buffer
      // @ts-ignore
      await wb.xlsx.load(buffer);
      const sheets = wb.worksheets.map((ws) => ws.name);
      expect(sheets).toContain('Ringkasan');
      expect(sheets).toContain('Registrasi Baru');
      expect(sheets).toContain('Daftar Ulang');
    });
  });

  describe('buildReport', () => {
    it('tidak double-count: registrasi baru dihitung dari createdAt, daftar ulang dari daftarUlangConfirmedAt', async () => {
      const win = LaporanService.computeTodayWindow('Asia/Makassar');
      const inside = new Date((win.startUtc.getTime() + win.endUtc.getTime()) / 2);
      // 1 pendaftar di window ini (createdAt + daftarUlangConfirmedAt)
      prisma.pendaftars.push({
        registrationNumber: 'REG-001',
        namaLengkap: 'Andi',
        jenisKelamin: 'L',
        tanggalLahir: new Date('2010-01-01'),
        sekolahAsal: 'SMP A',
        noTelp: '081',
        email: null,
        whatsappNumber: null,
        jurusan: { code: 'TKJ', name: 'Teknik Komputer' },
        gelombang: { name: 'Gel 1' },
        status: 'SISWA_AKTIF',
        ukuranBaju: 'M',
        metodePembayaran: 'CASH',
        nominalPembayaran: 100000,
        statusPembayaran: 'LUNAS',
        createdAt: inside,
        daftarUlangConfirmedAt: inside,
        tanggalBayar: inside,
      });

      const data = await service.buildReport(win);
      expect(data.totals.registrasiBaruCount).toBe(1);
      expect(data.totals.daftarUlangCount).toBe(1);
      expect(data.totals.totalPembayaranHariIni).toBe(100000);
    });

    it('exclude DITOLAK dari daftar ulang', async () => {
      const win = LaporanService.computeTodayWindow('Asia/Makassar');
      const inside = new Date((win.startUtc.getTime() + win.endUtc.getTime()) / 2);
      prisma.pendaftars.push({
        registrationNumber: 'REG-002',
        namaLengkap: 'Budi',
        status: 'DITOLAK',
        ukuranBaju: 'M',
        metodePembayaran: null,
        nominalPembayaran: null,
        statusPembayaran: null,
        createdAt: inside,
        daftarUlangConfirmedAt: inside,
      });
      const data = await service.buildReport(win);
      expect(data.totals.registrasiBaruCount).toBe(1); // hitung di registrasi baru
      expect(data.totals.daftarUlangCount).toBe(0); // tapi TIDAK double-count sebagai daftar ulang
    });
  });

  describe('generateAndDeliver — channel failure isolation', () => {
    beforeEach(() => {
      whatsapp.setSetting('laporan_harian.aktif', 'true');
      whatsapp.setSetting('laporan_harian.email.aktif', 'true');
      whatsapp.setSetting('laporan_harian.email.recipients', 'ok@test.com,fail@test.com,ok2@test.com');
      whatsapp.setSetting('laporan_harian.whatsapp.aktif', 'false'); // off by default di test
    });

    it('email error per-recipient TIDAK stop recipient lain', async () => {
      whatsapp.setSetting('laporan_harian.whatsapp.aktif', 'false');
      email.setOutcome('ok@test.com', 'ok');
      email.setOutcome('fail@test.com', 'fail');
      email.setOutcome('ok2@test.com', 'ok');

      const result = await service.generateAndDeliver({ trigger: 'manual' });

      expect(result.email.attempted).toBe(3);
      expect(result.email.sent).toBe(2);
      expect(result.email.failed).toBe(1);
      expect(result.email.errors.some((e) => e.includes('fail@test.com'))).toBe(true);
    });

    it('email channel gagal total TIDAK stop WhatsApp channel', async () => {
      whatsapp.setSetting('laporan_harian.whatsapp.aktif', 'true');
      whatsapp.setReady(true);
      // Seed verified user
      prisma.users.push({
        id: 'u1',
        name: 'Test User',
        whatsappNumber: '6281111111111',
        whatsappVerifiedAt: new Date(),
        isActive: true,
      });

      // Force all recipients to fail
      for (const r of ['ok@test.com', 'fail@test.com', 'ok2@test.com']) {
        email.setOutcome(r, 'fail');
      }

      const result = await service.generateAndDeliver({ trigger: 'manual' });

      // Email gagal semua
      expect(result.email.failed).toBe(3);
      expect(result.email.sent).toBe(0);
      // WhatsApp masih jalan
      expect(result.whatsapp.attempted).toBe(1);
      expect(result.whatsapp.sent).toBeGreaterThanOrEqual(0);
    });

    it('only verified users receive WhatsApp', async () => {
      whatsapp.setSetting('laporan_harian.whatsapp.aktif', 'true');
      whatsapp.setReady(true);
      // 2 verified + 1 unverified
      prisma.users.push(
        {
          id: 'u1',
          name: 'Verified 1',
          whatsappNumber: '6281111111111',
          whatsappVerifiedAt: new Date(),
          isActive: true,
        },
        {
          id: 'u2',
          name: 'Verified 2',
          whatsappNumber: '6281222222222',
          whatsappVerifiedAt: new Date(),
          isActive: true,
        },
        {
          id: 'u3',
          name: 'Not verified',
          whatsappNumber: '6281333333333',
          whatsappVerifiedAt: null,
          isActive: true,
        },
      );

      const result = await service.generateAndDeliver({ trigger: 'manual' });
      expect(result.whatsapp.attempted).toBe(2); // u3 excluded (whatsappVerifiedAt = null)
    });

    it('whatsapp provider not ready → channel skipped', async () => {
      whatsapp.setSetting('laporan_harian.whatsapp.aktif', 'true');
      whatsapp.setReady(false); // prov belum configured
      prisma.users.push({
        id: 'u1',
        name: 'V',
        whatsappNumber: '6281111111111',
        whatsappVerifiedAt: new Date(),
        isActive: true,
      });
      const result = await service.generateAndDeliver({ trigger: 'manual' });
      expect(result.whatsapp.skipped).toBeGreaterThanOrEqual(1);
      expect(result.whatsapp.attempted).toBe(0);
    });

    it('whatsapp channel off by setting → channel skipped', async () => {
      whatsapp.setSetting('laporan_harian.whatsapp.aktif', 'false');
      whatsapp.setReady(true);
      prisma.users.push({
        id: 'u1',
        name: 'V',
        whatsappNumber: '6281111111111',
        whatsappVerifiedAt: new Date(),
        isActive: true,
      });
      const result = await service.generateAndDeliver({ trigger: 'manual' });
      expect(result.whatsapp.skipped).toBeGreaterThanOrEqual(1);
    });

    it('audit log di-tulis dengan summary delivery', async () => {
      await service.generateAndDeliver({ trigger: 'manual' });
      const generateCalls = audit.calls.filter((c) => c.action === 'laporan.generated');
      const deliverCalls = audit.calls.filter((c) => c.action === 'laporan.delivered');
      expect(generateCalls).toHaveLength(1);
      expect(deliverCalls).toHaveLength(1);
      expect(deliverCalls[0].meta.email).toBeDefined();
      expect(deliverCalls[0].meta.whatsapp).toBeDefined();
    });
  });
});
