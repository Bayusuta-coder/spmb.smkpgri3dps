import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { promises as fs, existsSync } from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import PDFDocument from 'pdfkit';
import { getSchoolInfo, SchoolInfo } from '../common/constants/school';

/**
 * Mode PDF:
 *  - 'MENUNGGU' → Tahap 1 (label publik: "Belum Daftar Ulang") — generate otomatis
 *                 saat siswa submit form pendaftaran. Judul: TANDA BUKTI PENDAFTARAN.
 *  - 'BAYAR'    → Tahap 1.5 (label publik: "Sudah Bayar") — generate saat Bendahara
 *                 catat pembayaran (TANPA menunggu ukuran baju). Judul: BUKTI PEMBAYARAN.
 *                 Tampilkan nominal + metode + tanggal bayar + petugas, TANPA ukuran baju.
 *  - 'AKTIF'    → Tahap 2 (label publik: "Siswa Aktif") — generate saat pembayaran
 *                 DAN ukuran baju sudah lengkap. Judul: BUKTI PENDAFTARAN ULANG.
 */
export type PdfMode = 'MENUNGGU' | 'BAYAR' | 'AKTIF';

/**
 * Data minimum untuk generate bukti pendaftaran.
 * - Untuk MENUNGGU: cukup data diri, TIDAK perlu ukuranBaju / nominalPembayaran.
 * - Untuk BAYAR   : data diri + nominalPembayaran (snapshot) + dibayarOleh.
 * - Untuk AKTIF   : WAJIB ada ukuranBaju + nominalPembayaran (snapshot harga saat approve).
 */
export interface BuktiPendaftaranUlangData {
  mode: PdfMode;
  registrationNumber: string;
  namaLengkap: string;
  jenisKelamin: 'L' | 'P';
  /** Enum Agama dari Prisma (uppercase di PDF — lihat render row "Agama"). */
  agama?: string | null;
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
  // Untuk mode BAYAR & AKTIF (optional di type, tapi service akan validasi runtime)
  ukuranBaju?: string | null;
  nominalPembayaran?: number | string | null;
  // Untuk mode BAYAR: metode + tanggal bayar + petugas Bendahara
  metodePembayaran?: 'CASH' | 'TRANSFER' | null;
  tanggalBayar?: Date | null;
  dibayarOleh?: { name: string; email: string } | null;
  // Nilai UN — opsional di form, disimpan sebagai Decimal nullable di DB.
  // Di PDF tampil '-' kalau null (konsisten dengan NISN).
  jumlahNilaiUn?: number | string | null;
  // Penanda waktu & approver (untuk AKTIF & BAYAR — Bendahara untuk BAYAR)
  approvedAt: Date;
  approvedBy?: { name: string; email: string };
  // URL absolut halaman verifikasi publik (frontend-user)
  verificationUrl?: string;
}

/**
 * Data minimum untuk generate Formulir Pengambilan Seragam Siswa Baru.
 * Mirip formulir kertas yang biasa diisi TU saat siswa datang ke sekolah
 * untuk ambil seragam — lengkap dengan checkbox per item + 2 kolom
 * tanda tangan (Penerima & Petugas Seragam).
 *
 * Layout PDF:
 *   - Kop surat (PNG embed, SAMA dengan bukti pendaftaran — reuse kopSuratPath)
 *   - Judul: "FORMULIR PENGAMBILAN SERAGAM SISWA BARU [tahun ajaran]"
 *   - 6 info siswa (nama, no reg, jurusan, JK, ukuran, tgl ambil)
 *   - Box catatan "Seragam yang sudah diterima tidak dapat dikembalikan"
 *   - Tabel item (3 kolom: NAMA ITEM | CENTANG | KETERANGAN)
 *   - 2 kolom tanda tangan: Penerima (kiri) + Petugas (kanan)
 *
 * PDF ini disimpan sebagai `<registrationNumber>-SERAGAM.pdf` di storage
 * yang sama dengan bukti pendaftaran — supaya tidak bentrok dengan PDF
 * bukti pendaftaran utama (beda suffix).
 */
export interface FormulirSeragamData {
  /** Custom filename (di-inject oleh service — pattern: `<reg>-SERAGAM.pdf`) */
  filename: string;
  registrationNumber: string;
  namaLengkap: string;
  jenisKelamin: 'L' | 'P';
  // Pendaftar reference (untuk signature line + content)
  jurusan: { code: string; name: string };
  ukuran: string;
  tanggalPengambilan: Date;
  // Nama penerima (orang tua/wali) — boleh null kalau TU belum tau
  penerimaNama?: string | null;
  // Petugas yang terakhir submit checklist (TU/Superadmin)
  petugas: { name: string; email: string };
  // Daftar item yang sudah di-expand dengan ceklist state — tiap item:
  //   - nama: dari master item
  //   - sudahDidapat: bool → render sebagai checkbox visual
  //   - keterangan: string|null → render di kolom KETERANGAN
  items: Array<{ nama: string; sudahDidapat: boolean; keterangan?: string | null }>;
  // Tahun ajaran label (misal "2026/2027") untuk judul PDF — di-compute
  // di service (Indonesia: Jul–Jun).
  tahunAjaranLabel: string;
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
          : data.mode === 'BAYAR'
            ? 'BUKTI PEMBAYARAN'
            : 'TANDA BUKTI PENDAFTARAN';
      doc
        .font('Helvetica-Bold').fontSize(TITLE_FONT_SIZE).fillColor('#1e3a8a')
        .text(judulText, MARGIN_L, TITLE_Y,
          { width: CONTENT_W, align: 'center' })
        .font('Helvetica').fontSize(10).fillColor('black')
        .text(`Nomor Pendaftaran: ${data.registrationNumber}`,
          MARGIN_L, NOMOR_Y, { width: CONTENT_W, align: 'center' });

      // ===== STATUS BANNER (full width, warna & teks berbeda per mode) ====
      // 3 mode: MENUNGGU (kuning), BAYAR (biru), AKTIF (hijau).
      const isAktif = data.mode === 'AKTIF';
      const isBayar = data.mode === 'BAYAR';
      const isMenunggu = data.mode === 'MENUNGGU';
      const bannerFill = isAktif ? '#dcfce7' : isBayar ? '#dbeafe' : '#fef9c3';
      const bannerStroke = isAktif ? '#16a34a' : isBayar ? '#2563eb' : '#ca8a04';
      const bannerText = isAktif ? 'SISWA AKTIF' : isBayar ? 'SUDAH BAYAR' : 'BELUM DAFTAR ULANG';
      const bannerTextColor = isAktif ? '#14532d' : isBayar ? '#1e3a8a' : '#713f12';

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
      const jenisKelaminLabel = data.jenisKelamin === 'L' ? 'LAKI-LAKI' : 'PEREMPUAN';
      const agamaLabel = (data.agama || '-').toString().toUpperCase();
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
        ['Agama', agamaLabel],
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

      // Tambahan khusus mode BAYAR (Total Pembayaran saja — baju belum diisi TU)
      if (isBayar) {
        const nominalStr =
          data.nominalPembayaran != null
            ? this.formatRupiah(Number(data.nominalPembayaran))
            : '-';
        rows.push(['Total Pembayaran', nominalStr]);
      }

      // Tambahan khusus mode AKTIF (Ukuran Baju + Total Pembayaran)
      if (isAktif) {
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

      // ===== MODE-SPECIFIC INFO SECTION (LANGSUNG setelah data) ==========
// - MENUNGGU: tampilkan "Perihal" + "Jam" — instruksi daftar ulang.
// - BAYAR   : tampilkan "Metode Pembayaran" + "Tanggal Pembayaran" + reminder
//             bahwa ukuran baju akan dicatat oleh TU saat daftar ulang fisik.
      if (isMenunggu) {
        const pesanLabelW = 60;
        const pesanValueW = CONTENT_W - pesanLabelW - 8;
        const pesanY = contentEndY + 6; // small gap setelah data

        // Row 1: Perihal (value mungkin wrap ke 2 baris untuk alamat panjang)
        doc.font('Helvetica-Bold').fontSize(9).fillColor('#0f172a')
          .text('Perihal', MARGIN_L, pesanY, { width: pesanLabelW });
        doc.font('Helvetica').fontSize(9).fillColor('#0f172a')
          .text(
            ': Segera lakukan pendaftaran ulang secara langsung ke SMK PGRI 3 Denpasar di ' + this.school.address,
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
      } else if (isBayar) {
        const pesanLabelW = 110;
        const pesanValueW = CONTENT_W - pesanLabelW - 8;
        const pesanY = contentEndY + 6;

        const metodeLabel = data.metodePembayaran === 'TRANSFER' ? 'Transfer Bank' : 'Tunai';
        const tanggalBayarStr = data.tanggalBayar
          ? data.tanggalBayar.toLocaleDateString('id-ID', {
              day: 'numeric', month: 'long', year: 'numeric',
            })
          : '-';

        // Row: Metode Pembayaran
        doc.font('Helvetica-Bold').fontSize(9).fillColor('#0f172a')
          .text('Metode Pembayaran', MARGIN_L, pesanY, { width: pesanLabelW });
        doc.font('Helvetica').fontSize(9).fillColor('#0f172a')
          .text(`: ${metodeLabel}`, MARGIN_L + pesanLabelW, pesanY,
            { width: pesanValueW });
        const tglY = doc.y + 4;

        // Row: Tanggal Pembayaran
        doc.font('Helvetica-Bold').fontSize(9).fillColor('#0f172a')
          .text('Tanggal Pembayaran', MARGIN_L, tglY, { width: pesanLabelW });
        doc.font('Helvetica').fontSize(9).fillColor('#0f172a')
          .text(`: ${tanggalBayarStr}`, MARGIN_L + pesanLabelW, tglY,
            { width: pesanValueW });

        contentEndY = doc.y + 6;
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
        || (isAktif ? 'Petugas SPMB' : isBayar ? (data.dibayarOleh?.name || 'Bendahara') : 'Panitia Pendaftaran');
      const approverEmail = data.approvedBy?.email
        || data.dibayarOleh?.email
        || 'panitia@smk-pgri3dps.sch.id';

      // Posisikan signature block DI BAWAH contentEndY, di kolom kanan.
      const sigY = contentEndY + 14;

      // Baris-baris signature block:
      //   Line 1: "Denpasar, <tanggal>" (semua mode)
      //   Line 2: Jabatan penandatangan
      //           - AKTIF: "Petugas yang menyetujui,"
      //           - BAYAR: "Bendahara yang mencatat,"
      //           - MENUNGGU: "Panitia Pendaftaran,"
      //   Line 3: (gap 30pt — ruang tanda tangan basah / tulis tangan)
      //   Line 4: Nama penandatangan
      //           - AKTIF/BAYAR: nama approver (dari approvedBy/dibayarOleh) + email
      //           - MENUNGGU: TIDAK diisi nama asli — hanya label "Panitia
      //             Pendaftaran" sebagai placeholder di bawah garis kosong.
      doc.font('Helvetica').fontSize(9).fillColor('#0f172a')
        .text('Denpasar, ' + tglCetakId, SIG_X, sigY, { width: SIG_W, align: 'left' });
      if (isAktif) {
        // ---- Mode AKTIF: nama approver + email (seperti sebelumnya) ------
        doc.text('Petugas yang menyetujui,', SIG_X, sigY + 14, { width: SIG_W })
          // 30pt gap untuk ruang tanda tangan
          .font('Helvetica-Bold').fontSize(10)
          .text(approverName, SIG_X, sigY + 58, { width: SIG_W })
          .font('Helvetica').fontSize(8).fillColor('#475569')
          .text(approverEmail, SIG_X, sigY + 70, { width: SIG_W })
          .fillColor('black');
      } else if (isBayar) {
        // ---- Mode BAYAR: Bendahara yang mencatat + nama + email ---------
        doc.text('Bendahara yang mencatat,', SIG_X, sigY + 14, { width: SIG_W })
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
      // Untuk mode AKTIF & BAYAR. Mode MENUNGGU sudah punya pesan Perihal/Jam.
      if (isAktif) {
        doc.font('Helvetica-Oblique').fontSize(8.5).fillColor('#475569')
          .text(
            'Informasi lebih lanjut terkait teknis pelaksanaan tahun ajaran ' +
              'baru akan diinformasikan melalui pihak sekolah.',
            MARGIN_L, PESAN_Y, { width: CONTENT_W, align: 'center', height: 28 },
          );
      } else if (isBayar) {
        doc.font('Helvetica-Oblique').fontSize(8.5).fillColor('#475569')
          .text(
            'Ukuran baju akan dicatat terpisah oleh petugas Tata Usaha (TU) ' +
              'saat Anda datang ke sekolah untuk melakukan daftar ulang fisik.',
            MARGIN_L, PESAN_Y, { width: CONTENT_W, align: 'center', height: 28 },
          );
      }

      // ===== FOOTER ========================================================
      // Footer untuk mode AKTIF & BAYAR (PDF otomatis). Mode MENUNGGU kosong.
      if (isAktif || isBayar) {
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

  /**
   * =====================================================================
   * FORMULIR PENGAMBILAN SERAGAM SISWA BARU — Batch D
   * =====================================================================
   *
   * Generate PDF formulir checklist seragam per siswa. Layout MIRIP formulir
   * kertas asli yang dipakai TU saat siswa datang ke sekolah — dengan
   * kolom centang per item + 2 kolom tanda tangan (Penerima & Petugas).
   *
   * REUSE kop surat PNG dari bukti pendaftaran (`this.kopSuratPath`).
   * Tidak ada QR / signature publik karena PDF ini admin-only (tidak
   * dipublikasikan ke siswa/orang tua).
   *
   * Returns: absolute path file PDF (caller / controller stream ke client).
   */
  async generateFormulirSeragam(data: FormulirSeragamData): Promise<string> {
    await fs.mkdir(this.uploadsDir, { recursive: true });

    // Load kop surat (sama dengan bukti pendaftaran — REUSE asset existing).
    let kopBuffer: Buffer | null = null;
    try {
      kopBuffer = await fs.readFile(this.kopSuratPath);
    } catch (e: any) {
      this.logger.warn(
        `Kop surat image tidak ditemukan di ${this.kopSuratPath} ` +
          `— kop surat PDF formulir seragam akan dikosongkan.`,
      );
    }

    const safeName = (data.filename || `${data.registrationNumber}-SERAGAM.pdf`)
      .replace(/[^A-Za-z0-9._-]/g, '_');
    const absPath = path.join(this.uploadsDir, safeName);

    // Layout constants (A4 portrait)
    const PAGE_WIDTH = 595.28;
    const PAGE_HEIGHT = 841.89;
    const MARGIN_L = 50;
    const MARGIN_R = 50;
    const MARGIN_T = 40;
    const MARGIN_B = 50;
    const CONTENT_W = PAGE_WIDTH - MARGIN_L - MARGIN_R; // ≈495.28

    // Kop surat — sama persis ukuran dengan bukti pendaftaran.
    const KOP_W = 450;
    const KOP_H = KOP_W * this.KOP_RATIO;
    const KOP_X = (PAGE_WIDTH - KOP_W) / 2;
    const KOP_Y = MARGIN_T;

    // Posisi vertikal setelah kop surat
    const TITLE_Y = KOP_Y + KOP_H + 14;
    const SUBTITLE_Y = TITLE_Y + 14;
    const DATA_BLOCK_Y = SUBTITLE_Y + 18;
    const CATATAN_Y_OFFSET = 14;

    await new Promise<void>((resolve, reject) => {
      const doc = new PDFDocument({
        size: 'A4',
        margins: { top: MARGIN_T, bottom: MARGIN_B, left: MARGIN_L, right: MARGIN_R },
        info: {
          Title: `Formulir Pengambilan Seragam - ${data.registrationNumber}`,
          Author: 'SPMB SMK PGRI 3 Denpasar',
          Subject: 'Formulir Pengambilan Seragam Siswa Baru',
          Keywords: 'SPMB, SMK PGRI 3 Denpasar, Seragam, ' + data.registrationNumber,
        },
      });
      const stream = require('fs').createWriteStream(absPath);
      doc.pipe(stream);
      stream.on('finish', () => resolve());
      stream.on('error', reject);

      // ===== KOP SURAT =================================================
      if (kopBuffer) {
        doc.image(kopBuffer, KOP_X, KOP_Y, { width: KOP_W, height: KOP_H });
      } else {
        doc.lineWidth(0.4)
          .moveTo(MARGIN_L, KOP_Y + KOP_H / 2)
          .lineTo(PAGE_WIDTH - MARGIN_R, KOP_Y + KOP_H / 2)
          .strokeColor('#e2e8f0')
          .stroke();
      }

      // ===== JUDUL ====================================================
      doc.font('Helvetica-Bold').fontSize(14).fillColor('#1e3a8a')
        .text('FORMULIR PENGAMBILAN SERAGAM SISWA BARU', MARGIN_L, TITLE_Y,
          { width: CONTENT_W, align: 'center' });
      doc.font('Helvetica').fontSize(11).fillColor('#0f172a')
        .text(`Tahun Ajaran ${data.tahunAjaranLabel}`, MARGIN_L, SUBTITLE_Y,
          { width: CONTENT_W, align: 'center' });

      // Garis tipis pemisah judul → data (seperti form fisik)
      let currentY = DATA_BLOCK_Y;
      doc.lineWidth(0.4)
        .moveTo(MARGIN_L, currentY - 4)
        .lineTo(PAGE_WIDTH - MARGIN_R, currentY - 4)
        .strokeColor('#94a3b8')
        .stroke();

      // ===== INFO SISWA (grid 2 row × 3 col, label : value) ===========
      // Sama dengan layout form fisik asli.
      const jenisKelaminLabel = data.jenisKelamin === 'L' ? 'LAKI-LAKI' : 'PEREMPUAN';
      const tglAmbilStr = data.tanggalPengambilan.toLocaleDateString('id-ID', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      });
      const fields: Array<[string, string, number, number]> = [
        // label, value, colX, colY (Y absolute; X calculated)
        ['Nama Siswa', data.namaLengkap, 0, 0],
        ['No. Pendaftaran', data.registrationNumber, 1, 0],
        ['Jurusan', `${data.jurusan.code} — ${data.jurusan.name}`, 2, 0],
        ['Jenis Kelamin', jenisKelaminLabel, 0, 1],
        ['Ukuran / Size', data.ukuran, 1, 1],
        ['Tanggal Pengambilan', tglAmbilStr, 2, 1],
      ];
      // Hitung lebar per kolom: split CONTENT_W (495.28) jadi 3 cols
      // dengan gap 4pt. 3*W + 2*4 = 495.28 → W ≈ (495.28 - 8) / 3 ≈ 162.43
      const COL_GAP = 6;
      const COL_W = (CONTENT_W - 2 * COL_GAP) / 3;
      const ROW_H = 28;

      for (const [label, value, col, row] of fields) {
        const cellX = MARGIN_L + col * (COL_W + COL_GAP);
        const cellY = DATA_BLOCK_Y + row * ROW_H;
        // Label
        doc.font('Helvetica-Bold').fontSize(8).fillColor('#64748b')
          .text(label.toUpperCase(), cellX, cellY, { width: COL_W });
        // Value
        doc.font('Helvetica').fontSize(11).fillColor('#0f172a')
          .text(value, cellX, cellY + 11, { width: COL_W });
      }
      currentY = DATA_BLOCK_Y + 2 * ROW_H + 4;

      // ===== CATATAN BOX ==============================================
      // Box kuning dengan pesan "Seragam yang sudah diterima tidak dapat
      // dikembalikan / ditukar !"
      const catatanH = 32;
      doc.lineWidth(0.6)
        .roundedRect(MARGIN_L, currentY, CONTENT_W, catatanH, 4)
        .fillAndStroke('#fef9c3', '#ca8a04');
      // Render jadi 1 paragraf supaya "CATATAN:" dan body text tidak overlap.
      // Pakai rich-style trick: tulis manual pakai font berbeda dalam 1 baris Y.
      doc.font('Helvetica-Bold').fontSize(9).fillColor('#713f12')
        .text('CATATAN', MARGIN_L + 10, currentY + 11,
          { width: 60, align: 'left' });
      // Body text mulai setelah label + offset
      doc.font('Helvetica').fontSize(9).fillColor('#713f12')
        .text(
          ': Seragam yang sudah diterima tidak dapat dikembalikan / ditukar !',
          MARGIN_L + 10 + 60, currentY + 11,
          { width: CONTENT_W - 20 - 60 },
        );
      currentY += catatanH + CATATAN_Y_OFFSET;

      // ===== TABEL CHECKLIST ==========================================
      // 3 kolom: NAMA ITEM | CENTANG (✓ / box) | KETERANGAN
      // Lebar kolom di-tune supaya text header "CENTANG (JIKA SUDAH DAPAT)"
      // muat tanpa overlap ke kolom sebelahnya.
      const TBL_LABEL = 'ITEM YG SUDAH DIDAPAT';
      const TBL_CHECK = 'CENTANG (JIKA SUDAH DAPAT)';
      const TBL_KET = 'KETERANGAN';
      const TBL_COL1 = CONTENT_W * 0.50;        // nama item (diperbesar dari 45%)
      const TBL_COL2 = CONTENT_W * 0.22;        // centang (diperbesar dari 15%)
      const TBL_COL3 = CONTENT_W - TBL_COL1 - TBL_COL2; // keterangan

      // Header table
      const TBL_HEADER_H = 28; // lebih tinggi (28pt) supaya 2 baris text muat
      const TBL_ROW_H = 22; // tinggi tiap row item
      const tblX = MARGIN_L;
      const tblY = currentY;

      // Header background
      doc.lineWidth(0.4)
        .rect(tblX, tblY, CONTENT_W, TBL_HEADER_H)
        .fillAndStroke('#1e3a8a', '#1e3a8a');
      // White text on blue header — pakai lineBreak:true supaya wrap ke baris
      // baru kalau text terlalu panjang (khusu TBL_CHECK yg panjang).
      doc.font('Helvetica-Bold').fontSize(8).fillColor('#ffffff');
      doc.text(TBL_LABEL, tblX + 4, tblY + 6,
        { width: TBL_COL1 - 8, align: 'left', lineBreak: false });
      doc.text(TBL_CHECK, tblX + TBL_COL1 + 4, tblY + 4,
        { width: TBL_COL2 - 8, align: 'center', lineBreak: true });
      doc.text(TBL_KET, tblX + TBL_COL1 + TBL_COL2 + 4, tblY + 6,
        { width: TBL_COL3 - 8, align: 'left', lineBreak: false });

      // Body rows
      let rowY = tblY + TBL_HEADER_H;
      doc.fillColor('#0f172a');
      for (let i = 0; i < data.items.length; i++) {
        const item = data.items[i];
        // Zebra striping (row ganjil lebih gelap tipis)
        if (i % 2 === 0) {
          doc.lineWidth(0.3)
            .rect(tblX, rowY, CONTENT_W, TBL_ROW_H)
            .fillAndStroke('#f8fafc', '#cbd5e1');
        } else {
          doc.lineWidth(0.3)
            .rect(tblX, rowY, CONTENT_W, TBL_ROW_H)
            .fillAndStroke('#ffffff', '#cbd5e1');
        }
        // Cell border (re-stroke untuk konsistensi visual)
        doc.lineWidth(0.3)
          .rect(tblX, rowY, CONTENT_W, TBL_ROW_H)
          .strokeColor('#cbd5e1')
          .stroke();

        // Vertical separators
        const col1EndX = tblX + TBL_COL1;
        const col2EndX = col1EndX + TBL_COL2;
        doc.moveTo(col1EndX, rowY).lineTo(col1EndX, rowY + TBL_ROW_H).strokeColor('#cbd5e1').stroke();
        doc.moveTo(col2EndX, rowY).lineTo(col2EndX, rowY + TBL_ROW_H).strokeColor('#cbd5e1').stroke();

        // Cell content: nama item
        doc.font('Helvetica').fontSize(10).fillColor('#0f172a')
          .text(item.nama, tblX + 6, rowY + 6,
            { width: TBL_COL1 - 12, lineBreak: false });

        // Cell content: checkbox (visual) di cell tengah
        const boxSize = 12;
        const checkBoxX = col1EndX + (TBL_COL2 - boxSize) / 2;
        const checkBoxY = rowY + (TBL_ROW_H - boxSize) / 2;
        // Box outline
        doc.lineWidth(item.sudahDidapat ? 1.2 : 0.6)
          .strokeColor(item.sudahDidapat ? '#16a34a' : '#64748b')
          .rect(checkBoxX, checkBoxY, boxSize, boxSize)
          .fillAndStroke(item.sudahDidapat ? '#dcfce7' : '#ffffff',
            item.sudahDidapat ? '#16a34a' : '#64748b');
        // Ceklist mark: pakai "v" font Bold (font Sederhana, bukan Unicode)
        // karena Helvetica WinAnsi tidak punya ✓ glyph — pakai v sederhana.
        if (item.sudahDidapat) {
          doc.font('Helvetica-Bold').fontSize(12).fillColor('#15803d')
            .text('v', checkBoxX, checkBoxY - 1,
              { width: boxSize, align: 'center', height: boxSize });
        }

        // Cell content: keterangan (wrap ke 1 baris)
        const ket = (item.keterangan || '').trim();
        if (ket) {
          doc.font('Helvetica').fontSize(9).fillColor('#0f172a')
            .text(ket, col2EndX + 6, rowY + 7,
              { width: TBL_COL3 - 12 });
        }

        rowY += TBL_ROW_H;
      }

      // Total rows consumed — currentY is now di bawah tabel
      currentY = rowY + 18;

      // ===== 2 KOLOM TANDA TANGAN =====================================
      // 2 box: kiri = "Penerima", kanan = "Petugas Seragam SMK PGRI 3 Denpasar"
      const SIG_H = 96;
      const SIG_W = CONTENT_W / 2 - 12;
      const sigLeftX = MARGIN_L;
      const sigRightX = MARGIN_L + SIG_W + 24;
      const sigY = currentY;

      // Helper untuk render 1 signature box
      const renderSigBox = (x: number, title: string, line2Label: string,
        lineBelowName: string | null, emailBelowName?: string | null) => {
        // Box background (rounded tipis, tidak ada border — sesuai form fisik)
        doc.lineWidth(0.3)
          .strokeColor('#cbd5e1');
        // Title atas (centered)
        doc.font('Helvetica-Bold').fontSize(10).fillColor('#0f172a')
          .text(title, x, sigY, { width: SIG_W, align: 'center' });
        // Label "Tanda tangan:" di bawah title
        doc.font('Helvetica').fontSize(9).fillColor('#64748b')
          .text(line2Label, x, sigY + 14, { width: SIG_W, align: 'center' });
        // Garis bawah (margin kiri sedikit — garis panjang)
        const lineY = sigY + 64;
        doc.moveTo(x + 10, lineY).lineTo(x + SIG_W - 10, lineY).stroke();
        // Nama di bawah garis (opsional — kalau ada)
        if (lineBelowName) {
          doc.font('Helvetica-Bold').fontSize(10).fillColor('#0f172a')
            .text(lineBelowName, x, lineY + 4, { width: SIG_W, align: 'center' });
          // Subtitle: email (kecil, gray) — opsional, hanya untuk Petugas.
          if (emailBelowName) {
            doc.font('Helvetica').fontSize(8).fillColor('#475569')
              .text(emailBelowName, x, lineY + 18, { width: SIG_W, align: 'center' });
          }
        }
      };

      // Box kiri: "Penerima" (nama saja — orang tua tidak punya akun email sistem)
      renderSigBox(sigLeftX, 'Penerima', '( Orang Tua / Wali Siswa )', data.penerimaNama || null);
      // Box kanan: "Petugas Seragam SMK PGRI 3 Denpasar" (nama + email petugas)
      renderSigBox(sigRightX, 'Petugas Seragam SMK PGRI 3 Denpasar', '( TU / Panitia )', data.petugas.name, data.petugas.email || null);
      // Reset fillColor setelah renderSigBox (karena kita set fillColor di helper,
      // bisa bocor ke elemen berikutnya).
      doc.fillColor('#0f172a');

      currentY = sigY + SIG_H + 8;

      // ===== FOOTER ===================================================
      // Posisi fixed di bawah margin bawah supaya konsisten untuk semua dokumen
      const FOOTER_Y = PAGE_HEIGHT - MARGIN_B - 18;
      doc.fontSize(7.5).fillColor('#64748b')
        .text(
          `Dicetak otomatis oleh sistem SPMB SMK PGRI 3 Denpasar ` +
          `— Formulir Pengambilan Seragam — ${data.registrationNumber}`,
          MARGIN_L, FOOTER_Y, { width: CONTENT_W, align: 'center' },
        );

      doc.end();
    });

    this.logger.log(`PDF formulir seragam tersimpan: ${absPath}`);
    return absPath;
  }

  private formatRupiah(value: number): string {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0,
    }).format(value);
  }
}