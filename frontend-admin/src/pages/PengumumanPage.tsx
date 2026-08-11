import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Trash2, History, ListChecks, Edit3, RotateCcw, Power, Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';
import { api, fotoUrl } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import UploadFotoField from '../components/UploadFotoField';

type Tab = 'list' | 'history';

interface Pengumuman {
  id: string;
  judul: string;
  foto: string;
  aktif: boolean;
  urutan: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  createdBy?: { name: string; email: string };
}

interface FormState {
  judul: string;
  foto: string;
  aktif: boolean;
  urutan: number;
}

const EMPTY_FORM: FormState = {
  judul: '',
  foto: '',
  aktif: true,
  urutan: 0,
};

export default function PengumumanPage() {
  const { hasPermission } = useAuth();
  const [tab, setTab] = useState<Tab>('list');
  const [items, setItems] = useState<Pengumuman[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [includeDeleted, setIncludeDeleted] = useState(false);
  const [showInactive, setShowInactive] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.get('/pengumuman', {
        params: {
          includeDeleted: includeDeleted || undefined,
          aktif: showInactive ? undefined : true,
        },
      });
      setItems(res.data.items);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [includeDeleted, showInactive]);

  const openCreate = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setShowForm(true);
  };

  const openEdit = (p: Pengumuman) => {
    setEditingId(p.id);
    setForm({
      judul: p.judul,
      foto: p.foto,
      aktif: p.aktif,
      urutan: p.urutan,
    });
    setShowForm(true);
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.foto) {
      toast.error('Foto wajib diupload');
      return;
    }
    const payload = {
      judul: form.judul.trim(),
      foto: form.foto,
      aktif: form.aktif,
      urutan: Number(form.urutan) || 0,
    };
    try {
      if (editingId) {
        await api.patch(`/pengumuman/${editingId}`, payload);
        toast.success('Pengumuman diperbarui');
      } else {
        await api.post('/pengumuman', payload);
        toast.success('Pengumuman dibuat');
      }
      setShowForm(false);
      setEditingId(null);
      setForm(EMPTY_FORM);
      load();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const toggleAktif = async (p: Pengumuman) => {
    try {
      await api.patch(`/pengumuman/${p.id}`, { aktif: !p.aktif });
      toast.success(p.aktif ? 'Pengumuman dinonaktifkan' : 'Pengumuman diaktifkan');
      load();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const softDelete = async (p: Pengumuman) => {
    if (!confirm(`Hapus pengumuman "${p.judul}"? (Soft delete)`)) return;
    try {
      await api.delete(`/pengumuman/${p.id}`);
      toast.success('Pengumuman dihapus');
      load();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const restore = async (p: Pengumuman) => {
    try {
      await api.patch(`/pengumuman/${p.id}/restore`);
      toast.success('Pengumuman dipulihkan');
      load();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  return (
    <div>
      <div className="mb-4 flex flex-col items-start justify-between gap-3 md:flex-row md:items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Manajemen Pengumuman</h1>
          <p className="text-sm text-slate-500">Banner popup yang tampil di landing page user.</p>
        </div>
        {tab === 'list' && hasPermission('pengumuman.manage') && (
          <button onClick={showForm ? () => setShowForm(false) : openCreate} className="btn-primary">
            <Plus size={16} /> {showForm ? 'Tutup' : 'Pengumuman Baru'}
          </button>
        )}
      </div>

      <div className="mb-4 flex gap-1 rounded-lg bg-slate-200 p-1">
        <button
          onClick={() => setTab('list')}
          className={`flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition ${
            tab === 'list' ? 'bg-white text-primary-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <ListChecks size={16} /> Daftar Pengumuman
        </button>
        <button
          onClick={() => setTab('history')}
          className={`flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition ${
            tab === 'history' ? 'bg-white text-primary-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <History size={16} /> Riwayat
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
          >
            {showForm && hasPermission('pengumuman.manage') && (
              <motion.form
                initial={{ y: -8, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ duration: 0.2 }}
                onSubmit={onSubmit}
                className="card mb-4 space-y-3"
              >
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <div>
                    <label className="label">Judul *</label>
                    <input
                      className="input"
                      value={form.judul}
                      onChange={(e) => setForm({ ...form, judul: e.target.value })}
                      required
                      placeholder="Contoh: Open House 2026"
                    />
                  </div>
                  <div>
                    <label className="label">Urutan</label>
                    <input
                      type="number"
                      className="input"
                      value={form.urutan}
                      onChange={(e) => setForm({ ...form, urutan: Number(e.target.value) })}
                      placeholder="0"
                    />
                    <p className="mt-1 text-[11px] text-slate-500">Angka lebih kecil tampil lebih dulu di carousel.</p>
                  </div>
                </div>

                <UploadFotoField
                  value={form.foto}
                  onChange={(p) => setForm({ ...form, foto: p })}
                  folder="pengumuman"
                />

                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={form.aktif}
                    onChange={(e) => setForm({ ...form, aktif: e.target.checked })}
                  />
                  Aktif (tampil di popup landing page)
                </label>

                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setShowForm(false);
                      setEditingId(null);
                      setForm(EMPTY_FORM);
                    }}
                    className="btn-ghost"
                  >
                    Batal
                  </button>
                  <button type="submit" className="btn-primary">
                    {editingId ? 'Simpan Perubahan' : 'Simpan'}
                  </button>
                </div>
              </motion.form>
            )}

            <div className="mb-3 flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-sm text-slate-600">
                <input
                  type="checkbox"
                  checked={showInactive}
                  onChange={(e) => setShowInactive(e.target.checked)}
                />
                Tampilkan yang non-aktif
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-600">
                <input
                  type="checkbox"
                  checked={includeDeleted}
                  onChange={(e) => setIncludeDeleted(e.target.checked)}
                />
                Tampilkan yang sudah dihapus
              </label>
            </div>

            <div className="card overflow-hidden p-0">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="border-b border-slate-200 bg-slate-50">
                    <tr>
                      <th className="table-th">Foto</th>
                      <th className="table-th">Judul</th>
                      <th className="table-th">Status</th>
                      <th className="table-th">Urutan</th>
                      <th className="table-th">Tanggal</th>
                      {hasPermission('pengumuman.manage') && <th className="table-th">Aksi</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {loading ? (
                      <tr>
                        <td colSpan={6} className="table-td text-center text-slate-500">
                          Memuat…
                        </td>
                      </tr>
                    ) : items.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="table-td text-center text-slate-500">
                          Belum ada pengumuman
                        </td>
                      </tr>
                    ) : (
                      items.map((p) => (
                        <tr key={p.id} className={p.deletedAt ? 'bg-red-50/40' : 'hover:bg-slate-50'}>
                          <td className="table-td">
                            {p.foto ? (
                              <img
                                src={fotoUrl(p.foto)}
                                alt={p.judul}
                                className="h-14 w-14 rounded object-cover ring-1 ring-slate-200"
                              />
                            ) : (
                              <div className="flex h-14 w-14 items-center justify-center rounded bg-slate-100 text-[10px] text-slate-400">
                                no img
                              </div>
                            )}
                          </td>
                          <td className="table-td">
                            <div className="font-medium text-slate-900">{p.judul}</div>
                            {p.deletedAt && (
                              <div className="mt-0.5 text-xs text-red-600">
                                Dihapus {new Date(p.deletedAt).toLocaleDateString('id-ID')}
                              </div>
                            )}
                          </td>
                          <td className="table-td">
                            {p.aktif ? (
                              <span className="badge bg-emerald-100 text-emerald-700">
                                <Eye size={10} /> Aktif
                              </span>
                            ) : (
                              <span className="badge bg-slate-100 text-slate-600">
                                <EyeOff size={10} /> Non-aktif
                              </span>
                            )}
                          </td>
                          <td className="table-td font-mono text-sm">{p.urutan}</td>
                          <td className="table-td text-xs text-slate-500">
                            {new Date(p.updatedAt).toLocaleDateString('id-ID')}
                          </td>
                          {hasPermission('pengumuman.manage') && (
                            <td className="table-td">
                              <div className="flex flex-wrap gap-1">
                                {!p.deletedAt && (
                                  <>
                                    <button
                                      onClick={() => openEdit(p)}
                                      className="btn-ghost text-xs"
                                      title="Edit"
                                    >
                                      <Edit3 size={12} /> Edit
                                    </button>
                                    <button
                                      onClick={() => toggleAktif(p)}
                                      className={`btn-ghost text-xs ${
                                        p.aktif ? 'text-amber-600' : 'text-emerald-600'
                                      }`}
                                      title={p.aktif ? 'Non-aktifkan' : 'Aktifkan'}
                                    >
                                      <Power size={12} /> {p.aktif ? 'Off' : 'On'}
                                    </button>
                                    <button
                                      onClick={() => softDelete(p)}
                                      className="btn-ghost text-xs text-red-600"
                                    >
                                      <Trash2 size={12} /> Hapus
                                    </button>
                                  </>
                                )}
                                {p.deletedAt && (
                                  <button
                                    onClick={() => restore(p)}
                                    className="btn-ghost text-xs text-blue-600"
                                  >
                                    <RotateCcw size={12} /> Restore
                                  </button>
                                )}
                              </div>
                            </td>
                          )}
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </motion.div>
        ) : (
          <HistoryTab key="history" title="Riwayat Perubahan Pengumuman" />
        )}
      </AnimatePresence>
    </div>
  );
}

function HistoryTab({ title }: { title: string }) {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const res = await api.get('/audit-logs', {
          params: { module: 'pengumuman', pageSize: 100 },
        });
        setItems(res.data.items);
      } catch (e: any) {
        toast.error(e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const actionLabel = (a: string) => {
    switch (a) {
      case 'pengumuman.created':
        return 'Tambah Pengumuman';
      case 'pengumuman.updated':
        return 'Edit Pengumuman';
      case 'pengumuman.deleted':
        return 'Hapus Pengumuman';
      case 'pengumuman.restored':
        return 'Restore Pengumuman';
      default:
        return a;
    }
  };

  const actionColor = (a: string) => {
    if (a.endsWith('.deleted')) return 'bg-red-100 text-red-700';
    if (a.endsWith('.created')) return 'bg-emerald-100 text-emerald-700';
    if (a.endsWith('.restored')) return 'bg-blue-100 text-blue-700';
    return 'bg-slate-100 text-slate-700';
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
    >
      <p className="mb-3 text-sm text-slate-600">{title}</p>
      <div className="card overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="border-b border-slate-200 bg-slate-50">
              <tr>
                <th className="table-th">Waktu</th>
                <th className="table-th">User</th>
                <th className="table-th">Aksi</th>
                <th className="table-th">Detail</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={4} className="table-td text-center text-slate-500">
                    Memuat…
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={4} className="table-td text-center text-slate-500">
                    Belum ada riwayat
                  </td>
                </tr>
              ) : (
                items.map((l) => (
                  <tr key={l.id}>
                    <td className="table-td whitespace-nowrap text-xs text-slate-500">
                      {new Date(l.createdAt).toLocaleString('id-ID')}
                    </td>
                    <td className="table-td">
                      <div className="text-sm">{l.user?.name || '-'}</div>
                      <div className="text-xs text-slate-500">{l.user?.email}</div>
                    </td>
                    <td className="table-td">
                      <span className={`badge ${actionColor(l.action)}`}>{actionLabel(l.action)}</span>
                    </td>
                    <td className="table-td text-xs text-slate-600">
                      <pre className="whitespace-pre-wrap break-words">
                        {JSON.stringify(l.meta, null, 2)}
                      </pre>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </motion.div>
  );
}
