import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Plus, Shield } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';

export default function RolesPage() {
  const { hasPermission } = useAuth();
  const [roles, setRoles] = useState<any[]>([]);
  const [perms, setPerms] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<any | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', description: '', permissionIds: [] as string[] });

  const load = async () => {
    setLoading(true);
    try {
      const [r, p] = await Promise.all([
        api.get('/roles'),
        api.get('/permissions/grouped'),
      ]);
      setRoles(r.data);
      setPerms(p.data);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const openEdit = (role: any) => {
    setEditing(role);
    setForm({
      name: role.name,
      description: role.description || '',
      permissionIds: role.permissions.map((p: any) => p.id),
    });
    setShowForm(true);
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editing) {
        await api.patch(`/roles/${editing.id}`, form);
        toast.success('Role diperbarui');
      } else {
        await api.post('/roles', form);
        toast.success('Role dibuat');
      }
      setShowForm(false);
      setEditing(null);
      setForm({ name: '', description: '', permissionIds: [] });
      load();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const togglePerm = (id: string, checked: boolean) => {
    setForm((f) => ({
      ...f,
      permissionIds: checked
        ? [...f.permissionIds, id]
        : f.permissionIds.filter((x) => x !== id),
    }));
  };

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">Role & Permission</h1>
        {hasPermission('role.manage') && (
          <button
            onClick={() => {
              setEditing(null);
              setForm({ name: '', description: '', permissionIds: [] });
              setShowForm(true);
            }}
            className="btn-primary"
          >
            <Plus size={16} /> Role Baru
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
              <label className="label">Nama Role *</label>
              <input
                className="input"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
                disabled={editing?.isSystem}
              />
            </div>
            <div>
              <label className="label">Deskripsi</label>
              <input
                className="input"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-slate-700">Permission</h3>
            <div className="mt-2 space-y-3">
              {perms.map((g: any) => (
                <div key={g.module} className="rounded-lg border border-slate-200 p-3">
                  <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                    {g.module}
                  </div>
                  <div className="mt-2 grid grid-cols-1 gap-1 sm:grid-cols-2">
                    {g.permissions.map((p: any) => (
                      <label key={p.id} className="flex items-start gap-2 text-sm">
                        <input
                          type="checkbox"
                          className="mt-0.5"
                          checked={form.permissionIds.includes(p.id)}
                          onChange={(e) => togglePerm(p.id, e.target.checked)}
                        />
                        <div>
                          <div className="font-mono text-xs text-slate-500">{p.code}</div>
                          <div className="text-slate-700">{p.description}</div>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setShowForm(false)} className="btn-ghost">Batal</button>
            <button type="submit" className="btn-primary">Simpan</button>
          </div>
        </motion.form>
      )}

      {loading ? (
        <div className="text-slate-500">Memuat…</div>
      ) : (
        <div className="space-y-3">
          {roles.map((r) => (
            <div key={r.id} className="card">
              <div className="flex flex-col items-start justify-between gap-2 md:flex-row md:items-center">
                <div>
                  <div className="flex items-center gap-2">
                    <Shield size={16} className="text-primary-500" />
                    <h2 className="font-semibold text-slate-900">{r.name}</h2>
                    {r.isSystem && <span className="badge bg-slate-200 text-slate-600">Sistem</span>}
                  </div>
                  <p className="text-sm text-slate-500">{r.description || 'Tanpa deskripsi'}</p>
                  <p className="mt-1 text-xs text-slate-400">
                    {r.userCount} user · {r.permissions.length} permission
                  </p>
                </div>
                {hasPermission('role.manage') && (
                  <button onClick={() => openEdit(r)} className="btn-ghost text-xs">
                    Edit
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
