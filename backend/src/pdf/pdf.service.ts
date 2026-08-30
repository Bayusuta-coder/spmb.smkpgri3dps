import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { promises as fs, existsSync } from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import PDFDocument from 'pdfkit';
import { getSchoolInfo, SchoolInfo } from '../common/constants/school';

/**
 * Mode PDF:
 *  - 'MENUNGGU' → Tahap 1 (status: "Menunggu Daftar Ulang") — generate otomatis
 *                 saat siswa submit form pendaftaran. Judul: TANDA BUKTI PENDAFTARAN.
 *  - 'AKTIF'    → Tahap 2 (status: "Siswa Aktif") — generate saat admin approve & input
 *                 ukuran baju + nominal bayar. Judul: BUKTI PENDAFTARAN ULANG.
 */
export type PdfMode = 'MENUNGGU' | 'AKTIF';

/**
 * Data minimum untuk generate bukti pendaftaran.
 * - Untuk MENUNGGU: cukup data diri, TIDAK perlu ukuranBaju / nominalPembayaran.
 * - Untuk AKTIF: WAJIB ada ukuranBaju + nominalPembayaran (snapshot harga saat approve).
 */
export interface BuktiPendaftaranUlangData {
  mode: PdfMode;
  registrationNumber: string;
  namaLengkap: string;
  jenisKelamin: 'L' | 'P';
  tempatLahir: string;
  tanggalLahir: Date;
  nisn?: string;
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
  // Khusus mode AKTIF (optional di type, tapi service akan validasi runtime)
  ukuranBaju?: string | null;
  nominalPembayaran?: number | string | null;
  // Nilai UN — opsional di form, disimpan sebagai Decimal nullable di DB.
  // Di PDF tampil '-' kalau null (konsisten dengan NISN).
  jumlahNilaiUn?: number | string | null;
  // Penanda waktu & approver
  approvedAt: Date;
  approvedBy?: { name: string; email: string };
  // URL absolut halaman verifikasi publik (frontend-user)
  verificationUrl?: string;
}

@Injectable()
export class PdfService {
  private readonly logger = new Logger(PdfService.name);
  private readonly uploadsDir: string;
  private readonly school: SchoolInfo;
  private readonly kopSuratPath: string;
  // Aspect ratio (h/w) dari kop-surat.png — diukur saat generate PNG.
  // 2400×716 px → 0.2983. Dicache supaya tidak baca metadata setiap kali generate.
  private readonly KOP_RATIO = 716 / 2400;

  constructor(private readonly config: ConfigService) {
    this.uploadsDir = this.config.get<string>(
      'UPLOADS_DIR',
      path.join(process.cwd(), 'uploads', 'spmb'),
    );
    this.school = getSchoolInfo({
      SCHOOL_NAME: this.config.get<string>('SCHOOL_NAME'),
      SCHOOL_ADDRESS: this.config.get<string>('SCHOOL_ADDRESS'),
      SCHOOL_PHONE: this.config.get<string>('SCHOOL_PHONE'),
      SCHOOL_EMAIL: this.config.get<string>('SCHOOL_EMAIL'),
    });
    // Resolve path kop surat PNG dengan fallback multi-lokasi supaya robust
    // baik saat development (ts-node, src/assets/) maupun production (compiled,
    // dist/assets/ — di-copy oleh nest-cli.json assets config).
    //
    // Urutan pencarian:
    //   1. Env KOP_SURAT_PATH (override eksplisit, highest priority)
    //   2. src/assets/kop-surat.png   (dev mode: __dirname = backend/src/pdf)
    //   3. dist/assets/kop-surat.png  (prod compiled: __dirname = backend/dist/pdf)
    //   4. process.cwd()/src/assets/kop-surat.png  (fallback run dari root)
    //   5. process.cwd()/dist/assets/kop-surat.png (fallback run compiled dari root)
    const envPath = this.config.get<string>('KOP_SURAT_PATH');
    const candidates = [
      path.join(__dirname, '..', 'assets', 'kop-surat.png'), // src/pdf → src/assets (dev) ATAU dist/pdf → dist/assets (prod)
      path.join(__dirname, '..', '..', 'src', 'assets', 'kop-surat.png'), // dist/pdf → src/assets (kalau assets tidak di-copy)
      path.join(process.cwd(), 'src', 'assets', 'kop-surat.png'),
      path.join(process.cwd(), 'dist', 'assets', 'kop-surat.png'),
    ];
    const found = envPath && existsSync(envPath)
      ? envPath
      : candidates.find((p) => existsSync(p));
    this.kopSuratPath = found ?? envPath ?? candidates[0];

    if (!existsSync(this.kopSuratPath)) {
      this.logger.error(
        `Kop surat image TIDAK ditemukan di lokasi manapun: ${[envPath, ...candidates]
          .filter(Boolean)
          .join(', ')}. ` +
          `PDF generator tidak akan menampilkan kop surat. Jalankan: ` +
          `cd backend && npx ts-node scripts/convert-kop-pdf-to-png.ts`,
      );
    } else {
      this.logger.log(`Kop surat loaded dari: ${this.kopSuratPath}`);
    }
  }

  getAbsolutePath(relativePath: string): string {
    return path.join(this.uploadsDir, relativePath);
  }

  generateSignature(): string {
    return crypto.randomBytes(24).toString('hex');
  }

  /**
   * Bangun URL halaman verifikasi publik (frontend-user). Disimpan di metadata
   * response agar frontend bisa link ke halaman cek-status langsung, meski
   * saat ini QR Code sudah dihapus dari layout PDF.
   */
  buildVerificationUrl(regNumber: string, signature: string): string {
    const origin =
      this.config.get<string>('FRONTEND_USER_ORIGIN') || 'http://localhost:5173';
    return `${origin.replace(/\/+$/, '')}/verifikasi/${encodeURIComponent(regNumber)}?token=${signature}`;
  }

  async generateBuktiPendaftaranUlang(
    data: BuktiPendaftaranUlangData,
  ): Promise<{ relativePath: string; signature: string; verificationUrl: string }> {
    await fs.mkdir(this.uploadsDir, { recursive: true });

    const signature = this.generateSignature();
    const verificationUrl =
      data.verificationUrl || this.buildVerificationUrl(data.registrationNumber, signature);

    // Load kop surat image sebagai SATU GAMBAR UTUH (tidak di-render ulang
    // teksnya). Kalau file tidak ada, area kop dibiarkan kosong (tidak ada
    // fallback text — supaya layout tetap konsisten, lebih baik kosong daripada
    // text rendering yang bisa keluar beda tiap font).
    let kopBuffer: Buffer | null = null;
    try {
      kopBuffer = await fs.readFile(this.kopSuratPath);
    } catch (e: any) {
      this.logger.warn(
        `Kop surat image tidak ditemukan di ${this.kopSuratPath} — kop surat ` +
          `akan dikosongkan. Jalankan: ` +
          `cd backend && npx ts-node scripts/convert-kop-pdf-to-png.ts`,
      );
    }

    const safeReg = data.registrationNumber.replace(/[^A-Za-z0-9._-]/g, '_');
    const relativePath = `${safeReg}.pdf`;
    const absPath = this.getAbsolutePath(relativePath);

    // ---- Layout constants (A4 portrait) ---------------------------------
    const PAGE_WIDTH = 595.28;
    const PAGE_HEIGHT = 841.89;
    const MARGIN_L = 50;
    const MARGIN_R = 50;
    const MARGIN_T = 40;
    const MARGIN_B = 50;
    const CONTENT_W = PAGE_WIDTH - MARGIN_L - MARGIN_R; // 495.28

    // Kop surat: lebar 450pt, CENTERED horizontal. Tinggi = W × 716/2400 ≈ 134pt.
    // (Lebar 450pt sengaja < CONTENT_W (495) supaya ada margin kiri-kanan yang
    // proporsional — tidak full-bleed, sesuai brief.)
    const KOP_W = 450;
    const KOP_H = KOP_W * this.KOP_RATIO; // ≈ 134.2pt
    const KOP_X = (PAGE_WIDTH - KOP_W) / 2; // ≈ 72.64
    const KOP_Y = MARGIN_T;

    // Posisi vertikal setelah kop surat
    const TITLE_Y = KOP_Y + KOP_H + 16; // ≈ 190
    const TITLE_FONT_SIZE = 14;
    const TITLE_H = 18;
    const NOMOR_Y = TITLE_Y + TITLE_H + 4; // ≈ 212
    const NOMOR_H = 14;

    // Banner status full-width
    const BANNER_Y = NOMOR_Y + NOMOR_H + 14; // ≈ 240
    const BANNER_H = 26;
    const BANNER_END_Y = BANNER_Y + BANNER_H; // ≈ 266
    const DATA_START_Y = BANNER_END_Y + 14; // ≈ 280

    // Tanda tangan (kanan) — fixed di kolom kanan setelah konten utama
    const SIG_W = 200;
    const SIG_X = PAGE_WIDTH - MARGIN_R - SIG_W; // ≈ 345.28

    // Pesan penutup + footer
    const PESAN_Y = PAGE_HEIGHT - MARGIN_B - 56; // ≈ 736
    const FOOTER_Y = PAGE_HEIGHT - MARGIN_B - 22; // ≈ 770

    await new Promise<void>((resolve, reject) => {
      const doc = new PDFDocument({
        size: 'A4',
        margins: { top: MARGIN_T, bottom: MARGIN_B, left: MARGIN_L, right: MARGIN_R },
        info: {
          Title:
            data.mode === 'AKTIF'
              ? `Bukti Pendaftaran Ulang - ${data.registrationNumber}`
              : `Tanda Bukti Pendaftaran - ${data.registrationNumber}`,
          Author: data.approvedBy?.name || 'SPMB SMK PGRI 3 Denpasar',
          Subject:
            data.mode === 'AKTIF'
              ? 'Bukti Pendaftaran Ulang - Siswa Aktif'
              : 'Tanda Bukti Pendaftaran - Menunggu Daftar Ulang',
          Keywords: 'SPMB, SMK PGRI 3 Denpasar, ' + data.registrationNumber,
        },
      });
      const stream = require('fs').createWriteStream(absPath);
      doc.pipe(stream);
      stream.on('finish', () => resolve());
      stream.on('error', reject);

      // ===== KOP SURAT — embedded image (single block) ====================
      // Dipasang CENTER horizontal, lebar 450pt (lebih kecil dari CONTENT_W
      // supaya ada margin kiri-kanan proporsional). Tinggi auto dari aspect
      // ratio supaya tidak gepeng/stretched.
      if (kopBuffer) {
        doc.image(kopBuffer, KOP_X, KOP_Y, { width: KOP_W, height: KOP_H });
      } else {
        // Placeholder tipis (satu garis tipis horizontal di area kop) supaya
        // user tahu area kop seharusnya di sini — lebih jelas daripada blank.
        doc
          .lineWidth(0.4)
          .moveTo(MARGIN_L, KOP_Y + KOP_H / 2)
          .lineTo(PAGE_WIDTH - MARGIN_R, KOP_Y + KOP_H / 2)
          .strokeColor('#e2e8f0')
          .stroke();
      }

      // ===== JUDUL DOKUMEN ===============================================
      const judulText =
        data.mode === 'AKTIF'
          ? 'BUKTI PENDAFTARAN ULANG'
          : 'TANDA BUKTI PENDAFTARAN';
      doc
        .font('Helvetica-Bold').fontSize(TITLE_FONT_SIZE).fillColor('#1e3a8a')
        .text(judulText, MARGIN_L, TITLE_Y,
          { width: CONTENT_W, align: 'center' })
        .font('Helvetica').fontSize(10).fillColor('black')
        .text(`Nomor Pendaftaran: ${data.registrationNumber}`,
          MARGIN_L, NOMOR_Y, { width: CONTENT_W, align: 'center' });

      // ===== STATUS BANNER (full width, warna & teks berbeda per mode) ====
      const isActive = data.mode === 'AKTIF';
      const bannerFill = isActive ? '#dcfce7' : '#fef9c3';
      const bannerStroke = isActive ? '#16a34a' : '#ca8a04';
      const bannerText = isActive ? 'SISWA AKTIF' : 'MENUNGGU DAFTAR ULANG';
      const bannerTextColor = isActive ? '#14532d' : '#713f12';

      doc
        .lineWidth(0.6)
        .roundedRect(MARGIN_L, BANNER_Y, CONTENT_W, BANNER_H, 4)
        .fillOpacity(1)
        .fillAndStroke(bannerFill, bannerStroke);
      doc
        .font('Helvetica-Bold').fontSize(11).fillColor(bannerTextColor)
        .text(bannerText,
          MARGIN_L + 6, BANNER_Y + 7,
          { width: CONTENT_W - 12, align: 'center' })
        .fillColor('black');

      // ===== DATA PENDAFTAR (full width di bawah banner) ==================
      const tglLahirId = data.tanggalLahir.toLocaleDateString('id-ID', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      });
      const jenisKelaminLabel = data.jenisKelamin === 'L' ? 'Laki-laki' : 'Perempuan';
      const tempatTglLahir = `${data.tempatLahir}, ${tglLahirId}`;

      type Row = [string, string];
      // Nilai UN: tampil 2 desimal kalau ada (mis. "85.50"), '-' kalau kosong.
      // Konsisten dengan NISN — lihat rows handling di bawah.
      const nilaiUnStr =
        data.jumlahNilaiUn != null && !Number.isNaN(Number(data.jumlahNilaiUn))
          ? Number(data.jumlahNilaiUn).toFixed(2).replace(/\.00$/, '')
          : '-';
      const rows: Row[] = [
        ['Nama Lengkap', data.namaLengkap],
        ['Jenis Kelamin', jenisKelaminLabel],
        ['Tempat / Tgl. Lahir', tempatTglLahir],
        ['NISN', data.nisn || '-'],
        ['Nilai UN', nilaiUnStr],
        ['Sekolah Asal', data.sekolahAsal],
        ['Alamat', data.alamat],
        ['No. Telp / HP', data.noTelp],
        ['Nama Ibu', data.namaIbu],
        ['No. Telp Orang Tua', data.noTelpOrtu],
        ['Jurusan Pilihan', `${data.jurusan.code} — ${data.jurusan.name}`],
        ['Gelombang', data.gelombang.name],
      ];

      // Tambahan khusus mode AKTIF
      if (isActive) {
        const nominalStr =
          data.nominalPembayaran != null
            ? this.formatRupiah(Number(data.nominalPembayaran))
            : '-';
        rows.push(['Ukuran Baju', data.ukuranBaju || '-']);
        rows.push(['Total Pembayaran', nominalStr]);
      }

      // Tinggi baris dinamis — dihitung dari doc.heightOfString terhadap lebar
      // kolom value, supaya field yang isinya panjang (Alamat, Sekolah Asal,
      // Nama Ibu) bisa wrap ke 2 baris tanpa menabrak baris berikutnya.
      const LABEL_W = 135;
      const dataColW = CONTENT_W - LABEL_W - 8;
      const minRowH = 14; // minimum tinggi 1 baris
      const rowGap = 4; // jarak antar-baris data

      // Pra-komputasi tinggi per baris. Font HARUS diset sebelum memanggil
      // heightOfString supaya hasilnya akurat (pdfkit pakai font aktif).
      const rowHeights: number[] = rows.map((r) => {
        doc.font('Helvetica').fontSize(9);
        const valueText = ': ' + r[1];
        const valueH = doc.heightOfString(valueText, { width: dataColW });
        return Math.max(minRowH, valueH);
      });

      // Render baris satu per satu, Y maju sesuai tinggi aktual.
      let currentY = DATA_START_Y;
      rows.forEach((r, i) => {
        const y = currentY;
        doc.font('Helvetica-Bold').fontSize(9).fillColor('#0f172a')
          .text(r[0], MARGIN_L, y, { width: LABEL_W });
        doc.font('Helvetica').fontSize(9).fillColor('#0f172a')
          .text(': ' + r[1], MARGIN_L + LABEL_W, y, { width: dataColW });
        currentY += rowHeights[i] + rowGap;
      });
      let contentEndY = currentY - rowGap; // trailing gap tidak ikut dihitung

      // ===== PERIHAL & JAM (Tahap 1 only) — LANGSUNG setelah data =========
      // Tahap 1 menampilkan instruksi daftar ulang sebagai 2 baris label-value
      // dengan gaya yang sama dengan data row di atas — bukan paragraf panjang.
      // Doc.y digunakan untuk posisi baris kedua supaya wrap tetap aman.
      if (!isActive) {
        const pesanLabelW = 60;
        const pesanValueW = CONTENT_W - pesanLabelW - 8;
        const pesanY = contentEndY + 6; // small gap setelah data

        // Row 1: Perihal (value mungkin wrap ke 2 baris untuk alamat panjang)
        doc.font('Helvetica-Bold').fontSize(9).fillColor('#0f172a')
          .text('Perihal', MARGIN_L, pesanY, { width: pesanLabelW });
        doc.font('Helvetica').fontSize(9).fillColor('#0f172a')
          .text(
            ': Lakukan pendaftaran ulang ke sekolah di ' + this.school.address,
            MARGIN_L + pesanLabelW, pesanY,
            { width: pesanValueW },
          );
        const jamY = doc.y + 4;

        // Row 2: Jam
        doc.font('Helvetica-Bold').fontSize(9).fillColor('#0f172a')
          .text('Jam', MARGIN_L, jamY, { width: pesanLabelW });
        doc.font('Helvetica').fontSize(9).fillColor('#0f172a')
          .text(': 08.00 – 15.00 WITA',
            MARGIN_L + pesanLabelW, jamY, { width: pesanValueW });

        contentEndY = doc.y + 6; // update untuk section berikutnya
      }

      // ===== JADWAL DAFTAR ULANG (jika ada) ===============================
      // Jadwal berada SETELAH Perihal/Jam (Tahap 1) atau SETELAH data (Tahap 2),
      // supaya alur visual dari atas ke bawah tetap koheren.
      if (data.gelombang.tanggalDaftarUlang || data.gelombang.jamDaftarUlang) {
        const jadwalY = contentEndY + 8;
        const tgl = data.gelombang.tanggalDaftarUlang
          ? data.gelombang.tanggalDaftarUlang.toLocaleDateString('id-ID', {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            })
          : 'Akan diumumkan';
        const jam = data.gelombang.jamDaftarUlang || 'Akan diumumkan';
        doc.font('Helvetica-Bold').fontSize(10).fillColor('#1e40af')
          .text('JADWAL DAFTAR ULANG FISIK', MARGIN_L, jadwalY,
            { width: CONTENT_W })
          .font('Helvetica').fontSize(9.5).fillColor('#0f172a')
          .text(`Tanggal : ${tgl}`, MARGIN_L, doc.y + 2, { width: CONTENT_W })
          .text(`Jam     : ${jam} WITA`, MARGIN_L, doc.y + 2, { width: CONTENT_W })
          .text(`Lokasi  : ${this.school.address}`, MARGIN_L, doc.y + 2,
            { width: CONTENT_W })
          .text(`Telp    : ${this.school.phone}`, MARGIN_L, doc.y + 2,
            { width: CONTENT_W });
        contentEndY = doc.y + 8;
      }

      // ===== TANDA TANGAN PETUGAS (kanan, di bawah konten) ================
      // Untuk MENUNGGU: cap "Panitia Pendaftaran" (tidak ada approver spesifik).
      // Untuk AKTIF: cap "Petugas yang menyetujui" dengan nama approver.
      const tglCetakId = data.approvedAt.toLocaleDateString('id-ID', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      });
      const approverName = data.approvedBy?.name
        || (isActive ? 'Petugas SPMB' : 'Panitia Pendaftaran');
      const approverEmail = data.approvedBy?.email
        || 'panitia@smk-pgri3dps.sch.id';

      // Posisikan signature block DI BAWAH contentEndY, di kolom kanan.
      const sigY = contentEndY + 14;

      // Baris-baris signature block:
      //   Line 1: "Denpasar, <tanggal>" (semua mode)
      //   Line 2: Jabatan penandatangan
      //           - AKTIF: "Petugas yang menyetujui,"
      //           - MENUNGGU: "Panitia Pendaftaran,"
      //   Line 3: (gap 30pt — ruang tanda tangan basah / tulis tangan)
      //   Line 4: Nama penandatangan
      //           - AKTIF: nama approver (dari approvedBy) + email di bawahnya
      //           - MENUNGGU: TIDAK diisi nama asli — hanya label "Panitia
      //             Pendaftaran" sebagai placeholder di bawah garis kosong,
      //             tanpa email.
      doc.font('Helvetica').fontSize(9).fillColor('#0f172a')
        .text('Denpasar, ' + tglCetakId, SIG_X, sigY, { width: SIG_W, align: 'left' });
      if (isActive) {
        // ---- Mode AKTIF: nama approver + email (seperti sebelumnya) ------
        doc.text('Petugas yang menyetujui,', SIG_X, sigY + 14, { width: SIG_W })
          // 30pt gap untuk ruang tanda tangan
          .font('Helvetica-Bold').fontSize(10)
          .text(approverName, SIG_X, sigY + 58, { width: SIG_W })
          .font('Helvetica').fontSize(8).fillColor('#475569')
          .text(approverEmail, SIG_X, sigY + 70, { width: SIG_W })
          .fillColor('black');
      } else {
        // ---- Mode MENUNGGU: garis kosong + label placeholder, tanpa email -
        doc.text('Panitia Pendaftaran,', SIG_X, sigY + 14, { width: SIG_W })
          // 30pt gap untuk ruang tanda tangan kosong (garis bawah = nama yg
          // akan ditulis tangan / dibubuhkan cap sekolah)
          .font('Helvetica-Bold').fontSize(10).fillColor('#0f172a')
          .text('Panitia Pendaftaran', SIG_X, sigY + 58, { width: SIG_W })
          .fillColor('black');
      }

      // ===== PESAN PENUTUP ================================================
      // Hanya untuk mode AKTIF (Tahap 2). Mode MENUNGGU (Tahap 1) sudah
      // punya pesan Perihal/Jam yang di-render LANGSUNG setelah data diri.
      if (isActive) {
        doc.font('Helvetica-Oblique').fontSize(8.5).fillColor('#475569')
          .text(
            'Informasi lebih lanjut terkait teknis pelaksanaan tahun ajaran ' +
              'baru akan diinformasikan melalui pihak sekolah.',
            MARGIN_L, PESAN_Y, { width: CONTENT_W, align: 'center', height: 28 },
          );
      }

      // ===== FOOTER ========================================================
      // Footer hanya untuk mode AKTIF (Tahap 2). Mode MENUNGGU (Tahap 1)
      // sengaja kosongkan — sesuai brief user.
      if (isActive) {
        doc.fontSize(7.5).fillColor('#64748b')
          .text(
            'Dokumen ini dihasilkan otomatis oleh sistem SPMB SMK PGRI 3 Denpasar.',
            MARGIN_L, FOOTER_Y, { width: CONTENT_W, align: 'center', height: 18 },
          );
      }

      doc.end();
    });

    this.logger.log(
      `PDF bukti (mode=${data.mode}) tersimpan: ${absPath}`,
    );
    return { relativePath, signature, verificationUrl };
  }

  private formatRupiah(value: number): string {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0,
    }).format(value);
  }
}