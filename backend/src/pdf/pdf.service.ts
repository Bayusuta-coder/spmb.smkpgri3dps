import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { promises as fs } from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import PDFDocument from 'pdfkit';
import * as QRCode from 'qrcode';
import { getSchoolInfo, SchoolInfo } from '../common/constants/school';

/**
 * Data minimum untuk generate bukti pendaftaran ulang.
 */
export interface BuktiPendaftaranUlangData {
  registrationNumber: string;
  namaLengkap: string;
  jenisKelamin: 'L' | 'P';
  tempatLahir: string;
  tanggalLahir: Date;
  sekolahAsal: string;
  alamat: string;
  noTelp: string;
  namaIbu: string;
  noTelpOrtu: string;
  jurusan: { code: string; name: string };
  gelombang: {
    name: string;
    tanggalDaftarUlang?: Date | null;
    jamDaftarUlang?: string | null;
  };
  approvedAt: Date;
  approvedBy: { name: string; email: string };
  /**
   * URL absolut halaman verifikasi publik (frontend-user)
   * yang akan di-encode ke QR code.
   * Optional — kalau tidak diisi, service akan membangun otomatis dari
   * FRONTEND_USER_ORIGIN + regNumber + signature.
   */
  verificationUrl?: string;
}

@Injectable()
export class PdfService {
  private readonly logger = new Logger(PdfService.name);
  private readonly uploadsDir: string;
  private readonly school: SchoolInfo;

  constructor(private readonly config: ConfigService) {
    this.uploadsDir = this.config.get<string>('UPLOADS_DIR', path.join(process.cwd(), 'uploads', 'spmb'));
    this.school = getSchoolInfo({
      SCHOOL_NAME: this.config.get<string>('SCHOOL_NAME'),
      SCHOOL_ADDRESS: this.config.get<string>('SCHOOL_ADDRESS'),
      SCHOOL_PHONE: this.config.get<string>('SCHOOL_PHONE'),
      SCHOOL_EMAIL: this.config.get<string>('SCHOOL_EMAIL'),
    });
  }

  getAbsolutePath(relativePath: string): string {
    return path.join(this.uploadsDir, relativePath);
  }

  generateSignature(): string {
    return crypto.randomBytes(24).toString('hex');
  }

  /**
   * Bangun URL halaman verifikasi publik (frontend-user) yang akan di-encode ke QR.
   * Bukan link download PDF — halaman ini hanya menampilkan info singkat
   * (nama, status, jadwal & lokasi daftar ulang).
   */
  buildVerificationUrl(regNumber: string, signature: string): string {
    const origin =
      this.config.get<string>('FRONTEND_USER_ORIGIN') || 'http://localhost:5173';
    return `${origin.replace(/\/+$/, '')}/verifikasi/${encodeURIComponent(regNumber)}?token=${signature}`;
  }

  /**
   * Bangun payload JSON untuk QR (fallback kalau URL terlalu panjang).
   * Hanya identifier, tidak ada data pribadi sensitif.
   */
  buildQrPayload(regNumber: string, signature: string): string {
    return JSON.stringify({ v: 1, r: regNumber, s: signature });
  }

  async generateBuktiPendaftaranUlang(
    data: BuktiPendaftaranUlangData,
  ): Promise<{ relativePath: string; signature: string; verificationUrl: string }> {
    await fs.mkdir(this.uploadsDir, { recursive: true });

    const signature = this.generateSignature();
    const verificationUrl = data.verificationUrl || this.buildVerificationUrl(data.registrationNumber, signature);
    const qrPngBuffer = await QRCode.toBuffer(verificationUrl, {
      type: 'png',
      errorCorrectionLevel: 'M',
      margin: 1,
      width: 220,
    });

    const safeReg = data.registrationNumber.replace(/[^A-Za-z0-9._-]/g, '_');
    const relativePath = `${safeReg}.pdf`;
    const absPath = this.getAbsolutePath(relativePath);

    // ---- Layout constants --------------------------------------------------
    const PAGE_WIDTH = 595.28;   // A4 portrait
    const PAGE_HEIGHT = 841.89;
    const MARGIN_L = 50;
    const MARGIN_R = 50;
    const MARGIN_T = 40;
    const MARGIN_B = 50;
    const CONTENT_W = PAGE_WIDTH - MARGIN_L - MARGIN_R; // 495

    // Kotak "Pas Photo 3x4" di pojok kanan atas (di bawah kop surat).
    // Disusun compact: tinggi ~120px cukup untuk QR + label singkat.
    const PHOTO_W = 110;
    const PHOTO_H = 140;
    const PHOTO_X = PAGE_WIDTH - MARGIN_R - PHOTO_W; // 595-50-110 = 435
    const PHOTO_Y = 110; // di bawah kop surat (kop ~40-95)

    // Area teks body (kolom kiri), dibatasi agar tidak masuk ke kolom QR.
    const BODY_RIGHT_LIMIT = PHOTO_X - 15; // 420
    const LABEL_W = 130;

    await new Promise<void>((resolve, reject) => {
      const doc = new PDFDocument({
        size: 'A4',
        margins: { top: MARGIN_T, bottom: MARGIN_B, left: MARGIN_L, right: MARGIN_R },
        info: {
          Title: `Tanda Bukti Pendaftaran Ulang - ${data.registrationNumber}`,
          Author: data.approvedBy.name,
          Subject: 'Bukti Pendaftaran Ulang',
          Keywords: 'SPMB, SMK PGRI 3 Denpasar, ' + data.registrationNumber,
        },
      });
      const stream = require('fs').createWriteStream(absPath);
      doc.pipe(stream);
      stream.on('finish', () => resolve());
      stream.on('error', reject);

      // ===== KOP SURAT ===================================================
      doc
        .font('Helvetica-Bold').fontSize(11)
        .text('YAYASAN PENDIDIKAN LUHUR PERSADA GANESHA (YPLP) PGRI',
          MARGIN_L, 40, { width: CONTENT_W, align: 'center' })
        .font('Helvetica').fontSize(11)
        .text(this.school.name.toUpperCase(),
          MARGIN_L, doc.y, { width: CONTENT_W, align: 'center' })
        .fontSize(8.5)
        .text(this.school.address + ' | Telp. ' + this.school.phone,
          MARGIN_L, doc.y + 2, { width: CONTENT_W, align: 'center' });

      // Garis kop double
      const kopY = doc.y + 6;
      doc.lineWidth(0.8).moveTo(MARGIN_L, kopY).lineTo(PAGE_WIDTH - MARGIN_R, kopY).stroke();
      doc.lineWidth(0.4).moveTo(MARGIN_L, kopY + 2).lineTo(PAGE_WIDTH - MARGIN_R, kopY + 2).stroke();

      // ===== KOTAK PAS PHOTO + QR (pojok kanan atas) =====================
      doc.lineWidth(0.8);
      doc.rect(PHOTO_X, PHOTO_Y, PHOTO_W, PHOTO_H).stroke();
      // QR di tengah kotak, dengan margin 5px
      const qrSize = PHOTO_W - 14; // 96px
      doc.image(qrPngBuffer, PHOTO_X + 7, PHOTO_Y + 7, { width: qrSize, height: qrSize });
      doc
        .fontSize(7).fillColor('#475569')
        .text('QR Verifikasi', PHOTO_X, PHOTO_Y + 7 + qrSize + 2,
          { width: PHOTO_W, align: 'center' })
        .text('Pindai untuk info', PHOTO_X, doc.y, { width: PHOTO_W, align: 'center' })
        .text('daftar ulang', PHOTO_X, doc.y, { width: PHOTO_W, align: 'center' })
        .fillColor('black');

      // ===== JUDUL ========================================================
      const judulY = 130;
      doc
        .font('Helvetica-Bold').fontSize(13).fillColor('#1e3a8a')
        .text('TANDA BUKTI PENDAFTARAN ULANG',
          MARGIN_L, judulY, { width: BODY_RIGHT_LIMIT - MARGIN_L, align: 'center' })
        .font('Helvetica').fontSize(10).fillColor('black')
        .text(`Nomor Pendaftaran: ${data.registrationNumber}`,
          MARGIN_L, doc.y + 2, { width: BODY_RIGHT_LIMIT - MARGIN_L, align: 'center' });

      // ===== STATUS BANNER ===============================================
      const statusY = doc.y + 10;
      doc
        .lineWidth(0.6)
        .roundedRect(MARGIN_L, statusY, BODY_RIGHT_LIMIT - MARGIN_L, 26, 4)
        .fillOpacity(1)
        .fillAndStroke('#dcfce7', '#16a34a');
      doc
        .font('Helvetica-Bold').fontSize(11).fillColor('#14532d')
        .text('BERHASIL — SIAP MELAKUKAN PENDAFTARAN ULANG',
          MARGIN_L + 6, statusY + 7, { width: BODY_RIGHT_LIMIT - MARGIN_L - 12, align: 'center' })
        .fillColor('black');

      // ===== DATA PENDAFTAR (kolom kiri) =================================
      const dataStartY = statusY + 36;
      const tglLahirId = data.tanggalLahir.toLocaleDateString('id-ID',
        { day: 'numeric', month: 'long', year: 'numeric' });
      const tglCetakId = data.approvedAt.toLocaleDateString('id-ID',
        { day: 'numeric', month: 'long', year: 'numeric' });
      const jenisKelaminLabel = data.jenisKelamin === 'L' ? 'Laki-laki' : 'Perempuan';
      const tempatTglLahir = `${data.tempatLahir}, ${tglLahirId}`;

      type Row = [string, string];
      const rows: Row[] = [
        ['Nama Lengkap', data.namaLengkap],
        ['Jenis Kelamin', jenisKelaminLabel],
        ['Tempat / Tgl. Lahir', tempatTglLahir],
        ['Sekolah Asal', data.sekolahAsal],
        ['Alamat', data.alamat],
        ['No. Telp / HP', data.noTelp],
        ['Nama Ibu', data.namaIbu],
        ['No. Telp Orang Tua', data.noTelpOrtu],
        ['Jurusan Pilihan', `${data.jurusan.code} — ${data.jurusan.name}`],
        ['Gelombang', data.gelombang.name],
      ];

      const rowH = 16;
      rows.forEach((r, i) => {
        const y = dataStartY + i * rowH;
        doc.font('Helvetica-Bold').fontSize(9.5).fillColor('#0f172a')
          .text(r[0], MARGIN_L, y, { width: LABEL_W });
        doc.font('Helvetica').fontSize(9.5).fillColor('#0f172a')
          .text(': ' + r[1], MARGIN_L + LABEL_W, y,
            { width: BODY_RIGHT_LIMIT - MARGIN_L - LABEL_W });
      });

      // ===== JADWAL DAFTAR ULANG (jika ada) ==============================
      const jadwalY = dataStartY + rows.length * rowH + 8;
      if (data.gelombang.tanggalDaftarUlang || data.gelombang.jamDaftarUlang) {
        const tgl = data.gelombang.tanggalDaftarUlang
          ? data.gelombang.tanggalDaftarUlang.toLocaleDateString('id-ID',
              { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
          : 'Akan diumumkan';
        const jam = data.gelombang.jamDaftarUlang || 'Akan diumumkan';
        doc.font('Helvetica-Bold').fontSize(10).fillColor('#1e40af')
          .text('JADWAL DAFTAR ULANG FISIK', MARGIN_L, jadwalY,
            { width: BODY_RIGHT_LIMIT - MARGIN_L })
          .font('Helvetica').fontSize(9.5).fillColor('#0f172a')
          .text(`Tanggal : ${tgl}`, MARGIN_L, doc.y + 2,
            { width: BODY_RIGHT_LIMIT - MARGIN_L })
          .text(`Jam     : ${jam} WITA`, MARGIN_L, doc.y + 2,
            { width: BODY_RIGHT_LIMIT - MARGIN_L })
          .text(`Lokasi  : ${this.school.address}`, MARGIN_L, doc.y + 2,
            { width: BODY_RIGHT_LIMIT - MARGIN_L })
          .text(`Telp    : ${this.school.phone}`, MARGIN_L, doc.y + 2,
            { width: BODY_RIGHT_LIMIT - MARGIN_L });
      }

      // ===== TANDA TANGAN PETUGAS (kolom kanan-bawah, di bawah QR) ======
      const sigY = Math.max(jadwalY + 100, PHOTO_Y + PHOTO_H + 30);
      const sigX = PAGE_WIDTH - MARGIN_R - 200; // kotak selebar 200px di kanan

      doc.font('Helvetica').fontSize(9).fillColor('#0f172a')
        .text('Denpasar, ' + tglCetakId, sigX, sigY, { width: 200, align: 'left' })
        .text('Petugas yang menyetujui,', sigX, sigY + 14, { width: 200 })
        .moveDown(2);
      const sigNameY = sigY + 60;
      doc.font('Helvetica-Bold').fontSize(10)
        .text(data.approvedBy.name, sigX, sigNameY, { width: 200 })
        .font('Helvetica').fontSize(8).fillColor('#475569')
        .text(data.approvedBy.email, sigX, sigNameY + 12, { width: 200 });

      // ===== FOOTER =======================================================
      // Letakkan footer di atas margin bawah dengan ruang cukup untuk 2 baris,
      // supaya wrap tidak menambah halaman baru.
      doc.fontSize(7.5).fillColor('#64748b')
        .text(
          'Dokumen ini dihasilkan otomatis oleh sistem SPMB SMK PGRI 3 Denpasar. ' +
          'Pindai QR Code di atas untuk verifikasi & info jadwal daftar ulang.',
          MARGIN_L, PAGE_HEIGHT - MARGIN_B - 22,
          { width: CONTENT_W, align: 'center', height: 20 },
        );

      doc.end();
    });

    this.logger.log(`PDF bukti pendaftaran ulang tersimpan: ${absPath}`);
    return { relativePath, signature, verificationUrl };
  }
}
