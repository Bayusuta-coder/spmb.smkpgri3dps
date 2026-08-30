import { Injectable } from '@nestjs/common';
import ExcelJS from 'exceljs';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Bentuk request untuk endpoint export daftar ulang.
 *
 * - `classByJurusan`: map jurusanId -> jumlah kelas yang diinginkan.
 *   Kalau kosong/undefined, sistem fallback ke 1 kelas per jurusan.
 * - `maxFromSameSchool`: batas maksimal siswa dari sekolah asal sama
 *   yang boleh masuk ke kelas yang sama. Default 3 (configurable).
 */
export interface DaftarUlangExportRequest {
  classByJurusan?: Record<string, number>;
  maxFromSameSchool?: number;
}

/** Label Indonesia untuk enum Agama (sesuai 6 agama yang diakui). */
const AGAMA_LABEL: Record<string, string> = {
  ISLAM: 'Islam',
  KRISTEN: 'Kristen',
  KATOLIK: 'Katolik',
  HINDU: 'Hindu',
  BUDDHA: 'Buddha',
  KHONGHUCU: 'Khonghucu',
};

type JurusanClassDistribusi = {
  kode: string;
  nama: string;
  total: number;
  numClasses: number;
  classes: any[][];
  warnings: string[];
};

type DistribusiResult = {
  byJurusan: Map<string, JurusanClassDistribusi>;
  warnings: string[];
};

// Helper: styling header konsisten
const HEADER_FILL: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FF1E40AF' }, // primary-700
};
const HEADER_FONT: Partial<ExcelJS.Font> = {
  bold: true,
  color: { argb: 'FFFFFFFF' },
  size: 11,
};
const SUBHEADER_FILL: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FFE0E7FF' }, // primary-100
};
const SUBHEADER_FONT: Partial<ExcelJS.Font> = {
  bold: true,
  color: { argb: 'FF1E3A8A' }, // primary-900
};
const THIN: Partial<ExcelJS.Border> = {
  style: 'thin',
  color: { argb: 'FFCBD5E1' }, // slate-300
};

@Injectable()
export class ExportService {
  constructor(private readonly prisma: PrismaService) {}

  // =========================================================================
  // EXISTING: siswa aktif 1-sheet (Dapodik-like)
  // =========================================================================

  async exportSiswaAktifToXlsx(): Promise<Buffer> {
    const list = await this.prisma.pendaftar.findMany({
      where: { status: 'SISWA_AKTIF' },
      include: {
        jurusan: true,
        gelombang: true,
      },
      orderBy: { namaLengkap: 'asc' },
    });

    const wb = new ExcelJS.Workbook();
    wb.creator = 'SPMB SMK PGRI 3 Denpasar';
    wb.created = new Date();
    const ws = wb.addWorksheet('Siswa Aktif');

    ws.columns = [
      { header: 'No', key: 'no', width: 5 },
      { header: 'Nomor Pendaftaran', key: 'reg', width: 22 },
      { header: 'Nama Lengkap', key: 'nama', width: 32 },
      { header: 'Jenis Kelamin', key: 'jk', width: 8 },
      { header: 'Tempat Lahir', key: 'tempat', width: 20 },
      { header: 'Tanggal Lahir', key: 'tgl', width: 14 },
      { header: 'NISN', key: 'nisn', width: 14 },
      { header: 'Sekolah Asal', key: 'sekolah', width: 28 },
      { header: 'Alamat', key: 'alamat', width: 36 },
      { header: 'No. Telp', key: 'telp', width: 16 },
      { header: 'Email', key: 'email', width: 32 },
      { header: 'Nilai UN', key: 'nun', width: 10 },
      { header: 'Prestasi', key: 'prestasi', width: 24 },
      { header: 'Nama Ibu', key: 'ibu', width: 28 },
      { header: 'No. Telp Ortu', key: 'ortu', width: 16 },
      { header: 'Jurusan', key: 'jurusan', width: 32 },
      { header: 'Gelombang', key: 'gelombang', width: 18 },
      { header: 'Tanggal Daftar', key: 'tglDaftar', width: 16 },
      { header: 'Tanggal Approve', key: 'tglApprove', width: 16 },
    ];

    const headerRow = ws.getRow(1);
    headerRow.font = HEADER_FONT;
    headerRow.fill = HEADER_FILL;
    headerRow.alignment = { vertical: 'middle', horizontal: 'left' };

    list.forEach((p, i) => {
      ws.addRow({
        no: i + 1,
        reg: p.registrationNumber,
        nama: p.namaLengkap,
        jk: p.jenisKelamin === 'L' ? 'Laki-laki' : 'Perempuan',
        tempat: p.tempatLahir,
        tgl: p.tanggalLahir.toISOString().slice(0, 10),
        nisn: p.nisn,
        sekolah: p.sekolahAsal,
        alamat: p.alamat,
        telp: p.noTelp,
        email: p.email || '',
        nun: Number(p.jumlahNilaiUn),
        prestasi: p.prestasi || '',
        ibu: p.namaIbu,
        ortu: p.noTelpOrtu,
        jurusan: `${p.jurusan.code} - ${p.jurusan.name}`,
        gelombang: p.gelombang.name,
        tglDaftar: p.createdAt.toISOString().slice(0, 10),
        tglApprove: p.approvedAt ? p.approvedAt.toISOString().slice(0, 10) : '',
      });
    });

    this.applyBorders(ws, list.length + 1, ws.columns.length);

    const buffer = await wb.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  // =========================================================================
  // NEW: daftar ulang multi-sheet
  //   1. Semua Data
  //   2. By Sekolah Asal
  //   3. Ringkasan (kelas + agama counts)
  //   4..N. Per-kelas sheets (X KL 1, X KL 2, ..., X PH 1, ...)
  //   N+1..  Per-agama sheets (Islam, Hindu, Kristen, ...) — 1 sheet per agama
  // =========================================================================

  async exportDaftarUlangToXlsx(req: DaftarUlangExportRequest): Promise<Buffer> {
    const maxPerKelas = Math.max(1, Math.min(10, req.maxFromSameSchool ?? 3));

    // 1. Ambil siswa_aktif + grouped per jurusan
    const list = await this.prisma.pendaftar.findMany({
      where: { status: 'SISWA_AKTIF' },
      include: {
        jurusan: { select: { id: true, code: true, name: true } },
        gelombang: { select: { id: true, name: true } },
      },
      orderBy: [{ jurusanId: 'asc' }, { namaLengkap: 'asc' }],
    });

    const wb = new ExcelJS.Workbook();
    wb.creator = 'SPMB SMK PGRI 3 Denpasar';
    wb.created = new Date();

    // Sheet 1: Semua data siswa daftar ulang
    this.buildSheetAll(wb, list);

    // Sheet 2: Dikelompokkan per sekolah asal (alfabetis)
    this.buildSheetBySekolah(wb, list);

    // Sheet 3: Ringkasan (kelas + agama counts)
    const distribusi = this.distributeToClasses(list, req.classByJurusan ?? {}, maxPerKelas);
    this.buildSheetRingkasan(wb, distribusi, list, maxPerKelas);


    // Sheet 4+: 1 sheet per kelas (X KL 1, X KL 2, ..., X PH 1, ...)
    this.buildSheetPerKelas(wb, distribusi);

    // Sheet terakhhir: 1 sheet per agama (Islam, Hindu, ...)
    this.buildSheetPerAgama(wb, list);

    const buffer = await wb.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  // -- Sheet 1: Semua data siswa -------------------------------------------

  private buildSheetAll(wb: ExcelJS.Workbook, list: any[]) {
    const ws = wb.addWorksheet('1. Semua Data');

    const headers = [
      { header: 'No', key: 'no', width: 5 },
      { header: 'Nomor Pendaftaran', key: 'reg', width: 22 },
      { header: 'Nama Lengkap', key: 'nama', width: 32 },
      { header: 'Jenis Kelamin', key: 'jk', width: 8 },
      { header: 'Tempat Lahir', key: 'tempat', width: 18 },
      { header: 'Tanggal Lahir', key: 'tglLahir', width: 14 },
      { header: 'NISN', key: 'nisn', width: 14 },
      { header: 'Agama', key: 'agama', width: 12 },
      { header: 'Sekolah Asal', key: 'sekolah', width: 30 },
      { header: 'Alamat', key: 'alamat', width: 36 },
      { header: 'No. Telp', key: 'telp', width: 14 },
      { header: 'Nama Ibu', key: 'ibu', width: 28 },
      { header: 'No. Telp Ortu', key: 'ortu', width: 14 },
      { header: 'Jurusan', key: 'jurusan', width: 30 },
      { header: 'Gelombang', key: 'gelombang', width: 18 },
      { header: 'Tgl Daftar', key: 'tglDaftar', width: 14 },
      { header: 'Tgl Approve', key: 'tglApprove', width: 14 },
    ];
    ws.columns = headers;
    this.styleHeader(ws.getRow(1));

    list.forEach((p, i) => {
      ws.addRow({
        no: i + 1,
        reg: p.registrationNumber,
        nama: p.namaLengkap,
        jk: p.jenisKelamin === 'L' ? 'Laki-laki' : 'Perempuan',
        tempat: p.tempatLahir,
        tglLahir: p.tanggalLahir.toISOString().slice(0, 10),
        nisn: p.nisn,
        agama: p.agama ? AGAMA_LABEL[p.agama] || p.agama : '(Belum diisi)',
        sekolah: p.sekolahAsal,
        alamat: p.alamat,
        telp: p.noTelp,
        ibu: p.namaIbu,
        ortu: p.noTelpOrtu,
        jurusan: `${p.jurusan.code} - ${p.jurusan.name}`,
        gelombang: p.gelombang.name,
        tglDaftar: p.createdAt.toISOString().slice(0, 10),
        tglApprove: p.approvedAt ? p.approvedAt.toISOString().slice(0, 10) : '',
      });
    });

    this.applyBorders(ws, list.length + 1, headers.length);
    ws.views = [{ state: 'frozen', ySplit: 1 }];
  }

  // -- Sheet 2: By sekolah asal -------------------------------------------

  private buildSheetBySekolah(wb: ExcelJS.Workbook, list: any[]) {
    const ws = wb.addWorksheet('2. By Sekolah Asal');

    const headers = [
      { header: 'No', key: 'no', width: 5 },
      { header: 'Sekolah Asal', key: 'sekolah', width: 36 },
      { header: 'Nomor Pendaftaran', key: 'reg', width: 22 },
      { header: 'Nama Lengkap', key: 'nama', width: 32 },
      { header: 'Jurusan', key: 'jurusan', width: 30 },
      { header: 'Agama', key: 'agama', width: 12 },
    ];
    ws.columns = headers;
    this.styleHeader(ws.getRow(1));

    // Sort alfabetis by sekolahAsal, lalu nama
    const ordered = [...list].sort((a, b) => {
      const c = a.sekolahAsal.localeCompare(b.sekolahAsal, 'id');
      if (c !== 0) return c;
      return a.namaLengkap.localeCompare(b.namaLengkap);
    });

    // Hitung jumlah per sekolah untuk ringkasan
    const counts: Record<string, number> = {};
    list.forEach((p) => {
      counts[p.sekolahAsal] = (counts[p.sekolahAsal] || 0) + 1;
    });

    // Tambahkan "subtle banding" — tiap ganti sekolah, kasih warna background
    // berbeda tipis supaya lebih mudah dibaca secara visual.
    let prevSekolah = '';
    const palette = ['FFFFFFFF', 'FFF8FAFC']; // putih / slate-50
    let colorIdx = 0;

    ordered.forEach((p, i) => {
      if (p.sekolahAsal !== prevSekolah) {
        colorIdx = (colorIdx + 1) % palette.length;
        prevSekolah = p.sekolahAsal;
      }
      const fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: palette[colorIdx] } } as const;
      const row = ws.addRow({
        no: i + 1,
        sekolah: p.sekolahAsal,
        reg: p.registrationNumber,
        nama: p.namaLengkap,
        jurusan: `${p.jurusan.code} - ${p.jurusan.name}`,
        agama: p.agama ? AGAMA_LABEL[p.agama] || p.agama : '(Belum diisi)',
      });
      row.eachCell((cell) => (cell.fill = fill));
    });

    // Ringkasan per sekolah di bawah (sorted by jumlah desc)
    const lastDataRow = ordered.length + 1;
    let cursor = lastDataRow + 2;

    const summaryHeaderRow = ws.getRow(cursor);
    summaryHeaderRow.getCell(1).value = 'Ringkasan Jumlah per Sekolah Asal';
    summaryHeaderRow.getCell(1).font = SUBHEADER_FONT;
    summaryHeaderRow.getCell(1).fill = SUBHEADER_FILL;
    ws.mergeCells(cursor, 1, cursor, 3);
    cursor++;

    const subHeader = ws.getRow(cursor);
    subHeader.getCell(1).value = 'No';
    subHeader.getCell(2).value = 'Sekolah Asal';
    subHeader.getCell(3).value = 'Jumlah Siswa';
    [1, 2, 3].forEach((c) => {
      subHeader.getCell(c).font = { bold: true };
      subHeader.getCell(c).fill = SUBHEADER_FILL;
      subHeader.getCell(c).border = this.cellBorder();
    });
    cursor++;

    const summaryEntries = Object.entries(counts).sort((a, b) => {
      if (b[1] !== a[1]) return b[1] - a[1]; // by count desc
      return a[0].localeCompare(b[0], 'id'); // tie-breaker alfabetis
    });
    summaryEntries.forEach(([sekolah, count], idx) => {
      const row = ws.getRow(cursor);
      row.getCell(1).value = idx + 1;
      row.getCell(2).value = sekolah;
      row.getCell(3).value = count;
      [1, 2, 3].forEach((c) => (row.getCell(c).border = this.cellBorder()));
      cursor++;
    });

    const totalRow = ws.getRow(cursor);
    totalRow.getCell(2).value = 'TOTAL';
    totalRow.getCell(3).value = list.length;
    [2, 3].forEach((c) => {
      totalRow.getCell(c).font = { bold: true };
      totalRow.getCell(c).border = this.cellBorder();
    });

    this.applyBorders(ws, ordered.length + 1, headers.length);
    ws.views = [{ state: 'frozen', ySplit: 1 }];
  }

  // -- Sheet 4: Konversi ke kelas ------------------------------------------

  /**
   * Algoritma:
   * 1. Group siswa per jurusan
   * 2. Untuk tiap jurusan, distribusi ke N kelas (sesuai input, default 1)
   *    dengan constraint: max `maxPerKelas` siswa dari sekolah asal sama.
   * 3. Sort siswa dalam jurusan by sekolahAsal (alfabetis) untuk round-robin
   *    by sekolah — sehingga siswa sekolah A ke-1 → kelas 1, ke-2 → kelas 2,
   *    dst, hingga kelas N, lalu kembali ke kelas 1.
   *
   * Kalau ada sekolah yang jumlah siswanya > (N × maxPerKelas), maka beberapa
   * kelas akan terpaksa kelebihan → ditandai di `warnings`.
   */
  private distributeToClasses(
    list: any[],
    classByJurusan: Record<string, number>,
    maxPerKelas: number,
  ): DistribusiResult {
    // Group by jurusan
    const grouped = new Map<string, { kode: string; nama: string; items: any[] }>();
    list.forEach((p) => {
      const key = p.jurusan.id;
      if (!grouped.has(key)) {
        grouped.set(key, { kode: p.jurusan.code, nama: p.jurusan.name, items: [] });
      }
      grouped.get(key)!.items.push(p);
    });

    const result = new Map<string, JurusanClassDistribusi>();
    const globalWarnings: string[] = [];

    grouped.forEach((group, jurusanId) => {
      const numClasses = Math.max(1, classByJurusan[jurusanId] ?? 1);
      const classes: any[][] = Array.from({ length: numClasses }, () => []);
      const warnings: string[] = [];

      // Sort by sekolahAsal (alfabetis), lalu nama, untuk round-robin by sekolah
      const sorted = [...group.items].sort((a, b) => {
        const c = a.sekolahAsal.localeCompare(b.sekolahAsal, 'id');
        if (c !== 0) return c;
        return a.namaLengkap.localeCompare(b.namaLengkap);
      });

      // Iterasi per sekolah, distribusi round-robin ke kelas
      // (kunci round-robin by sekolah: siswa dari sekolah yang sama disebar ke
      //  kelas yang berbeda selagi mungkin).
      const sekolahCountInClass = Array.from({ length: numClasses }, () => new Map<string, number>());

      // Track sekolah dengan violation untuk warning global (1 per sekolah per jurusan)
      const warningSekolah = new Set<string>();

      sorted.forEach((p) => {
        // Cari kelas yang (a) belum penuh (overload wajar) dan
        //                  (b) jumlah siswa dari sekolah ini < maxPerKelas.
        let chosen = -1;
        // Prioritaskan kelas yang paling kosong
        const orderByLoad = classes
          .map((cls, idx) => ({ idx, load: cls.length }))
          .sort((a, b) => a.load - b.load);
        for (const { idx } of orderByLoad) {
          const cur = sekolahCountInClass[idx].get(p.sekolahAsal) || 0;
          if (cur < maxPerKelas) {
            chosen = idx;
            break;
          }
        }
        // Kalau tidak ada yang muat, pilih kelas dengan load paling kecil
        // (best-effort — mungkin melebihi maxPerKelas untuk sekolah ini)
        if (chosen === -1) {
          chosen = orderByLoad[0].idx;
          if (!warningSekolah.has(p.sekolahAsal)) {
            warningSekolah.add(p.sekolahAsal);
            warnings.push(
              `Sekolah "${p.sekolahAsal}" melebihi batas ${maxPerKelas} siswa/kelas di ` +
                `jurusan ${group.kode}. Tambahkan jumlah kelas atau kurangi maxPerKelas.`,
            );
          }
        }
        classes[chosen].push(p);
        sekolahCountInClass[chosen].set(
          p.sekolahAsal,
          (sekolahCountInClass[chosen].get(p.sekolahAsal) || 0) + 1,
        );
      });

      result.set(jurusanId, {
        kode: group.kode,
        nama: group.nama,
        total: group.items.length,
        numClasses,
        classes,
        warnings,
      });
      globalWarnings.push(...warnings);
    });

    return { byJurusan: result, warnings: globalWarnings };
  }

  /**
   * Sheet 4: Ringkasan Kelas — overview semua kelas yang terbentuk
   * (nama, jurusan, jumlah siswa, warning). Sheet ini jadi "table of contents"
   * sebelum admin buka sheet per kelas.
   */
  /**
   * Sheet 3: Ringkasan (kelas + agama counts).
   * Sheet ini jadi "table of contents" sebelum admin buka sheet per kelas
   * atau per agama.
   */
  private buildSheetRingkasan(
    wb: ExcelJS.Workbook,
    distribusi: DistribusiResult,
    list: any[],
    maxPerKelas: number,
  ) {
    const ws = wb.addWorksheet('3. Ringkasan');

    // Title rows
    const titleRow = ws.getRow(1);
    titleRow.getCell(1).value = 'RINGKASAN — SISWA AKTIF (DAFTAR ULANG)';
    titleRow.getCell(1).font = { bold: true, size: 14, color: { argb: 'FF1E3A8A' } };
    ws.mergeCells(1, 1, 1, 6);

    const subRow = ws.getRow(2);
    subRow.getCell(1).value =
      `Tanggal export: ${new Date().toLocaleString('id-ID')} • ` +
      `Batas ${maxPerKelas} siswa dari sekolah asal sama per kelas`;
    subRow.getCell(1).font = { italic: true, color: { argb: 'FF64748B' } };
    ws.mergeCells(2, 1, 2, 6);

    // Header row
    const headers = [
      { header: 'No', key: 'no', width: 5 },
      { header: 'Nama Kelas', key: 'kelas', width: 16 },
      { header: 'Jurusan', key: 'jurusan', width: 26 },
      { header: 'Kelas ke-', key: 'kelasKe', width: 10 },
      { header: 'Jumlah Siswa', key: 'jumlah', width: 14 },
      { header: 'Catatan', key: 'catatan', width: 50 },
    ];
    ws.columns = headers;
    const headerRow = ws.getRow(4);
    ws.getRow(4).values = ['No', 'Nama Kelas', 'Jurusan', 'Kelas ke-', 'Jumlah Siswa', 'Catatan'];
    this.styleHeader(headerRow);

    let cursor = 5;
    let noUrut = 1;
    const entries = Array.from(distribusi.byJurusan.entries()).sort((a, b) => {
      return a[1].kode.localeCompare(b[1].kode);
    });

    // Track warning per-class (untuk kolom "Catatan")
    const classWarnings = new Map<string, string[]>();

    entries.forEach(([jurusanId, info]) => {
      // Section header per jurusan
      const sectionRow = ws.getRow(cursor);
      sectionRow.getCell(1).value =
        `${info.kode} — ${info.nama}  (${info.total} siswa / ${info.numClasses} kelas)`;
      sectionRow.getCell(1).font = SUBHEADER_FONT;
      sectionRow.getCell(1).fill = SUBHEADER_FILL;
      ws.mergeCells(cursor, 1, cursor, 6);
      cursor++;

      info.classes.forEach((cls, idx) => {
        const className = `X ${info.kode} ${idx + 1}`;
        // Deteksi warning per-class: sekolah mana yang > maxPerKelas
        const moreThanMax = new Map<string, number>();
        cls.forEach((p) => {
          moreThanMax.set(p.sekolahAsal, (moreThanMax.get(p.sekolahAsal) || 0) + 1);
        });
        const overList: string[] = [];
        moreThanMax.forEach((c, sekolah) => {
          if (c > maxPerKelas) {
            overList.push(`${sekolah} (${c})`);
          }
        });
        const catatan = overList.length > 0
          ? `⚠ Melebihi batas ${maxPerKelas}: ${overList.join(', ')}`
          : cls.length === 0
            ? '(kelas kosong)'
            : 'OK';

        if (overList.length > 0) {
          classWarnings.set(className, overList);
        }

        const row = ws.getRow(cursor);
        row.getCell(1).value = noUrut++;
        row.getCell(2).value = className;
        row.getCell(3).value = `${info.kode} - ${info.nama}`;
        row.getCell(4).value = idx + 1;
        row.getCell(5).value = cls.length;
        row.getCell(6).value = catatan;
        [1, 2, 3, 4, 5, 6].forEach((c) => (row.getCell(c).border = this.cellBorder()));
        if (overList.length > 0) {
          row.getCell(6).font = { color: { argb: 'FFB91C1C' }, bold: true };
        }
        cursor++;
      });

      // Subtotal per jurusan
      const subtotalRow = ws.getRow(cursor);
      subtotalRow.getCell(3).value = `Subtotal ${info.kode}:`;
      subtotalRow.getCell(3).font = { italic: true, color: { argb: 'FF64748B' } };
      subtotalRow.getCell(3).alignment = { horizontal: 'right' };
      subtotalRow.getCell(5).value = info.total;
      subtotalRow.getCell(5).font = { bold: true };
      [3, 4, 5].forEach((c) => (subtotalRow.getCell(c).border = this.cellBorder()));
      cursor += 2; // spasi antar jurusan
    });

    // Grand total
    const totalAll = Array.from(distribusi.byJurusan.values()).reduce(
      (a, b) => a + b.total,
      0,
    );
    const totalClasses = Array.from(distribusi.byJurusan.values()).reduce(
      (a, b) => a + b.numClasses,
      0,
    );
    const totalRow = ws.getRow(cursor);
    totalRow.getCell(2).value = 'GRAND TOTAL';
    totalRow.getCell(2).font = { bold: true, size: 12, color: { argb: 'FF1E3A8A' } };
    totalRow.getCell(5).value = `${totalAll} siswa / ${totalClasses} kelas`;
    totalRow.getCell(5).font = { bold: true, size: 12 };
    [2, 3, 4, 5, 6].forEach((c) => (totalRow.getCell(c).border = this.cellBorder()));
    cursor += 2;

    // Section: Ringkasan per Agama
    const agamaHeaderRow = ws.getRow(cursor);
    agamaHeaderRow.getCell(1).value = 'RINGKASAN PER AGAMA';
    agamaHeaderRow.getCell(1).font = SUBHEADER_FONT;
    agamaHeaderRow.getCell(1).fill = SUBHEADER_FILL;
    ws.mergeCells(cursor, 1, cursor, 6);
    cursor++;

    // Sub-header untuk tabel agama
    const agamaSubHeader = ws.getRow(cursor);
    agamaSubHeader.getCell(1).value = 'No';
    agamaSubHeader.getCell(2).value = 'Agama';
    agamaSubHeader.getCell(3).value = 'Jumlah Siswa';
    agamaSubHeader.getCell(4).value = 'Persentase';
    [1, 2, 3, 4].forEach((c) => {
      agamaSubHeader.getCell(c).font = { bold: true };
      agamaSubHeader.getCell(c).fill = SUBHEADER_FILL;
      agamaSubHeader.getCell(c).border = this.cellBorder();
    });
    cursor++;

    // Hitung count per agama, sort by jumlah desc
    const agamaCounts: Record<string, number> = {};
    list.forEach((p) => {
      const key = p.agama || '(Belum diisi)';
      agamaCounts[key] = (agamaCounts[key] || 0) + 1;
    });
    const totalSiswa = list.length;
    const agamaEntries = Object.entries(agamaCounts).sort((a, b) => b[1] - a[1]);
    agamaEntries.forEach(([key, count], idx) => {
      const label = AGAMA_LABEL[key] || key;
      const pct = totalSiswa > 0 ? `${((count / totalSiswa) * 100).toFixed(1)}%` : '0%';
      const row = ws.getRow(cursor);
      row.getCell(1).value = idx + 1;
      row.getCell(2).value = label;
      row.getCell(3).value = count;
      row.getCell(4).value = pct;
      [1, 2, 3, 4].forEach((c) => (row.getCell(c).border = this.cellBorder()));
      cursor++;
    });

    // Total agama
    const totalAgamaRow = ws.getRow(cursor);
    totalAgamaRow.getCell(2).value = 'TOTAL';
    totalAgamaRow.getCell(3).value = totalSiswa;
    totalAgamaRow.getCell(4).value = '100%';
    [2, 3, 4].forEach((c) => {
      totalAgamaRow.getCell(c).font = { bold: true };
      totalAgamaRow.getCell(c).border = this.cellBorder();
    });
    cursor += 2;

    // Global warnings section
    if (distribusi.warnings.length > 0) {
      const warningRow = ws.getRow(cursor);
      warningRow.getCell(1).value = `⚠ PERHATIAN (${distribusi.warnings.length} warning)`;
      warningRow.getCell(1).font = { bold: true, color: { argb: 'FFB91C1C' } };
      warningRow.getCell(1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFFEF2F2' },
      };
      ws.mergeCells(cursor, 1, cursor, 6);
      cursor++;
      distribusi.warnings.forEach((w) => {
        const row = ws.getRow(cursor);
        row.getCell(1).value = '•';
        row.getCell(2).value = w;
        ws.mergeCells(cursor, 2, cursor, 6);
        row.getCell(1).alignment = { horizontal: 'right' };
        cursor++;
      });
    }

    ws.views = [{ state: 'frozen', ySplit: 4 }];
  }

  /**
   * Sheet 5+: Satu sheet per kelas (urut by jurusan code, lalu kelas ke-).
   * Tiap sheet berisi:
   *   - Header info (nama kelas, jurusan, jumlah siswa, tanggal export)
   *   - Sub-header (batas maxPerKelas)
   *   - Tabel siswa: no, nama, NISN, sekolah asal, jenis kelamin
   */
  private buildSheetPerKelas(
    wb: ExcelJS.Workbook,
    distribusi: DistribusiResult,
  ) {
    const entries = Array.from(distribusi.byJurusan.entries()).sort((a, b) => {
      return a[1].kode.localeCompare(b[1].kode);
    });

    // Excel sheet name max 31 chars, no special chars
    const sanitizeSheetName = (raw: string): string => {
      // Ganti non-allowed chars dengan spasi, truncate
      const cleaned = raw.replace(/[\\/*?:[\]]/g, ' ');
      return cleaned.slice(0, 31);
    };

    for (const [jurusanId, info] of entries) {
      for (let idx = 0; idx < info.classes.length; idx++) {
        const cls = info.classes[idx];
        const className = `X ${info.kode} ${idx + 1}`;
        const sheetName = sanitizeSheetName(className);

        // Hindari duplicate sheet name (edge case: nama dipotong jadi sama)
        const uniqueName = wb.worksheets.find((w) => w.name === sheetName)
          ? `${sheetName.slice(0, 28)} ${idx + 1}`
          : sheetName;

        const ws = wb.addWorksheet(uniqueName);

        // Title rows
        const titleRow = ws.getRow(1);
        titleRow.getCell(1).value = `KELAS ${className}`;
        titleRow.getCell(1).font = { bold: true, size: 14, color: { argb: 'FF1E3A8A' } };
        ws.mergeCells(1, 1, 1, 5);

        const subRow1 = ws.getRow(2);
        subRow1.getCell(1).value = `Jurusan: ${info.kode} - ${info.nama}`;
        subRow1.getCell(1).font = { italic: true, color: { argb: 'FF64748B' } };
        ws.mergeCells(2, 1, 2, 5);

        const subRow2 = ws.getRow(3);
        subRow2.getCell(1).value =
          `Jumlah siswa: ${cls.length} • Tanggal export: ${new Date().toLocaleString('id-ID')}`;
        subRow2.getCell(1).font = { italic: true, color: { argb: 'FF64748B' } };
        ws.mergeCells(3, 1, 3, 5);

        // Header row di baris 5 — pakai getColumn().width manual (bukan ws.columns)
        // supaya ExcelJS tidak auto-write header di row 1 (yang akan overwrite
        // title "KELAS X KL 1").
        ws.getColumn(1).width = 5;
        ws.getColumn(2).width = 14;
        ws.getColumn(3).width = 32;
        ws.getColumn(4).width = 30;
        ws.getColumn(5).width = 14;
        const headerRow = ws.getRow(5);
        ws.getRow(5).values = ['No', 'NISN', 'Nama Lengkap', 'Sekolah Asal', 'Jenis Kelamin'];
        this.styleHeader(headerRow);

        let cursor = 6;
        if (cls.length === 0) {
          const row = ws.getRow(cursor);
          row.getCell(1).value = '—';
          row.getCell(2).value = '—';
          row.getCell(3).value = '(kelas kosong)';
          row.getCell(4).value = '—';
          row.getCell(5).value = '—';
          [1, 2, 3, 4, 5].forEach((c) => (row.getCell(c).border = this.cellBorder()));
        } else {
          // Sort siswa by nama
          const sortedCls = [...cls].sort((a, b) => a.namaLengkap.localeCompare(b.namaLengkap));
          sortedCls.forEach((p, i) => {
            const row = ws.getRow(cursor);
            row.getCell(1).value = i + 1;
            row.getCell(2).value = p.nisn;
            row.getCell(3).value = p.namaLengkap;
            row.getCell(4).value = p.sekolahAsal;
            row.getCell(5).value = p.jenisKelamin === 'L' ? 'Laki-laki' : 'Perempuan';
            [1, 2, 3, 4, 5].forEach((c) => (row.getCell(c).border = this.cellBorder()));
            cursor++;
          });
        }

        // Footer: wali kelas / total
        const footerRow = ws.getRow(cursor + 1);
        footerRow.getCell(3).value = 'Total siswa:';
        footerRow.getCell(3).font = { italic: true, bold: true };
        footerRow.getCell(3).alignment = { horizontal: 'right' };
        footerRow.getCell(4).value = cls.length;
        footerRow.getCell(4).font = { bold: true };
        [3, 4].forEach((c) => (footerRow.getCell(c).border = this.cellBorder()));

        ws.views = [{ state: 'frozen', ySplit: 5 }];
      }
    }
  }

  // -- Styling helpers -----------------------------------------------------

  private styleHeader(row: ExcelJS.Row) {
    row.font = HEADER_FONT;
    row.fill = HEADER_FILL;
    row.alignment = { vertical: 'middle', horizontal: 'left' };
    row.eachCell((cell) => (cell.border = this.cellBorder()));
  }

  private applyBorders(ws: ExcelJS.Worksheet, rows: number, cols: number) {
    for (let r = 1; r <= rows; r++) {
      for (let c = 1; c <= cols; c++) {
        ws.getRow(r).getCell(c).border = this.cellBorder();
      }
    }
  }

  private cellBorder(): Partial<ExcelJS.Borders> {
    return {
      top: THIN,
      left: THIN,
      bottom: THIN,
      right: THIN,
    };
  }

  // =========================================================================
  // Sheet 5+: 1 sheet per agama (Islam, Hindu, Kristen, Katolik, Buddha, Khonghucu)
  // =========================================================================

  /**
   * Generate 1 sheet per agama yang punya data (skip yang kosong).
   * Sort dalam sheet by nama depan (kata pertama di namaLengkap) A→Z.
   */
  private buildSheetPerAgama(wb: ExcelJS.Workbook, list: any[]) {
    // Group by agama
    const grouped = new Map<string, any[]>();
    list.forEach((p) => {
      const key = p.agama || '(Belum diisi)';
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(p);
    });

    // Sort key order: AGAMA_ORDER, lalu yang lain di akhir
    const AGAMA_ORDER = ['ISLAM', 'KRISTEN', 'KATOLIK', 'HINDU', 'BUDDHA', 'KHONGHUCU'];
    const sortedKeys = Array.from(grouped.keys()).sort((a, b) => {
      const aIdx = AGAMA_ORDER.indexOf(a);
      const bIdx = AGAMA_ORDER.indexOf(b);
      if (aIdx === -1 && bIdx === -1) return a.localeCompare(b);
      if (aIdx === -1) return 1;
      if (bIdx === -1) return -1;
      return aIdx - bIdx;
    });

    // Helper: nama depan (kata pertama namaLengkap)
    const firstName = (fullName: string): string => {
      return (fullName || '').trim().split(/\s+/)[0] || '';
    };

    const exportDate = new Date().toLocaleString('id-ID');

    for (const agamaKey of sortedKeys) {
      const students = grouped.get(agamaKey)!;
      if (students.length === 0) continue; // skip agama tanpa siswa

      const label = AGAMA_LABEL[agamaKey] || agamaKey;
      // Sheet name max 31 chars, no special chars
      const sheetName = label.replace(/[\\/*?:[\]]/g, ' ').slice(0, 31);

      // Hindari duplicate sheet name
      const uniqueName = wb.worksheets.find((w) => w.name === sheetName)
        ? `${sheetName.slice(0, 28)} 2`
        : sheetName;

      const ws = wb.addWorksheet(uniqueName);

      // Title rows
      const titleRow = ws.getRow(1);
      titleRow.getCell(1).value = `AGAMA ${label}`;
      titleRow.getCell(1).font = { bold: true, size: 14, color: { argb: 'FF1E3A8A' } };
      ws.mergeCells(1, 1, 1, 5);

      const subRow = ws.getRow(2);
      subRow.getCell(1).value =
        `Jumlah siswa: ${students.length} • Tanggal export: ${exportDate}`;
      subRow.getCell(1).font = { italic: true, color: { argb: 'FF64748B' } };
      ws.mergeCells(2, 1, 2, 5);

      // Manual column widths (jangan pakai ws.columns = [...] — auto-write header di row 1)
      ws.getColumn(1).width = 5;
      ws.getColumn(2).width = 14;
      ws.getColumn(3).width = 32;
      ws.getColumn(4).width = 30;
      ws.getColumn(5).width = 30;

      // Header row 4
      const headerRow = ws.getRow(4);
      ws.getRow(4).values = ['No', 'NISN', 'Nama Lengkap', 'Sekolah Asal', 'Jurusan'];
      this.styleHeader(headerRow);

      // Sort by nama depan (A→Z), case-insensitive, locale-aware
      const sorted = [...students].sort((a, b) =>
        firstName(a.namaLengkap).localeCompare(firstName(b.namaLengkap), 'id', { sensitivity: 'base' }),
      );

      // Data rows start at row 5
      sorted.forEach((p, i) => {
        const row = ws.getRow(5 + i);
        row.getCell(1).value = i + 1;
        row.getCell(2).value = p.nisn;
        row.getCell(3).value = p.namaLengkap;
        row.getCell(4).value = p.sekolahAsal;
        row.getCell(5).value = `${p.jurusan.code} - ${p.jurusan.name}`;
        [1, 2, 3, 4, 5].forEach((c) => (row.getCell(c).border = this.cellBorder()));
      });

      // Footer: total siswa
      const footerRow = ws.getRow(5 + sorted.length + 1);
      footerRow.getCell(3).value = 'Total siswa:';
      footerRow.getCell(3).font = { italic: true, bold: true };
      footerRow.getCell(3).alignment = { horizontal: 'right' };
      footerRow.getCell(4).value = sorted.length;
      footerRow.getCell(4).font = { bold: true };
      [3, 4].forEach((c) => (footerRow.getCell(c).border = this.cellBorder()));

      ws.views = [{ state: 'frozen', ySplit: 4 }];
    }
  }
}