// Status pendaftar (label internal untuk admin).
//
// Batch C: approval didesentralisasi jadi 2 aksi independen (Bendahara: bayar,
// TU: ukuran baju). Status sekarang AUTO-COMPUTED dari kombinasi 2 field
// tersebut di service layer (lihat `computeStatus()` di backend).
// Tabel keputusan (HARUS sinkron dengan backend):
//   BELUM  + null  → MENUNGGU_PERSETUJUAN  ("Menunggu Daftar Ulang")
//   BELUM  + "M"   → MENUNGGU_PEMBAYARAN   ("Menunggu Pembayaran")
//   LUNAS  + null  → MENUNGGU_UKURAN_BAJU  ("Menunggu Ukuran Baju")
//   LUNAS  + "M"   → SISWA_AKTIF            ("Siswa Aktif")
export const STATUS_LABELS: Record<string, string> = {
  MENUNGGU_PERSETUJUAN: 'Belum Daftar Ulang',
  MENUNGGU_PEMBAYARAN: 'Menunggu Pembayaran',
  MENUNGGU_UKURAN_BAJU: 'Menunggu Ukuran Baju',
  DITOLAK: 'Ditolak',
  SISWA_AKTIF: 'Siswa Aktif',
};

export const STATUS_COLORS: Record<string, string> = {
  // Amber = generic pending (sebelum ada aksi apapun dari staff)
  MENUNGGU_PERSETUJUAN: 'bg-amber-100 text-amber-800 border border-amber-200',
  // Blue = butuh Bendahara (sudah ada progress dari TU tapi bayar belum)
  MENUNGGU_PEMBAYARAN: 'bg-blue-100 text-blue-800 border border-blue-200',
  // Purple = butuh TU (sudah bayar, tinggal ukuran baju)
  MENUNGGU_UKURAN_BAJU: 'bg-purple-100 text-purple-800 border border-purple-200',
  DITOLAK: 'bg-red-100 text-red-800 border border-red-200',
  SISWA_AKTIF: 'bg-emerald-100 text-emerald-800 border border-emerald-200',
};

/**
 * Label untuk MetodePembayaran (enum di backend). Dipakai di:
 *   - radio/select di PembayaranModal (Bendahara)
 *   - struk print view di detail page
 *   - export Excel kolom "Metode Bayar"
 */
export const METODE_PEMBAYARAN_LABELS: Record<string, string> = {
  CASH: 'Tunai',
  TRANSFER: 'Transfer Bank',
};

/** Label untuk StatusPembayaran (badge ringkas per-row di list). */
export const STATUS_PEMBAYARAN_LABELS: Record<string, string> = {
  BELUM: 'Belum Bayar',
  LUNAS: 'Sudah Lunas',
};

/**
 * Warna badge kecil per-row untuk 2 field kelengkapan (pembayaran + ukuran baju).
 * Hijau = done, abu-abu = pending. Dipakai di kolom "Kelengkapan" list page.
 */
export const KELENGKAPAN_COLORS = {
  done: 'bg-emerald-100 text-emerald-800 border border-emerald-200',
  pending: 'bg-slate-100 text-slate-500 border border-slate-200',
};

export const BERITA_STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Draft',
  PUBLISHED: 'Published',
};

export const BERITA_STATUS_COLORS: Record<string, string> = {
  DRAFT: 'bg-slate-100 text-slate-700',
  PUBLISHED: 'bg-emerald-100 text-emerald-700',
};

/**
 * Pilihan ukuran baju untuk form approve.
 * HARUS sinkron dengan settings table `ukuran_baju_options` di backend (default: ini).
 * Superadmin bisa edit via menu Bendahara (akan dibangun di iterasi berikutnya);
 * sampai ada UI-nya, kalau diubah di DB, minta superadmin sync manual ke frontend.
 */
export const UKURAN_BAJU_OPTIONS = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL'] as const;

/** Format Rupiah untuk tampilan nominal. */
export function formatRupiah(n: number | string | null | undefined): string {
  if (n == null) return '-';
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
  }).format(Number(n));
}

/**
 * UI-friendly label & kode untuk permission backend.
 *
 * Backend permission code (mis. `spmb.bayar`) tetap jadi primary key untuk
 * `useAuth().hasPermission()` check. Kode di sini (mis. `BDR-01`) cuma label
 * visual supaya superadmin gampang scan di Role Permission matrix view.
 *
 * Section grouping (Pendaftar, Bendahara, TU, dst.) dipakai untuk bagi matrix
 * jadi collapsible groups — supaya tidak overwhelming (25 permission × 4 role).
 *
 * Kalau tambah permission baru di backend seed.ts, tambahkan juga entry di sini.
 */
export interface PermissionMeta {
  /** Kode singkat untuk display (mis. "BDR-01"). Format: PREFIX-NN. */
  uiCode: string;
  /** Label user-friendly (mis. "Catat Pembayaran"). */
  label: string;
  /** Grouping di matrix view (mis. "Pendaftar", "Bendahara"). */
  section: string;
}

export const PERMISSION_UI_LABELS: Record<string, PermissionMeta> = {
  // ─── Pendaftar (PDF) ────────────────────────────────────────────────
  'spmb.view':               { uiCode: 'PDF-00', label: 'Lihat Pendaftar',          section: 'Pendaftar' },
  'spmb.create':             { uiCode: 'PDF-01', label: 'Tambah Pendaftar Manual',  section: 'Pendaftar' },
  'spmb.update':             { uiCode: 'PDF-02', label: 'Edit Data Pendaftar',      section: 'Pendaftar' },
  'spmb.delete':             { uiCode: 'PDF-03', label: 'Hapus Data Pendaftar',     section: 'Pendaftar' },
  'spmb.verify_berkas':      { uiCode: 'PDF-04', label: 'Verifikasi Berkas',        section: 'Pendaftar' },
  'spmb.approve':            { uiCode: 'PDF-05', label: 'Approve (legacy)',         section: 'Pendaftar' },
  'spmb.reject':             { uiCode: 'PDF-06', label: 'Tolak Pendaftar',          section: 'Pendaftar' },
  'spmb.export':             { uiCode: 'PDF-07', label: 'Export Excel Pendaftar',   section: 'Pendaftar' },
  'spmb.scan_daftar_ulang':  { uiCode: 'PDF-08', label: 'Scan QR Daftar Ulang',     section: 'Pendaftar' },

  // ─── Bendahara (BDR) ────────────────────────────────────────────────
  'spmb.bayar':              { uiCode: 'BDR-01', label: 'Catat Pembayaran',         section: 'Bendahara' },

  // ─── TU (Ukuran Baju) ───────────────────────────────────────────────
  'spmb.ukuran_baju':        { uiCode: 'TU-01',  label: 'Input Ukuran Baju',        section: 'TU (Ukuran Baju)' },

  // ─── Gelombang (GLB) ────────────────────────────────────────────────
  'gelombang.view':          { uiCode: 'GLB-01', label: 'Lihat Gelombang',          section: 'Gelombang' },
  'gelombang.manage':        { uiCode: 'GLB-02', label: 'Tambah/Edit/Hapus Gelombang', section: 'Gelombang' },

  // ─── Jurusan (JRS) ──────────────────────────────────────────────────
  'jurusan.view':            { uiCode: 'JRS-01', label: 'Lihat Jurusan',            section: 'Jurusan' },
  'jurusan.manage':          { uiCode: 'JRS-02', label: 'Tambah/Edit/Hapus Jurusan', section: 'Jurusan' },

  // ─── Statistik (STS) ────────────────────────────────────────────────
  'statistik.view':          { uiCode: 'STS-01', label: 'Lihat Statistik',          section: 'Statistik' },

  // ─── User (USR) ─────────────────────────────────────────────────────
  'user.view':               { uiCode: 'USR-01', label: 'Lihat User',               section: 'User' },
  'user.manage':             { uiCode: 'USR-02', label: 'Buat/Edit User',           section: 'User' },

  // ─── Role & Permission (ROL) ────────────────────────────────────────
  'role.view':               { uiCode: 'ROL-01', label: 'Lihat Role & Permission',  section: 'Role & Permission' },
  'role.manage':             { uiCode: 'ROL-02', label: 'Buat/Edit Role',           section: 'Role & Permission' },

  // ─── Audit Log (LOG) ────────────────────────────────────────────────
  'audit.view':              { uiCode: 'LOG-01', label: 'Lihat Audit Log',          section: 'Audit Log' },

  // ─── Berita (BRT) ───────────────────────────────────────────────────
  'berita.view':             { uiCode: 'BRT-01', label: 'Lihat Berita',             section: 'Berita' },
  'berita.manage':           { uiCode: 'BRT-02', label: 'Buat/Edit/Hapus Berita',   section: 'Berita' },

  // ─── Pengumuman (PNG) ───────────────────────────────────────────────
  'pengumuman.view':         { uiCode: 'PNG-01', label: 'Lihat Pengumuman',         section: 'Pengumuman' },
  'pengumuman.manage':       { uiCode: 'PNG-02', label: 'Buat/Edit/Hapus Pengumuman', section: 'Pengumuman' },

  // ─── Export Agregat (EXP) ───────────────────────────────────────────
  'export.manage':           { uiCode: 'EXP-01', label: 'Export Excel Struk',       section: 'Struk Bendahara' },

  // ─── WhatsApp (WA) ──────────────────────────────────────────────────
  'whatsapp.view':           { uiCode: 'WA-01', label: 'Lihat Status WA Sendiri',      section: 'WhatsApp' },
  'whatsapp.manage':         { uiCode: 'WA-02', label: 'Kelola WA User Lain',         section: 'WhatsApp' },

  // ─── Pengaturan (CFG) ───────────────────────────────────────────────
  'settings.view':           { uiCode: 'CFG-01', label: 'Lihat Pengaturan Laporan',    section: 'Pengaturan' },
  'settings.manage':         { uiCode: 'CFG-02', label: 'Atur Laporan & Notifikasi',   section: 'Pengaturan' },

  // ─── Seragam (SRG) — Checklist Pengambilan Seragam Siswa Baru ────────
  'spmb.checklist_seragam.view':   { uiCode: 'SRG-01', label: 'Lihat Checklist Seragam',       section: 'Seragam' },
  'spmb.checklist_seragam.manage': { uiCode: 'SRG-02', label: 'Input Checklist Seragam',       section: 'Seragam' },
  'spmb.seragam_item.manage':      { uiCode: 'SRG-03', label: 'Kelola Master Item Seragam',    section: 'Seragam' },
};

/**
 * Daftar section yang dipakai untuk grouping di matrix view.
 * Urutan di sini = urutan tampil di matrix (Pendaftar dulu, lalu peran
 * spesifik, lalu master data).
 */
export const PERMISSION_SECTION_ORDER: string[] = [
  'Pendaftar',
  'Bendahara',
  'TU (Ukuran Baju)',
  'Gelombang',
  'Jurusan',
  'Statistik',
  'User',
  'Role & Permission',
  'Audit Log',
  'Berita',
  'Pengumuman',
  'Struk Bendahara',
  'WhatsApp',
  'Pengaturan',
  'Seragam',
];