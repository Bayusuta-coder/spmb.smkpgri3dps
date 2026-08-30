import { useEffect, useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, ChevronRight, X, Megaphone, ImageOff } from 'lucide-react';
import { api, fotoUrl } from '../lib/api';

interface PengumumanItem {
  id: string;
  judul: string;
  foto: string;
}

const SESSION_KEY = 'spmb_pengumuman_dismissed_v1';
const AUTO_SLIDE_MS = 3000; // 3 detik per slide (konsisten, tanpa jeda)

/**
 * Popup pengumuman — Instagram-style carousel dengan auto-slide MURNI.
 *
 * Behavior:
 * - Auto-advance tiap AUTO_SLIDE_MS (3 detik) — looping tanpa henti
 * - TIDAK ada pause-on-hover, TIDAK ada pause-after-manual-interaction
 * - Klik arrow/dot cuma pindah slide, lalu auto-slide lanjut dari situ
 * - Dismiss = sekali per sesi (sessionStorage)
 * - Backdrop blur + spring scale-in
 * - Lock body scroll saat modal terbuka
 *
 * Implementation note:
 * - Timer pakai setInterval di useEffect dengan deps [open, items.length]
 *   (item count berubah = reset, tapi per-slide transition TIDAK restart
 *   timer; user interaction cuma setIndex, bukan trigger re-render effect)
 * - Untuk menjamin timer konsisten, kita pakai ref untuk index setter
 *   sehingga callback setInterval tidak bergantung pada state index saat
 *   effect pertama kali jalan.
 */
export default function PengumumanModal() {
  const [items, setItems] = useState<PengumumanItem[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [index, setIndex] = useState(0);
  const [imgBroken, setImgBroken] = useState<Record<string, boolean>>({});

  // Fetch
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (sessionStorage.getItem(SESSION_KEY) === '1') {
      setLoading(false);
      return;
    }
    (async () => {
      try {
        const res = await api.get<PengumumanItem[]>('/pengumuman/public/active');
        if (res.data && res.data.length > 0) {
          setItems(res.data);
          setOpen(true);
        }
      } catch (e) {
        // silent — popup tidak boleh mengganggu UX
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const close = useCallback(() => {
    setOpen(false);
    try {
      sessionStorage.setItem(SESSION_KEY, '1');
    } catch {}
  }, []);

  /** Manual nav: set index, lalu auto-slide lanjut dari situ. */
  const next = useCallback(() => {
    setIndex((i) => (i + 1) % Math.max(items.length, 1));
  }, [items.length]);

  const prev = useCallback(() => {
    setIndex((i) => (i - 1 + Math.max(items.length, 1)) % Math.max(items.length, 1));
  }, [items.length]);

  const goTo = useCallback((i: number) => {
    setIndex(i);
  }, []);

  // Auto-slide MURNI — jalan terus kecuali modal tertutup / belum ada item
  // PASTI konsisten 3 detik, tidak dipengaruhi hover/klik apa pun.
  useEffect(() => {
    if (!open) return;
    if (items.length <= 1) return; // Single item: no need to advance

    const id = setInterval(() => {
      setIndex((i) => (i + 1) % items.length);
    }, AUTO_SLIDE_MS);

    return () => clearInterval(id);
  }, [open, items.length]);

  // Keyboard nav (tidak jeda auto-slide)
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
      if (items.length > 1) {
        if (e.key === 'ArrowRight') next();
        if (e.key === 'ArrowLeft') prev();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, items.length, close, next, prev]);

  // Lock body scroll saat modal terbuka
  useEffect(() => {
    if (open) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = prev;
      };
    }
  }, [open]);

  if (loading) return null;
  if (!open || items.length === 0) return null;

  const current = items[index];
  const showBroken = imgBroken[current.id];

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="pengumuman-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/70 p-3 backdrop-blur-md sm:p-6"
          onClick={close}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0, y: 16 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.92, opacity: 0, y: 8 }}
            transition={{ duration: 0.28, type: 'spring', stiffness: 280, damping: 24 }}
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-black/5"
          >
            {/* Close button (top-right, floating sobre card) */}
            <button
              onClick={close}
              aria-label="Tutup"
              className="absolute right-3 top-3 z-10 rounded-full bg-black/40 p-2 text-white backdrop-blur transition hover:bg-black/60"
            >
              <X size={18} />
            </button>

            {/* Hero image — 1:1 Instagram-style */}
            <div className="relative aspect-square w-full overflow-hidden bg-slate-100">
              <AnimatePresence mode="wait">
                <motion.div
                  key={current.id}
                  initial={{ opacity: 0, x: 24 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -24 }}
                  transition={{ duration: 0.35, ease: 'easeInOut' }}
                  className="absolute inset-0"
                >
                  {showBroken ? (
                    <div className="flex h-full w-full flex-col items-center justify-center bg-slate-100 text-slate-400">
                      <ImageOff size={48} />
                      <span className="mt-2 text-xs">Gambar tidak tersedia</span>
                    </div>
                  ) : (
                    <img
                      src={fotoUrl(current.foto)}
                      alt={current.judul}
                      loading="eager"
                      className="h-full w-full object-cover"
                      onError={() =>
                        setImgBroken((m) => ({ ...m, [current.id]: true }))
                      }
                    />
                  )}

                  {/* Gradient overlay — title readable di atas gambar */}
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent p-4 pt-16">
                    <div className="mb-1 inline-flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white backdrop-blur">
                      <Megaphone size={10} />
                      Pengumuman
                    </div>
                    <h3 className="mt-1 text-base font-bold leading-snug text-white drop-shadow-md sm:text-lg">
                      {current.judul}
                    </h3>
                  </div>
                </motion.div>
              </AnimatePresence>

              {/* Prev / Next (floating) — manual nav, auto-slide lanjut */}
              {items.length > 1 && (
                <>
                  <button
                    onClick={prev}
                    aria-label="Sebelumnya"
                    className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-white/90 p-2 text-slate-700 shadow-lg transition hover:bg-white"
                  >
                    <ChevronLeft size={18} />
                  </button>
                  <button
                    onClick={next}
                    aria-label="Selanjutnya"
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-white/90 p-2 text-slate-700 shadow-lg transition hover:bg-white"
                  >
                    <ChevronRight size={18} />
                  </button>
                </>
              )}
            </div>

            {/* Footer — pagination dots + counter */}
            <div className="flex items-center justify-between gap-3 bg-white px-4 py-3">
              <div className="flex items-center gap-1.5">
                {items.map((p, i) => (
                  <button
                    key={p.id}
                    onClick={() => goTo(i)}
                    aria-label={`Slide ${i + 1}`}
                    className={`h-1.5 rounded-full transition-all ${
                      i === index ? 'w-6 bg-primary-500' : 'w-1.5 bg-slate-300 hover:bg-slate-400'
                    }`}
                  />
                ))}
              </div>
              <div className="flex items-center gap-2">
                {items.length > 1 && (
                  <span className="text-xs font-medium text-slate-500">
                    {index + 1}/{items.length}
                  </span>
                )}
                <button
                  onClick={close}
                  className="rounded-full bg-slate-900 px-4 py-1.5 text-xs font-semibold text-white transition hover:bg-slate-800"
                >
                  Tutup
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
