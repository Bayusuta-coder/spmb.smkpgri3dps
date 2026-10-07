import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus,
  History,
  ListChecks,
  Trash2,
  Pencil,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Shirt,
} from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import HistoryTab from '../components/HistoryTab';

type Tab = 'list' | 'history';

interface SeragamItem {
  id: string;
  nama: string;
  urutan: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  usedCount?: number; // jumlah checklist yang reference item ini (optional dari BE)
}

/**
 * Halaman "Master Item Seragam" — SUPERADMIN ONLY.
 *
 * Mengelola daftar item seragam yang akan di-centang TU saat siswa ambil
 * seragam (lihat SeragamChecklistPage). Item yang sudah pernah dipakai di
 * checklist manapun TIDAK boleh hard delete (untuk jaga konsistensi PDF
 * historis) — Superadmin harus soft-disable via tombol "Nonaktifkan".
 *
 * ENDPOINT BACKEND:
 *   GET    /seragam/items?includeInactive=true
 *   POST   /seragam/items                  { nama, urutan?, isActive? }
 *   PATCH  /seragam/items/:id              { nama?, urutan?, isActive? }
 *   DELETE /seragam/items/:id              (ditolak kalau usedCount>0)
 *
 * ACCESS: spmb.seragam_item.manage (Superadmin only by seed default).
 */
export default function SeragamItemMasterPage() {
  const { hasPermission } = useAuth();
  const canManage = hasPermission('spmb.seragam_item.manage');
  const canView = hasPermission('spmb.checklist_seragam.view') || canManage;

  const [tab, setTab] = useState<Tab>('list');
  const [items, setItems] = useState<SeragamItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [includeInactive, setIncludeInactive] = useState(false);

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ nama: '', urutan: 0, isActive: true });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showDeleteId, setShowDeleteId] = useState<string | null>(null);
  // Auto-suggest urutan = max(urutan) + 10 (atau 0 kalau list kosong).
  const nextUrutan = items.length === 0
    ? 0
    : Math.max(...items.map((it) => it.urutan ?? 0)) + 10;

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.get<SeragamItem[]>('/seragam/items', {
        params: { includeInactive: includeInactive || undefined },
      });
      setItems(res.data);
    } catch (e: any) {
      toast.error(e.message ?? 'Gagal memuat data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (tab === 'list') load();
  }, [includeInactive, tab]);

  const resetForm = () => {
    setForm({ nama: '', urutan: 0, isActive: true });
    setEditingId(null);
    setShowForm(false);
  };

  const openCreateModal = () => {
    setForm({ nama: '', urutan: nextUrutan, isActive: true });
    setEditingId(null);
    setShowForm(true);
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingId) {
        await api.patch(`/seragam/items/${editingId}`, {
          nama: form.nama,
          urutan: Number(form.urutan) || 0,
          isActive: form.isActive,
        });
        toast.success('Item seragam diperbarui');
      } else {
        await api.post('/seragam/items', {
          nama: form.nama,
          urutan: Number(form.urutan) || 0,
          isActive: form.isActive,
        });
        toast.success('Item seragam ditambahkan');
      }
      resetForm();
      load();
    } catch (e: any) {
      toast.error(e.message ?? 'Gagal menyimpan');
    }
  };

  const onEdit = (item: SeragamItem) => {
    setForm({ nama: item.nama, urutan: item.urutan, isActive: item.isActive });
    setEditingId(item.id);
    setShowForm(true);
  };

  const onToggleActive = async (item: SeragamItem) => {
    try {
      await api.patch(`/seragam/items/${item.id}`, { isActive: !item.isActive });
      toast.success(item.isActive ? 'Item dinonaktifkan' : 'Item diaktifkan');
      load();
    } catch (e: any) {
      toast.error(e.message ?? 'Gagal ubah status');
    }
  };

  const onDelete = async (id: string) => {
    try {
      await api.delete(`/seragam/items/${id}`);
      toast.success('Item dihapus');
      setShowDeleteId(null);
      load();
    } catch (e: any) {
      toast.error(e.message ?? 'Gagal menghapus item');
    }
  };

  if (!canView) {
    return (
      <div className="card border-amber-200 bg-amber-50">
        <div className="flex items-start gap-3">
          <AlertTriangle className="text-amber-600" size={20} />
          <div>
            <h3 className="text-sm font-semibold text-amber-900">Akses Ditolak</h3>
            <p className="mt-1 text-sm text-amber-800">
              Anda tidak punya akses untuk melihat halaman ini. Hubungi
              Superadmin jika ini seharusnya bisa diakses.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900">
            <Shirt className="text-primary-600" size={24} />
            Master Item Seragam
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Daftar item seragam yang akan di-centang oleh TU saat siswa
            mengambil seragam. Item yang sudah pernah dipakai di checklist
            siswa tidak bisa dihapus (untuk menjaga konsistensi PDF historis)
            — gunakan tombol <b>Nonaktifkan</b> sebagai gantinya.
          </p>
        </div>
        {tab === 'list' && canManage && (
          <button
            onClick={openCreateModal}
            className="btn-primary shrink-0"
          >
            <Plus size={16} /> Tambah Item
          </button>
        )}
      </div>

      {/* ── Tabs ─────────────────────────────────────────────────────── */}
      <div className="flex gap-1 rounded-lg bg-slate-200 p-1">
        <button
          onClick={() => setTab('list')}
          className={`flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition ${
            tab === 'list'
              ? 'bg-white text-primary-700 shadow-sm'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <ListChecks size={16} /> Daftar Item
        </button>
        <button
          onClick={() => setTab('history')}
          className={`flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition ${
            tab === 'history'
              ? 'bg-white text-primary-700 shadow-sm'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <History size={16} /> Riwayat Perubahan
        </button>
      </div>

      <AnimatePresence mode="wait">
        {tab === 'list' ? (
          <motion.div
            key="list"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="space-y-4"
          >
            {/* ── Filter ────────────────────────────────────────────────── */}
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <label className="flex items-center gap-2 text-slate-600">
                <input
                  type="checkbox"
                  checked={includeInactive}
                  onChange={(e) => setIncludeInactive(e.target.checked)}
                />
                Tampilkan item yang sudah dinonaktifkan
              </label>
            </div>

            {/* ── Tabel ────────────────────────────────────────────────── */}
            <div className="card overflow-hidden p-0">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="border-b border-slate-200 bg-slate-50">
                    <tr>
                      <th className="table-th w-16">#</th>
                      <th className="table-th">Nama Item</th>
                      <th className="table-th w-24">Urutan</th>
                      <th className="table-th w-28">Status</th>
                      <th className="table-th w-64">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {loading ? (
                      <tr>
                        <td
                          colSpan={5}
                          className="table-td text-center text-slate-500"
                        >
                          Memuat…
                        </td>
                      </tr>
                    ) : items.length === 0 ? (
                      <tr>
                        <td
                          colSpan={5}
                          className="table-td text-center text-slate-500"
                        >
                          Belum ada item seragam. Klik "Item Seragam Baru" di
                          atas untuk menambah.
                        </td>
                      </tr>
                    ) : (
                      items.map((it, idx) => (
                        <tr
                          key={it.id}
                          className={it.isActive ? '' : 'bg-slate-50/60'}
                        >
                          <td className="table-td text-slate-500">{idx + 1}</td>
                          <td className="table-td">
                            <span
                              className={
                                it.isActive
                                  ? 'font-medium text-slate-900'
                                  : 'text-slate-500 line-through'
                              }
                            >
                              {it.nama}
                            </span>
                          </td>
                          <td className="table-td font-mono text-slate-600">
                            {it.urutan}
                          </td>
                          <td className="table-td">
                            <span
                              className={`badge ${
                                it.isActive
                                  ? 'bg-emerald-100 text-emerald-700'
                                  : 'bg-slate-200 text-slate-600'
                              }`}
                            >
                              {it.isActive ? 'Aktif' : 'Nonaktif'}
                            </span>
                          </td>
                          <td className="table-td">
                            {canManage && (
                              <div className="flex flex-wrap gap-1">
                                <button
                                  onClick={() => onEdit(it)}
                                  className="btn-ghost text-xs"
                                  title="Edit item"
                                >
                                  <Pencil size={12} /> Edit
                                </button>
                                <button
                                  onClick={() => onToggleActive(it)}
                                  className="btn-ghost text-xs"
                                  title={
                                    it.isActive
                                      ? 'Nonaktifkan item'
                                      : 'Aktifkan item'
                                  }
                                >
                                  {it.isActive ? (
                                    <>
                                      <XCircle size={12} /> Nonaktifkan
                                    </>
                                  ) : (
                                    <>
                                      <CheckCircle2 size={12} /> Aktifkan
                                    </>
                                  )}
                                </button>
                                <button
                                  onClick={() => setShowDeleteId(it.id)}
                                  className="btn-ghost text-xs text-red-600 hover:bg-red-50"
                                  title="Hapus item (akan ditolak kalau sudah pernah dipakai)"
                                >
                                  <Trash2 size={12} /> Hapus
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="text-xs text-slate-500">
              💡 Tip: urutan dipakai untuk mengurutkan item di form checklist
              siswa dan di PDF Formulir Pengambilan Seragam. Pakai nilai kecil
              = tampil lebih dulu (mis. 0, 10, 20, …).
            </div>
          </motion.div>
        ) : (
          <HistoryTab
            key="history"
            module="spmb"
            title="Riwayat Perubahan Master Item Seragam"
          />
        )}
      </AnimatePresence>

      {/* ── Modal konfirmasi delete ─────────────────────────────────── */}
      <AnimatePresence>
        {showDeleteId && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="card w-full max-w-md"
            >
              <div className="mb-3 flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-rose-100">
                  <AlertTriangle className="text-rose-600" size={20} />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-slate-900">
                    Hapus Item Seragam?
                  </h3>
                  <p className="mt-1 text-sm text-slate-600">
                    Item yang sudah pernah dipakai di checklist siswa{' '}
                    <b>tidak akan bisa dihapus</b> (backend akan menolak).
                    Sebagai gantinya, gunakan tombol{' '}
                    <b>"Nonaktifkan"</b> di daftar.
                  </p>
                </div>
              </div>
              <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
                <button
                  type="button"
                  onClick={() => setShowDeleteId(null)}
                  className="btn-ghost"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={() => onDelete(showDeleteId)}
                  className="btn-primary bg-rose-600 hover:bg-rose-700"
                >
                  <Trash2 size={14} />
                  Coba Hapus
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── Modal Tambah / Edit Item (pola sama dengan "Tambah Pendaftar Manual") ── */}
      <AnimatePresence>
        {showForm && canManage && (
          <div
            className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4"
            onClick={() => setShowForm(false)}
          >
            <motion.form
              initial={{ scale: 0.96, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.96, opacity: 0 }}
              transition={{ duration: 0.15 }}
              onSubmit={onSubmit}
              className="card my-8 w-full max-w-lg space-y-3"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start gap-3 border-b border-slate-100 pb-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-100">
                  <Shirt className="text-primary-600" size={20} />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-slate-900">
                    {editingId ? 'Edit Item Seragam' : 'Tambah Item Seragam'}
                  </h3>
                  <p className="mt-1 text-xs text-slate-500">
                    Item ini akan tersedia di Formulir Pengambilan Seragam
                    siswa yang baru dibuka / disubmit berikutnya.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <div className="md:col-span-2">
                  <label className="label">Nama Item *</label>
                  <input
                    className="input"
                    placeholder="Contoh: Kaos Oblong Putih"
                    value={form.nama}
                    onChange={(e) =>
                      setForm({ ...form, nama: e.target.value })
                    }
                    autoFocus
                    required
                  />
                </div>
                <div>
                  <label className="label">Urutan</label>
                  <input
                    type="number"
                    className="input"
                    placeholder={String(nextUrutan)}
                    value={form.urutan}
                    onChange={(e) =>
                      setForm({ ...form, urutan: Number(e.target.value) })
                    }
                    min={0}
                    title={
                      editingId
                        ? 'Urutan tampilan di form checklist'
                        : `Otomatis = ${nextUrutan}. Ubah kalau perlu.`
                    }
                  />
                </div>
              </div>

              <div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
                💡 <b>Urutan</b> = posisi tampil di form checklist siswa dan
                PDF Formulir Pengambilan Seragam. Angka kecil tampil lebih
                dulu. Saat tambah baru, otomatis di-set ke{' '}
                <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono">
                  {nextUrutan}
                </code>{' '}
                (= urutan terbesar saat ini + 10).
              </div>

              {!editingId && (
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="isActive"
                    checked={form.isActive}
                    onChange={(e) =>
                      setForm({ ...form, isActive: e.target.checked })
                    }
                  />
                  <label
                    htmlFor="isActive"
                    className="text-sm text-slate-700"
                  >
                    Aktif (centang supaya item langsung muncul di form
                    checklist TU)
                  </label>
                </div>
              )}

              <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="btn-ghost"
                >
                  Batal
                </button>
                <button type="submit" className="btn-primary">
                  {editingId ? 'Simpan Perubahan' : 'Tambah Item'}
                </button>
              </div>
            </motion.form>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}