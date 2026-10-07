export type StatusPendaftar =
  | 'MENUNGGU_PERSETUJUAN'
  | 'MENUNGGU_UKURAN_BAJU' // siswa sudah bayar (Bukti Pembayaran tersedia), tinggal TU catat baju saat daftar ulang
  | 'DITOLAK'
  | 'SISWA_AKTIF';

// Label publik untuk orang tua murid — friendly, hindari istilah teknis.
// Backend mengirim status internal (MENUNGGU_PERSETUJUAN), frontend mapping
// ke label yang lebih mudah dipahami.
export const STATUS_LABELS: Record<StatusPendaftar, string> = {
  MENUNGGU_PERSETUJUAN: 'Belum Daftar Ulang',
  MENUNGGU_UKURAN_BAJU: 'Sudah Bayar',
  DITOLAK: 'Ditolak',
  SISWA_AKTIF: 'Siswa Aktif',
};

export const STATUS_COLORS: Record<StatusPendaftar, string> = {
  MENUNGGU_PERSETUJUAN: 'bg-amber-100 text-amber-800 border border-amber-200',
  MENUNGGU_UKURAN_BAJU: 'bg-blue-100 text-blue-800 border border-blue-200',
  DITOLAK: 'bg-red-100 text-red-800 border border-red-200',
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
  hasPdf: boolean;
  pdfDownloadUrl: string | null;
  daftarUlangConfirmedAt: string | null;
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
  pdfSignature?: string | null;
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