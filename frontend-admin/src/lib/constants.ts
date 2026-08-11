export const STATUS_LABELS: Record<string, string> = {
  MENUNGGU_VERIFIKASI: 'Menunggu Verifikasi',
  DITOLAK: 'Ditolak',
  LOLOS_MENUNGGU_DAFTAR_ULANG: 'Lolos - Menunggu Daftar Ulang',
  MENUNGGU_VERIFIKASI_PEMBAYARAN: 'Menunggu Verifikasi Pembayaran',
  SISWA_AKTIF: 'Siswa Aktif',
};

export const STATUS_COLORS: Record<string, string> = {
  MENUNGGU_VERIFIKASI: 'bg-amber-100 text-amber-800 border border-amber-200',
  DITOLAK: 'bg-red-100 text-red-800 border border-red-200',
  LOLOS_MENUNGGU_DAFTAR_ULANG: 'bg-blue-100 text-blue-800 border border-blue-200',
  MENUNGGU_VERIFIKASI_PEMBAYARAN: 'bg-purple-100 text-purple-800 border border-purple-200',
  SISWA_AKTIF: 'bg-emerald-100 text-emerald-800 border border-emerald-200',
};

export const PAYMENT_STATUS_LABELS: Record<string, string> = {
  MENUNGGU_VERIFIKASI: 'Menunggu Verifikasi',
  TERVERIFIKASI: 'Terverifikasi',
  BELUM_DITEMUKAN: 'Belum Ditemukan',
};

export const PAYMENT_STATUS_COLORS: Record<string, string> = {
  MENUNGGU_VERIFIKASI: 'bg-amber-100 text-amber-800 border border-amber-200',
  TERVERIFIKASI: 'bg-emerald-100 text-emerald-800 border border-emerald-200',
  BELUM_DITEMUKAN: 'bg-red-100 text-red-800 border border-red-200',
};

export const BERITA_STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Draft',
  PUBLISHED: 'Published',
};

export const BERITA_STATUS_COLORS: Record<string, string> = {
  DRAFT: 'bg-slate-100 text-slate-700',
  PUBLISHED: 'bg-emerald-100 text-emerald-700',
};
