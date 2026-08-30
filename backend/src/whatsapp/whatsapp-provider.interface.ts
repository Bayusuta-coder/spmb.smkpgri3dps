/**
 * WhatsApp provider abstraction.
 *
 * Pattern: Strategy. Implementasi konkret (Meta WhatsApp Cloud API,
 * Twilio, dsb.) menyembunyikan detail HTTP API di balik interface ini.
 * Service layer (WhatsappService) hanya berinteraksi dengan interface.
 *
 * Method yang WAJIB ada:
 *   - sendOtp(to, code): kirim OTP via template (WAJIB untuk OTP path —
 *     Meta business-initiated template wajib pakai type='template')
 *   - sendMessage(to, message): kirim text-mode (untuk LaporanService
 *     ringkasan yang dikirim ke verified users — boleh text selama user
 *     initiate session dalam 24 jam)
 *   - isConfigured(): boolean — untuk UI badge dan boot-time validation
 *   - getProviderName(): string — untuk audit log meta
 */

export interface SendMessageResult {
  ok: boolean;
  /** ID message dari provider (untuk audit/debug). Optional kalau gagal. */
  providerMessageId?: string;
  /** Error message kalau gagal */
  error?: string;
}

export interface WhatsAppProvider {
  /**
   * Kirim kode OTP via template-based Meta WhatsApp Cloud API.
   * Hanya OTP path yang menggunakan ini — supaya compliant dengan
   * aturan Meta untuk business-initiated messaging.
   *
   * Provider implementation:
   *   - Normalisasi `to` ke E.164 `62xxxxxxxxxx`
   *   - POST {apiUrl}/{phoneNumberId}/messages dengan payload
   *     { messaging_product, to, type: 'template', template: { name,
   *       language, components: [{type:'body', parameters:[{code}]}] } }
   *   - Return providerMessageId dari response.messages[0].id
   */
  sendOtp(to: string, code: string): Promise<SendMessageResult>;

  /**
   * Kirim text-mode message. Dipakai LaporanService untuk ringkasan
   * harian ke user yang sudah terverifikasi.
   *
   * Untuk first-touch / business-initiated ke user baru, gunakan
   * `sendOtp` (template-based).
   */
  sendMessage(to: string, message: string): Promise<SendMessageResult>;

  /**
   * Apakah provider fully configured (semua env var credential ada)?
   * Kalau false, WhatsappService akan return error di sendOtp / sendMessage.
   */
  isConfigured(): boolean;

  /** Identifier provider ini untuk audit log meta */
  getProviderName(): string;
}
