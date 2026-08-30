/**
 * Test khusus untuk perilaku WhatsappOtpService terhadap skenario provider
 * (Meta WhatsApp Cloud API only — noop sudah dihapus).
 *
 * Skenario:
 *   1. Provider not configured → throw 500 (HTTP 500 = INTERNAL_SERVER_ERROR)
 *      dengan message aman "WhatsApp provider belum dikonfigurasi".
 *   2. Provider cloud error (4xx/5xx/network) → throw 502 BAD_GATEWAY.
 *   3. Provider success → return result tanpa raw OTP.
 *
 * Verifikasi tambahan:
 *   - Response TIDAK pernah ada field OTP mentah.
 *   - Logger tidak mengandung token atau kode OTP.
 */

import { HttpException, HttpStatus } from '@nestjs/common';
import { WhatsappOtpService } from '../whatsapp-otp.service';

type ProviderMode = 'cloud-success' | 'cloud-not-configured' | 'cloud-error' | 'cloud-network-error';

class MockWhatsappService {
  mode: ProviderMode;
  sentOtps: Array<{ to: string; code: string }> = [];

  constructor(mode: ProviderMode = 'cloud-success') {
    this.mode = mode;
  }

  async sendOtp(to: string, code: string) {
    this.sentOtps.push({ to, code });
    if (this.mode === 'cloud-success') {
      return { ok: true, providerMessageId: 'wamid.cloud-test-12345' };
    }
    if (this.mode === 'cloud-not-configured') {
      return { ok: false, error: 'WhatsApp provider belum dikonfigurasi (config missing)' };
    }
    if (this.mode === 'cloud-error') {
      return {
        ok: false,
        error: 'Meta Graph API responded with 401: Invalid OAuth access token',
      };
    }
    return { ok: false, error: 'fetch failed (ECONNREFUSED)' };
  }

  async sendMessage(_to: string, _body: string) {
    return { ok: true };
  }

  getProviderName(): string {
    return 'whatsapp-cloud';
  }

  isReady(): boolean {
    return this.mode === 'cloud-success';
  }

  async getSetting(_key: string, fallback?: any): Promise<any> {
    const map: Record<string, number> = {
      'whatsapp.otp.ttl_seconds': 300,
      'whatsapp.otp.max_attempts': 5,
      'whatsapp.otp.resend_cooldown_seconds': 60,
    };
    return map[_key] ?? fallback;
  }
}

class InMemoryPrisma {
  otps: Array<any> = [];
  idCounter = 1;

  whatsAppOtp = {
    findFirst: async (opts: any) => {
      const list = this.otps.filter((o) =>
        Object.entries(opts.where ?? {}).every(
          ([k, v]) => (v as any) === undefined || o[k] === v,
        ),
      );
      return list[0] ?? null;
    },
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
        if (Object.entries(opts.where ?? {}).every(([k, v]) => (v as any) === undefined || o[k] === v)) {
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

describe('WhatsappOtpService — provider error mapping', () => {
  let prisma: InMemoryPrisma;
  let whatsapp: MockWhatsappService;

  beforeEach(() => {
    prisma = new InMemoryPrisma();
  });

  it('provider not configured → throw 500 + providerError', async () => {
    whatsapp = new MockWhatsappService('cloud-not-configured');
    const svc = new WhatsappOtpService(prisma as any, whatsapp as any);

    let caught: HttpException | null = null;
    try {
      await svc.requestOtp({ userId: 'u1', phoneNumber: '081234567890' });
    } catch (e) {
      caught = e as HttpException;
    }

    expect(caught).toBeInstanceOf(HttpException);
    expect(caught!.getStatus()).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
    const body = caught!.getResponse() as any;
    expect(body.message).toContain('belum dikonfigurasi');
    expect(body.providerError).toContain('belum dikonfigurasi');
    expect(whatsapp.sentOtps).toHaveLength(1);

    // Status verifikasi TIDAK berubah — OTP row pending
    expect(prisma.otps).toHaveLength(1);
    expect(prisma.otps[0].status).toBe('pending');
  });

  it('provider cloud 4xx/5xx → throw 502 + generic message', async () => {
    whatsapp = new MockWhatsappService('cloud-error');
    const svc = new WhatsappOtpService(prisma as any, whatsapp as any);

    let caught: HttpException | null = null;
    try {
      await svc.requestOtp({ userId: 'u1', phoneNumber: '081234567890' });
    } catch (e) {
      caught = e as HttpException;
    }

    expect(caught).toBeInstanceOf(HttpException);
    expect(caught!.getStatus()).toBe(HttpStatus.BAD_GATEWAY);
    const body = caught!.getResponse() as any;
    expect(body.message).toContain('Gagal mengirim OTP');
    expect(body.providerError).toContain('401');
  });

  it('provider network error (ECONNREFUSED) → throw 502', async () => {
    whatsapp = new MockWhatsappService('cloud-network-error');
    const svc = new WhatsappOtpService(prisma as any, whatsapp as any);

    let caught: HttpException | null = null;
    try {
      await svc.requestOtp({ userId: 'u1', phoneNumber: '081234567890' });
    } catch (e) {
      caught = e as HttpException;
    }

    expect(caught).toBeInstanceOf(HttpException);
    expect(caught!.getStatus()).toBe(HttpStatus.BAD_GATEWAY);
  });

  it('provider success → result tanpa raw OTP', async () => {
    whatsapp = new MockWhatsappService('cloud-success');
    const svc = new WhatsappOtpService(prisma as any, whatsapp as any);

    const result = await svc.requestOtp({ userId: 'u1', phoneNumber: '081234567890' });

    expect(result.ok).toBe(true);
    // TIDAK ada field OTP mentah
    expect((result as any).devOtp).toBeUndefined();
    expect((result as any).rawOtpForInternalUseOnly).toBeUndefined();
    expect((result as any).otp).toBeUndefined();
    expect(result.expiresInSeconds).toBeGreaterThan(0);

    expect(whatsapp.sentOtps).toHaveLength(1);
    expect(prisma.otps[0].meta.provider).toBe('whatsapp-cloud');
    expect(prisma.otps[0].meta.providerMessageId).toBe('wamid.cloud-test-12345');
  });

  it('status verifikasi TIDAK berubah saat provider gagal', async () => {
    whatsapp = new MockWhatsappService('cloud-not-configured');
    const svc = new WhatsappOtpService(prisma as any, whatsapp as any);

    try {
      await svc.requestOtp({ userId: 'u1', phoneNumber: '081234567890' });
    } catch (_) {
      // expected 500
    }

    const otpRow = prisma.otps[0];
    expect(otpRow.status).toBe('pending');
    expect(otpRow.codeHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('logger source code tidak mengandung token atau OTP interpolation', () => {
    // Defensive: kalau ada yang nambah logger line tanpa masking, test ini fail.
    const src = WhatsappOtpService.prototype.requestOtp.toString();
    expect(src).not.toMatch(/\$\{[^}]*token[^}]*\}/i);
    expect(src).not.toMatch(/logger\.\w+\([^)]*\$\{raw/);
    // Logger boleh punya `${sendResult.error}` — itu sudah aman (error
    // dari Meta, bukan OTP mentah).
  });
});
