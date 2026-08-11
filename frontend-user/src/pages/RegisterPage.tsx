import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { api } from '../lib/api';
import type { ActiveGelombang, RegisterResponse } from '../lib/types';

interface FormData {
  namaLengkap: string;
  jenisKelamin: 'L' | 'P';
  tempatLahir: string;
  tanggalLahir: string;
  nisn: string;
  sekolahAsal: string;
  alamat: string;
  noTelp: string;
  email?: string;
  jumlahNilaiUn: number;
  prestasi?: string;
  namaIbu: string;
  noTelpOrtu: string;
  jurusanId: string;
  gelombangId: string;
}

export default function RegisterPage() {
  const [active, setActive] = useState<ActiveGelombang | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<RegisterResponse | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormData>({ mode: 'onBlur' });

  useEffect(() => {
    (async () => {
      try {
        const res = await api.get<ActiveGelombang | null>('/gelombang/public/active');
        setActive(res.data);
        if (!res.data) toast.info('Belum ada gelombang aktif');
      } catch (e: any) {
        toast.error(e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const onSubmit = async (data: FormData) => {
    setSubmitting(true);
    try {
      const res = await api.post<RegisterResponse>('/pendaftar/register', {
        ...data,
        jumlahNilaiUn: Number(data.jumlahNilaiUn),
      });
      setResult(res.data);
      toast.success('Pendaftaran berhasil! Simpan nomor pendaftaran Anda.');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="container-page py-16 text-center text-slate-500">Memuat…</div>
    );
  }

  if (result) {
    return (
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.4 }}
        className="container-page py-12 md:py-16"
      >
        <div className="mx-auto max-w-2xl">
          <div className="card text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-3xl">
              ✓
            </div>
            <h1 className="mt-4 text-2xl font-bold text-slate-900 md:text-3xl">
              Pendaftaran Berhasil!
            </h1>
            <p className="mt-2 text-slate-600">
              Simpan nomor pendaftaran Anda untuk mengecek status:
            </p>
            <div className="mt-6 rounded-xl border-2 border-dashed border-primary-300 bg-primary-50 px-4 py-6">
              <div className="text-xs uppercase tracking-wider text-primary-600">Nomor Pendaftaran</div>
              <div className="mt-2 break-all font-mono text-2xl font-bold text-primary-700 md:text-3xl">
                {result.registrationNumber}
              </div>
            </div>
            <p className="mt-4 text-sm text-slate-500">
              Status saat ini: <b>{result.statusLabel}</b>
            </p>
            <div className="mt-6 flex flex-col justify-center gap-2 sm:flex-row">
              <Link to={`/cek-status?reg=${result.registrationNumber}`} className="btn-primary">
                Cek Status Sekarang
              </Link>
              <Link to="/" className="btn-ghost">
                Kembali ke Beranda
              </Link>
            </div>
          </div>
        </div>
      </motion.div>
    );
  }

  if (!active) {
    return (
      <div className="container-page py-16 text-center">
        <h1 className="text-2xl font-bold">Pendaftaran Belum Dibuka</h1>
        <p className="mt-2 text-slate-600">
          Belum ada gelombang SPMB yang aktif. Silakan cek kembali nanti.
        </p>
        <Link to="/" className="btn-ghost mt-6 inline-flex">
          Kembali ke Beranda
        </Link>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ y: 20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4 }}
      className="container-page py-8 md:py-12"
    >
      <div className="mx-auto max-w-3xl">
        <h1 className="text-2xl font-bold text-slate-900 md:text-3xl">Formulir Pendaftaran</h1>
        <p className="mt-2 text-slate-600">
          Isi semua field dengan benar. Field bertanda <span className="text-red-500">*</span> wajib diisi.
        </p>

        <div className="card mt-6">
          <div className="rounded-lg bg-primary-50 p-3 text-sm text-primary-800">
            Gelombang aktif: <b>{active.name}</b>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-6">
            <Section title="Data Pribadi">
              <Field label="Nama Lengkap *" error={errors.namaLengkap?.message}>
                <input
                  className="input"
                  placeholder="Sesuai ijazah / akta kelahiran"
                  {...register('namaLengkap', { required: 'Wajib diisi' })}
                />
              </Field>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <Field label="Jenis Kelamin *" error={errors.jenisKelamin?.message}>
                  <select
                    className="input"
                    {...register('jenisKelamin', { required: 'Wajib dipilih' })}
                  >
                    <option value="">— Pilih —</option>
                    <option value="L">Laki-laki</option>
                    <option value="P">Perempuan</option>
                  </select>
                </Field>

                <Field label="NISN *" error={errors.nisn?.message}>
                  <input
                    className="input"
                    placeholder="10 digit"
                    maxLength={10}
                    {...register('nisn', {
                      required: 'Wajib diisi',
                      pattern: { value: /^\d{10}$/, message: 'NISN harus 10 digit angka' },
                    })}
                  />
                </Field>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <Field label="Tempat Lahir *" error={errors.tempatLahir?.message}>
                  <input className="input" {...register('tempatLahir', { required: 'Wajib diisi' })} />
                </Field>
                <Field label="Tanggal Lahir *" error={errors.tanggalLahir?.message}>
                  <input
                    className="input"
                    type="date"
                    {...register('tanggalLahir', { required: 'Wajib diisi' })}
                  />
                </Field>
              </div>
            </Section>

            <Section title="Asal Sekolah & Nilai">
              <Field label="Sekolah Asal *" error={errors.sekolahAsal?.message}>
                <input className="input" {...register('sekolahAsal', { required: 'Wajib diisi' })} />
              </Field>
              <Field label="Jumlah Nilai UN (rata-rata) *" error={errors.jumlahNilaiUn?.message}>
                <input
                  className="input"
                  type="number"
                  step="0.01"
                  min={0}
                  max={100}
                  {...register('jumlahNilaiUn', {
                    required: 'Wajib diisi',
                    valueAsNumber: true,
                    min: { value: 0, message: 'Tidak boleh negatif' },
                    max: { value: 100, message: 'Maksimal 100' },
                  })}
                />
              </Field>
              <Field label="Prestasi (opsional)" error={errors.prestasi?.message}>
                <textarea
                  className="input min-h-[80px]"
                  placeholder="Contoh: Juara 1 Lomba Robotik Tingkat Provinsi"
                  {...register('prestasi')}
                />
              </Field>
            </Section>

            <Section title="Kontak & Alamat">
              <Field label="Alamat Lengkap *" error={errors.alamat?.message}>
                <textarea
                  className="input min-h-[80px]"
                  {...register('alamat', { required: 'Wajib diisi' })}
                />
              </Field>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <Field label="No. Telp/HP (Siswa) *" error={errors.noTelp?.message}>
                  <input
                    className="input"
                    placeholder="08xxxxxxxxxx"
                    {...register('noTelp', {
                      required: 'Wajib diisi',
                      pattern: { value: /^[0-9+\-\s]{8,20}$/, message: 'No. telp tidak valid' },
                    })}
                  />
                </Field>
                <Field label="Email (untuk kirim bukti pendaftaran ulang) *" error={errors.email?.message}>
                  <input
                    className="input"
                    type="email"
                    placeholder="nama@email.com"
                    {...register('email', {
                      required: 'Email wajib diisi untuk menerima bukti pendaftaran ulang',
                      pattern: { value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, message: 'Email tidak valid' },
                    })}
                  />
                </Field>
              </div>
              <Field label="No. Telp Orang Tua *" error={errors.noTelpOrtu?.message}>
                <input
                  className="input"
                  placeholder="08xxxxxxxxxx"
                  {...register('noTelpOrtu', {
                    required: 'Wajib diisi',
                    pattern: { value: /^[0-9+\-\s]{8,20}$/, message: 'No. telp tidak valid' },
                  })}
                />
              </Field>
              <Field label="Nama Ibu Kandung *" error={errors.namaIbu?.message}>
                <input className="input" {...register('namaIbu', { required: 'Wajib diisi' })} />
              </Field>
            </Section>

            <Section title="Pilihan Jurusan & Gelombang">
              <Field label="Gelombang *" error={errors.gelombangId?.message}>
                <select
                  className="input"
                  {...register('gelombangId', { required: 'Wajib dipilih' })}
                >
                  <option value="">— Pilih Gelombang —</option>
                  <option value={active.id}>{active.name}</option>
                </select>
              </Field>
              <Field label="Pilihan Jurusan *" error={errors.jurusanId?.message}>
                <select
                  className="input"
                  {...register('jurusanId', { required: 'Wajib dipilih' })}
                >
                  <option value="">— Pilih Jurusan —</option>
                  {active.details.map((d) => (
                    <option
                      key={d.jurusanId}
                      value={d.jurusanId}
                      disabled={d.remaining === 0}
                    >
                      {d.jurusanCode} — {d.jurusanName}{' '}
                      {d.remaining === 0
                        ? '(Penuh)'
                        : `(Sisa ${d.remaining})`}
                    </option>
                  ))}
                </select>
              </Field>
            </Section>

            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
              <b>Perhatian:</b> Pastikan data yang Anda masukkan sudah benar. Setelah dikirim,
              data tidak dapat diubah sendiri. Hubungi admin jika perlu koreksi.
            </div>

            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Link to="/" className="btn-ghost">
                Batal
              </Link>
              <button type="submit" disabled={submitting} className="btn-primary">
                {submitting ? 'Mengirim…' : 'Kirim Pendaftaran'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </motion.div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="border-b border-slate-200 pb-2 text-sm font-semibold uppercase tracking-wider text-slate-500">
        {title}
      </h3>
      <div className="mt-4 space-y-4">{children}</div>
    </div>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="label">{label}</label>
      {children}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
