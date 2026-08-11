import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { Download, CheckCircle2, FileText } from 'lucide-react';
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
  const [showPayment, setShowPayment] = useState(false);

  const { register, handleSubmit, getValues } = useForm<SearchForm>({
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
          Masukkan nomor pendaftaran (format: <code className="rounded bg-slate-100 px-1.5 py-0.5">REG-YYYYMMDD-XXX</code>)
          untuk melihat status terbaru.
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
              </div>
              <span className={`badge px-3 py-1 text-sm ${STATUS_COLORS[data.status]}`}>
                {STATUS_LABELS[data.status]}
              </span>
            </div>

            {data.status === 'DITOLAK' && data.rejectionNote && (
              <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                <b>Catatan penolakan:</b> {data.rejectionNote}
              </div>
            )}

            {data.status === 'LOLOS_MENUNGGU_DAFTAR_ULANG' && (
              <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800">
                <b>Selamat!</b> Anda dinyatakan <b>Lolos</b> seleksi berkas. Silakan lakukan
                pembayaran daftar ulang ke rekening sekolah, lalu input data transfer di sini.
                <div className="mt-3">
                  {!showPayment ? (
                    <button onClick={() => setShowPayment(true)} className="btn-accent text-xs">
                      Input Data Pembayaran
                    </button>
                  ) : (
                    <PaymentForm
                      registrationNumber={data.registrationNumber}
                      onDone={() => {
                        setShowPayment(false);
                        onSearch({ registrationNumber: getValues('registrationNumber') });
                      }}
                    />
                  )}
                </div>
              </div>
            )}

            {data.status === 'MENUNGGU_VERIFIKASI_PEMBAYARAN' && data.pembayaran && (
              <div className="mt-4 rounded-lg border border-purple-200 bg-purple-50 p-4 text-sm text-purple-800">
                <p>
                  Data pembayaran Anda telah kami terima dan sedang diverifikasi oleh Tim TU.
                </p>
                <ul className="mt-2 space-y-1 text-purple-900">
                  <li>Nominal: <b>Rp {Number(data.pembayaran.nominal).toLocaleString('id-ID')}</b></li>
                  <li>Tanggal Transfer: <b>{new Date(data.pembayaran.tanggalTransfer).toLocaleDateString('id-ID')}</b></li>
                  <li>Nama Pengirim: <b>{data.pembayaran.namaPengirim}</b></li>
                </ul>
              </div>
            )}

            {data.status === 'SISWA_AKTIF' && (
              <div className="mt-4 space-y-3 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
                <p>
                  🎉 <b>Selamat!</b> Anda resmi menjadi <b>Siswa Aktif</b> SMK PGRI 3 Denpasar.
                  Sampai jumpa di hari pertama sekolah!
                </p>

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
                    Kehadiran daftar ulang fisik sudah dikonfirmasi pada{' '}
                    {new Date(data.daftarUlangConfirmedAt).toLocaleString('id-ID')}.
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
      </div>
    </motion.div>
  );
}

function PaymentForm({
  registrationNumber,
  onDone,
}: {
  registrationNumber: string;
  onDone: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const { register, handleSubmit, formState: { errors } } = useForm<{
    nominal: number;
    tanggalTransfer: string;
    namaPengirim: string;
    catatan?: string;
  }>({ mode: 'onBlur' });

  const onSubmit = async (data: any) => {
    setLoading(true);
    try {
      await api.post('/pembayaran/submit', {
        registrationNumber,
        nominal: Number(data.nominal),
        tanggalTransfer: data.tanggalTransfer,
        namaPengirim: data.namaPengirim,
        catatan: data.catatan,
      });
      toast.success('Data pembayaran berhasil dikirim. Mohon tunggu verifikasi TU.');
      onDone();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.form
      initial={{ y: 10, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.3 }}
      onSubmit={handleSubmit(onSubmit)}
      className="mt-2 space-y-3 rounded-lg bg-white p-3 ring-1 ring-blue-200"
    >
      <div>
        <label className="label">Nominal (Rp) *</label>
        <input
          className="input"
          type="number"
          {...register('nominal', { required: 'Wajib diisi', valueAsNumber: true, min: 1 })}
        />
        {errors.nominal && <p className="mt-1 text-xs text-red-600">{errors.nominal.message}</p>}
      </div>
      <div>
        <label className="label">Tanggal Transfer *</label>
        <input
          className="input"
          type="date"
          {...register('tanggalTransfer', { required: 'Wajib diisi' })}
        />
        {errors.tanggalTransfer && (
          <p className="mt-1 text-xs text-red-600">{errors.tanggalTransfer.message}</p>
        )}
      </div>
      <div>
        <label className="label">Nama Pengirim *</label>
        <input
          className="input"
          {...register('namaPengirim', { required: 'Wajib diisi' })}
        />
        {errors.namaPengirim && (
          <p className="mt-1 text-xs text-red-600">{errors.namaPengirim.message}</p>
        )}
      </div>
      <div>
        <label className="label">Catatan (opsional)</label>
        <textarea className="input min-h-[60px]" {...register('catatan')} />
      </div>
      <button type="submit" disabled={loading} className="btn-primary w-full">
        {loading ? 'Mengirim…' : 'Kirim Data Pembayaran'}
      </button>
    </motion.form>
  );
}
