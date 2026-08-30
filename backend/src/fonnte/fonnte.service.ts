/**
 * FonnteService — kirim pesan WhatsApp via Fonnte REST API.
 *
 * INDEPENDENT dari WhatsappService (Meta Cloud API) yang dipakai OTP.
 * Service ini KHUSUS untuk notifikasi rekap harian ke user panitia.
 * Tidak ada DI cycle ke module WhatsApp — untuk util normalisasi nomor &
 * masking, service ini import pure function dari `whatsapp/whatsapp.util.ts`
 * (bukan module DI), supaya tidak bentrok dengan OTP path.
 *
 * Provider: Fonnte (https://fonnte.com)
 *   - Base URL: env FONNTE_BASE_URL (default https://api.fonnte.com)
 *   - Endpoint: POST {baseUrl}/send
 *   - Header:  Authorization: <token>  (LITERAL, BUKAN "Bearer <token>")
 *   - Body:    multipart/form-data
 *               field `target`   = nomor tujuan (E.164, mis. 6281234567890)
 *               field `message`  = caption
 *               field `file`     = lampiran (Blob dari fs.readFile)
 *               atau `url`       = URL file (alternatif tanpa upload lokal)
 *
 * Env: FONNTE_TOKEN (WAJIB di production untuk kirim; kosong = skip channel).
 *
 * Failure mode:
 *   - Token kosong → return { ok: false, error: 'Fonnte belum dikonfigurasi' }
 *     tanpa throw. Caller (RekapHarianService) catat sebagai `skipped`.
 *   - HTTP non-2xx → return { ok: false, error: <safe msg>, status }
 *   - Network exception → return { ok: false, error: e.message }
 *
 * Logging discipline:
 *   - Logger HANYA boleh memuat: provider name ('fonnte'), HTTP status,
 *     Fonnte message id (kalau ada), nomor tujuan yang sudah di-mask.
 *   - DILARANG log: token, full body response, full body request, full nomor.
 */

import {
  Injectable,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { promises as fs } from 'fs';
import { normalizePhoneNumber, maskPhone } from '../whatsapp/whatsapp.util';

export interface FonnteSendOptions {
  /** Nomor tujuan — akan dinormalisasi ke 628xxxxxxxxxx */
  to: string;
  /** Caption pesan (text body) */
  caption: string;
  /** Path file Excel di disk — akan di-read dan dikirim sebagai field `file` */
  filePath?: string;
  /** Nama file saat diterima user (opsional, default = basename(filePath)) */
  fileName?: string;
  /** Alternatif: URL file external — kalau tidak pakai filePath */
  url?: string;
}

export interface FonnteSendResult {
  ok: boolean;
  providerMessageId?: string;
  error?: string;
  status?: number;
}

const PROVIDER_NAME = 'fonnte';

@Injectable()
export class FonnteService implements OnModuleInit {
  private readonly logger = new Logger(FonnteService.name);
  private readonly token: string | undefined;
  private readonly baseUrl: string;

  constructor(config: ConfigService) {
    // BACA LANGSUNG dari ConfigService — tidak pakai WhatsappService / settings.
    this.token = (
      config.get<string>('FONNTE_TOKEN') ??
      process.env.FONNTE_TOKEN ??
      ''
    ).trim();
    this.baseUrl = (
      config.get<string>('FONNTE_BASE_URL') ??
      process.env.FONNTE_BASE_URL ??
      'https://api.fonnte.com'
    ).replace(/\/+$/, '');
  }

  onModuleInit(): void {
    if (this.isReady()) {
      this.logger.log(
        `Fonnte provider aktif (provider=${PROVIDER_NAME}, baseUrl=${this.baseUrl})`,
      );
    } else {
      // Warn (bukan error) — channel Fonnte opsional. App tetap boot normal.
      this.logger.warn(
        'Fonnte belum dikonfigurasi (FONNTE_TOKEN kosong). Channel notifikasi ' +
          'rekap harian via Fonnte akan di-skip sampai env diisi.',
      );
    }
  }

  isReady(): boolean {
    return !!this.token && this.token.length > 0;
  }

  isConfigured(): boolean {
    return this.isReady();
  }

  getProviderName(): string {
    return PROVIDER_NAME;
  }

  getBaseUrl(): string {
    return this.baseUrl;
  }

  /**
   * Kirim pesan WhatsApp via Fonnte dengan lampiran file.
   *
   * Returns FonnteSendResult — TIDAK throw pada error supaya caller bisa
   * loop per recipient dengan failure isolation (satu gagal, lain lanjut).
   */
  async sendWithAttachment(opts: FonnteSendOptions): Promise<FonnteSendResult> {
    if (!this.isReady()) {
      return {
        ok: false,
        error: 'Fonnte belum dikonfigurasi (FONNTE_TOKEN kosong)',
      };
    }

    // Normalisasi nomor — pakai util langsung dari whatsapp.util (pure fn).
    const norm = normalizePhoneNumber(opts.to);
    if (!norm.ok) {
      return { ok: false, error: norm.error ?? 'Nomor tidak valid' };
    }
    const target = norm.normalized!;

    if (!opts.caption || opts.caption.trim() === '') {
      return { ok: false, error: 'Caption kosong' };
    }

    // Build FormData (Node 18+ native FormData & Blob di-undici / undici-types).
    // Pakai native FormData (Node 20+) — proyek ini sudah pakai NestJS 10 +
    // Node 20, jadi FormData tersedia global.
    const form = new FormData();
    form.append('target', target);
    form.append('message', opts.caption);

    let fileAttached = false;
    if (opts.filePath) {
      try {
        const buf = await fs.readFile(opts.filePath);
        const filename =
          opts.fileName ?? opts.filePath.split(/[\\/]/).pop() ?? 'attachment.xlsx';
        // Blob + filename via BlobPart — Node 20 native Blob.
        const blob = new Blob([new Uint8Array(buf)], {
          type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        });
        form.append('file', blob, filename);
        fileAttached = true;
      } catch (e: any) {
        return {
          ok: false,
          error: `Gagal baca file lampiran: ${e?.message ?? e}`,
        };
      }
    } else if (opts.url) {
      form.append('url', opts.url);
      fileAttached = true;
    }

    if (!fileAttached) {
      return {
        ok: false,
        error: 'Harus menyertakan filePath atau url attachment',
      };
    }

    const url = `${this.baseUrl}/send`;
    let res: Response;
    try {
      res = await fetch(url, {
        method: 'POST',
        // Header `Authorization: <token>` LITERAL (Fonnte pakai format ini,
        // BUKAN `Bearer <token>`). Tidak di-log.
        headers: {
          Authorization: this.token!,
        },
        body: form,
      });
    } catch (e: any) {
      this.logger.error(
        `[${PROVIDER_NAME}] Network error ke ${target.replace(/^.{5}/, '*****')}: ${e?.message ?? e}`,
      );
      return { ok: false, error: `Network error: ${e?.message ?? e}` };
    }

    let body: any = null;
    try {
      body = await res.json();
    } catch {
      // Body bukan JSON — abaikan, tetap proses status code.
    }

    if (res.ok) {
      const providerMessageId =
        body?.id ?? body?.message_id ?? body?.detail?.id ?? undefined;
      this.logger.log(
        `[${PROVIDER_NAME}] OK status=${res.status} target=${maskPhone(target)} ` +
          `messageId=${providerMessageId ?? '—'}`,
      );
      return {
        ok: true,
        providerMessageId:
          typeof providerMessageId === 'string' ? providerMessageId : undefined,
        status: res.status,
      };
    }

    // Non-2xx
    const reason =
      body?.reason ?? body?.detail?.reason ?? body?.message ?? `HTTP ${res.status}`;
    this.logger.warn(
      `[${PROVIDER_NAME}] Gagal status=${res.status} target=${maskPhone(target)} reason=${reason}`,
    );
    return {
      ok: false,
      error: reason,
      status: res.status,
    };
  }
}
