/**
 * WhatsApp Cloud API provider (Meta Graph API v20.0).
 *
 * Env vars:
 *   WHATSAPP_PROVIDER           — harus 'cloud' (case-insensitive). Lain = not configured.
 *   WHATSAPP_API_URL            — default https://graph.facebook.com/v20.0
 *   WHATSAPP_PHONE_NUMBER_ID    — phone number ID dari Meta Business Suite
 *                                 (alias: WHATSAPP_PHONE_ID, untuk backward-compat)
 *   WHATSAPP_ACCESS_TOKEN       — system user permanent access token
 *                                 (alias: WHATSAPP_API_TOKEN)
 *   WHATSAPP_OTP_TEMPLATE       — nama template OTP yang sudah di-approve Meta
 *                                 (template body harus punya placeholder {{1}} untuk code)
 *   WHATSAPP_OTP_LANG           — kode bahasa template (mis. 'id', 'en')
 *
 * Logging discipline: HANYA boleh log:
 *   - getProviderName() (constant)
 *   - error.code dari Meta response
 *   - providerMessageId dari response.messages[0].id
 *   - phone.slice(0, 5) + '***'
 * TIDAK boleh log: token, code (OTP), full request body, full response body.
 */

import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { SendMessageResult, WhatsAppProvider } from './whatsapp-provider.interface';
import { maskPhone, normalizePhoneNumber } from './whatsapp.util';

export class WhatsAppCloudProvider implements WhatsAppProvider {
  private readonly logger = new Logger(WhatsAppCloudProvider.name);
  private readonly providerName: string;
  private readonly apiUrl: string;
  private readonly phoneNumberId: string | undefined;
  private readonly accessToken: string | undefined;
  private readonly otpTemplate: string | undefined;
  private readonly otpLang: string | undefined;

  constructor(config: ConfigService) {
    this.providerName = String(
      config.get<string>('WHATSAPP_PROVIDER') ?? '',
    )
      .trim()
      .toLowerCase();
    this.apiUrl =
      config.get<string>('WHATSAPP_API_URL') ?? 'https://graph.facebook.com/v20.0';
    this.phoneNumberId =
      config.get<string>('WHATSAPP_PHONE_NUMBER_ID') ??
      config.get<string>('WHATSAPP_PHONE_ID');
    this.accessToken =
      config.get<string>('WHATSAPP_ACCESS_TOKEN') ??
      config.get<string>('WHATSAPP_API_TOKEN');
    this.otpTemplate = config.get<string>('WHATSAPP_OTP_TEMPLATE');
    this.otpLang = config.get<string>('WHATSAPP_OTP_LANG');
  }

  isConfigured(): boolean {
    return Boolean(
      this.providerName === 'cloud' &&
        this.phoneNumberId &&
        this.accessToken &&
        this.otpTemplate &&
        this.otpLang,
    );
  }

  getProviderName(): string {
    return 'whatsapp-cloud';
  }

  /**
   * Kirim OTP via template-based Meta WhatsApp Cloud API.
   *
   * Payload:
   *   {
   *     messaging_product: 'whatsapp',
   *     to: '<normalized E.164>',
   *     type: 'template',
   *     template: {
   *       name: '<WHATSAPP_OTP_TEMPLATE>',
   *       language: { code: '<WHATSAPP_OTP_LANG>' },
   *       components: [{ type: 'body', parameters: [{ type: 'text', text: '<code>' }] }]
   *     }
   *   }
   */
  async sendOtp(to: string, code: string): Promise<SendMessageResult> {
    if (!this.isConfigured()) {
      return {
        ok: false,
        error:
          'WhatsApp provider belum dikonfigurasi (WHATSAPP_PROVIDER/WHATSAPP_PHONE_NUMBER_ID/WHATSAPP_ACCESS_TOKEN/WHATSAPP_OTP_TEMPLATE/WHATSAPP_OTP_LANG)',
      };
    }
    if (!/^\d{6}$/.test(code)) {
      return { ok: false, error: 'Invalid OTP format' };
    }

    const norm = normalizePhoneNumber(to);
    if (!norm.ok || !norm.normalized) {
      return { ok: false, error: norm.error ?? 'Nomor tidak valid' };
    }
    const normalized = norm.normalized;

    const url = `${this.apiUrl}/${this.phoneNumberId}/messages`;
    const payload = {
      messaging_product: 'whatsapp',
      to: normalized,
      type: 'template',
      template: {
        name: this.otpTemplate,
        language: { code: this.otpLang },
        components: [
          {
            type: 'body',
            parameters: [{ type: 'text', text: code }],
          },
        ],
      },
    };

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const data: any = await res.json().catch(() => ({}));

      if (!res.ok) {
        const errorMsg =
          data?.error?.message ?? `HTTP ${res.status} ${res.statusText}`;
        this.logger.warn(
          `WhatsApp Cloud OTP send gagal provider=${this.getProviderName()} ` +
            `phone=${maskPhone(normalized)} code=${data?.error?.code ?? '?'} ` +
            `httpStatus=${res.status}`,
        );
        return { ok: false, error: errorMsg };
      }

      const providerMessageId = data?.messages?.[0]?.id;
      this.logger.log(
        `WhatsApp Cloud OTP terkirim provider=${this.getProviderName()} ` +
          `phone=${maskPhone(normalized)} msgId=${providerMessageId ?? '?'}`,
      );
      return { ok: true, providerMessageId };
    } catch (e: any) {
      this.logger.error(
        `WhatsApp Cloud OTP exception provider=${this.getProviderName()} ` +
          `phone=${maskPhone(normalized)} reason=${e?.message ?? 'unknown'}`,
      );
      return { ok: false, error: e?.message ?? String(e) };
    }
  }

  /**
   * Kirim text-mode message. Dipakai LaporanService untuk ringkasan ke
   * verified users (Meta izinkan text-mode kalau user initiate session
   * dalam 24 jam).
   */
  async sendMessage(to: string, message: string): Promise<SendMessageResult> {
    if (!this.isConfigured()) {
      return {
        ok: false,
        error:
          'WhatsApp provider belum dikonfigurasi (WHATSAPP_PROVIDER/WHATSAPP_PHONE_NUMBER_ID/WHATSAPP_ACCESS_TOKEN/WHATSAPP_OTP_TEMPLATE/WHATSAPP_OTP_LANG)',
      };
    }

    const norm = normalizePhoneNumber(to);
    if (!norm.ok || !norm.normalized) {
      return { ok: false, error: norm.error ?? 'Nomor tidak valid' };
    }
    const normalized = norm.normalized;

    const url = `${this.apiUrl}/${this.phoneNumberId}/messages`;
    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: normalized,
      type: 'text',
      text: { preview_url: false, body: message },
    };

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const data: any = await res.json().catch(() => ({}));

      if (!res.ok) {
        const errorMsg =
          data?.error?.message ?? `HTTP ${res.status} ${res.statusText}`;
        this.logger.warn(
          `WhatsApp Cloud text send gagal provider=${this.getProviderName()} ` +
            `phone=${maskPhone(normalized)} code=${data?.error?.code ?? '?'} ` +
            `httpStatus=${res.status}`,
        );
        return { ok: false, error: errorMsg };
      }

      const providerMessageId = data?.messages?.[0]?.id;
      this.logger.log(
        `WhatsApp Cloud text terkirim provider=${this.getProviderName()} ` +
          `phone=${maskPhone(normalized)} msgId=${providerMessageId ?? '?'}`,
      );
      return { ok: true, providerMessageId };
    } catch (e: any) {
      this.logger.error(
        `WhatsApp Cloud text exception provider=${this.getProviderName()} ` +
          `phone=${maskPhone(normalized)} reason=${e?.message ?? 'unknown'}`,
      );
      return { ok: false, error: e?.message ?? String(e) };
    }
  }
}
