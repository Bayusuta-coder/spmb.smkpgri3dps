export type StatusPendaftar =
  | 'MENUNGGU_VERIFIKASI'
  | 'DITOLAK'
  | 'LOLOS_MENUNGGU_DAFTAR_ULANG'
  | 'MENUNGGU_VERIFIKASI_PEMBAYARAN'
  | 'SISWA_AKTIF';

export const STATUS_LABELS: Record<StatusPendaftar, string> = {
  MENUNGGU_VERIFIKASI: 'Menunggu Verifikasi',
  DITOLAK: 'Ditolak',
  LOLOS_MENUNGGU_DAFTAR_ULANG: 'Lolos - Menunggu Daftar Ulang',
  MENUNGGU_VERIFIKASI_PEMBAYARAN: 'Menunggu Verifikasi Pembayaran',
  SISWA_AKTIF: 'Siswa Aktif',
};

export const STATUS_COLORS: Record<StatusPendaftar, string> = {
  MENUNGGU_VERIFIKASI: 'bg-amber-100 text-amber-800 border border-amber-200',
  DITOLAK: 'bg-red-100 text-red-800 border border-red-200',
  LOLOS_MENUNGGU_DAFTAR_ULANG: 'bg-blue-100 text-blue-800 border border-blue-200',
  MENUNGGU_VERIFIKASI_PEMBAYARAN: 'bg-purple-100 text-purple-800 border border-purple-200',
  SISWA_AKTIF: 'bg-emerald-100 text-emerald-800 border border-emerald-200',
};

export interface ActiveGelombang {
  id: string;
  name: string;
  startDate: string;
  endDate: string | null;
  details: Array<{
    jurusanId: string;
    jurusanCode: string;
    jurusanName: string;
    quota: number;
    used: number;
    remaining: number;
  }>;
}

export interface Jurusan {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
}

export interface CheckStatusResponse {
  registrationNumber: string;
  namaLengkap: string;
  jurusan: { code: string; name: string };
  gelombang: { name: string };
  status: StatusPendaftar;
  statusLabel: string;
  rejectionNote: string | null;
  canInputPayment: boolean;
  hasPdf: boolean;
  pdfDownloadUrl: string | null;
  daftarUlangConfirmedAt: string | null;
  pembayaran: {
    nominal: string;
    tanggalTransfer: string;
    namaPengirim: string;
    status: 'MENUNGGU_VERIFIKASI' | 'TERVERIFIKASI' | 'BELUM_DITEMUKAN';
    note: string | null;
  } | null;
  createdAt: string;
}

export interface RegisterResponse {
  id: string;
  registrationNumber: string;
  status: StatusPendaftar;
  statusLabel: string;
}

export interface SchoolInfo {
  name: string;
  address: string;
  phone: string;
  email: string;
}

export interface VerifyInfoResponse {
  valid: boolean;
  registrationNumber: string;
  namaLengkap: string;
  jenisKelamin: 'L' | 'P';
  status: StatusPendaftar;
  statusLabel: string;
  isActive: boolean;
  jurusan: { code: string; name: string };
  gelombang: {
    name: string;
    tanggalDaftarUlong?: string | null;
    tanggalDaftarUlang?: string | null;
    jamDaftarUlang?: string | null;
  };
  school: SchoolInfo;
  approvedAt: string | null;
  daftarUlangConfirmedAt: string | null;
  attendanceConfirmed: boolean;
}
