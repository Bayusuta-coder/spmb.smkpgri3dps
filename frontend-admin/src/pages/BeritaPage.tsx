import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Trash2, History, ListChecks, Edit3, Eye, RotateCcw, Send } from 'lucide-react';
import { toast } from 'sonner';
import { api, fotoUrl } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { BERITA_STATUS_COLORS, BERITA_STATUS_LABELS } from '../lib/constants';
import UploadFotoField from '../components/UploadFotoField';

type Tab = 'list' | 'history';

interface Berita {
  id: string;
  judul: string;
  slug: string;
  foto: string;
  isi: string;
  hashtag: string[];
  status: 'DRAFT' | 'PUBLISHED';
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  createdBy?: { name: string; email: string };
}

interface FormState {
  judul: string;
  foto: string;
  isi: string;
  hashtagText: string;
  status: 'DRAFT' | 'PUBLISHED';
}

const EMPTY_FORM: FormState = {
  judul: '',
  foto: '',
  isi: '',
  hashtagText: '',
  status: 'DRAFT',
};

export default function BeritaPage() {
  const { hasPermission } = useAuth();
  const [tab, setTab] = useState<Tab>('list');
  const [items, setItems] = useState<Berita[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [includeDeleted, setIncludeDeleted] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'DRAFT' | 'PUBLISHED'>('ALL');

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.get('/berita', {
        params: {
          includeDeleted: includeDeleted || undefined,
          status: statusFilter === 'ALL' ? undefined : statusFilter,
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
  }, [includeDeleted, statusFilter]);

  const openCreate = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setShowForm(true);
  };

  const openEdit = (b: Berita) => {
    setEditingId(b.id);
    setForm({
      judul: b.judul,
      foto: b.foto,
      isi: b.isi,
      hashtagText: (b.hashtag || []).join(' '),
      status: b.status,
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
      isi: form.isi,
      hashtag: form.hashtagText
        .split(/[\s,]+/)
        .map((s) => s.trim())
        .filter(Boolean)
        .map((s) => (s.startsWith('#') ? s : '#' + s)),
      status: form.status,
    };
    try {
      if (editingId) {
        await api.patch(`/berita/${editingId}`, payload);
        toast.success('Berita diperbarui');
      } else {
        await api.post('/berita', payload);
        toast.success('Berita dibuat');
      }
      setShowForm(false);
      setEditingId(null);
      setForm(EMPTY_FORM);
      load();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const togglePublish = async (b: Berita) => {
    const next = b.status === 'PUBLISHED' ? 'DRAFT' : 'PUBLISHED';
    try {
      await api.patch(`/berita/${b.id}`, { status: next });
      toast.success(next === 'PUBLISHED' ? 'Berita dipublikasikan' : 'Berita di-unpublish');
      load();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const softDelete = async (b: Berita) => {
    if (!confirm(`Hapus berita "${b.judul}"? (Soft delete — bisa di-restore)`)) return;
    try {
      await api.delete(`/berita/${b.id}`);
      toast.success('Berita dihapus');
      load();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const restore = async (b: Berita) => {
    try {
      await api.patch(`/berita/${b.id}/restore`);
      toast.success('Berita dipulihkan');
      load();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  return (
    <div>
      <div className="mb-4 flex flex-col items-start justify-between gap-3 md:flex-row md:items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Manajemen Berita</h1>
          <p className="text-sm text-slate-500">Artikel & info untuk halaman publik.</p>
        </div>
        {tab === 'list' && hasPermission('berita.manage') && (
          <button onClick={showForm ? () => setShowForm(false) : openCreate} className="btn-primary">
            <Plus size={16} /> {showForm ? 'Tutup' : 'Berita Baru'}
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
          <ListChecks size={16} /> Daftar Berita
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
            {showForm && hasPermission('berita.manage') && (
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
                      placeholder="Contoh: Penerimaan Murid Baru 2026 Dibuka!"
                    />
                  </div>
                  <div>
                    <label className="label">Status</label>
                    <select
                      className="input"
                      value={form.status}
                      onChange={(e) => setForm({ ...form, status: e.target.value as any })}
                    >
                      <option value="DRAFT">Draft (belum tampil di publik)</option>
                      <option value="PUBLISHED">Published (langsung tayang)</option>
                    </select>
                  </div>
                </div>

                <UploadFotoField
                  value={form.foto}
                  onChange={(p) => setForm({ ...form, foto: p })}
                  folder="berita"
                />

                <div>
                  <label className="label">Isi Berita *</label>
                  <textarea
                    className="input min-h-[180px]"
                    value={form.isi}
                    onChange={(e) => setForm({ ...form, isi: e.target.value })}
                    required
                    placeholder="Tulis isi berita di sini. Baris baru akan dipertahankan saat render."
                  />
                </div>

                <div>
                  <label className="label">Hashtag</label>
                  <input
                    className="input"
                    value={form.hashtagText}
                    onChange={(e) => setForm({ ...form, hashtagText: e.target.value })}
                    placeholder="#SPMB2026 #PengumumanPenting"
                  />
                  <p className="mt-1 text-[11px] text-slate-500">Pisahkan dengan spasi atau koma.</p>
                </div>

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
              <select
                className="input max-w-[180px]"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as any)}
              >
                <option value="ALL">Semua status</option>
                <option value="DRAFT">Draft</option>
                <option value="PUBLISHED">Published</option>
              </select>
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
                      <th className="table-th">Slug</th>
                      <th className="table-th">Tanggal</th>
                      {hasPermission('berita.manage') && <th className="table-th">Aksi</th>}
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
                          Belum ada berita
                        </td>
                      </tr>
                    ) : (
                      items.map((b) => (
                        <tr key={b.id} className={b.deletedAt ? 'bg-red-50/40' : 'hover:bg-slate-50'}>
                          <td className="table-td">
                            {b.foto ? (
                              <img
                                src={fotoUrl(b.foto)}
                                alt={b.judul}
                                className="h-14 w-14 rounded object-cover ring-1 ring-slate-200"
                              />
                            ) : (
                              <div className="flex h-14 w-14 items-center justify-center rounded bg-slate-100 text-[10px] text-slate-400">
                                no img
                              </div>
                            )}
                          </td>
                          <td className="table-td">
                            <div className="font-medium text-slate-900">{b.judul}</div>
                            {b.deletedAt && (
                              <div className="mt-0.5 text-xs text-red-600">
                                Dihapus {new Date(b.deletedAt).toLocaleDateString('id-ID')}
                              </div>
                            )}
                            {b.hashtag?.length > 0 && (
                              <div className="mt-1 flex flex-wrap gap-1">
                                {b.hashtag.slice(0, 4).map((h, i) => (
                                  <span
                                    key={i}
                                    className="rounded-full bg-primary-50 px-2 py-0.5 text-[10px] font-medium text-primary-700"
                                  >
                                    {h}
                                  </span>
                                ))}
                              </div>
                            )}
                          </td>
                          <td className="table-td">
                            <span className={`badge ${BERITA_STATUS_COLORS[b.status]}`}>
                              {BERITA_STATUS_LABELS[b.status]}
                            </span>
                          </td>
                          <td className="table-td font-mono text-xs text-slate-500">{b.slug}</td>
                          <td className="table-td text-xs text-slate-500">
                            <div>{new Date(b.updatedAt).toLocaleDateString('id-ID')}</div>
                            {b.publishedAt && (
                              <div className="text-emerald-600">
                                pub: {new Date(b.publishedAt).toLocaleDateString('id-ID')}
                              </div>
                            )}
                          </td>
                          {hasPermission('berita.manage') && (
                            <td className="table-td">
                              <div className="flex flex-wrap gap-1">
                                {!b.deletedAt && (
                                  <>
                                    <button
                                      onClick={() => openEdit(b)}
                                      className="btn-ghost text-xs"
                                      title="Edit"
                                    >
                                      <Edit3 size={12} /> Edit
                                    </button>
                                    <button
                                      onClick={() => togglePublish(b)}
                                      className={`btn-ghost text-xs ${
                                        b.status === 'PUBLISHED'
                                          ? 'text-amber-600'
                                          : 'text-emerald-600'
                                      }`}
                                      title={b.status === 'PUBLISHED' ? 'Unpublish' : 'Publish'}
                                    >
                                      {b.status === 'PUBLISHED' ? (
                                        <>
                                          <Eye size={12} /> Unpublish
                                        </>
                                      ) : (
                                        <>
                                          <Send size={12} /> Publish
                                        </>
                                      )}
                                    </button>
                                    <button
                                      onClick={() => softDelete(b)}
                                      className="btn-ghost text-xs text-red-600"
                                    >
                                      <Trash2 size={12} /> Hapus
                                    </button>
                                  </>
                                )}
                                {b.deletedAt && (
                                  <button
                                    onClick={() => restore(b)}
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
          <HistoryTab key="history" module="berita" title="Riwayat Perubahan Berita" />
        )}
      </AnimatePresence>
    </div>
  );
}

function HistoryTab({ module, title }: { module: string; title: string }) {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const res = await api.get('/audit-logs', {
          params: { module, pageSize: 100 },
        });
        setItems(res.data.items);
      } catch (e: any) {
        toast.error(e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [module]);

  const actionLabel = (a: string) => {
    switch (a) {
      case 'berita.created':
        return 'Tambah Berita';
      case 'berita.updated':
        return 'Edit Berita';
      case 'berita.deleted':
        return 'Hapus Berita';
      case 'berita.restored':
        return 'Restore Berita';
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
