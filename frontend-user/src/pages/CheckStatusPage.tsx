import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import {
  Download,
  CheckCircle2,
  FileText,
  Clock,
  AlertTriangle,
  PartyPopper,
  Calendar,
  Building2,
  GraduationCap,
} from 'lucide-react';
import { api, getApiBaseUrl } from '../lib/api';
import { STATUS_COLORS, STATUS_LABELS } from '../lib/types';
import type { CheckStatusResponse } from '../lib/types';

interface SearchForm {
  registrationNumber: string;
}

export default function CheckStatusPage() {
  const [params] = useSearchParams();
  const [data, setData] = useState<CheckStatusResponse | null>(null);
  const [loading, setLoading] = useState(false);

  const { register, handleSubmit } = useForm<SearchForm>({
    defaultValues: { registrationNumber: params.get('reg') || '' },
  });

  const onSearch = async ({ registrationNumber }: SearchForm) => {
    setLoading(true);
    setData(null);
    try {
      const res = await api.get<CheckStatusResponse>(
        `/pendaftar/check/${encodeURIComponent(registrationNumber)}`,
      );
      setData(res.data);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div
      initial={{ y: 20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4 }}
      className="container-page py-8 md:py-12"
    >
      <div className="mx-auto max-w-2xl">
        <h1 className="text-2xl font-bold text-slate-900 md:text-3xl">Cek Status Pendaftaran</h1>
        <p className="mt-2 text-slate-600">
          Masukkan nomor pendaftaran (format:{' '}
          <code className="rounded bg-slate-100 px-1.5 py-0.5">REG-YYYYMMDD-XXX</code>) untuk melihat
          status terbaru.
        </p>

        <form
          onSubmit={handleSubmit(onSearch)}
          className="card mt-6 flex flex-col gap-3 sm:flex-row"
        >
          <input
            className="input flex-1"
            placeholder="REG-20260101-001"
            autoFocus
            {...register('registrationNumber', { required: 'Wajib diisi' })}
          />
          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? 'Mencari…' : 'Cek Status'}
          </button>
        </form>

        {data && (
          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.4 }}
            className="card mt-6"
          >
            <div className="flex flex-col items-start justify-between gap-3 md:flex-row md:items-center">
              <div>
                <p className="text-sm text-slate-500">Nomor Pendaftaran</p>
                <p className="font-mono text-lg font-semibold text-primary-700">
                  {data.registrationNumber}
                </p>
                <p className="mt-1 text-slate-700">
                  {data.namaLengkap} — <span className="text-slate-500">{data.jurusan.code}</span>
                </p>
                <p className="mt-0.5 text-xs text-slate-500">
                  <Building2 size={12} className="mr-0.5 inline" />
                  {data.gelombang.name}
                </p>
              </div>
              <span className={`badge px-3 py-1 text-sm ${STATUS_COLORS[data.status]}`}>
                {STATUS_LABELS[data.status]}
              </span>
            </div>

            {/* ===== Status: MENUNGGU_PERSETUJUAN ===== */}
            {data.status === 'MENUNGGU_PERSETUJUAN' && (
              <div className="mt-4 space-y-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                <div className="flex items-start gap-2">
                  <Clock size={18} className="mt-0.5 shrink-0 text-amber-600" />
                  <div>
                    <p className="font-semibold">Pendaftaran Anda sedang menunggu persetujuan admin.</p>
                    <p className="mt-1 text-amber-800/90">
                      Mohon menunggu informasi lebih lanjut. Panitia akan menghubungi Anda jika
                      pendaftaran sudah disetujui.
                    </p>
                  </div>
                </div>

                {/* Tanda Bukti Pendaftaran (Tahap 1) — selalu tersedia setelah submit.
                    Beda dengan Bukti Pendaftaran Ulang (Tahap 2) yang ada di status SISWA_AKTIF. */}
                {data.hasPdf && data.pdfDownloadUrl && (
                  <motion.a
                    initial={{ scale: 0.97, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ duration: 0.3 }}
                    href={`${getApiBaseUrl().replace(/\/api$/, '')}${data.pdfDownloadUrl}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 rounded-lg bg-amber-600 px-4 py-2.5 font-medium text-white shadow-sm transition hover:bg-amber-700"
                  >
                    <Download size={18} />
                    Download Tanda Bukti Pendaftaran (PDF)
                  </motion.a>
                )}

                <p className="flex items-start gap-1.5 rounded-md bg-white/70 px-3 py-2 text-xs text-amber-800">
                  <FileText size={14} className="mt-0.5 shrink-0" />
                  <span>
                    Simpan Tanda Bukti Pendaftaran ini. Bawalah ke sekolah saat melakukan daftar ulang
                    fisik pada jam operasional 08.00 – 15.00 WITA. Bukti PDF final dengan QR verifikasi
                    akan tersedia setelah status berubah menjadi <b>Siswa Aktif</b>.
                  </span>
                </p>
              </div>
            )}

            {/* ===== Status: DITOLAK ===== */}
            {data.status === 'DITOLAK' && (
              <div className="mt-4 space-y-3 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
                <div className="flex items-start gap-2">
                  <AlertTriangle size={18} className="mt-0.5 shrink-0 text-red-600" />
                  <div>
                    <p className="font-semibold">Mohon maaf, pendaftaran Anda belum dapat kami terima.</p>
                    {data.rejectionNote && (
                      <p className="mt-2 rounded-md bg-white/70 p-2 text-red-900">
                        <span className="font-medium">Alasan:</span> {data.rejectionNote}
                      </p>
                    )}
                    <p className="mt-2 text-red-700/90">
                      Jika Anda merasa ini keliru atau ingin menanyakan lebih lanjut, silakan
                      hubungi panitia SPMB SMK PGRI 3 Denpasar.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* ===== Status: SISWA_AKTIF ===== */}
            {data.status === 'SISWA_AKTIF' && (
              <div className="mt-4 space-y-3 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
                <div className="flex items-start gap-2">
                  <PartyPopper size={18} className="mt-0.5 shrink-0 text-emerald-600" />
                  <div>
                    <p className="font-semibold">
                      🎉 Selamat! Anda resmi menjadi <b>Siswa Aktif</b> SMK PGRI 3 Denpasar.
                    </p>
                    <p className="mt-1 text-emerald-800/90">
                      Silakan datang ke sekolah untuk melakukan daftar ulang fisik. Bukti PDF di
                      bawah ini berisi QR Code yang akan di-scan oleh petugas saat Anda hadir.
                    </p>
                  </div>
                </div>

                {data.hasPdf && data.pdfDownloadUrl && (
                  <motion.a
                    initial={{ scale: 0.97, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ duration: 0.3 }}
                    // pdfDownloadUrl dari backend sudah absolut ke backend (signature-based),
                    // buka di tab baru biar preview PDF-nya kelihatan.
                    href={`${getApiBaseUrl().replace(/\/api$/, '')}${data.pdfDownloadUrl}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 font-medium text-white shadow-sm transition hover:bg-emerald-700"
                  >
                    <Download size={18} />
                    Download Bukti Pendaftaran Ulang (PDF)
                  </motion.a>
                )}

                {data.daftarUlangConfirmedAt && (
                  <p className="flex items-center gap-2 rounded-md bg-white/70 px-3 py-2 text-xs text-emerald-900">
                    <CheckCircle2 size={16} className="text-emerald-600" />
                    <span>
                      <Calendar size={12} className="mr-0.5 inline" />
                      Kehadiran daftar ulang fisik sudah dikonfirmasi pada{' '}
                      {new Date(data.daftarUlangConfirmedAt).toLocaleString('id-ID')}.
                    </span>
                  </p>
                )}

                {!data.hasPdf && (
                  <p className="flex items-center gap-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900">
                    <FileText size={16} />
                    Bukti PDF sedang diproses. Silakan refresh halaman ini dalam beberapa saat.
                  </p>
                )}
              </div>
            )}
          </motion.div>
        )}

        {/* Footer info kecil: alur disederhanakan */}
        <div className="mt-4 rounded-lg bg-slate-50 p-3 text-xs text-slate-500">
          <GraduationCap size={14} className="mr-1 inline" />
          Alur SPMB SMK PGRI 3 Denpasar disederhanakan: <b>Submit Form</b> →{' '}
          <b>Persetujuan Admin</b> → <b>Siswa Aktif</b> (siap daftar ulang & cetak bukti PDF di
          sekolah).
        </div>
      </div>
    </motion.div>
  );
}