import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, History, ListChecks } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';

type Tab = 'list' | 'history';

export default function GelombangPage() {
  const { hasPermission } = useAuth();
  const [tab, setTab] = useState<Tab>('list');
  const [items, setItems] = useState<any[]>([]);
  const [jurusanList, setJurusanList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    name: '',
    startDate: '',
    endDate: '',
    isActive: true,
    kuota: [] as { jurusanId: string; quota: number }[],
  });

  const load = async () => {
    setLoading(true);
    try {
      const [g, j] = await Promise.all([
        api.get('/gelombang'),
        api.get('/jurusan'),
      ]);
      setItems(g.data);
      setJurusanList(j.data);
      setForm((f) => ({
        ...f,
        kuota: j.data.map((x: any) => ({ jurusanId: x.id, quota: 0 })),
      }));
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post('/gelombang', form);
      toast.success('Gelombang dibuat');
      setShowForm(false);
      setForm({ name: '', startDate: '', endDate: '', isActive: true, kuota: [] });
      load();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const toggleActive = async (id: string, isActive: boolean) => {
    try {
      await api.patch(`/gelombang/${id}`, { isActive: !isActive });
      toast.success('Status diperbarui');
      load();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  return (
    <div>
      <div className="mb-4 flex flex-col items-start justify-between gap-3 md:flex-row md:items-center">
        <h1 className="text-2xl font-bold text-slate-900">Gelombang SPMB</h1>
        {tab === 'list' && hasPermission('gelombang.manage') && (
          <button onClick={() => setShowForm(!showForm)} className="btn-primary">
            <Plus size={16} /> {showForm ? 'Tutup' : 'Gelombang Baru'}
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
          <ListChecks size={16} /> Daftar Gelombang
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
                className="card mb-4 space-y-4"
              >
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <div>
                    <label className="label">Nama Gelombang *</label>
                    <input
                      className="input"
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                      required
                    />
                  </div>
                  <div>
                    <label className="label">Status</label>
                    <select
                      className="input"
                      value={form.isActive ? '1' : '0'}
                      onChange={(e) => setForm({ ...form, isActive: e.target.value === '1' })}
                    >
                      <option value="1">Aktif</option>
                      <option value="0">Nonaktif</option>
                    </select>
                  </div>
                  <div>
                    <label className="label">Tanggal Mulai *</label>
                    <input
                      className="input"
                      type="date"
                      value={form.startDate}
                      onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                      required
                    />
                  </div>
                  <div>
                    <label className="label">Tanggal Selesai (opsional)</label>
                    <input
                      className="input"
                      type="date"
                      value={form.endDate}
                      onChange={(e) => setForm({ ...form, endDate: e.target.value })}
                    />
                  </div>
                </div>

                <div>
                  <h3 className="text-sm font-semibold text-slate-700">Kuota per Jurusan</h3>
                  <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {form.kuota.map((k, i) => {
                      const j = jurusanList.find((x) => x.id === k.jurusanId);
                      return (
                        <div key={k.jurusanId} className="flex items-center gap-2 rounded-lg border border-slate-200 p-2">
                          <div className="flex-1">
                            <div className="text-sm font-medium">{j?.code} — {j?.name}</div>
                          </div>
                          <input
                            className="input w-24"
                            type="number"
                            min={0}
                            value={k.quota}
                            onChange={(e) => {
                              const newKuota = [...form.kuota];
                              newKuota[i] = { ...k, quota: Number(e.target.value) };
                              setForm({ ...form, kuota: newKuota });
                            }}
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="flex justify-end gap-2">
                  <button type="button" onClick={() => setShowForm(false)} className="btn-ghost">Batal</button>
                  <button type="submit" className="btn-primary">Simpan</button>
                </div>
              </motion.form>
            )}

            <div className="space-y-4">
              {loading ? (
                <div className="text-slate-500">Memuat…</div>
              ) : items.length === 0 ? (
                <div className="card text-center text-slate-500">Belum ada gelombang</div>
              ) : items.map((g) => (
                <div key={g.id} className="card">
                  <div className="flex flex-col items-start justify-between gap-2 md:flex-row md:items-center">
                    <div>
                      <h2 className="font-semibold text-slate-900">{g.name}</h2>
                      <p className="text-sm text-slate-500">
                        {new Date(g.startDate).toLocaleDateString('id-ID')}
                        {g.endDate && ` — ${new Date(g.endDate).toLocaleDateString('id-ID')}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`badge ${g.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'}`}>
                        {g.isActive ? 'Aktif' : 'Nonaktif'}
                      </span>
                      {hasPermission('gelombang.manage') && (
                        <button
                          onClick={() => toggleActive(g.id, g.isActive)}
                          className="btn-ghost text-xs"
                        >
                          {g.isActive ? 'Nonaktifkan' : 'Aktifkan'}
                        </button>
                      )}
                    </div>
                  </div>
                  {g.kuota?.length > 0 && (
                    <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
                      {g.kuota.map((k: any) => (
                        <div key={k.id} className="rounded-lg bg-slate-50 p-2 text-sm">
                          <div className="font-medium">{k.jurusanCode}</div>
                          <div className="text-xs text-slate-500">{k.jurusanName}</div>
                          <div className="mt-1 text-xs">
                            <span className="font-semibold">{k.used}</span> / {k.quota}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </motion.div>
        ) : (
          <HistoryTab key="history" module="gelombang" title="Riwayat Penambahan & Perubahan Gelombang" />
        )}
      </AnimatePresence>
    </div>
  );
}

/**
 * Tab history bersama (dipakai Gelombang & Jurusan).
 * Mengambil dari /audit-logs?module=...
 */
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
      case 'gelombang.created': return 'Tambah Gelombang';
      case 'gelombang.updated': return 'Edit Gelombang';
      case 'gelombang.deactivated': return 'Nonaktifkan Gelombang';
      case 'jurusan.created': return 'Tambah Jurusan';
      case 'jurusan.updated': return 'Edit Jurusan';
      case 'jurusan.deleted': return 'Hapus Jurusan';
      case 'jurusan.restored': return 'Restore Jurusan';
      default: return a;
    }
  };

  const actionColor = (a: string) => {
    if (a.endsWith('.deleted') || a.endsWith('.deactivated')) return 'bg-red-100 text-red-700';
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
                <tr><td colSpan={4} className="table-td text-center text-slate-500">Memuat…</td></tr>
              ) : items.length === 0 ? (
                <tr><td colSpan={4} className="table-td text-center text-slate-500">Belum ada riwayat</td></tr>
              ) : items.map((l) => (
                <tr key={l.id}>
                  <td className="table-td text-xs text-slate-500 whitespace-nowrap">
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
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </motion.div>
  );
}
