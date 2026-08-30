import { useEffect, useState } from 'react';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ShieldCheck,
  ShieldX,
  CheckCircle2,
  MapPin,
  Phone,
  Calendar,
  Clock,
  User,
  GraduationCap,
  AlertTriangle,
  ArrowLeft,
  Printer,
} from 'lucide-react';
import { api, getApiBaseUrl } from '../lib/api';
import { STATUS_COLORS, STATUS_LABELS } from '../lib/types';
import type { VerifyInfoResponse } from '../lib/types';

type State =
  | { kind: 'loading' }
  | { kind: 'ok'; data: VerifyInfoResponse }
  | { kind: 'error'; message: string };

export default function VerifikasiPage() {
  const { registrationNumber } = useParams<{ registrationNumber: string }>();
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const [state, setState] = useState<State>({ kind: 'loading' });

  useEffect(() => {
    let cancelled = false;
    if (!registrationNumber || !token) {
      setState({ kind: 'error', message: 'Tautan verifikasi tidak lengkap (nomor / token kosong).' });
      return;
    }
    setState({ kind: 'loading' });
    api
      .get<VerifyInfoResponse>(
        `/pendaftar/verify/${encodeURIComponent(registrationNumber)}`,
        { params: { token } },
      )
      .then((r) => {
        if (!cancelled) setState({ kind: 'ok', data: r.data });
      })
      .catch((e: any) => {
        if (!cancelled)
          setState({
            kind: 'error',
            message:
              e?.message ||
              'Tautan verifikasi tidak valid atau QR sudah tidak berlaku.',
          });
      });
    return () => {
      cancelled = true;
    };
  }, [registrationNumber, token]);

  return (
    <motion.div
      initial={{ y: 20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4 }}
      className="container-page py-8 md:py-12"
    >
      <Link
        to="/"
        className="mb-4 inline-flex items-center gap-1 text-sm text-primary-700 hover:text-primary-900"
      >
        <ArrowLeft size={16} /> Kembali ke beranda
      </Link>

      <div className="mx-auto max-w-2xl">
        {state.kind === 'loading' && <LoadingCard />}
        {state.kind === 'error' && <ErrorCard message={state.message} />}
        {state.kind === 'ok' && <SuccessCard data={state.data} token={token} />}
      </div>
    </motion.div>
  );
}

function LoadingCard() {
  return (
    <div className="card text-center text-slate-500">
      <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-primary-600" />
      <p className="mt-3 text-sm">Memverifikasi data…</p>
    </div>
  );
}

function ErrorCard({ message }: { message: string }) {
  return (
    <div className="card border-red-200 bg-red-50">
      <div className="flex items-start gap-3">
        <ShieldX size={28} className="shrink-0 text-red-600" />
        <div>
          <h1 className="text-lg font-semibold text-red-700">
            Verifikasi tidak valid
          </h1>
          <p className="mt-1 text-sm text-red-700">{message}</p>
          <p className="mt-2 text-xs text-red-600">
            Pastikan QR Code dipindai secara utuh (tidak terpotong).
          </p>
        </div>
      </div>
    </div>
  );
}

function SuccessCard({ data, token }: { data: VerifyInfoResponse; token: string }) {
  const tglDaftarUlang = data.gelombang.tanggalDaftarUlang
    ? new Date(data.gelombang.tanggalDaftarUlang).toLocaleDateString('id-ID', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    : null;

  return (
    <motion.div
      initial={{ scale: 0.97, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ duration: 0.35 }}
      className="space-y-4"
    >
      {/* Hero status */}
      <div
        className={`rounded-2xl border p-5 ${
          data.isActive
            ? 'border-emerald-200 bg-gradient-to-br from-emerald-50 to-emerald-100'
            : 'border-slate-200 bg-slate-50'
        }`}
      >
        <div className="flex items-start gap-3">
          {data.isActive ? (
            <ShieldCheck size={36} className="shrink-0 text-emerald-600" />
          ) : (
            <AlertTriangle size={36} className="shrink-0 text-slate-500" />
          )}
          <div className="flex-1">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Halaman Verifikasi Publik — SPMB
            </p>
            <h1 className="mt-1 text-xl font-bold text-slate-900 md:text-2xl">
              {data.isActive
                ? 'Berhasil Diterima sebagai Siswa Aktif'
                : `Status: ${STATUS_LABELS[data.status]}`}
            </h1>
            <p className="mt-1 text-sm text-slate-700">
              <span className="font-mono font-semibold">{data.registrationNumber}</span>{' '}
              — <b>{data.namaLengkap}</b> (
              {data.jenisKelamin === 'L' ? 'Laki-laki' : 'Perempuan'})
            </p>
            <span
              className={`mt-3 inline-block rounded-full px-3 py-1 text-xs font-medium ${STATUS_COLORS[data.status]}`}
            >
              {STATUS_LABELS[data.status]}
            </span>
          </div>
        </div>
      </div>

      {/* Info Pendaftar */}
      <div className="card space-y-3">
        <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900">
          <User size={18} className="text-primary-700" />
          Identitas Pendaftar
        </h2>
        <Row label="Nomor Pendaftaran" value={data.registrationNumber} mono />
        <Row label="Nama Lengkap" value={data.namaLengkap} />
        <Row label="Jurusan" value={`${data.jurusan.code} — ${data.jurusan.name}`} />
        <Row label="Gelombang" value={data.gelombang.name} />
      </div>

      {/* Jadwal Daftar Ulang */}
      {(tglDaftarUlang || data.gelombang.jamDaftarUlang) && (
        <div className="card space-y-3 border-blue-200 bg-blue-50/40">
          <h2 className="flex items-center gap-2 text-base font-semibold text-blue-900">
            <Calendar size={18} />
            Jadwal Pelaksanaan Daftar Ulang Fisik
          </h2>
          {tglDaftarUlang && (
            <Row icon={<Calendar size={16} />} label="Tanggal" value={tglDaftarUlang} />
          )}
          {data.gelombang.jamDaftarUlang && (
            <Row
              icon={<Clock size={16} />}
              label="Jam"
              value={`${data.gelombang.jamDaftarUlang} WITA`}
            />
          )}
          <Row
            icon={<MapPin size={16} />}
            label="Lokasi"
            value={data.school.address}
          />
          <Row
            icon={<Phone size={16} />}
            label="Telepon Sekolah"
            value={data.school.phone}
          />
        </div>
      )}

      {/* Status Kehadiran */}
      {data.attendanceConfirmed ? (
        <div className="card border-emerald-200 bg-emerald-50">
          <div className="flex items-start gap-3">
            <CheckCircle2 size={24} className="shrink-0 text-emerald-600" />
            <div>
              <h3 className="font-semibold text-emerald-800">
                Kehadiran sudah dikonfirmasi
              </h3>
              <p className="mt-1 text-sm text-emerald-700">
                Daftar ulang fisik telah dikonfirmasi pada{' '}
                {data.daftarUlangConfirmedAt
                  ? new Date(data.daftarUlangConfirmedAt).toLocaleString('id-ID')
                  : '—'}
                .
              </p>
            </div>
          </div>
        </div>
      ) : (
        data.isActive && (
          <div className="card border-amber-200 bg-amber-50">
            <div className="flex items-start gap-3">
              <AlertTriangle size={24} className="shrink-0 text-amber-600" />
              <div>
                <h3 className="font-semibold text-amber-800">
                  Belum konfirmasi kehadiran
                </h3>
                <p className="mt-1 text-sm text-amber-700">
                  Datang ke sekolah pada jadwal di atas dan tunjukkan bukti ini
                  ke petugas untuk dicocokkan.
                </p>
              </div>
            </div>
          </div>
        )
      )}

      {/* Aksi Petugas — tombol Cetak PDF saat siswa hadir */}
      {data.isActive && (
        <div className="card border-2 border-primary-200 bg-primary-50/30">
          <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
            <div className="flex items-start gap-3">
              <Printer size={28} className="shrink-0 text-primary-700" />
              <div>
                <h3 className="font-semibold text-slate-900">Aksi Petugas</h3>
                <p className="mt-0.5 text-sm text-slate-600">
                  Cetak bukti pendaftaran ulang PDF untuk diberikan ke siswa / ditempel di
                  dokumen daftar ulang.
                </p>
              </div>
            </div>
            <CetakPdfButton
              registrationNumber={data.registrationNumber}
              token={token}
            />
          </div>
        </div>
      )}

      {/* Footer sekolah */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 text-center text-xs text-slate-500">
        <p className="flex items-center justify-center gap-1.5 font-medium text-slate-700">
          <GraduationCap size={14} />
          {data.school.name}
        </p>
        <p className="mt-1">
          Dokumen ini hanya menampilkan informasi ringkas untuk publik.
          Hubungi sekolah jika ada pertanyaan lebih lanjut.
        </p>
      </div>
    </motion.div>
  );
}

function Row({
  label,
  value,
  icon,
  mono,
}: {
  label: string;
  value: string;
  icon?: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="flex items-start gap-3 border-b border-slate-100 pb-2 last:border-0 last:pb-0">
      {icon && <span className="mt-0.5 text-slate-400">{icon}</span>}
      <div className="flex-1">
        <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
        <p
          className={`mt-0.5 text-sm text-slate-900 ${
            mono ? 'font-mono font-semibold' : 'font-medium'
          }`}
        >
          {value}
        </p>
      </div>
    </div>
  );
}

/**
 * Tombol Cetak PDF — buka PDF di tab baru lewat endpoint publik signature-based.
 * `token` dari URL verifikasi == pdfSignature yang sama-sama di-encode ke QR,
 * jadi kita bisa pakai langsung untuk download (lihat pdf.service.ts buildVerificationUrl).
 */
function CetakPdfButton({
  registrationNumber,
  token,
}: {
  registrationNumber: string;
  token: string;
}) {
  const handleClick = () => {
    if (!token) {
      alert('Token tidak tersedia — PDF tidak bisa dicetak.');
      return;
    }
    const apiOrigin = getApiBaseUrl().replace(/\/api$/, '');
    const url = `${apiOrigin}/pendaftar/check/${encodeURIComponent(registrationNumber)}/download-pdf?s=${encodeURIComponent(token)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  return (
    <button
      onClick={handleClick}
      className="ml-auto inline-flex items-center gap-2 rounded-md bg-primary-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-primary-700"
    >
      <Printer size={16} />
      Cetak Bukti PDF
    </button>
  );
}