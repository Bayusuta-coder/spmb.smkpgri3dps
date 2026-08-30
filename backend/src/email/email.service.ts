import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private transporter: nodemailer.Transporter | null = null;
  private fromAddress: string;
  private smtpConfigured = false;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    this.fromAddress = this.config.get<string>(
      'SMTP_FROM',
      'no-reply@smk-pgri3dps.sch.id',
    );
    this.initTransporter();
  }

  /**
   * Inisialisasi transporter dari env.
   *
   * Mendukung 2 mode koneksi umum:
   *  - SSL/TLS port 465 → `secure: true`
   *  - STARTTLS port 587 (default) → `secure: false`, nodemailer handle STARTTLS
   *
   * Untuk Gmail SMTP: host=`smtp.gmail.com`, port=465 (SSL) atau 587 (STARTTLS).
   *   Wajib pakai App Password 16-char, BUKAN password Gmail biasa
   *   (lihat https://myaccount.google.com/apppasswords).
   *
   * Untuk Hostinger: host=`smtp.hostinger.com`, port=465 (SSL).
   */
  private initTransporter() {
    const host = this.config.get<string>('SMTP_HOST');
    const port = Number(this.config.get<string>('SMTP_PORT', '587'));
    const user = this.config.get<string>('SMTP_USER');
    const pass = this.config.get<string>('SMTP_PASS');

    if (!host || !user || !pass) {
      this.logger.warn(
        'SMTP belum dikonfigurasi (.env SMTP_HOST/USER/PASS kosong). Email akan di-log ke console saja (DEV-ONLY MODE).',
      );
      this.smtpConfigured = false;
      return;
    }

    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
      // Penting: kasih timeout reasonable biar nggak hang selamanya kalau
      // SMTP server unreachable (mis. firewall block, port salah, dsb).
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 15_000,
    });

    this.smtpConfigured = true;
    this.logger.log(`SMTP configured: ${user}@${host}:${port} (secure=${port === 465})`);
  }

  /**
   * Test koneksi SMTP — bisa dipanggil dari script CLI
   * (`backend/scripts/test-smtp.ts`) atau dari controller admin diagnostic.
   * verify() di nodemailer melakukan handshake penuh: connect + auth + quit.
   */
  async verifyConnection(): Promise<{ ok: boolean; error?: string; configured: boolean }> {
    if (!this.transporter) {
      return { ok: false, configured: false, error: 'SMTP belum dikonfigurasi' };
    }
    try {
      await this.transporter.verify();
      return { ok: true, configured: true };
    } catch (e: any) {
      return { ok: false, configured: true, error: e.message };
    }
  }

  isConfigured(): boolean {
    return this.smtpConfigured;
  }

  /**
   * Kirim email. Jika SMTP belum dikonfigurasi, hanya log ke console (untuk development).
   * Mendukung attachment (misal PDF bukti pendaftaran ulang).
   */
  async send(opts: {
    to: string;
    subject: string;
    html: string;
    text?: string;
    relatedType?: string;
    relatedId?: string;
    attachments?: Array<{ filename: string; path?: string; content?: Buffer; contentType?: string }>;
  }): Promise<{ sent: boolean; error?: string; preview?: boolean }> {
    const text = opts.text || opts.html.replace(/<[^>]+>/g, '');

    if (!this.transporter) {
      this.logger.warn(
        `[DEV-EMAIL] To: ${opts.to} | Subject: ${opts.subject} | Attachments: ${
          opts.attachments?.map((a) => a.filename).join(', ') || '(none)'
        } | Body: ${text.slice(0, 200)}...`,
      );
      await this.prisma.emailLog
        .create({
          data: {
            to: opts.to,
            subject: opts.subject,
            body: text,
            status: 'sent',
            relatedType: opts.relatedType,
            relatedId: opts.relatedId,
          },
        })
        .catch(() => null);
      // Tandai `preview: true` supaya caller tahu ini BUKAN email beneran
      // (cuma log). auth.service.ts pakai ini untuk decide apakah expose
      // devResetLink di response.
      return { sent: true, preview: true };
    }

    try {
      await this.transporter.sendMail({
        from: this.fromAddress,
        to: opts.to,
        subject: opts.subject,
        html: opts.html,
        text,
        attachments: opts.attachments,
      });
      await this.prisma.emailLog
        .create({
          data: {
            to: opts.to,
            subject: opts.subject,
            body: text,
            status: 'sent',
            relatedType: opts.relatedType,
            relatedId: opts.relatedId,
          },
        })
        .catch(() => null);
      return { sent: true };
    } catch (e: any) {
      this.logger.error(`Gagal kirim email ke ${opts.to}: ${e.message}`);
      await this.prisma.emailLog
        .create({
          data: {
            to: opts.to,
            subject: opts.subject,
            body: text,
            status: 'failed',
            error: e.message,
            relatedType: opts.relatedType,
            relatedId: opts.relatedId,
          },
        })
        .catch(() => null);
      return { sent: false, error: e.message };
    }
  }

  // -- Template siap pakai ----------------------------------------------------

  async sendRegistrationReceived(
    to: string,
    regNumber: string,
    attachments?: Array<{ filename: string; path?: string; content?: Buffer; contentType?: string }>,
    pdfSignature?: string | null,
  ) {
    const downloadUrl = pdfSignature
      ? `${process.env.FRONTEND_USER_ORIGIN || 'http://localhost:5173'}/cek-status?reg=${encodeURIComponent(regNumber)}`
      : null;
    return this.send({
      to,
      subject: `[SPMB] Tanda Bukti Pendaftaran: ${regNumber}`,
      html: `
        <p>Halo,</p>
        <p>Terima kasih telah melakukan pendaftaran online di
           <b>SPMB SMK PGRI 3 Denpasar</b>. Pendaftaran Anda telah kami terima.</p>
        <p>Nomor Pendaftaran: <b>${regNumber}</b></p>
        <p>Status Anda saat ini: <b>Menunggu Daftar Ulang</b>. Silakan datang langsung
           ke sekolah untuk melakukan daftar ulang <b>fisik</b> dengan membawa dokumen
           identitas dan dokumen yang diperlukan.</p>
        <p>Terlampir pada email ini adalah <b>Tanda Bukti Pendaftaran</b> dalam format PDF.
           Bukti ini berisi QR Code yang dapat dipindai untuk verifikasi status pendaftaran
           Anda sewaktu-waktu.</p>
        ${downloadUrl ? `<p>Anda juga dapat mengunduh ulang tanda bukti pendaftaran di
           <a href="${downloadUrl}">halaman Cek Status</a> (cukup masukkan nomor pendaftaran Anda).</p>` : ''}
        <p>Informasi lebih lanjut terkait teknis pelaksanaan tahun ajaran baru akan
           diinformasikan melalui pihak sekolah.</p>
        <p>Terima kasih.</p>
      `,
      relatedType: 'pendaftar',
      attachments,
    });
  }

  async sendStatusUpdate(to: string, regNumber: string, statusLabel: string, note?: string) {
    return this.send({
      to,
      subject: `[SPMB] Update status pendaftaran ${regNumber}: ${statusLabel}`,
      html: `
        <p>Halo,</p>
        <p>Status pendaftaran Anda (<b>${regNumber}</b>) telah diperbarui menjadi:</p>
        <p><b>${statusLabel}</b></p>
        ${note ? `<p>Catatan: ${note}</p>` : ''}
        <p>Cek detail di halaman cek status SPMB SMK PGRI 3 Denpasar.</p>
      `,
      relatedType: 'pendaftar',
    });
  }

  async sendDaftarUlangSuccess(
    to: string,
    regNumber: string,
    approvedByName?: string,
    approvedByEmail?: string,
    pdfSignature?: string | null,
    attachments?: Array<{ filename: string; path?: string; content?: Buffer; contentType?: string }>,
    opts?: { ukuranBaju?: string | null; nominalPembayaran?: number | string | null },
  ) {
    const downloadUrl = pdfSignature
      ? `${process.env.FRONTEND_USER_ORIGIN || 'http://localhost:5173'}/cek-status?reg=${encodeURIComponent(regNumber)}`
      : null;
    const rupiah = (n: number | string) =>
      new Intl.NumberFormat('id-ID', {
        style: 'currency',
        currency: 'IDR',
        minimumFractionDigits: 0,
      }).format(Number(n));
    return this.send({
      to,
      subject: `[SPMB] Selamat! Anda resmi menjadi Siswa SMK PGRI 3 Denpasar (${regNumber})`,
      html: `
        <p>Selamat!</p>
        <p>Pendaftaran Anda telah <b>disetujui</b> oleh panitia SPMB. Anda resmi terdaftar sebagai
           <b>Siswa Aktif</b> SMK PGRI 3 Denpasar.</p>
        <p>Nomor Pendaftaran: <b>${regNumber}</b></p>
        ${opts?.ukuranBaju ? `<p>Ukuran baju yang kami catat: <b>${opts.ukuranBaju}</b>. Mohon gunakan ukuran ini saat pengambilan atribut sekolah.</p>` : ''}
        ${opts?.nominalPembayaran != null ? `<p>Total pembayaran daftar ulang: <b>${rupiah(opts.nominalPembayaran)}</b>.</p>` : ''}
        <p>Terlampir pada email ini adalah <b>Bukti Pendaftaran Ulang</b> dalam format PDF.
           Bukti ini berisi QR Code yang akan di-scan oleh petugas saat Anda datang ke sekolah
           untuk melakukan daftar ulang fisik.</p>
        ${downloadUrl ? `<p>Anda juga dapat mengunduh ulang bukti pendaftaran ulang di
           <a href="${downloadUrl}">halaman Cek Status</a> (cukup masukkan nomor pendaftaran Anda).</p>` : ''}
        ${approvedByName ? `<p>Disetujui oleh: <b>${approvedByName}</b>${approvedByEmail ? ` (${approvedByEmail})` : ''}</p>` : ''}
        <p>Informasi lebih lanjut terkait teknis pelaksanaan tahun ajaran baru akan
           diinformasikan melalui pihak sekolah.</p>
        <p>Sampai jumpa di hari pertama sekolah!</p>
      `,
      relatedType: 'pendaftar',
      attachments,
    });
  }

  async notifyAdminNewPendaftar(adminEmails: string[], regNumber: string, pendaftarName: string) {
    if (!adminEmails.length) return;
    return this.send({
      to: adminEmails.join(','),
      subject: `[SPMB] Pendaftar baru: ${regNumber} - ${pendaftarName}`,
      html: `
        <p>Halo Admin,</p>
        <p>Ada pendaftar baru di SPMB SMK PGRI 3 Denpasar:</p>
        <ul>
          <li>No. Pendaftaran: <b>${regNumber}</b></li>
          <li>Nama: <b>${pendaftarName}</b></li>
        </ul>
        <p>Segera lakukan verifikasi di dashboard admin (menu Pendaftar).</p>
      `,
      relatedType: 'pendaftar',
    });
  }

  /**
   * Kirim email berisi link reset password untuk admin/user yang lupa password.
   * `resetLink` adalah URL lengkap yang sudah di-compose caller (auth.service).
   * Link berisi token raw — token raw ini di-hash (SHA-256) oleh backend
   * sebelum disimpan ke DB, jadi DB dump tidak berguna.
   */
  async sendPasswordReset(to: string, name: string, resetLink: string, ttlMinutes: number) {
    const year = new Date().getFullYear();
    return this.send({
      to,
      subject: 'Reset Password - SPMB SMK PGRI 3 Denpasar',
      html: `
        <div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#0f172a;">
          <div style="background:#1e40af;padding:20px 24px;border-radius:8px 8px 0 0;">
            <h2 style="margin:0;color:#ffffff;font-size:18px;">SPMB SMK PGRI 3 Denpasar</h2>
            <p style="margin:4px 0 0;color:#cbd5e1;font-size:12px;">
              Sistem Penerimaan Murid Baru — T.A. ${year}/${year + 1}
            </p>
          </div>

          <div style="border:1px solid #e2e8f0;border-top:none;border-radius:0 0 8px 8px;padding:24px;background:#ffffff;">
            <p style="margin:0 0 12px;">Halo <b>${name}</b>,</p>
            <p style="margin:0 0 16px;line-height:1.5;">
              Kami menerima permintaan reset password untuk akun admin Anda di
              <b>SPMB SMK PGRI 3 Denpasar</b>.
            </p>

            <p style="margin:0 0 20px;line-height:1.5;">
              Klik tombol di bawah untuk mengatur password baru Anda.
              Link ini berlaku selama <b>${ttlMinutes} menit</b> dan hanya bisa dipakai satu kali.
            </p>

            <p style="margin:24px 0;text-align:center;">
              <a href="${resetLink}"
                 style="display:inline-block;padding:14px 32px;background:#1e40af;color:#ffffff;
                        text-decoration:none;border-radius:8px;font-weight:700;font-size:14px;
                        letter-spacing:0.3px;">
                Reset Password Saya
              </a>
            </p>

            <p style="margin:0 0 8px;font-size:13px;color:#64748b;">
              Jika tombol di atas tidak berfungsi, salin URL ini ke browser Anda:
            </p>
            <p style="word-break:break-all;background:#f1f5f9;padding:12px;border-radius:6px;
                      font-family:monospace;font-size:12px;color:#334155;margin:0 0 16px;">
              ${resetLink}
            </p>

            <div style="background:#fef3c7;border:1px solid #fde68a;border-radius:6px;
                        padding:12px 16px;margin:20px 0 0;font-size:13px;color:#92400e;">
              <b>⚠️ Tidak meminta reset?</b><br/>
              Jika Anda <b>tidak merasa</b> meminta reset password, abaikan email ini.
              Password Anda tidak akan berubah sampai Anda mengklik link di atas dan membuat password baru.
            </div>
          </div>

          <p style="text-align:center;color:#94a3b8;font-size:11px;margin:16px 0 0;">
            © ${year} SMK PGRI 3 Denpasar — Email ini dikirim otomatis, jangan dibalas.
          </p>
        </div>
      `,
      relatedType: 'user',
    });
  }
}
