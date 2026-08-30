import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Download, X, AlertTriangle, FileSpreadsheet } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../lib/api';

interface JurusanSummary {
  id: string;
  code: string;
  name: string;
  totalSiswaAktif: number;
}

interface Props {
  open: boolean;
  onClose: () => void;
}

/**
 * Modal input parameter untuk export Excel multi-sheet Daftar Ulang.
 *
 * Admin cukup isi 2 angka:
 *   1. Kapasitas maksimal per kelas (default 30) — sistem auto-hitung
 *      jumlah kelas per jurusan = ceil(jumlah siswa / kapasitas).
 *   2. Batas maksimal siswa dari sekolah asal sama per kelas (default 3).
 *
 * Output Excel multi-sheet:
 *   1. Semua data siswa aktif
 *   2. By Sekolah Asal (alfabetis)
 *   3. Ringkasan (kelas + agama counts)
 *   4..N. 1 sheet per kelas (X KL 1, X KL 2, dst)
 *   N+1. 1 sheet per agama (sort by nama depan A→Z, skip agama tanpa siswa)
 */
export default function ExportDaftarUlangModal({ open, onClose }: Props) {
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [jurusanList, setJurusanList] = useState<JurusanSummary[]>([]);
  const [classByJurusan, setClassByJurusan] = useState<Record<string, number>>({});
  const [maxPerKelas, setMaxPerKelas] = useState(3);
  const [kapasitasPerKelas, setKapasitasPerKelas] = useState(30);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    (async () => {
      try {
        // Hitung siswa_aktif per jurusan via endpoint statistik admin (kalau ada),
        // atau ambil dari list pendaftar filtered by status.
        // Simpler: ambil seluruh pendaftar SISWA_AKTIF, group manual di FE.
        const res = await api.get('/pendaftar', {
          params: { status: 'SISWA_AKTIF', pageSize: 1000 },
        });
        const counts: Record<string, JurusanSummary> = {};
        (res.data.items as any[]).forEach((p) => {
          const key = p.jurusan.id;
          if (!counts[key]) {
            counts[key] = {
              id: p.jurusan.id,
              code: p.jurusan.code,
              name: p.jurusan.name,
              totalSiswaAktif: 0,
            };
          }
          counts[key].totalSiswaAktif += 1;
        });
        const list = Object.values(counts).sort((a, b) =>
          a.code.localeCompare(b.code),
        );
        setJurusanList(list);
        // Default jumlah kelas: 1
        const initial: Record<string, number> = {};
        list.forEach((j) => (initial[j.id] = 1));
        setClassByJurusan(initial);
      } catch (e: any) {
        toast.error(e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [open]);

  // Auto-hitung jumlah kelas = ceil(siswa / kapasitas) — update live
  // setiap kali kapasitas berubah atau data pendaftar selesai dimuat.
  useEffect(() => {
    setClassByJurusan((prev) => {
      const next: Record<string, number> = {};
      jurusanList.forEach((j) => {
        next[j.id] = Math.max(1, Math.ceil(j.totalSiswaAktif / kapasitasPerKelas));
      });
      return next;
    });
  }, [kapasitasPerKelas, jurusanList]);

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const res = await api.post<Blob>('/export/daftar-ulang.xlsx', {
        classByJurusan,
        maxFromSameSchool: maxPerKelas,
      }, { responseType: 'blob' });

      // Extract filename dari Content-Disposition (best-effort)
      const dispo = (res.headers as any)['content-disposition'] as string | undefined;
      let filename = `daftar-ulang-${new Date().toISOString().slice(0, 10)}.xlsx`;
      if (dispo) {
        const match = /filename="?([^";]+)"?/.exec(dispo);
        if (match) filename = match[1];
      }

      const blobUrl = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(blobUrl), 30_000);

      toast.success(`Berhasil export ${filename}`);
      onClose();
    } catch (e: any) {
      toast.error(`Gagal export: ${e.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  const totalKelas = Object.values(classByJurusan).reduce((a, b) => a + b, 0);
  const totalSiswa = jurusanList.reduce((a, b) => a + b.totalSiswaAktif, 0);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => !submitting && onClose()}
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="card w-full max-w-2xl p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-1 flex items-center gap-2 text-primary-700">
              <FileSpreadsheet size={22} />
              <h3 className="text-lg font-semibold text-slate-900">
                Export Excel — Daftar Ulang
              </h3>
            </div>
            <p className="mb-4 text-sm text-slate-600">
              Generate file Excel multi-sheet untuk siswa berstatus Siswa Aktif.
              Atur kapasitas per kelas di bawah — sistem otomatis hitung jumlah
              kelas per jurusan dan membagi siswa dengan round-robin (mencegah
              pengelompokan dari sekolah asal sama).
            </p>

            {loading ? (
              <div className="py-8 text-center text-slate-500">
                <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-primary-600" />
                <p className="mt-2 text-sm">Memuat data…</p>
              </div>
            ) : jurusanList.length === 0 ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                <div className="flex items-start gap-2">
                  <AlertTriangle size={18} className="mt-0.5 shrink-0" />
                  <div>
                    <p className="font-medium">Belum ada siswa aktif</p>
                    <p className="mt-0.5 text-amber-700/90">
                      Export tidak bisa dilakukan karena belum ada siswa berstatus Siswa Aktif.
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <>
                {/* Kapasitas per kelas (1 angka, berlaku untuk semua jurusan) */}
                <div className="mb-4">
                  <label className="label">Kapasitas Maksimal per Kelas</label>
                  <input
                    type="number"
                    min={1}
                    max={50}
                    className="input w-32"
                    value={kapasitasPerKelas}
                    onChange={(e) => setKapasitasPerKelas(Math.max(1, Number(e.target.value) || 1))}
                  />
                  <p className="mt-1 text-xs text-slate-500">
                    Berlaku untuk semua jurusan. Sistem auto-hitung jumlah kelas
                    per jurusan = ceil(jumlah siswa / kapasitas). Preview di bawah
                    update otomatis.
                  </p>
                </div>

                {/* Per-jurusan preview (read-only) */}
                <div className="mb-4 max-h-72 space-y-2 overflow-y-auto rounded-lg border border-slate-200 p-3">
                  {jurusanList.map((j) => (
                    <div
                      key={j.id}
                      className="flex items-center justify-between gap-2 rounded border border-slate-100 bg-slate-50 px-3 py-2"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="font-mono text-xs text-slate-500">{j.code}</div>
                        <div className="truncate font-medium text-slate-900">
                          {j.name}
                          <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
                            {j.totalSiswaAktif} siswa
                          </span>
                        </div>
                        <div className="mt-0.5 text-xs text-slate-500">
                          → {classByJurusan[j.id] ?? 1} kelas (kapasitas {kapasitasPerKelas}/kelas)
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <span className="rounded-md bg-primary-50 px-3 py-1 text-sm font-semibold text-primary-700">
                          {classByJurusan[j.id] ?? 1} kelas
                        </span>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Max per kelas */}
                <div className="mb-4">
                  <label className="label">
                    Batas Siswa dari Sekolah Asal Sama per Kelas
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={10}
                    className="input w-32"
                    value={maxPerKelas}
                    onChange={(e) => setMaxPerKelas(Math.max(1, Math.min(10, Number(e.target.value) || 1)))}
                  />
                  <p className="mt-1 text-xs text-slate-500">
                    Default 3. Kalau dalam 1 kelas terlalu banyak siswa dari sekolah yang sama,
                    akan muncul warning di sheet Konversi Kelas.
                  </p>
                </div>

                {/* Summary footer */}
                <div className="mb-5 flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
                  <span className="text-slate-600">
                    Total: <b>{totalSiswa}</b> siswa akan dibagi ke <b>{totalKelas}</b> kelas
                  </span>
                  <span className="rounded-full bg-primary-100 px-2 py-0.5 text-xs font-medium text-primary-700">
                    {jurusanList.length} jurusan
                  </span>
                </div>

                {/* Action */}
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={onClose}
                    disabled={submitting}
                    className="btn-ghost"
                  >
                    <X size={16} />
                    Batal
                  </button>
                  <button
                    type="button"
                    onClick={handleSubmit}
                    disabled={submitting || totalKelas === 0}
                    className="btn-primary"
                  >
                    <Download size={16} />
                    {submitting ? 'Generating…' : 'Generate & Download'}
                  </button>
                </div>
              </>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}