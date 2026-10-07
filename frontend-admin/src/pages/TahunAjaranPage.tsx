import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Archive,
  AlertTriangle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  RefreshCw,
  Users,
  CalendarDays,
  Layers,
} from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../lib/api';

/**
 * Halaman "Arsip & Reset Tahun Ajaran" — SUPERADMIN ONLY.
 *
 * TUJUAN:
 *   Setiap akhir tahun ajaran, Superadmin melakukan reset data operasional
 *   SPMB untuk tahun ajaran baru. Sebelum reset, data di-archive ke Excel.
 *
 * ALUR UI (3 tahap konfirmasi untuk cegah fat-finger):
 *   1. Halaman summary menampilkan count data saat ini
 *   2. Klik "Arsipkan & Reset" → modal konfirmasi pertama (review counts)
 *   3. Modal kedua: ketik frasa "ARSIPKAN DAN RESET" untuk enable tombol
 *
 * ENDPOINT BACKEND:
 *   GET  /tahun-ajaran/summary
 *   POST /tahun-ajaran/archive-and-reset  body: { confirmation: "ARSIPKAN DAN RESET" }
 */

interface TahunAjaranSummary {
  tahunAjaranLabel: string;
  lastArchivedAt: string | null;
  counts: {
    pendaftar: number;
    gelombang: number;
    kuotaGelombang: number;
    pendaftarByStatus: Array<{ status: string; count: number }>;
  };
}

interface ArchiveResult {
  tahunAjaranLabel: string;
  archiveFilePath: string;
  archiveFileSizeBytes: number;
  archived: { pendaftar: number; gelombang: number; kuotaGelombang: number };
  deleted: { pendaftar: number; gelombang: number; kuotaGelombang: number };
}

const STATUS_LABELS: Record<string, string> = {
  MENUNGGU_PERSETUJUAN: 'Belum Daftar Ulang',
  MENUNGGU_PEMBAYARAN: 'Menunggu Pembayaran',
  MENUNGGU_UKURAN_BAJU: 'Menunggu Ukuran Baju',
  DITOLAK: 'Ditolak',
  SISWA_AKTIF: 'Siswa Aktif',
};

const STATUS_COLORS: Record<string, string> = {
  MENUNGGU_PERSETUJUAN: 'bg-slate-100 text-slate-700',
  MENUNGGU_PEMBAYARAN: 'bg-amber-100 text-amber-700',
  MENUNGGU_UKURAN_BAJU: 'bg-blue-100 text-blue-700',
  DITOLAK: 'bg-rose-100 text-rose-700',
  SISWA_AKTIF: 'bg-emerald-100 text-emerald-700',
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    return d.toLocaleString('id-ID', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export default function TahunAjaranPage() {
  const [summary, setSummary] = useState<TahunAjaranSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [showConfirm, setShowConfirm] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [processing, setProcessing] = useState(false);
  const [lastResult, setLastResult] = useState<ArchiveResult | null>(null);

  const REQUIRED_TEXT = 'ARSIPKAN DAN RESET';

  const load = async () => {
    setLoading(true);
    try {
      const r = await api.get<TahunAjaranSummary>('/tahun-ajaran/summary');
      setSummary(r.data);
    } catch (e: any) {
      toast.error(e?.response?.data?.message ?? 'Gagal memuat summary');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleArchiveAndReset = async () => {
    if (confirmText !== REQUIRED_TEXT) {
      toast.error(`Ketik persis "${REQUIRED_TEXT}" untuk konfirmasi`);
      return;
    }
    setProcessing(true);
    try {
      const r = await api.post<ArchiveResult>('/tahun-ajaran/archive-and-reset', {
        confirmation: REQUIRED_TEXT,
      });
      toast.success(`Arsip tersimpan: ${r.data.archiveFilePath}`);
      setLastResult(r.data);
      setShowConfirm(false);
      setConfirmText('');
      load();
    } catch (e: any) {
      toast.error(
        e?.response?.data?.message ?? e?.message ?? 'Gagal arsipkan & reset',
      );
    } finally {
      setProcessing(false);
    }
  };

  if (loading && !summary) {
    return (
      <div className="flex h-64 items-center justify-center text-slate-500">
        <RefreshCw className="mr-2 animate-spin" size={20} />
        Memuat summary…
      </div>
    );
  }

  if (!summary) return null;

  const hasData =
    summary.counts.pendaftar > 0 ||
    summary.counts.gelombang > 0 ||
    summary.counts.kuotaGelombang > 0;

  return (
    <div className="space-y-6">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900">
            <Archive className="text-primary-600" size={24} />
            Arsip & Reset Tahun Ajaran
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Generate file Excel arsip, lalu reset data operasional SPMB untuk
            tahun ajaran baru.
          </p>
        </div>
        <button onClick={load} className="btn-ghost shrink-0">
          <RefreshCw size={14} />
          Refresh
        </button>
      </div>

      {/* ── Tahun Ajaran Aktif ─────────────────────────────────────────── */}
      <div className="card">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-100">
            <CalendarDays className="text-primary-600" size={20} />
          </div>
          <div className="flex-1">
            <div className="text-xs uppercase tracking-wide text-slate-500">
              Tahun Ajaran Aktif
            </div>
            <div className="text-2xl font-bold text-slate-900">
              {summary.tahunAjaranLabel}
            </div>
            <div className="mt-1 text-sm text-slate-600">
              Arsip terakhir:{' '}
              <span className="font-medium text-slate-700">
                {formatDate(summary.lastArchivedAt)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Summary Counts ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <SummaryCard
          icon={<Users />}
          label="Total Pendaftar"
          value={summary.counts.pendaftar}
          tone="primary"
        />
        <SummaryCard
          icon={<CalendarDays />}
          label="Gelombang"
          value={summary.counts.gelombang}
          tone="blue"
        />
        <SummaryCard
          icon={<Layers />}
          label="Kuota Gelombang"
          value={summary.counts.kuotaGelombang}
          tone="amber"
        />
      </div>

      {/* ── Breakdown Status ───────────────────────────────────────────── */}
      {summary.counts.pendaftarByStatus.length > 0 && (
        <div className="card">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700">
            <FileSpreadsheet size={16} />
            Breakdown Status Pendaftar
          </h3>
          <div className="flex flex-wrap gap-2">
            {summary.counts.pendaftarByStatus.map((s) => (
              <span
                key={s.status}
                className={`badge ${
                  STATUS_COLORS[s.status] ?? 'bg-slate-100 text-slate-700'
                }`}
              >
                {STATUS_LABELS[s.status] ?? s.status}: {s.count}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* ── Result banner (setelah sukses reset) ───────────────────────── */}
      {lastResult && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="card border-emerald-200 bg-emerald-50"
        >
          <div className="flex items-start gap-3">
            <CheckCircle2 className="text-emerald-600" size={20} />
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-emerald-900">
                Arsip & Reset Berhasil
              </h3>
              <p className="mt-1 text-sm text-emerald-800">
                File Excel tersimpan di{' '}
                <code className="rounded bg-emerald-100 px-1.5 py-0.5 text-xs">
                  {lastResult.archiveFilePath}
                </code>{' '}
                ({formatBytes(lastResult.archiveFileSizeBytes)}).
              </p>
              <p className="mt-1 text-xs text-emerald-700">
                Diarsipkan: {lastResult.archived.pendaftar} pendaftar,{' '}
                {lastResult.archived.gelombang} gelombang,{' '}
                {lastResult.archived.kuotaGelombang} kuota. Dihapus:{' '}
                {lastResult.deleted.pendaftar} pendaftar,{' '}
                {lastResult.deleted.gelombang} gelombang,{' '}
                {lastResult.deleted.kuotaGelombang} kuota.
              </p>
            </div>
          </div>
        </motion.div>
      )}

      {/* ── Aksi Utama ─────────────────────────────────────────────────── */}
      <div className="card">
        <h3 className="text-base font-semibold text-slate-900">Aksi</h3>
        <p className="mt-1 text-sm text-slate-600">
          Klik tombol di bawah jika Anda siap melakukan arsip & reset. Data
          User, Jurusan, Berita, Pengumuman, dan Setting TIDAK dihapus —
          hanya Pendaftar, Gelombang, dan Kuota Gelombang.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <button
            onClick={() => setShowConfirm(true)}
            disabled={!hasData || processing}
            className="btn-primary bg-rose-600 hover:bg-rose-700 disabled:opacity-50"
          >
            <Archive size={16} />
            Arsipkan & Reset
          </button>
          {!hasData && (
            <span className="text-sm text-slate-500">
              Tidak ada data untuk diarsipkan (semua sudah 0).
            </span>
          )}
        </div>
      </div>

      {/* ── Modal Konfirmasi (2 tahap) ─────────────────────────────────── */}
      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="card w-full max-w-lg"
          >
            <div className="mb-3 flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-rose-100">
                <AlertTriangle className="text-rose-600" size={20} />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-slate-900">
                  Konfirmasi Arsip & Reset
                </h3>
                <p className="mt-1 text-sm text-slate-600">
                  Tindakan ini <b>tidak bisa dibatalkan</b>. Data berikut akan
                  diarsipkan ke file Excel lalu dihapus dari database:
                </p>
                <ul className="mt-2 space-y-1 text-sm text-slate-700">
                  <li>
                    • <b>{summary.counts.pendaftar}</b> baris Pendaftar (termasuk
                    data bayar & ukuran baju)
                  </li>
                  <li>
                    • <b>{summary.counts.gelombang}</b> Gelombang
                  </li>
                  <li>
                    • <b>{summary.counts.kuotaGelombang}</b> Kuota Gelombang
                  </li>
                </ul>
                <p className="mt-2 text-xs text-slate-600">
                  💡 User, Jurusan, Berita, Pengumuman, dan Setting{' '}
                  <b>tidak dihapus</b> — hanya data operasional SPMB.
                </p>
              </div>
            </div>

            <div className="mt-4 rounded-lg bg-amber-50 p-3">
              <label className="block text-xs font-medium text-slate-700">
                Untuk konfirmasi, ketik:{' '}
                <code className="rounded bg-amber-100 px-1.5 py-0.5 text-xs">
                  {REQUIRED_TEXT}
                </code>
              </label>
              <input
                type="text"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder={REQUIRED_TEXT}
                className="input mt-2 w-full"
                autoFocus
                disabled={processing}
              />
            </div>

            <div className="mt-4 flex justify-end gap-2 border-t border-slate-100 pt-3">
              <button
                type="button"
                onClick={() => {
                  setShowConfirm(false);
                  setConfirmText('');
                }}
                disabled={processing}
                className="btn-ghost"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleArchiveAndReset}
                disabled={confirmText !== REQUIRED_TEXT || processing}
                className="btn-primary bg-rose-600 hover:bg-rose-700 disabled:opacity-50"
              >
                {processing ? (
                  <>
                    <RefreshCw className="animate-spin" size={14} />
                    Memproses…
                  </>
                ) : (
                  <>
                    <Download size={14} />
                    Arsipkan & Reset Sekarang
                  </>
                )}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}

function SummaryCard({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  tone: 'primary' | 'blue' | 'amber';
}) {
  const toneClass: Record<typeof tone, string> = {
    primary: 'bg-primary-100 text-primary-700',
    blue: 'bg-blue-100 text-blue-700',
    amber: 'bg-amber-100 text-amber-700',
  };
  return (
    <div className="card">
      <div className="flex items-center gap-3">
        <div
          className={`flex h-10 w-10 items-center justify-center rounded-lg ${toneClass[tone]}`}
        >
          {icon}
        </div>
        <div>
          <div className="text-xs uppercase tracking-wide text-slate-500">
            {label}
          </div>
          <div className="text-2xl font-bold text-slate-900">{value}</div>
        </div>
      </div>
    </div>
  );
}