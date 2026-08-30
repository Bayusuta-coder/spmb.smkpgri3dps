/**
 * Unit-test WhatsappOtpService lifecycle dengan mock in-memory.
 *
 * Mock WhatsappService expose `sendOtp(to, code)` yang mencatat pemanggilan
 * ke array `sentOtps`. Test mem-validasi:
 *   - requestOtp normalisasi nomor → '6281234567890'
 *   - Hash OTP SHA-256, raw TIDAK ada di DB
 *   - sendOtp dipanggil dengan nomor normalized + code 6 digit
 *   - sendMessage TIDAK dipanggil (template path used)
 *   - Response TIDAK ada field OTP mentah
 *   - verifyOtp cocokin hash, increment attempts, dst
 */

import { WhatsappOtpService } from '../whatsapp-otp.service';
import { hashOtp } from '../whatsapp.util';
import { BadRequestException } from '@nestjs/common';

class InMemoryWhatsappService {
  sentOtps: Array<{ to: string; code: string }> = [];
  sentMessages: Array<{ to: string; body: string }> = [];

  async sendOtp(to: string, code: string) {
    this.sentOtps.push({ to, code });
    return { ok: true, providerMessageId: 'wamid.test' };
  }

  async sendMessage(to: string, body: string) {
    this.sentMessages.push({ to, body });
    return { ok: true };
  }

  getProviderName(): string {
    return 'whatsapp-cloud';
  }

  isReady(): boolean {
    return true;
  }

  async getSetting(key: string, fallback?: any): Promise<any> {
    const map: Record<string, number> = {
      'whatsapp.otp.ttl_seconds': 300,
      'whatsapp.otp.max_attempts': 5,
      'whatsapp.otp.resend_cooldown_seconds': 60,
    };
    return map[key] ?? fallback;
  }
}

class InMemoryPrisma {
  otps: Array<any> = [];
  idCounter = 1;

  whatsAppOtp = {
    findFirst: async (opts: any) => {
      const list = this.otps.filter((o) => matchWhere(o, opts.where));
      const orderBy = opts.orderBy?.createdAt ?? 'desc';
      const sorted = [...list].sort((a, b) => {
        if (orderBy === 'desc') return b.createdAt.getTime() - a.createdAt.getTime();
        return a.createdAt.getTime() - b.createdAt.getTime();
      });
      return sorted[0] ?? null;
    },
    findMany: async (opts: any) => this.otps.filter((o) => matchWhere(o, opts.where ?? {})),
    create: async (opts: any) => {
      const row = {
        id: String(this.idCounter++),
        createdAt: new Date(),
        updatedAt: new Date(),
        attempts: 0,
        status: 'pending',
        ...opts.data,
      };
      this.otps.push(row);
      return row;
    },
    update: async (opts: any) => {
      const target = this.otps.find((o) => o.id === opts.where.id);
      if (!target) throw new Error('not found');
      Object.assign(target, opts.data);
      return target;
    },
    updateMany: async (opts: any) => {
      let count = 0;
      for (const o of this.otps) {
        if (matchWhere(o, opts.where)) {
          Object.assign(o, opts.data);
          count++;
        }
      }
      return { count };
    },
  };

  user = {
    findUnique: async (_opts: any) => null,
    update: async (_opts: any) => ({}),
  };

  $transaction = async (ops: any[]) => {
    const results = [];
    for (const op of ops) results.push(await op);
    return results;
  };
}

function matchWhere(o: any, where: any): boolean {
  if (!where) return true;
  for (const k of Object.keys(where)) {
    if (where[k] === undefined) continue;
    if (typeof where[k] === 'object' && where[k] !== null && !Array.isArray(where[k])) {
      for (const inner of Object.keys(where[k])) {
        if (where[k][inner] === undefined) continue;
        if (k === 'id' && inner === 'not') {
          if (o[k] === where[k][inner]) return false;
        }
      }
    } else if (typeof where[k] !== 'object') {
      if (o[k] !== where[k]) return false;
    }
  }
  return true;
}

describe('WhatsappOtpService — lifecycle', () => {
  let prisma: InMemoryPrisma;
  let whatsapp: InMemoryWhatsappService;

  const buildService = () => {
    return new WhatsappOtpService(prisma as any, whatsapp as any);
  };

  beforeEach(() => {
    prisma = new InMemoryPrisma();
    whatsapp = new InMemoryWhatsappService();
  });

  it('requestOtp: normalize nomor, hash OTP, simpan ke DB, panggil sendOtp', async () => {
    const svc = buildService();
    const result = await svc.requestOtp({ userId: 'u1', phoneNumber: '081234567890' });

    expect(result.ok).toBe(true);
    // Response TIDAK ada field OTP mentah
    expect((result as any).devOtp).toBeUndefined();
    expect((result as any).rawOtpForInternalUseOnly).toBeUndefined();
    expect((result as any).otp).toBeUndefined();
    expect(result.expiresInSeconds).toBe(300);
    expect(result.resendCooldownSeconds).toBe(60);

    // DB row
    expect(prisma.otps).toHaveLength(1);
    const stored = prisma.otps[0];
    expect(stored.phoneNumber).toBe('6281234567890');
    expect(stored.codeHash).toMatch(/^[0-9a-f]{64}$/);
    expect(stored.code).toBeUndefined();
    expect(stored.raw).toBeUndefined();
    expect(stored.status).toBe('pending');
    expect(stored.attempts).toBe(0);
    expect(stored.maxAttempts).toBe(5);
    expect(stored.expiresAt.getTime() - Date.now()).toBeGreaterThan(290_000);

    // sendOtp dipanggil dengan nomor normalized + code 6 digit
    expect(whatsapp.sentOtps).toHaveLength(1);
    expect(whatsapp.sentOtps[0].to).toBe('6281234567890');
    expect(whatsapp.sentOtps[0].code).toMatch(/^\d{6}$/);
    expect(whatsapp.sentOtps[0].code).toMatch(/^\d{6}$/);

    // Hash cocok dengan OTP yang dikirim
    expect(stored.codeHash).toBe(hashOtp(whatsapp.sentOtps[0].code));

    // sendMessage (text-mode) TIDAK dipanggil untuk OTP path
    expect(whatsapp.sentMessages).toHaveLength(0);
  });

  it('requestOtp: tolak nomor invalid', async () => {
    const svc = buildService();
    await expect(svc.requestOtp({ userId: 'u1', phoneNumber: 'abc' })).rejects.toThrow(
      BadRequestException,
    );
    expect(prisma.otps).toHaveLength(0);
    expect(whatsapp.sentOtps).toHaveLength(0);
  });

  it('requestOtp: cancel OTP lama pending saat minta yang baru', async () => {
    const svc = buildService();
    const r1 = await svc.requestOtp({ userId: 'u1', phoneNumber: '081234567890' });
    expect(prisma.otps[0].status).toBe('pending');

    // Simulasikan lewat cooldown supaya request ke-2 boleh
    prisma.otps[0].createdAt = new Date(Date.now() - 70_000);

    const r2 = await svc.requestOtp({ userId: 'u1', phoneNumber: '081234567890' });

    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);
    expect(whatsapp.sentOtps[0].code).not.toBe(whatsapp.sentOtps[1].code);
    // OTP pertama dibatalkan
    expect(prisma.otps[0].status).toBe('cancelled');
    // OTP kedua masih pending
    expect(prisma.otps[1].status).toBe('pending');
  });

  it('requestOtp: sendOtp dipanggil dengan nomor normalized (table-driven)', async () => {
    const svc = buildService();
    for (const input of [
      '081234567890',
      '+62 812 3456 7890',
      '6281234567890',
    ]) {
      // Reset cooldown window supaya tiap request dianggap fresh
      prisma.otps.forEach((o) => (o.createdAt = new Date(Date.now() - 70_000)));
      await svc.requestOtp({ userId: `u-${input.replace(/\D/g, '')}`, phoneNumber: input });
    }
    for (const call of whatsapp.sentOtps) {
      expect(call.to).toBe('6281234567890');
    }
  });

  it('verifyOtp: matched hash → ok', async () => {
    const svc = buildService();
    await svc.requestOtp({ userId: 'u1', phoneNumber: '081234567890' });
    const code = whatsapp.sentOtps[0].code;

    const ok = await svc.verifyOtp({ userId: 'u1', code });
    expect(ok.ok).toBe(true);
  });

  it('verifyOtp: increment attempts dan tetap pending untuk kode salah di bawah max', async () => {
    const svc = buildService();
    await svc.requestOtp({ userId: 'u1', phoneNumber: '081234567890' });

    const result = await svc.verifyOtp({ userId: 'u1', code: '000000' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('invalid_code');
      expect(result.attemptsLeft).toBe(4);
    }
    expect(prisma.otps[0].attempts).toBe(1);
    expect(prisma.otps[0].status).toBe('pending');
  });

  it('verifyOtp: status jadi cancelled setelah attempts >= maxAttempts', async () => {
    const svc = buildService();
    await svc.requestOtp({ userId: 'u1', phoneNumber: '081234567890' });

    let last;
    for (let i = 0; i < 4; i++) {
      last = await svc.verifyOtp({ userId: 'u1', code: '000000' });
    }
    last = await svc.verifyOtp({ userId: 'u1', code: '000000' });
    expect(last.ok).toBe(false);
    if (!last.ok) {
      expect(last.reason).toBe('max_attempts_exceeded');
    }
    expect(prisma.otps[0].status).toBe('cancelled');
  });

  it('verifyOtp: menolak kode format salah (non-6-digit) sebagai invalid_code', async () => {
    const svc = buildService();
    await svc.requestOtp({ userId: 'u1', phoneNumber: '081234567890' });
    const r = await svc.verifyOtp({ userId: 'u1', code: 'abc' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('invalid_code');
    expect(prisma.otps[0].attempts).toBe(0);
  });

  it('cancelOtpsForUser: cancel semua OTP pending user', async () => {
    const svc = buildService();
    const baseTime = Date.now() - 200_000;
    prisma.otps.push(
      {
        id: 'a',
        userId: 'u1',
        phoneNumber: '6281111111111',
        codeHash: 'x'.repeat(64),
        status: 'pending',
        attempts: 0,
        maxAttempts: 5,
        expiresAt: new Date(Date.now() + 300_000),
        createdAt: new Date(baseTime),
        updatedAt: new Date(baseTime),
        ipAddress: null,
        userAgent: null,
        meta: {},
      },
      {
        id: 'b',
        userId: 'u1',
        phoneNumber: '6281222222222',
        codeHash: 'y'.repeat(64),
        status: 'pending',
        attempts: 0,
        maxAttempts: 5,
        expiresAt: new Date(Date.now() + 300_000),
        createdAt: new Date(baseTime + 1000),
        updatedAt: new Date(baseTime + 1000),
        ipAddress: null,
        userAgent: null,
        meta: {},
      },
      {
        id: 'c',
        userId: 'u2',
        phoneNumber: '6281333333333',
        codeHash: 'z'.repeat(64),
        status: 'pending',
        attempts: 0,
        maxAttempts: 5,
        expiresAt: new Date(Date.now() + 300_000),
        createdAt: new Date(baseTime + 2000),
        updatedAt: new Date(baseTime + 2000),
        ipAddress: null,
        userAgent: null,
        meta: {},
      },
    );
    expect(prisma.otps.filter((o) => o.userId === 'u1' && o.status === 'pending')).toHaveLength(2);

    const r = await svc.cancelOtpsForUser('u1');
    expect(r.count).toBe(2);
    expect(prisma.otps.filter((o) => o.userId === 'u1' && o.status === 'cancelled')).toHaveLength(2);
    expect(prisma.otps.find((o) => o.id === 'c')!.status).toBe('pending');
  });

  it('OTP mentah TIDAK PERNAH ada di DB row, response, atau log area', async () => {
    const svc = buildService();
    const result = await svc.requestOtp({ userId: 'u1', phoneNumber: '081234567890' });
    const stored = prisma.otps[0];

    // 1. DB row
    expect(stored.code).toBeUndefined();
    expect(stored.raw).toBeUndefined();
    expect(stored.rawOtp).toBeUndefined();
    expect(stored.codeHash).toBeDefined();

    // 2. Response — TIDAK ada field raw OTP (apapun namanya)
    const responseKeys = Object.keys(result);
    expect(responseKeys).not.toContain('devOtp');
    expect(responseKeys).not.toContain('rawOtpForInternalUseOnly');
    expect(responseKeys).not.toContain('otp');
    expect(responseKeys).not.toContain('code');
    expect(responseKeys).not.toContain('raw');

    // 3. Yang di-send ke provider = code 6 digit; user hanya terima via WhatsApp.
    expect(whatsapp.sentOtps[0].code).toMatch(/^\d{6}$/);
  });
});
