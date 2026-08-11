import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';

export default function UsersPage() {
  const { hasPermission } = useAuth();
  const [items, setItems] = useState<any[]>([]);
  const [roles, setRoles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ email: '', name: '', password: '', roleIds: [] as string[] });

  const load = async () => {
    setLoading(true);
    try {
      const [u, r] = await Promise.all([
        api.get('/users', { params: { pageSize: 100 } }),
        api.get('/roles'),
      ]);
      setItems(u.data.items);
      setRoles(r.data);
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
      await api.post('/users', form);
      toast.success('User dibuat');
      setForm({ email: '', name: '', password: '', roleIds: [] });
      setShowForm(false);
      load();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const toggleActive = async (id: string, current: boolean) => {
    try {
      await api.patch(`/users/${id}`, { isActive: !current });
      toast.success('Status user diperbarui');
      load();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">Manajemen User</h1>
        {hasPermission('user.manage') && (
          <button onClick={() => setShowForm(!showForm)} className="btn-primary">
            <Plus size={16} /> {showForm ? 'Tutup' : 'Tambah User'}
          </button>
        )}
      </div>

      {showForm && (
        <motion.form
          initial={{ y: -8, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          onSubmit={onSubmit}
          className="card mb-4 space-y-3"
        >
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div>
              <label className="label">Email *</label>
              <input
                className="input"
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                required
              />
            </div>
            <div>
              <label className="label">Nama *</label>
              <input
                className="input"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
              />
            </div>
            <div>
              <label className="label">Password (min 8) *</label>
              <input
                className="input"
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                required
                minLength={8}
              />
            </div>
            <div>
              <label className="label">Role *</label>
              <div className="space-y-1 rounded-lg border border-slate-200 p-2">
                {roles.map((r) => (
                  <label key={r.id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={form.roleIds.includes(r.id)}
                      onChange={(e) => {
                        const ids = e.target.checked
                          ? [...form.roleIds, r.id]
                          : form.roleIds.filter((x) => x !== r.id);
                        setForm({ ...form, roleIds: ids });
                      }}
                    />
                    {r.name} <span className="text-xs text-slate-500">— {r.description}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setShowForm(false)} className="btn-ghost">Batal</button>
            <button type="submit" className="btn-primary">Simpan</button>
          </div>
        </motion.form>
      )}

      <div className="card overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="border-b border-slate-200 bg-slate-50">
              <tr>
                <th className="table-th">Email</th>
                <th className="table-th">Nama</th>
                <th className="table-th">Role</th>
                <th className="table-th">Status</th>
                <th className="table-th">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td colSpan={5} className="table-td text-center text-slate-500">Memuat…</td></tr>
              ) : items.map((u) => (
                <tr key={u.id}>
                  <td className="table-td">{u.email}</td>
                  <td className="table-td font-medium">{u.name}</td>
                  <td className="table-td">
                    <div className="flex flex-wrap gap-1">
                      {u.roles.map((r: any) => (
                        <span key={r.id} className="badge bg-primary-100 text-primary-700">{r.name}</span>
                      ))}
                    </div>
                  </td>
                  <td className="table-td">
                    <span className={`badge ${u.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'}`}>
                      {u.isActive ? 'Aktif' : 'Nonaktif'}
                    </span>
                  </td>
                  <td className="table-td">
                    {hasPermission('user.manage') && (
                      <button
                        onClick={() => toggleActive(u.id, u.isActive)}
                        className="text-xs text-primary-600 hover:underline"
                      >
                        {u.isActive ? 'Nonaktifkan' : 'Aktifkan'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
