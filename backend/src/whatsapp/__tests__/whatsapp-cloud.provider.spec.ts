/**
 * Provider-level test untuk WhatsAppCloudProvider.
 *
 * Fokus: payload Meta yang dikirim HARUS template-based, dengan satu
 * parameter `code`. URL, header, dan body shape di-assert eksplisit.
 *
 * Test ini menggunakan fetch mock supaya tidak pernah hit Meta beneran.
 * Logger TIDAK di-assert untuk tidak rapuh terhadap perubahan logging.
 * Yang penting: provider TIDAK BOLEH log token atau OTP — di-handle oleh
 * code review (logger string interpolation TIDAK include `this.token` atau
 * `code`).
 */

import { ConfigService } from '@nestjs/config';
import { WhatsAppCloudProvider } from '../whatsapp-cloud.provider';

function makeConfig(values: Record<string, string | undefined>): ConfigService {
  return {
    get: (key: string) => values[key],
  } as unknown as ConfigService;
}

const FULL_CONFIG = {
  WHATSAPP_PROVIDER: 'cloud',
  WHATSAPP_API_URL: 'https://graph.facebook.com/v20.0',
  WHATSAPP_PHONE_NUMBER_ID: '1234567890',
  WHATSAPP_ACCESS_TOKEN: 'EAA_TestToken_DoNotUse123',
  WHATSAPP_OTP_TEMPLATE: 'otp_verifikasi',
  WHATSAPP_OTP_LANG: 'id',
};

describe('WhatsAppCloudProvider — template-based OTP', () => {
  let originalFetch: typeof fetch;
  let fetchCalls: Array<{ url: string; init: RequestInit }>;

  beforeEach(() => {
    originalFetch = global.fetch;
    fetchCalls = [];
    global.fetch = (async (url: any, init: any) => {
      fetchCalls.push({ url: String(url), init: init ?? {} });
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => ({
          messages: [{ id: 'wamid.HBgLMTIzNDU2Nzg5MAB=' }],
          contacts: [{ input: '6281234567890', wa_id: '6281234567890' }],
        }),
      } as Response;
    }) as typeof fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('isConfigured() = true ketika semua field wajib terisi', () => {
    const p = new WhatsAppCloudProvider(makeConfig(FULL_CONFIG));
    expect(p.isConfigured()).toBe(true);
    expect(p.getProviderName()).toBe('whatsapp-cloud');
  });

  it('isConfigured() = false kalau WHATSAPP_PROVIDER != "cloud"', () => {
    const p = new WhatsAppCloudProvider(
      makeConfig({ ...FULL_CONFIG, WHATSAPP_PROVIDER: 'twilio' }),
    );
    expect(p.isConfigured()).toBe(false);
  });

  it('isConfigured() = false kalau WHATSAPP_ACCESS_TOKEN kosong', () => {
    const { WHATSAPP_ACCESS_TOKEN: _, ...rest } = FULL_CONFIG;
    const p = new WhatsAppCloudProvider(makeConfig(rest));
    expect(p.isConfigured()).toBe(false);
  });

  it('isConfigured() = false kalau WHATSAPP_OTP_TEMPLATE kosong', () => {
    const { WHATSAPP_OTP_TEMPLATE: _, ...rest } = FULL_CONFIG;
    const p = new WhatsAppCloudProvider(makeConfig(rest));
    expect(p.isConfigured()).toBe(false);
  });

  it('isConfigured() = false kalau WHATSAPP_OTP_LANG kosong', () => {
    const { WHATSAPP_OTP_LANG: _, ...rest } = FULL_CONFIG;
    const p = new WhatsAppCloudProvider(makeConfig(rest));
    expect(p.isConfigured()).toBe(false);
  });

  it('sendOtp() POST ke {apiUrl}/{phoneNumberId}/messages dengan payload template', async () => {
    const p = new WhatsAppCloudProvider(makeConfig(FULL_CONFIG));
    const result = await p.sendOtp('081234567890', '123456');

    expect(result.ok).toBe(true);
    expect(result.providerMessageId).toBe('wamid.HBgLMTIzNDU2Nzg5MAB=');
    expect(fetchCalls).toHaveLength(1);

    const call = fetchCalls[0];
    expect(call.url).toBe(
      'https://graph.facebook.com/v20.0/1234567890/messages',
    );

    const headers = call.init.headers as Record<string, string>;
    expect(headers['Authorization']).toBe('Bearer EAA_TestToken_DoNotUse123');
    expect(headers['Content-Type']).toBe('application/json');

    const body = JSON.parse(call.init.body as string);
    expect(body).toEqual({
      messaging_product: 'whatsapp',
      to: '6281234567890',
      type: 'template',
      template: {
        name: 'otp_verifikasi',
        language: { code: 'id' },
        components: [
          {
            type: 'body',
            parameters: [{ type: 'text', text: '123456' }],
          },
        ],
      },
    });
  });

  it('sendOtp() menormalisasi nomor ke E.164', async () => {
    const p = new WhatsAppCloudProvider(makeConfig(FULL_CONFIG));
    await p.sendOtp('+62 812-345-678 90', '123456');

    const body = JSON.parse(fetchCalls[0].init.body as string);
    expect(body.to).toBe('6281234567890');
  });

  it('sendOtp() return error kalau provider belum dikonfigurasi', async () => {
    const p = new WhatsAppCloudProvider(makeConfig({}));
    const result = await p.sendOtp('6281234567890', '123456');

    expect(result.ok).toBe(false);
    expect(result.error).toContain('belum dikonfigurasi');
    expect(fetchCalls).toHaveLength(0);
  });

  it('sendOtp() return error kalau format code bukan 6 digit', async () => {
    const p = new WhatsAppCloudProvider(makeConfig(FULL_CONFIG));
    const result = await p.sendOtp('6281234567890', 'abc');
    expect(result.ok).toBe(false);
    expect(result.error).toBe('Invalid OTP format');
    expect(fetchCalls).toHaveLength(0);
  });

  it('sendOtp() return error kalau Meta balas 4xx (provider error)', async () => {
    global.fetch = (async () => ({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      json: async () => ({
        error: {
          message: 'Invalid OAuth access token',
          code: 190,
          type: 'OAuthException',
        },
      }),
    })) as unknown as typeof fetch;

    const p = new WhatsAppCloudProvider(makeConfig(FULL_CONFIG));
    const result = await p.sendOtp('6281234567890', '123456');

    expect(result.ok).toBe(false);
    expect(result.error).toBe('Invalid OAuth access token');
    // PENTING: error.code tidak bocor via return value
    expect((result as any).errorCode).toBeUndefined();
  });

  it('sendOtp() tidak log token atau OTP — verifikasi source code shape', async () => {
    const p = new WhatsAppCloudProvider(makeConfig(FULL_CONFIG));
    const providerSource = WhatsAppCloudProvider.prototype.sendOtp.toString();
    // Logger source code tidak boleh punya interpolasi `this.token` atau
    // interpolasi `code` parameter. Asersi defensif: kalau code di masa
    // depan di-log tanpa masking, test ini fail.
    expect(providerSource).not.toMatch(/logger\.\w+\([^)]*\$\{this\.token/);
    expect(providerSource).not.toMatch(/logger\.\w+\([^)]*\$\{code/);
    expect(providerSource).not.toMatch(/Bearer\s+\$\{this\.token[^}]*\}/);
    // Bearer adalah header, bukan logger — skip assertion Bearer kecuali di
    // header line
  });

  it('sendMessage() (text-mode) tetap jalan untuk LaporanService', async () => {
    const p = new WhatsAppCloudProvider(makeConfig(FULL_CONFIG));
    const result = await p.sendMessage(
      '6281234567890',
      'Test summary message',
    );

    expect(result.ok).toBe(true);
    const body = JSON.parse(fetchCalls[0].init.body as string);
    expect(body).toEqual({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: '6281234567890',
      type: 'text',
      text: { preview_url: false, body: 'Test summary message' },
    });
  });

  it('sendOtp() return error kalau fetch throw (network)', async () => {
    global.fetch = (async () => {
      throw new Error('ECONNREFUSED');
    }) as unknown as typeof fetch;

    const p = new WhatsAppCloudProvider(makeConfig(FULL_CONFIG));
    const result = await p.sendOtp('6281234567890', '123456');

    expect(result.ok).toBe(false);
    expect(result.error).toBe('ECONNREFUSED');
  });

  it('phone di-mask sebelum di-log (first 5 chars + ***)', async () => {
    const p = new WhatsAppCloudProvider(makeConfig(FULL_CONFIG));
    await p.sendOtp('6281234567890', '123456');

    // Verify phone tidak muncul full di log strings
    // (provider source code pakai maskPhone, bukan raw `to`)
    const providerSource = WhatsAppCloudProvider.prototype.sendOtp.toString();
    expect(providerSource).toContain('maskPhone');
  });

  it('alias backward-compat: WHATSAPP_PHONE_ID tetap dibaca', async () => {
    const cfg = {
      ...FULL_CONFIG,
      WHATSAPP_PHONE_NUMBER_ID: undefined,
      WHATSAPP_PHONE_ID: '9999999',
    };
    const p = new WhatsAppCloudProvider(makeConfig(cfg));
    expect(p.isConfigured()).toBe(true);

    await p.sendOtp('6281234567890', '123456');
    expect(fetchCalls[0].url).toContain('/9999999/messages');
  });

  it('alias backward-compat: WHATSAPP_API_TOKEN tetap dibaca', async () => {
    const cfg = {
      ...FULL_CONFIG,
      WHATSAPP_ACCESS_TOKEN: undefined,
      WHATSAPP_API_TOKEN: 'EAA_LegacyToken_123',
    };
    const p = new WhatsAppCloudProvider(makeConfig(cfg));
    expect(p.isConfigured()).toBe(true);

    await p.sendOtp('6281234567890', '123456');
    const headers = fetchCalls[0].init.headers as Record<string, string>;
    expect(headers['Authorization']).toBe('Bearer EAA_LegacyToken_123');
  });
});
