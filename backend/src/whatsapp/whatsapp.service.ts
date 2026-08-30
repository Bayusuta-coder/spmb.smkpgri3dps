/**
 * WhatsappService — facade untuk WhatsApp provider.
 *
 * Provider tunggal: WhatsAppCloudProvider (Meta WhatsApp Cloud API).
 * Tidak ada fallback dev-mode. Kalau provider belum dikonfigurasi,
 * `sendOtp` / `sendMessage` mengembalikan error, dan caller
 * (WhatsappOtpService) akan throw HTTP 500 ke user.
 *
 * Boot-time validation di `onModuleInit`:
 *   - Kalau env tidak lengkap → log error daftar field yang missing,
 *     app tetap boot (supaya endpoint lain tetap jalan).
 *   - Kalau OK → log "WhatsApp Cloud provider aktif (template: X, lang: Y)".
 *
 * Method publik:
 *   - sendOtp(to, code)        → template-based, untuk OTP path
 *   - sendMessage(to, message) → text-mode, untuk LaporanService
 *   - sendTemplateMessage(...) → render template DB lalu kirim text-mode
 *   - isReady()                → untuk UI badge
 *   - getProviderName()        → untuk audit log
 *   - getSetting / getAllSettings / updateSetting → DB-backed settings
 */

import {
  Injectable,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import type {
  SendMessageResult,
  WhatsAppProvider,
} from './whatsapp-provider.interface';
import { WhatsAppCloudProvider } from './whatsapp-cloud.provider';
import { normalizePhoneNumber, renderMessageTemplate } from './whatsapp.util';

@Injectable()
export class WhatsappService implements OnModuleInit {
  private readonly logger = new Logger(WhatsappService.name);
  private readonly provider: WhatsAppProvider;

  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    this.provider = new WhatsAppCloudProvider(config);
  }

  onModuleInit(): void {
    if (this.provider.isConfigured()) {
      this.logger.log(
        `WhatsApp Cloud provider aktif (provider=${this.provider.getProviderName()})`,
      );
    } else {
      this.logger.error(
        'WhatsApp Cloud provider belum dikonfigurasi. Set env berikut: ' +
          'WHATSAPP_PROVIDER=cloud, WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_ACCESS_TOKEN, ' +
          'WHATSAPP_OTP_TEMPLATE, WHATSAPP_OTP_LANG. Request OTP akan gagal (HTTP 500) ' +
          'sampai env diisi.',
      );
    }
  }

  isReady(): boolean {
    return this.provider.isConfigured();
  }

  getProviderName(): string {
    return this.provider.getProviderName();
  }

  /**
   * Kirim kode OTP via template-based Meta WhatsApp Cloud API.
   * Kalau provider belum dikonfigurasi → return error tanpa throw
   * (caller WhatsappOtpService yang map ke HTTP 500).
   */
  async sendOtp(to: string, code: string): Promise<SendMessageResult> {
    if (!this.provider.isConfigured()) {
      return {
        ok: false,
        error: 'WhatsApp provider belum dikonfigurasi',
      };
    }
    return this.provider.sendOtp(to, code);
  }

  /**
   * Kirim text-mode message. Dipakai LaporanService untuk ringkasan ke
   * verified users. Normalisasi nomor di level service (defense in depth).
   */
  async sendMessage(to: string, message: string): Promise<SendMessageResult> {
    const norm = normalizePhoneNumber(to);
    if (!norm.ok) {
      return { ok: false, error: norm.error ?? 'Nomor tidak valid' };
    }
    if (!this.provider.isConfigured()) {
      return {
        ok: false,
        error: 'WhatsApp provider belum dikonfigurasi',
      };
    }
    return this.provider.sendMessage(norm.normalized!, message);
  }

  /**
   * Render template dari `whatsapp_settings` table, substitute placeholder,
   * lalu kirim text-mode. Kalau template key tidak ada, throw Error.
   *
   * Placeholder format: `{key}` — lihat `renderMessageTemplate()`.
   */
  async sendTemplateMessage(
    to: string,
    templateKey: string,
    data: Record<string, string | number>,
  ): Promise<SendMessageResult & { rendered?: string }> {
    const setting = await this.prisma.whatsAppSetting.findUnique({
      where: { key: templateKey },
    });

    if (!setting) {
      return {
        ok: false,
        error: `Template '${templateKey}' belum dikonfigurasi`,
      };
    }

    const rendered = renderMessageTemplate(setting.value, data);
    const sendResult = await this.sendMessage(to, rendered);
    return { ...sendResult, rendered };
  }

  async getSetting(key: string, fallback?: string): Promise<string | undefined> {
    const setting = await this.prisma.whatsAppSetting.findUnique({
      where: { key },
    });
    if (setting?.value != null && setting.value !== '') return setting.value;
    return fallback;
  }

  async getAllSettings(): Promise<Array<{ key: string; value: string; description: string | null }>> {
    const rows = await this.prisma.whatsAppSetting.findMany({
      orderBy: { key: 'asc' },
    });
    return rows.map((r) => ({
      key: r.key,
      value: r.value,
      description: r.description,
    }));
  }

  async updateSetting(
    key: string,
    value: string,
    _updatedByUserId?: string,
  ): Promise<void> {
    await this.prisma.whatsAppSetting.upsert({
      where: { key },
      update: { value },
      create: { key, value },
    });
  }
}
