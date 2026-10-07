import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Banknote,
  Save,
  RefreshCw,
  History,
  ArrowRight,
  ShieldAlert,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../lib/api';
import { formatRupiah } from '../lib/constants';
import { useAuth } from '../context/AuthContext';

/**
 * Section "Pengaturan Harga Pendaftaran" — reusable untuk halaman manapun
 * yang butuh menampilkan & mengedit harga daftar ulang global.
 *
 * Dipakai di:
 *   - frontend-admin/src/pages/PengaturanHargaPage.tsx (route /pengaturan-harga, halaman dedicated Superadmin)
 *     → tampil PENUH: form edit + Riwayat Perubahan harga
 *   - frontend-admin/src/pages/RekapPendapatanPage.tsx (route /rekap-pendapatan, halaman Bendahara — embed di atas summary cards)
 *     → tampil RINGKAS: hanya form edit/display harga, TANPA Riwayat Perubahan
 *     (Riwayat Perubahan harga sengaja TIDAK ditampilkan di sini —
 *     lihat/showHistory di halaman dedicated Pengaturan Harga saja supaya
 *     Bendahara tidak bingung dengan log internal Superadmin)
 *
 * Permission gating:
 *   - settings.view  → lihat harga saat ini
 *   - settings.manage → edit harga (hanya Superadmin per seed.ts)
 *
 * History perubahan disimpan via AuditLog oleh backend (entityId='harga_daftar_ulang'),
 * jadi tidak ada tabel/field DB baru di sini.
 */

export interface HargaMeta {
  value: number;
  updatedAt: string | null;
  updatedByNama: string | null;
  updatedByEmail: string | null;
}

export interface HargaAuditEntry {
  id: string;
  action: string;
  createdAt: string;
  userName: string | null;
  userEmail: string | null;
  meta: { oldValue: number; newValue: number };
}

function formatDateTime(iso: string | null) {
  if (!iso) return '-';
  return new Date(iso).toLocaleString('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

interface PengaturanHargaSectionProps {
  /**
   * Mode compact — header lebih kecil, layout 2 kolom tetap.
   * Hanya relevan secara visual; showHistory di-control terpisah di bawah.
   */
  compact?: boolean;
  /**
   * Tampilkan blok "Riwayat Perubahan Harga" (collapsible, default expanded
   * di halaman dedicated / collapsed di compact mode).
   *
   * - true  (default) → halaman dedicated PengaturanHarga (Superadmin):
   *                     history lengkap untuk audit internal.
   * - false           → embed di menu Bendahara (RekapPendapatan):
   *                     history log internal disembunyikan, supaya Bendahara
   *                     fokus ke operasional pencatatan pembayaran saja.
   */
  showHistory?: boolean;
}

export default function PengaturanHargaSection({
  compact = false,
  showHistory = true,
}: PengaturanHargaSectionProps) {
  const { hasPermission } = useAuth();
  const canView = hasPermission('settings.view');
  const canEdit = hasPermission('settings.manage');

  const [current, setCurrent] = useState<HargaMeta | null>(null);
  const [inputValue, setInputValue] = useState<string>('');
  const [history, setHistory] = useState<HargaAuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  // Di mode compact, history defaultnya collapsed supaya tidak terlalu makan tempat.
  const [historyOpen, setHistoryOpen] = useState(!compact);

  const load = async () => {
    setLoading(true);
    try {
      const [hargaRes, auditRes] = await Promise.all([
        api.get<HargaMeta>('/settings/harga-daftar-ulang'),
        // Hanya fetch audit log kalau showHistory=true (hemat 1 HTTP call
        // saat di-embed di Bendahara yang tidak butuh log internal).
        showHistory
          ? api.get<{ items: HargaAuditEntry[] }>('/settings/audit-log', {
              params: { key: 'harga_daftar_ulang', pageSize: 20 },
            })
          : Promise.resolve({ data: { items: [] as HargaAuditEntry[] } } as any),
      ]);
      setCurrent(hargaRes.data);
      setInputValue(String(hargaRes.data.value));
      setHistory(auditRes.data?.items ?? []);
    } catch (e: any) {
      toast.error(e?.message ?? 'Gagal memuat pengaturan harga');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSave = async () => {
    const cleaned = inputValue.replace(/[^0-9]/g, '');
    const numeric = Number(cleaned);
    if (!Number.isFinite(numeric) || numeric <= 0) {
      toast.error('Nominal harus angka lebih dari 0');
      return;
    }
    if (numeric > 100_000_000) {
      toast.error('Nominal terlalu besar (maks Rp 100.000.000)');
      return;
    }

    setSaving(true);
    try {
      const res = await api.put<{ value: number; oldValue: number }>(
        '/settings/harga-daftar-ulang',
        { value: numeric },
      );
      toast.success(
        `Harga daftar ulang diperbarui: ${formatRupiah(res.data.oldValue)} → ${formatRupiah(res.data.value)}`,
      );
      await load();
      // Auto-expand history supaya user langsung lihat perubahannya tercatat
      setHistoryOpen(true);
    } catch (e: any) {
      const msg = e?.response?.data?.message || e?.message || 'Gagal menyimpan';
      toast.error(Array.isArray(msg) ? msg.join(', ') : msg);
    } finally {
      setSaving(false);
    }
  };

  // User tanpa settings.view → jangan render apa-apa (sidebar akan hide route-nya juga)
  if (!canView) return null;

  return (
    <motion.div
      initial={{ y: 8, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      className="card"
    >
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className="rounded-lg bg-emerald-50 p-2 text-emerald-700">
          <Banknote size={compact ? 18 : 20} />
        </div>
        <div className="flex-1">
          <h2 className={`font-semibold text-slate-900 ${compact ? 'text-sm' : 'text-base'}`}>
            Pengaturan Harga Pendaftaran
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">
            {canEdit
              ? 'Nominal ini otomatis terisi di form Catat Pembayaran Bendahara dan ter-snapshot saat pembayaran dicatat.'
              : 'Nominal default yang dipakai saat Bendahara mencatat pembayaran siswa.'}
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="btn-ghost"
          title="Refresh"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      <div className={`mt-4 grid grid-cols-1 gap-4 ${compact ? 'md:grid-cols-2' : 'md:grid-cols-2'}`}>
        {/* Nilai saat ini (read-only display) */}
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
          <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Harga Saat Ini
          </div>
          <div className={`mt-1 font-bold text-slate-900 ${compact ? 'text-xl' : 'text-2xl'}`}>
            {loading
              ? '...'
              : current && current.value > 0
                ? formatRupiah(current.value)
                : <span className="text-amber-600">Belum diatur</span>}
          </div>
          {current?.updatedAt && (
            <div className="mt-2 text-xs text-slate-500">
              Terakhir diubah:{' '}
              <span className="font-medium text-slate-700">
                {formatDateTime(current.updatedAt)}
              </span>
              {current.updatedByNama && (
                <>
                  {' '}oleh{' '}
                  <span className="font-medium text-slate-700">
                    {current.updatedByNama}
                  </span>
                </>
              )}
            </div>
          )}
          {!current?.updatedAt && !loading && current?.value === 0 && (
            <div className="mt-2 text-xs text-amber-600">
              Belum ada harga yang diset. Superadmin harus mengatur nominal agar form
              Catat Pembayaran terisi otomatis.
            </div>
          )}
        </div>

        {/* Form edit (read-only untuk non-Superadmin) */}
        <div className={`rounded-lg border border-slate-200 p-4 ${!canEdit ? 'bg-slate-50' : ''}`}>
          <label
            htmlFor="harga-input"
            className="block text-xs font-medium uppercase tracking-wide text-slate-500"
          >
            {canEdit ? 'Nominal Baru' : 'Nominal (read-only)'}
          </label>
          <div className="relative mt-2">
            <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-sm font-medium text-slate-500">
              Rp
            </span>
            <input
              id="harga-input"
              type="text"
              inputMode="numeric"
              disabled={!canEdit || saving}
              value={inputValue}
              onChange={(e) => {
                const digits = e.target.value.replace(/[^0-9]/g, '');
                const formatted = digits
                  ? Number(digits).toLocaleString('id-ID')
                  : '';
                setInputValue(formatted);
              }}
              placeholder="350000"
              className="input w-full pl-10 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400"
            />
          </div>
          <div className="mt-3 flex items-center justify-between">
            <span className="text-xs text-slate-500">
              Preview:{' '}
              <span className="font-semibold text-slate-700">
                {inputValue.replace(/[^0-9]/g, '')
                  ? formatRupiah(Number(inputValue.replace(/[^0-9]/g, '')))
                  : '-'}
              </span>
            </span>
            {canEdit && (
              <button
                type="button"
                onClick={handleSave}
                disabled={saving || loading}
                className="btn-primary"
                title="Simpan perubahan"
              >
                <Save size={14} />
                {saving ? 'Menyimpan...' : 'Simpan Harga'}
              </button>
            )}
          </div>
        </div>
      </div>

      {!canEdit && (
        <div className="mt-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          <ShieldAlert size={14} className="mt-0.5 shrink-0" />
          <span>
            Anda login dengan role yang tidak memiliki izin{' '}
            <code className="font-mono">settings.manage</code>. Hanya Superadmin
            yang dapat mengubah nominal harga — Bendahara hanya bisa melihat.
          </span>
        </div>
      )}

      {/* History perubahan (collapsible) — hanya di halaman dedicated.
          Di menu Bendahara (showHistory=false) blok ini tidak di-render
          supaya Bendahara fokus ke operasional, dan log audit internal
          tidak ikut campur di menu pencatatan pembayaran. */}
      {showHistory && (
      <div className="mt-4 border-t border-slate-200 pt-3">
        <button
          type="button"
          onClick={() => setHistoryOpen((v) => !v)}
          className="flex w-full items-center justify-between text-left"
        >
          <span className="flex items-center gap-2 text-sm font-medium text-slate-700">
            <History size={14} className="text-slate-500" />
            Riwayat Perubahan
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
              {history.length}
            </span>
          </span>
          {historyOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>

        {historyOpen && (
          <div className="mt-3">
            {loading ? (
              <div className="py-4 text-center text-xs text-slate-400">Memuat...</div>
            ) : history.length === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-200 px-4 py-6 text-center text-xs text-slate-400">
                Belum ada perubahan harga yang tercatat.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 text-left uppercase tracking-wide text-slate-500">
                      <th className="py-2 pr-3 font-medium">Waktu</th>
                      <th className="py-2 pr-3 font-medium">Diubah Oleh</th>
                      <th className="py-2 pr-3 font-medium">Harga Lama</th>
                      <th className="py-2 pr-3 font-medium">Harga Baru</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((h) => (
                      <tr
                        key={h.id}
                        className="border-b border-slate-100 last:border-0"
                      >
                        <td className="py-2 pr-3 text-slate-700">
                          {formatDateTime(h.createdAt)}
                        </td>
                        <td className="py-2 pr-3">
                          <div className="font-medium text-slate-900">
                            {h.userName ?? '(user dihapus)'}
                          </div>
                          {h.userEmail && (
                            <div className="text-[10px] text-slate-500">{h.userEmail}</div>
                          )}
                        </td>
                        <td className="py-2 pr-3 text-slate-600">
                          {formatRupiah(h.meta?.oldValue ?? 0)}
                        </td>
                        <td className="py-2 pr-3">
                          <span className="inline-flex items-center gap-1">
                            <ArrowRight size={12} className="text-slate-400" />
                            <span className="font-semibold text-emerald-700">
                              {formatRupiah(h.meta?.newValue ?? 0)}
                            </span>
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
      )}
    </motion.div>
  );
}
