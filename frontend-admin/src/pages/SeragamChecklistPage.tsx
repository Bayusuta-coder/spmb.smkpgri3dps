import { useEffect, useMemo, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft,
  Shirt,
  Printer,
  Download,
  Check,
  Save,
  AlertTriangle,
  Calendar,
  User,
  ListChecks,
  CheckCircle2,
  RefreshCw,
} from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { CustomSelect } from '../components/CustomSelect';
import {
  UKURAN_BAJU_OPTIONS,
  STATUS_LABELS,
  STATUS_COLORS,
} from '../lib/constants';

interface PendaftarInfo {
  id: string;
  registrationNumber: string;
  namaLengkap: string;
  jenisKelamin: 'L' | 'P';
  /** Status pendaftar — dipakai untuk deteksi re-edit Siswa Aktif (Opsi A). */
  status?: StatusPendaftar;
  ukuranBajuPendaftar: string | null;
  jurusan: { code: string; name: string };
  gelombang: { name: string };
}

type StatusPendaftar =
  | 'MENUNGGU_PERSETUJUAN'
  | 'MENUNGGU_PEMBAYARAN'
  | 'MENUNGGU_UKURAN_BAJU'
  | 'DITOLAK'
  | 'SISWA_AKTIF';

interface ChecklistItem {
  id?: string;
  itemMasterId: string;
  nama: string;
  urutan: number;
  sudahDidapat: boolean;
  keterangan: string | null;
  isActive: boolean;
}

interface ChecklistInfo {
  id: string;
  ukuran: string;
  tanggalPengambilan: string;
  penerimaNama: string | null;
  petugasNama: string | null;
  petugasEmail: string | null;
  updatedAt: string;
  items: ChecklistItem[];
}

interface ChecklistResponse {
  pendaftar: PendaftarInfo;
  checklist: ChecklistInfo | null;
  availableItemMasters: Array<{ id: string; nama: string; urutan: number; isActive: boolean }>;
}

/**
 * =====================================================================
 * HALAMAN FORMULIR PENGAMBILAN SERAGAM (TU) — Batch D
 * =====================================================================
 *
 * Tujuan: Form checklist seragam per siswa yang MIRIP formulir kertas
 * fisik sekolah. Diakses via route `/pendaftar/:id/seragam`.
 *
 * AKSES: spmb.checklist_seragam.manage (TU) atau .view (untuk lihat saja)
 *        + spmb.seragam_item.manage (Superadmin fallback).
 *
 * Alur:
 *   1. Mount → fetch GET /seragam/checklist/:pendaftarId
 *      → dapat data pendaftar + checklist (kalau sudah pernah submit) +
 *        availableItemMasters (semua item aktif).
 *   2. Inisialisasi state form: ukuran (existing atau 'M'), tanggal (today),
 *      penerima (existing atau ''), items (merge dari existing + baru).
 *   3. User bisa:
 *      - Centang/un-centang per item
 *      - Tambah/edit keterangan per item
 *      - Ganti ukuran, tanggal, penerima
 *      - Submit → POST → setelah sukses, auto-refresh checklist & status.
 *      - Klik "Cetak Formulir" → buka PDF di tab baru (inline viewer).
 *
 * Submit pertama kali akan flip status pendaftar (kalau payment LUNAS) →
 * SISWA_AKTIF, generate PDF Tahap 2 dan kirim email (via PendaftarService
 * afterPartialSubmit).
 *
 * Submit ulang: status tidak flip lagi, hanya update items yang dicentang
 * atau data penerima/ukuran/tanggal.
 */
export default function SeragamChecklistPage() {
  const { id: pendaftarId } = useParams();
  const navigate = useNavigate();
  const { hasPermission } = useAuth();

  const canManage = hasPermission('spmb.checklist_seragam.manage');
  const canView = hasPermission('spmb.checklist_seragam.view') || canManage;

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [data, setData] = useState<ChecklistResponse | null>(null);

  // Form state
  const [ukuran, setUkuran] = useState('M');
  const [tanggal, setTanggal] = useState<string>(() => {
    return new Date().toISOString().slice(0, 10);
  });
  const [penerima, setPenerima] = useState('');
  const [items, setItems] = useState<ChecklistItem[]>([]);
  // Opsi A: alasan perubahan — WAJIB diisi kalau re-edit checklist setelah
  // pendaftar berstatus SISWA_AKTIF. Untuk submit pertama, opsional.
  const [reason, setReason] = useState('');
  const [savedSnapshot, setSavedSnapshot] = useState<{
    ukuran: string;
    tanggal: string;
    penerima: string;
    items: ChecklistItem[];
  } | null>(null);

  // ============================================================
  // 1. LOAD
  // ============================================================
  const load = async () => {
    setLoading(true);
    try {
      const res = await api.get<ChecklistResponse>(
        `/seragam/checklist/${pendaftarId}`,
      );
      setData(res.data);

      // Prefill form dari data yang sudah ada
      const existing = res.data.checklist;
      const masterItems = res.data.availableItemMasters ?? [];

      // Build items list: gabungkan existing items dengan master items.
      // Existing items keep state (id, sudahDidapat, keterangan).
      // Master-only items (belum pernah ada di existing) → sudahDidapat=false.
      const existingMap = new Map(
        (existing?.items ?? []).map((it) => [it.itemMasterId, it]),
      );
      const merged: ChecklistItem[] = masterItems.map((m) => {
        const ex = existingMap.get(m.id);
        return {
          id: ex?.id,
          itemMasterId: m.id,
          nama: m.nama,
          urutan: m.urutan,
          sudahDidapat: ex?.sudahDidapat ?? false,
          keterangan: ex?.keterangan ?? null,
          isActive: m.isActive,
        };
      });

      setItems(merged);
      setUkuran(existing?.ukuran ?? res.data.pendaftar.ukuranBajuPendaftar ?? 'M');
      setTanggal(
        existing?.tanggalPengambilan
          ? existing.tanggalPengambilan.slice(0, 10)
          : new Date().toISOString().slice(0, 10),
      );
      setPenerima(existing?.penerimaNama ?? '');

      // Simpan snapshot untuk deteksi dirty state
      setSavedSnapshot({
        ukuran: existing?.ukuran ?? res.data.pendaftar.ukuranBajuPendaftar ?? 'M',
        tanggal: existing?.tanggalPengambilan
          ? existing.tanggalPengambilan.slice(0, 10)
          : new Date().toISOString().slice(0, 10),
        penerima: existing?.penerimaNama ?? '',
        items: merged,
      });
      // Reset reason setiap reload — supaya tidak pakai reason dari edit
      // sebelumnya (Opsi A). Field reason ini 1-shot per submit.
      setReason('');
    } catch (e: any) {
      toast.error(e.message ?? 'Gagal memuat checklist');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (pendaftarId) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendaftarId]);

  // ============================================================
  // 2. HANDLERS
  // ============================================================
  const toggleItem = (idx: number) => {
    setItems((prev) =>
      prev.map((it, i) =>
        i === idx ? { ...it, sudahDidapat: !it.sudahDidapat } : it,
      ),
    );
  };

  const setKeterangan = (idx: number, value: string) => {
    setItems((prev) =>
      prev.map((it, i) => (i === idx ? { ...it, keterangan: value } : it)),
    );
  };

  const sudahDidapatCount = useMemo(
    () => items.filter((i) => i.sudahDidapat).length,
    [items],
  );

  const isDirty = useMemo(() => {
    if (!savedSnapshot) return false;
    if (savedSnapshot.ukuran !== ukuran) return true;
    if (savedSnapshot.tanggal !== tanggal) return true;
    if (savedSnapshot.penerima !== penerima) return true;
    if (savedSnapshot.items.length !== items.length) return true;
    for (let i = 0; i < items.length; i++) {
      const a = savedSnapshot.items[i];
      const b = items[i];
      if (!a || !b) return true;
      if (a.sudahDidapat !== b.sudahDidapat) return true;
      if ((a.keterangan ?? '') !== (b.keterangan ?? '')) return true;
    }
    return false;
  }, [savedSnapshot, ukuran, tanggal, penerima, items]);

  const submitForm = async () => {
    if (!canManage) {
      toast.error('Anda tidak punya izin input checklist');
      return;
    }
    if (!ukuran) {
      toast.error('Ukuran baju wajib diisi');
      return;
    }
    // Opsi A: kalau pendaftar sudah SISWA_AKTIF (re-edit), reason WAJIB diisi.
    const isAktif = data?.pendaftar?.status === 'SISWA_AKTIF';
    if (isAktif && !reason.trim()) {
      toast.error('Alasan perubahan wajib diisi untuk re-edit seragam setelah Siswa Aktif');
      return;
    }
    setSubmitting(true);
    try {
      const payload: {
        ukuran: string;
        tanggalPengambilan: string;
        penerimaNama: string | null;
        items: Array<{
          itemMasterId: string;
          sudahDidapat: boolean;
          keterangan: string | null;
        }>;
        reason?: string;
      } = {
        ukuran,
        tanggalPengambilan: tanggal,
        penerimaNama: penerima || null,
        items: items.map((it) => ({
          itemMasterId: it.itemMasterId,
          sudahDidapat: it.sudahDidapat,
          keterangan: it.keterangan || null,
        })),
      };
      if (reason.trim()) payload.reason = reason.trim();
      const r = await api.post(`/seragam/checklist/${pendaftarId}`, payload);
      toast.success(
        `Checklist tersimpan. Status pendaftar: ${
          STATUS_LABELS[r.data?.status] ?? r.data?.status ?? '—'
        }`,
      );
      // Reset reason setelah sukses
      setReason('');
      await load();
    } catch (e: any) {
      toast.error(e.message ?? 'Gagal menyimpan checklist');
    } finally {
      setSubmitting(false);
    }
  };

  const openPdf = (mode: 'inline' | 'attachment' = 'inline') => {
    if (!data?.checklist) {
      toast.error('Simpan checklist dulu sebelum cetak.');
      return;
    }
    const url = `${api.defaults.baseURL}/seragam/checklist/${pendaftarId}/pdf?as=${mode}`;
    // Pakai token via Bearer supaya endpoint authenticated.
    const token = localStorage.getItem('spmb_token');
    // Buka di tab baru dengan fetch blob → download URL (bypass browser PDF viewer kalau attachment)
    if (mode === 'attachment') {
      fetch(url, { headers: { Authorization: `Bearer ${token}` } })
        .then((r) => r.blob())
        .then((blob) => {
          const a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = `${data.pendaftar.registrationNumber}-SERAGAM.pdf`;
          a.click();
          URL.revokeObjectURL(a.href);
        })
        .catch(() => toast.error('Gagal download PDF'));
    } else {
      // Inline: buka tab baru + let browser render PDF (header Authorization
      // tidak terkirim via <a>, jadi kita pakai blob juga untuk konsistensi).
      fetch(url, { headers: { Authorization: `Bearer ${token}` } })
        .then((r) => r.blob())
        .then((blob) => {
          const u = URL.createObjectURL(blob);
          window.open(u, '_blank', 'noopener');
          // Auto-revoke setelah 60 detik (browser sudah selesai load).
          setTimeout(() => URL.revokeObjectURL(u), 60_000);
        })
        .catch(() => toast.error('Gagal buka PDF'));
    }
  };

  // ============================================================
  // 3. RENDER
  // ============================================================
  if (!canView) {
    return (
      <div className="space-y-4">
        <Link to="/pendaftar" className="btn-ghost">
          <ArrowLeft size={14} /> Kembali ke daftar pendaftar
        </Link>
        <div className="card border-amber-200 bg-amber-50">
          <div className="flex items-start gap-3">
            <AlertTriangle className="text-amber-600" size={20} />
            <div>
              <h3 className="text-sm font-semibold text-amber-900">
                Akses Ditolak
              </h3>
              <p className="mt-1 text-sm text-amber-800">
                Anda tidak punya akses untuk halaman checklist seragam.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (loading || !data) {
    return (
      <div className="flex h-64 items-center justify-center text-slate-500">
        <RefreshCw className="mr-2 animate-spin" size={20} />
        Memuat checklist seragam…
      </div>
    );
  }

  const { pendaftar, checklist } = data;

  return (
    <div className="space-y-6">
      {/* ── Header ─────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <button
            onClick={() => navigate(-1)}
            className="btn-ghost mb-2 -ml-2"
          >
            <ArrowLeft size={14} /> Kembali
          </button>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900">
            <Shirt className="text-primary-600" size={24} />
            Formulir Pengambilan Seragam
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Checklist seragam siswa baru yang dicatat TU saat siswa datang ke
            sekolah. Status "Ukuran Baju Terpenuhi" akan otomatis aktif begitu
            formulir ini disimpan pertama kali.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {checklist && (
            <>
              <button onClick={() => openPdf('inline')} className="btn-ghost">
                <Printer size={14} /> Lihat PDF
              </button>
              <button onClick={() => openPdf('attachment')} className="btn-ghost">
                <Download size={14} /> Download PDF
              </button>
            </>
          )}
        </div>
      </div>

      {/* ── Data Siswa (read-only card) ────────────────────────────── */}
      <div className="card">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700">
          <User size={16} />
          Data Siswa
        </h3>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Field label="Nama Lengkap" value={pendaftar.namaLengkap} />
          <Field label="No. Pendaftaran" value={pendaftar.registrationNumber} mono />
          <Field
            label="Jurusan"
            value={`${pendaftar.jurusan.code} — ${pendaftar.jurusan.name}`}
          />
          <Field
            label="Jenis Kelamin"
            value={pendaftar.jenisKelamin === 'L' ? 'Laki-laki' : 'Perempuan'}
          />
          <Field label="Gelombang" value={pendaftar.gelombang.name} />
          <Field
            label="Ukuran Baju (existing)"
            value={pendaftar.ukuranBajuPendaftar ?? '—'}
          />
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
          {checklist && (
            <span className="rounded-full bg-emerald-100 px-2.5 py-1 font-medium text-emerald-700">
              <CheckCircle2 size={12} className="mr-1 inline" />
              Sudah pernah disubmit
            </span>
          )}
          {checklist?.petugasNama && (
            <span className="text-slate-500">
              Petugas terakhir: {checklist.petugasNama}
              {checklist.petugasEmail ? ` (${checklist.petugasEmail})` : ''}
            </span>
          )}
        </div>
      </div>

      {/* ── Form Pengisian (TU/Superadmin) ─────────────────────────── */}
      <div className="card">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700">
          <ListChecks size={16} />
          Pengisian Formulir
        </h3>

        {/* Ukuran + Tanggal + Penerima */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div>
            <label className="label flex items-center gap-1.5">
              <Shirt size={14} /> Ukuran Baju *
            </label>
            <CustomSelect
              value={ukuran}
              onChange={(e) => setUkuran(e.target.value)}
              disabled={!canManage}
            >
              {UKURAN_BAJU_OPTIONS.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </CustomSelect>
          </div>
          <div>
            <label className="label flex items-center gap-1.5">
              <Calendar size={14} /> Tanggal Pengambilan *
            </label>
            <input
              type="date"
              className="input"
              value={tanggal}
              onChange={(e) => setTanggal(e.target.value)}
              disabled={!canManage}
            />
          </div>
          <div>
            <label className="label">Nama Penerima (opsional)</label>
            <input
              type="text"
              className="input"
              placeholder="cth: Budi Santoso (Ayah)"
              value={penerima}
              onChange={(e) => setPenerima(e.target.value)}
              disabled={!canManage}
            />
          </div>
        </div>

        {/* Opsi A: Warning + field Alasan perubahan untuk re-edit Siswa Aktif */}
        {data?.pendaftar?.status === 'SISWA_AKTIF' && checklist && (
          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
            <div className="flex items-start gap-2">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" />
              <div>
                <b>Re-edit setelah Siswa Aktif.</b> Perubahan akan dicatat di
                audit log untuk forensik. <b>Wajib mengisi alasan</b> di bawah.
              </div>
            </div>
          </div>
        )}
        {checklist && canManage && (
          <div className="mt-4">
            <label className="label">
              Alasan Perubahan
              {data?.pendaftar?.status === 'SISWA_AKTIF' ? ' *' : ' (opsional)'}
            </label>
            <textarea
              className="input min-h-[60px]"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={
                data?.pendaftar?.status === 'SISWA_AKTIF'
                  ? 'Contoh: Koreksi ukuran setelah siswa coba baju, tambah item baru yang baru diambil, dll.'
                  : 'Opsional — tulis konteks perubahan kalau perlu'
              }
            />
            {data?.pendaftar?.status === 'SISWA_AKTIF' && (
              <p className="mt-1 text-[11px] text-slate-500">
                Tercatat permanen di Audit Log (module: spmb, action:
                seragam.checklist_submitted) untuk forensik.
              </p>
            )}
          </div>
        )}

        {/* Tabel checklist item */}
        <div className="mt-5">
          <div className="mb-2 flex items-center justify-between">
            <h4 className="text-sm font-semibold text-slate-700">
              Item Seragam
            </h4>
            <span className="text-xs text-slate-500">
              {sudahDidapatCount} / {items.length} sudah diambil
            </span>
          </div>

          {items.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4 text-center text-sm text-slate-500">
              Belum ada item seragam. Hubungi Superadmin untuk menambahkan
              item di <b>Master Item Seragam</b>.
            </div>
          ) : (
            <div className="overflow-hidden rounded-lg border border-slate-200">
              <table className="w-full">
                <thead className="border-b border-slate-200 bg-slate-50">
                  <tr>
                    <th className="w-10 px-3 py-2 text-center text-xs font-semibold uppercase tracking-wide text-slate-500">
                      No.
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Nama Item
                    </th>
                    <th className="w-28 px-3 py-2 text-center text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Sudah Didapat
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Keterangan
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {items.map((it, idx) => (
                    <tr
                      key={it.itemMasterId}
                      className={it.isActive ? '' : 'bg-slate-50/40'}
                    >
                      <td className="px-3 py-2 text-center text-sm text-slate-500">
                        {idx + 1}
                      </td>
                      <td className="px-3 py-2">
                        <span
                          className={
                            it.isActive
                              ? 'text-sm font-medium text-slate-900'
                              : 'text-sm text-slate-400 line-through'
                          }
                        >
                          {it.nama}
                        </span>
                        {!it.isActive && (
                          <span className="ml-2 text-xs text-slate-400">
                            (nonaktif)
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-center">
                        <input
                          type="checkbox"
                          checked={it.sudahDidapat}
                          onChange={() => toggleItem(idx)}
                          disabled={!canManage}
                          className="h-4 w-4 cursor-pointer rounded border-slate-300 text-primary-600 focus:ring-primary-500"
                          title="Centang jika siswa sudah mengambil item ini"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="text"
                          className="input py-1 text-sm"
                          placeholder="cth: Ukuran L, kondisi baik"
                          value={it.keterangan ?? ''}
                          onChange={(e) => setKeterangan(idx, e.target.value)}
                          disabled={!canManage}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Action bar */}
        {canManage && (
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
            <div className="text-xs text-slate-500">
              {isDirty ? (
                <span className="flex items-center gap-1 text-amber-600">
                  <AlertTriangle size={12} /> Ada perubahan yang belum
                  disimpan
                </span>
              ) : (
                <span className="flex items-center gap-1 text-emerald-600">
                  <CheckCircle2 size={12} /> Tersinkron dengan data tersimpan
                </span>
              )}
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => load()}
                disabled={submitting}
                className="btn-ghost"
                type="button"
              >
                <RefreshCw size={14} /> Reset
              </button>
              <button
                onClick={submitForm}
                disabled={
                  submitting ||
                  !isDirty ||
                  // Opsi A: wajib reason kalau re-edit Siswa Aktif
                  (data?.pendaftar?.status === 'SISWA_AKTIF' && !reason.trim())
                }
                className="btn-primary disabled:opacity-50"
                type="button"
                title={
                  data?.pendaftar?.status === 'SISWA_AKTIF' && !reason.trim()
                    ? 'Isi alasan perubahan dulu (re-edit Siswa Aktif)'
                    : undefined
                }
              >
                <Save size={14} />
                {submitting
                  ? 'Menyimpan…'
                  : checklist
                  ? 'Simpan Perubahan'
                  : 'Simpan Checklist'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Helper card (selalu tampil, kalau TU/admin) ────────────── */}
      <div className="card border-blue-200 bg-blue-50">
        <div className="flex items-start gap-3">
          <AlertTriangle className="text-blue-600" size={18} />
          <div className="text-sm text-blue-900">
            <b>Catatan:</b> Formulir ini bisa disimpan berkali-kali (mis.
            siswa datang pertama ambil baju A &amp; B, besoknya ambil baju C
            &amp; D — buka form ini lagi dan centang item yang baru). Status
            pendaftar hanya berubah dari <code>MENUNGGU_UKURAN_BAJU</code> →{' '}
            <code>SISWA_AKTIF</code> pada submit pertama (kalau pembayaran
            sudah LUNAS).
          </div>
        </div>
      </div>

      {/* Print-stamp modal (sukses banner) */}
      <AnimatePresence>
        {sudahDidapatCount === items.length && items.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="card border-emerald-200 bg-emerald-50"
          >
            <div className="flex items-start gap-3">
              <CheckCircle2 className="text-emerald-600" size={20} />
              <div className="text-sm text-emerald-900">
                <b>Semua item sudah diambil!</b> Silakan cetak Formulir
                Pengambilan Seragam sebagai bukti serah-terima.
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Field({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-slate-500">
        {label}
      </div>
      <div
        className={`mt-0.5 text-sm font-medium text-slate-900 ${mono ? 'font-mono' : ''}`}
      >
        {value}
      </div>
    </div>
  );
}