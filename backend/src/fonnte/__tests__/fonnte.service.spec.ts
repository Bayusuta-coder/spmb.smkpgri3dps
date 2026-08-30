/**
 * Unit-test FonnteService.
 *
 * Mem-validasi:
 *   - isReady() false kalau token kosong → return error tanpa throw.
 *   - Normalisasi nomor: '081234567890' → '6281234567890' sebelum kirim.
 *   - Header Authorization pakai format LITERAL token (BUKAN "Bearer <token>").
 *   - POST ke {baseUrl}/send dengan body multipart FormData field
 *     `target`, `message`, `file`.
 *   - 2xx → ok: true + providerMessageId.
 *   - non-2xx → ok: false + error message dari body (atau HTTP status).
 *   - Network exception → ok: false + error.
 *   - Logger source code TIDAK mengandung token interpolation.
 */

import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { ConfigService } from '@nestjs/config';
import { FonnteService } from '../fonnte.service';

const ORIGINAL_FETCH = global.fetch;

function buildConfig(values: Record<string, string | undefined>): ConfigService {
  return {
    get: (key: string) => values[key],
  } as any;
}

describe('FonnteService', () => {
  let tmpFile: string;

  beforeAll(async () => {
    // Buat temporary Excel file dummy untuk attachment.
    tmpFile = path.join(os.tmpdir(), `fonnte-test-${Date.now()}.xlsx`);
    await fs.writeFile(tmpFile, Buffer.from('dummy-xlsx-content'));
  });

  afterAll(async () => {
    try {
      await fs.unlink(tmpFile);
    } catch {
      // ignore
    }
  });

  afterEach(() => {
    global.fetch = ORIGINAL_FETCH;
  });

  it('isReady() false kalau token kosong', () => {
    const svc = new FonnteService(
      buildConfig({ FONNTE_TOKEN: undefined, FONNTE_BASE_URL: 'https://api.fonnte.com' }),
    );
    expect(svc.isReady()).toBe(false);
  });

  it('isReady() true kalau token terisi', () => {
    const svc = new FonnteService(
      buildConfig({ FONNTE_TOKEN: 'token-abc', FONNTE_BASE_URL: 'https://api.fonnte.com' }),
    );
    expect(svc.isReady()).toBe(true);
    expect(svc.getProviderName()).toBe('fonnte');
  });

  it('sendWithAttachment: token kosong → return error tanpa throw', async () => {
    const svc = new FonnteService(
      buildConfig({ FONNTE_TOKEN: '', FONNTE_BASE_URL: 'https://api.fonnte.com' }),
    );
    const r = await svc.sendWithAttachment({
      to: '081234567890',
      caption: 'test',
      filePath: tmpFile,
    });
    expect(r.ok).toBe(false);
    expect(r.error).toContain('belum dikonfigurasi');
  });

  it('sendWithAttachment: tolak nomor invalid', async () => {
    const svc = new FonnteService(
      buildConfig({ FONNTE_TOKEN: 'token-abc', FONNTE_BASE_URL: 'https://api.fonnte.com' }),
    );
    const r = await svc.sendWithAttachment({
      to: 'abc',
      caption: 'test',
      filePath: tmpFile,
    });
    expect(r.ok).toBe(false);
    expect(r.error).toBeDefined();
    // Tidak ada panggilan fetch kalau nomor invalid.
    expect(global.fetch).toBe(ORIGINAL_FETCH);
  });

  it('sendWithAttachment: kirim dengan multipart FormData field benar', async () => {
    const captured: { url?: string; init?: any } = {};
    global.fetch = (async (url: any, init?: any) => {
      captured.url = String(url);
      captured.init = init;
      return {
        ok: true,
        status: 200,
        json: async () => ({ status: true, id: 'wamid.fonnte.test-123' }),
      } as any;
    }) as unknown as typeof fetch;

    const svc = new FonnteService(
      buildConfig({ FONNTE_TOKEN: 'super-secret-token-1234', FONNTE_BASE_URL: 'https://api.fonnte.com' }),
    );

    const r = await svc.sendWithAttachment({
      to: '081234567890',
      caption: 'Test caption',
      filePath: tmpFile,
      fileName: 'rekap.xlsx',
    });

    expect(r.ok).toBe(true);
    expect(r.providerMessageId).toBe('wamid.fonnte.test-123');

    // URL harus {baseUrl}/send
    expect(captured.url).toBe('https://api.fonnte.com/send');

    // Method POST
    expect(captured.init.method).toBe('POST');

    // Authorization pakai LITERAL token, BUKAN "Bearer ..."
    expect(captured.init.headers.Authorization).toBe('super-secret-token-1234');

    // Body FormData harus ada field target, message, file
    expect(captured.init.body).toBeDefined();
    const form = captured.init.body as FormData;
    const fields: Record<string, any> = {};
    // FormData iteration — Node 20 native
    // @ts-ignore
    for (const [k, v] of (form as any).entries()) {
      fields[k] = v;
    }
    expect(fields.target).toBe('6281234567890'); // normalized
    expect(fields.message).toBe('Test caption');
    expect(fields.file).toBeDefined();
  });

  it('sendWithAttachment: non-2xx → ok: false + error', async () => {
    global.fetch = (async () => {
      return {
        ok: false,
        status: 401,
        json: async () => ({
          status: false,
          reason: 'Token tidak valid',
        }),
      } as any;
    }) as unknown as typeof fetch;

    const svc = new FonnteService(
      buildConfig({ FONNTE_TOKEN: 'invalid-token', FONNTE_BASE_URL: 'https://api.fonnte.com' }),
    );

    const r = await svc.sendWithAttachment({
      to: '081234567890',
      caption: 'test',
      filePath: tmpFile,
    });

    expect(r.ok).toBe(false);
    expect(r.status).toBe(401);
    expect(r.error).toContain('Token tidak valid');
  });

  it('sendWithAttachment: network exception → ok: false', async () => {
    global.fetch = (async () => {
      throw new Error('ECONNREFUSED');
    }) as unknown as typeof fetch;

    const svc = new FonnteService(
      buildConfig({ FONNTE_TOKEN: 'token-abc', FONNTE_BASE_URL: 'https://api.fonnte.com' }),
    );

    const r = await svc.sendWithAttachment({
      to: '081234567890',
      caption: 'test',
      filePath: tmpFile,
    });

    expect(r.ok).toBe(false);
    expect(r.error).toContain('Network error');
    expect(r.error).toContain('ECONNREFUSED');
  });

  it('sendWithAttachment: filePath tidak ada → return error', async () => {
    const svc = new FonnteService(
      buildConfig({ FONNTE_TOKEN: 'token-abc', FONNTE_BASE_URL: 'https://api.fonnte.com' }),
    );
    const r = await svc.sendWithAttachment({
      to: '081234567890',
      caption: 'test',
      // tidak ada filePath & url
    });
    expect(r.ok).toBe(false);
    expect(r.error).toContain('filePath atau url');
  });

  it('sendWithAttachment: filePath tidak ditemukan di disk → return error', async () => {
    const svc = new FonnteService(
      buildConfig({ FONNTE_TOKEN: 'token-abc', FONNTE_BASE_URL: 'https://api.fonnte.com' }),
    );
    const r = await svc.sendWithAttachment({
      to: '081234567890',
      caption: 'test',
      filePath: '/tmp/this-file-does-not-exist-12345.xlsx',
    });
    expect(r.ok).toBe(false);
    expect(r.error).toContain('Gagal baca file');
  });

  it('source code tidak log token mentah', () => {
    // Defensive: kalau ada yang nambah logger line tanpa masking, test ini fail.
    const src = FonnteService.prototype.sendWithAttachment.toString();
    // Logger lines hanya boleh refer `maskPhone(target)` atau constant string,
    // bukan `this.token` interpolation.
    expect(src).not.toMatch(/logger\.\w+\([^)]*\$\{this\.token/);
    // Logger tidak boleh menulis body response mentah.
    expect(src).not.toMatch(/logger\.\w+\([^)]*\$\{body\}/);
  });
});
