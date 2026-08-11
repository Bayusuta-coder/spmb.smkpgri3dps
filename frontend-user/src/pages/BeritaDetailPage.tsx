import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, Calendar, Hash, ImageOff } from 'lucide-react';
import { toast } from 'sonner';
import { api, fotoUrl } from '../lib/api';
import PageContainer from '../components/PageContainer';

interface Berita {
  id: string;
  judul: string;
  slug: string;
  foto: string;
  isi: string;
  hashtag: string[];
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export default function BeritaDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const [berita, setBerita] = useState<Berita | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!slug) return;
    (async () => {
      setLoading(true);
      setNotFound(false);
      try {
        const res = await api.get<Berita>(`/berita/public/${slug}`);
        setBerita(res.data);
      } catch (e: any) {
        if (e?.message?.toLowerCase().includes('not found')) {
          setNotFound(true);
        } else {
          toast.error(e?.message || 'Gagal memuat berita');
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [slug]);

  if (loading) {
    return (
      <PageContainer>
        <div className="card animate-pulse">
          <div className="h-56 w-full rounded-lg bg-slate-200" />
          <div className="mt-4 h-7 w-3/4 rounded bg-slate-200" />
          <div className="mt-3 h-4 w-1/3 rounded bg-slate-200" />
          <div className="mt-6 space-y-2">
            <div className="h-3 w-full rounded bg-slate-200" />
            <div className="h-3 w-full rounded bg-slate-200" />
            <div className="h-3 w-5/6 rounded bg-slate-200" />
          </div>
        </div>
      </PageContainer>
    );
  }

  if (notFound || !berita) {
    return (
      <PageContainer>
        <div className="card py-16 text-center">
          <h1 className="text-2xl font-bold text-slate-900">Berita tidak ditemukan</h1>
          <p className="mt-2 text-slate-600">
            Artikel yang Anda cari mungkin telah dihapus atau beritanya belum dipublikasikan.
          </p>
          <Link to="/" className="btn-primary mt-6 inline-flex">
            <ArrowLeft size={14} /> Kembali ke Beranda
          </Link>
        </div>
      </PageContainer>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
    >
      <PageContainer>
        <button
          onClick={() => navigate(-1)}
          className="mb-4 inline-flex items-center gap-2 text-sm font-medium text-slate-600 transition hover:text-primary-600"
        >
          <ArrowLeft size={16} /> Kembali
        </button>

        <article className="card overflow-hidden p-0">
          {/* Foto utama — hero 21:9 (landscape lebar) untuk halaman detail */}
          {berita.foto ? (
            <div className="relative aspect-[21/9] w-full overflow-hidden bg-slate-100">
              <img
                src={fotoUrl(berita.foto)}
                alt={berita.judul}
                className="h-full w-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent" />
            </div>
          ) : (
            <div className="flex aspect-[21/9] w-full items-center justify-center bg-slate-100 text-slate-400">
              <ImageOff size={32} />
            </div>
          )}

          <div className="p-6 md:p-8">
            <h1 className="text-2xl font-bold leading-tight text-slate-900 md:text-4xl">
              {berita.judul}
            </h1>

            <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-slate-500">
              <span className="inline-flex items-center gap-1.5">
                <Calendar size={12} />
                {new Date(berita.publishedAt || berita.createdAt).toLocaleDateString('id-ID', {
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                })}
              </span>
              {berita.hashtag?.length > 0 && (
                <span className="inline-flex items-center gap-1.5">
                  <Hash size={12} />
                  {berita.hashtag.length} tag
                </span>
              )}
            </div>

            {berita.hashtag?.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-2">
                {berita.hashtag.map((h, i) => (
                  <span
                    key={i}
                    className="rounded-full bg-primary-50 px-3 py-1 text-xs font-medium text-primary-700"
                  >
                    {h}
                  </span>
                ))}
              </div>
            )}

            <div className="my-6 h-px bg-slate-100" />

            <div className="prose prose-slate max-w-none">
              <p className="whitespace-pre-line text-base leading-relaxed text-slate-700 md:text-lg">
                {berita.isi}
              </p>
            </div>
          </div>
        </article>

        <div className="mt-6 text-center">
          <Link to="/" className="btn-primary inline-flex">
            <ArrowLeft size={14} /> Kembali ke Beranda
          </Link>
        </div>
      </PageContainer>
    </motion.div>
  );
}
