import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, History, ListChecks, Trash2, Undo2 } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import HistoryTab from '../components/HistoryTab';

type Tab = 'list' | 'history';

export default function JurusanPage() {
  const { hasPermission } = useAuth();
  const [tab, setTab] = useState<Tab>('list');
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ code: '', name: '' });
  const [includeDeleted, setIncludeDeleted] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.get('/jurusan', {
        params: { includeDeleted: includeDeleted || undefined },
      });
      setItems(res.data);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [includeDeleted]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post('/jurusan', form);
      toast.success('Jurusan dibuat');
      setShowForm(false);
      setForm({ code: '', name: '' });
      load();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const toggleActive = async (id: string, isActive: boolean) => {
    try {
      await api.patch(`/jurusan/${id}`, { isActive: !isActive });
      toast.success('Status diperbarui');
      load();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const softDelete = async (id: string) => {
    if (!confirm('Hapus (soft delete) jurusan ini? Data pendaftar yang pernah memilih jurusan ini tetap tersimpan.')) return;
    try {
      await api.delete(`/jurusan/${id}`);
      toast.success('Jurusan di-nonaktifkan & ditandai deleted');
      load();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const restore = async (id: string) => {
    if (!confirm('Pulihkan (restore) jurusan ini?')) return;
    try {
      await api.patch(`/jurusan/${id}/restore`);
      toast.success('Jurusan dipulihkan');
      load();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  return (
    <div>
      <div className="mb-4 flex flex-col items-start justify-between gap-3 md:flex-row md:items-center">
        <h1 className="text-2xl font-bold text-slate-900">Master Jurusan</h1>
        {tab === 'list' && hasPermission('jurusan.manage') && (
          <button onClick={() => setShowForm(!showForm)} className="btn-primary">
            <Plus size={16} /> {showForm ? 'Tutup' : 'Jurusan Baru'}
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="mb-4 flex gap-1 rounded-lg bg-slate-200 p-1">
        <button
          onClick={() => setTab('list')}
          className={`flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition ${
            tab === 'list' ? 'bg-white text-primary-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <ListChecks size={16} /> Daftar Jurusan
        </button>
        <button
          onClick={() => setTab('history')}
          className={`flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition ${
            tab === 'history' ? 'bg-white text-primary-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'
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
          >
            {showForm && (
              <motion.form
                initial={{ y: -8, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ duration: 0.2 }}
                onSubmit={onSubmit}
                className="card mb-4 space-y-3"
              >
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <div>
                    <label className="label">Kode Jurusan *</label>
                    <input
                      className="input"
                      placeholder="TKJ"
                      value={form.code}
                      onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                      required
                    />
                  </div>
                  <div>
                    <label className="label">Nama Jurusan *</label>
                    <input
                      className="input"
                      placeholder="Teknik Komputer dan Jaringan"
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                      required
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <button type="button" onClick={() => setShowForm(false)} className="btn-ghost">Batal</button>
                  <button type="submit" className="btn-primary">Simpan</button>
                </div>
              </motion.form>
            )}

            <div className="mb-3 flex items-center gap-2">
              <label className="flex items-center gap-2 text-sm text-slate-600">
                <input
                  type="checkbox"
                  checked={includeDeleted}
                  onChange={(e) => setIncludeDeleted(e.target.checked)}
                />
                Tampilkan jurusan yang sudah dihapus
              </label>
            </div>

            <div className="card overflow-hidden p-0">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="border-b border-slate-200 bg-slate-50">
                    <tr>
                      <th className="table-th">Kode</th>
                      <th className="table-th">Nama</th>
                      <th className="table-th">Status</th>
                      <th className="table-th">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {loading ? (
                      <tr><td colSpan={4} className="table-td text-center text-slate-500">Memuat…</td></tr>
                    ) : items.length === 0 ? (
                      <tr><td colSpan={4} className="table-td text-center text-slate-500">Belum ada jurusan</td></tr>
                    ) : items.map((j) => (
                      <tr key={j.id} className={j.deletedAt ? 'bg-red-50/40' : ''}>
                        <td className="table-td font-mono font-semibold">{j.code}</td>
                        <td className="table-td">
                          {j.name}
                          {j.deletedAt && (
                            <div className="mt-0.5 text-xs text-red-600">
                              Dihapus {new Date(j.deletedAt).toLocaleDateString('id-ID')}
                            </div>
                          )}
                        </td>
                        <td className="table-td">
                          <span className={`badge ${
                            j.deletedAt
                              ? 'bg-red-100 text-red-700'
                              : j.isActive
                              ? 'bg-emerald-100 text-emerald-700'
                              : 'bg-slate-200 text-slate-600'
                          }`}>
                            {j.deletedAt ? 'Dihapus' : j.isActive ? 'Aktif' : 'Nonaktif'}
                          </span>
                        </td>
                        <td className="table-td">
                          <div className="flex flex-wrap gap-1">
                            {hasPermission('jurusan.manage') && !j.deletedAt && (
                              <>
                                <button
                                  onClick={() => toggleActive(j.id, j.isActive)}
                                  className="btn-ghost text-xs"
                                >
                                  {j.isActive ? 'Nonaktifkan' : 'Aktifkan'}
                                </button>
                                <button
                                  onClick={() => softDelete(j.id)}
                                  className="btn-ghost text-xs text-red-600 hover:bg-red-50"
                                >
                                  <Trash2 size={12} /> Hapus
                                </button>
                              </>
                            )}
                            {hasPermission('jurusan.manage') && j.deletedAt && (
                              <button
                                onClick={() => restore(j.id)}
                                className="btn-ghost text-xs text-blue-600 hover:bg-blue-50"
                              >
                                <Undo2 size={12} /> Restore
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </motion.div>
        ) : (
          <HistoryTab key="history" module="jurusan" title="Riwayat Perubahan Master Jurusan" />
        )}
      </AnimatePresence>
    </div>
  );
}
