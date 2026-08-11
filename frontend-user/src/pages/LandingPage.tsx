import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight, Newspaper, ImageOff } from 'lucide-react';
import { api, fotoUrl } from '../lib/api';
import type { ActiveGelombang } from '../lib/types';
import { toast } from 'sonner';

interface BeritaRingkas {
  id: string;
  judul: string;
  slug: string;
  foto: string;
  snippet: string;
  hashtag: string[];
  publishedAt: string | null;
  createdAt: string;
}

export default function LandingPage() {
  const [active, setActive] = useState<ActiveGelombang | null>(null);
  const [loading, setLoading] = useState(true);
  const [berita, setBerita] = useState<BeritaRingkas[]>([]);
  const [beritaLoading, setBeritaLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await api.get<ActiveGelombang | null>('/gelombang/public/active');
        setActive(res.data);
      } catch (e: any) {
        toast.error(e.message);
      } finally {
        setLoading(false);
      }
    })();

    (async () => {
      try {
        const res = await api.get<{ items: BeritaRingkas[] }>('/berita/public', {
          params: { pageSize: 6 },
        });
        setBerita(res.data.items || []);
      } catch (e) {
        // silent — section berita tidak boleh blokir halaman
      } finally {
        setBeritaLoading(false);
      }
    })();
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4 }}
    >
      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-br from-primary-500 via-primary-600 to-primary-700 text-white">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute -top-20 -left-20 h-72 w-72 rounded-full bg-accent-400 blur-3xl" />
          <div className="absolute bottom-0 right-0 h-80 w-80 rounded-full bg-accent-300 blur-3xl" />
        </div>
        <div className="container-page relative py-16 md:py-24">
          <motion.div
            initial={{ y: 30, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="mx-auto max-w-3xl text-center"
          >
            <span className="inline-block rounded-full bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider backdrop-blur">
              Tahun Ajaran {new Date().getFullYear()}/{new Date().getFullYear() + 1}
            </span>
            <h1 className="mt-4 text-3xl font-bold leading-tight md:text-5xl">
              Penerimaan Murid Baru <br className="hidden md:block" />
              <span className="text-accent-400">SMK PGRI 3 Denpasar</span>
            </h1>
            <p className="mt-4 text-base text-white/80 md:text-lg">
              Daftar secara online, pantau status pendaftaran, dan selesaikan daftar ulang
              tanpa harus bolak-balik ke sekolah.
            </p>
            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ duration: 0.5, delay: 0.3 }}
              className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row"
            >
              <Link
                to="/daftar"
                className="inline-flex items-center gap-2 rounded-lg bg-accent-400 px-6 py-3 text-sm font-bold text-primary-700 shadow-lg shadow-black/10 transition hover:bg-accent-500"
              >
                Daftar Sekarang
                <span>→</span>
              </Link>
              <Link
                to="/cek-status"
                className="inline-flex items-center gap-2 rounded-lg border border-white/30 bg-white/10 px-6 py-3 text-sm font-semibold text-white backdrop-blur transition hover:bg-white/20"
              >
                Cek Status Pendaftaran
              </Link>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* Gelombang aktif + kuota */}
      <section className="container-page py-12 md:py-16">
        <motion.div
          initial={{ y: 20, opacity: 0 }}
          whileInView={{ y: 0, opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
        >
          <h2 className="text-2xl font-bold text-slate-900 md:text-3xl">
            Gelombang & Kuota
          </h2>
          <p className="mt-2 text-slate-600">
            Informasi gelombang SPMB yang sedang aktif dan sisa kuota per jurusan.
          </p>
        </motion.div>

        {loading ? (
          <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="card animate-pulse">
                <div className="h-4 w-24 rounded bg-slate-200" />
                <div className="mt-3 h-6 w-40 rounded bg-slate-200" />
                <div className="mt-6 h-2 rounded bg-slate-200" />
              </div>
            ))}
          </div>
        ) : !active ? (
          <div className="card mt-8 text-center">
            <p className="text-slate-600">
              Saat ini belum ada gelombang SPMB yang aktif. Silakan cek kembali nanti.
            </p>
          </div>
        ) : (
          <motion.div
            initial={{ y: 20, opacity: 0 }}
            whileInView={{ y: 0, opacity: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="mt-8"
          >
            <div className="card mb-6">
              <div className="flex flex-col items-start justify-between gap-2 md:flex-row md:items-center">
                <div>
                  <span className="badge bg-emerald-100 text-emerald-700">Aktif</span>
                  <h3 className="mt-2 text-xl font-bold text-slate-900">{active.name}</h3>
                  <p className="text-sm text-slate-500">
                    {new Date(active.startDate).toLocaleDateString('id-ID', {
                      day: 'numeric', month: 'long', year: 'numeric',
                    })}
                    {active.endDate &&
                      ` — ${new Date(active.endDate).toLocaleDateString('id-ID', {
                        day: 'numeric', month: 'long', year: 'numeric',
                      })}`}
                  </p>
                </div>
                <Link to="/daftar" className="btn-primary">
                  Daftar di Gelombang Ini
                </Link>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {active.details.map((d, i) => (
                <motion.div
                  key={d.jurusanId}
                  initial={{ y: 20, opacity: 0 }}
                  whileInView={{ y: 0, opacity: 1 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.4, delay: i * 0.05 }}
                  className="card"
                >
                  <span className="badge bg-primary-100 text-primary-700">
                    {d.jurusanCode}
                  </span>
                  <h4 className="mt-2 text-lg font-semibold text-slate-900">
                    {d.jurusanName}
                  </h4>
                  <div className="mt-4">
                    <div className="flex items-baseline justify-between text-sm">
                      <span className="text-slate-500">Sisa Kuota</span>
                      <span className="font-semibold text-slate-900">
                        {d.remaining} / {d.quota}
                      </span>
                    </div>
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200">
                      <motion.div
                        initial={{ width: 0 }}
                        whileInView={{ width: `${(d.used / d.quota) * 100}%` }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.8, delay: 0.2 }}
                        className="h-full bg-gradient-to-r from-primary-500 to-accent-400"
                      />
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}
      </section>

      {/* Langkah Pendaftaran */}
      <section className="bg-slate-100 py-12 md:py-16">
        <div className="container-page">
          <motion.h2
            initial={{ y: 20, opacity: 0 }}
            whileInView={{ y: 0, opacity: 1 }}
            viewport={{ once: true }}
            className="text-2xl font-bold text-slate-900 md:text-3xl"
          >
            Alur Pendaftaran
          </motion.h2>

          <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
            {[
              { n: 1, t: 'Isi Formulir', d: 'Lengkapi formulir pendaftaran online dengan data yang benar.' },
              { n: 2, t: 'Verifikasi Berkas', d: 'Admin sekolah memverifikasi data Anda.' },
              { n: 3, t: 'Input Pembayaran', d: 'Jika lolos, lakukan transfer & input data bukti bayar.' },
              { n: 4, t: 'Siswa Aktif', d: 'Setelah disetujui, Anda resmi menjadi siswa SMK PGRI 3 Denpasar.' },
            ].map((s, i) => (
              <motion.div
                key={s.n}
                initial={{ y: 20, opacity: 0 }}
                whileInView={{ y: 0, opacity: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: i * 0.08 }}
                className="card"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary-500 text-base font-bold text-white">
                  {s.n}
                </div>
                <h3 className="mt-4 font-semibold text-slate-900">{s.t}</h3>
                <p className="mt-1 text-sm text-slate-600">{s.d}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Berita Terbaru */}
      <section className="container-page py-12 md:py-16">
        <motion.div
          initial={{ y: 20, opacity: 0 }}
          whileInView={{ y: 0, opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="flex items-end justify-between gap-4"
        >
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-primary-600">
              <Newspaper size={16} /> Berita
            </div>
            <h2 className="mt-2 text-2xl font-bold text-slate-900 md:text-3xl">Berita Terbaru</h2>
            <p className="mt-2 text-slate-600">Informasi & artikel terbaru dari SMK PGRI 3 Denpasar.</p>
          </div>
        </motion.div>

        {beritaLoading ? (
          <div className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="card animate-pulse overflow-hidden p-0">
                <div className="aspect-square w-full bg-slate-200" />
                <div className="p-4">
                  <div className="h-3 w-20 rounded bg-slate-200" />
                  <div className="mt-3 h-5 w-3/4 rounded bg-slate-200" />
                  <div className="mt-2 h-3 w-full rounded bg-slate-200" />
                  <div className="mt-1 h-3 w-5/6 rounded bg-slate-200" />
                </div>
              </div>
            ))}
          </div>
        ) : berita.length === 0 ? (
          <div className="card mt-8 text-center">
            <p className="text-slate-600">Belum ada berita yang dipublikasikan.</p>
          </div>
        ) : (
          <div className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            {berita.map((b, i) => (
              <motion.div
                key={b.id}
                initial={{ y: 20, opacity: 0 }}
                whileInView={{ y: 0, opacity: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: i * 0.06 }}
              >
                <Link
                  to={`/berita/${b.slug}`}
                  className="group card flex h-full flex-col overflow-hidden p-0 transition hover:shadow-lg"
                >
                  <div className="relative aspect-square w-full overflow-hidden bg-slate-100">
                    {b.foto ? (
                      <img
                        src={fotoUrl(b.foto)}
                        alt={b.judul}
                        loading="lazy"
                        className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                      />
                    ) : (
                      <div className="flex h-full w-full flex-col items-center justify-center text-slate-400">
                        <ImageOff size={28} />
                        <span className="mt-1 text-xs">tidak ada gambar</span>
                      </div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent opacity-0 transition group-hover:opacity-100" />
                    <span className="absolute left-3 top-3 rounded-full bg-white/90 px-2.5 py-0.5 text-[10px] font-semibold text-slate-700 backdrop-blur">
                      Berita
                    </span>
                  </div>
                  <div className="flex flex-1 flex-col p-4">
                    <div className="text-xs text-slate-500">
                      {new Date(b.publishedAt || b.createdAt).toLocaleDateString('id-ID', {
                        day: 'numeric',
                        month: 'long',
                        year: 'numeric',
                      })}
                    </div>
                    <h3 className="mt-1.5 text-base font-semibold leading-snug text-slate-900 group-hover:text-primary-600">
                      {b.judul}
                    </h3>
                    <p className="mt-2 line-clamp-3 flex-1 text-sm text-slate-600">{b.snippet}</p>
                    {b.hashtag?.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-1">
                        {b.hashtag.slice(0, 3).map((h, idx) => (
                          <span
                            key={idx}
                            className="rounded-full bg-primary-50 px-2 py-0.5 text-[10px] font-medium text-primary-700"
                          >
                            {h}
                          </span>
                        ))}
                      </div>
                    )}
                    <div className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-primary-600">
                      Baca selengkapnya <ArrowRight size={12} />
                    </div>
                  </div>
                </Link>
              </motion.div>
            ))}
          </div>
        )}
      </section>
    </motion.div>
  );
}
