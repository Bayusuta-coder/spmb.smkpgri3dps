import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private transporter: nodemailer.Transporter | null = null;
  private fromAddress: string;

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

  private initTransporter() {
    const host = this.config.get<string>('SMTP_HOST');
    const port = Number(this.config.get<string>('SMTP_PORT', '587'));
    const user = this.config.get<string>('SMTP_USER');
    const pass = this.config.get<string>('SMTP_PASS');

    if (!host || !user || !pass) {
      this.logger.warn(
        'SMTP belum dikonfigurasi (.env SMTP_HOST/USER/PASS kosong). Email akan di-log ke console saja.',
      );
      return;
    }

    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
    });

    this.logger.log(`SMTP configured: ${user}@${host}:${port}`);
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
  }): Promise<{ sent: boolean; error?: string }> {
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
      return { sent: true };
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

  async sendRegistrationReceived(to: string, regNumber: string) {
    return this.send({
      to,
      subject: `[SPMB] Pendaftaran diterima: ${regNumber}`,
      html: `
        <p>Halo,</p>
        <p>Pendaftaran Anda di <b>SPMB SMK PGRI 3 Denpasar</b> telah kami terima.</p>
        <p>Nomor Pendaftaran: <b>${regNumber}</b></p>
        <p>Simpan nomor ini untuk mengecek status pendaftaran Anda.</p>
        <p>Terima kasih.</p>
      `,
      relatedType: 'pendaftar',
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

  async sendPaymentInstruction(to: string, regNumber: string) {
    return this.send({
      to,
      subject: `[SPMB] Instruksi pembayaran daftar ulang (${regNumber})`,
      html: `
        <p>Selamat, Anda dinyatakan <b>LOLOS</b> seleksi berkas.</p>
        <p>Nomor Pendaftaran: <b>${regNumber}</b></p>
        <p>Silakan lakukan pembayaran daftar ulang ke rekening sekolah, lalu input data transfer
           (nominal, tanggal, nama pengirim) di halaman cek status SPMB.</p>
        <p>Setelah itu, Tim TU akan memverifikasi kecocokan dengan mutasi rekening kami.</p>
        <p>Terima kasih.</p>
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
  ) {
    const downloadUrl = pdfSignature
      ? `${process.env.FRONTEND_USER_ORIGIN || 'http://localhost:5173'}/cek-status?reg=${encodeURIComponent(regNumber)}`
      : null;
    return this.send({
      to,
      subject: `[SPMB] Selamat! Anda resmi menjadi Siswa SMK PGRI 3 Denpasar (${regNumber})`,
      html: `
        <p>Selamat!</p>
        <p>Pembayaran daftar ulang Anda telah kami verifikasi. Anda resmi terdaftar sebagai
           <b>Siswa Aktif</b> SMK PGRI 3 Denpasar.</p>
        <p>Nomor Pendaftaran: <b>${regNumber}</b></p>
        <p>Terlampir pada email ini adalah <b>Bukti Pendaftaran Ulang</b> dalam format PDF.
           Bukti ini berisi QR Code yang akan di-scan oleh petugas saat Anda datang ke sekolah
           untuk melakukan daftar ulang fisik.</p>
        ${downloadUrl ? `<p>Anda juga dapat mengunduh ulang bukti pendaftaran ulang di
           <a href="${downloadUrl}">halaman Cek Status</a> (cukup masukkan nomor pendaftaran Anda).</p>` : ''}
        ${approvedByName ? `<p>Disetujui oleh: <b>${approvedByName}</b>${approvedByEmail ? ` (${approvedByEmail})` : ''}</p>` : ''}
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
        <p>Segera lakukan verifikasi berkas di dashboard admin.</p>
      `,
      relatedType: 'pendaftar',
    });
  }

  async notifyAdminPaymentVerified(adminEmails: string[], regNumber: string) {
    if (!adminEmails.length) return;
    return this.send({
      to: adminEmails.join(','),
      subject: `[SPMB] Pembayaran diverifikasi TU: ${regNumber}`,
      html: `
        <p>Halo Admin,</p>
        <p>Pembayaran pendaftar <b>${regNumber}</b> telah diverifikasi oleh TU.</p>
        <p>Silakan lakukan approve final di dashboard admin.</p>
      `,
      relatedType: 'pembayaran',
    });
  }
}
