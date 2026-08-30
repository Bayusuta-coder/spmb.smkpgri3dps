import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Eye,
  EyeOff,
  Plus,
  ShieldCheck,
  ShieldOff,
  ShieldAlert,
  Send,
  Pencil,
  Trash2,
  KeyRound,
  ToggleLeft,
  ToggleRight,
  AlertTriangle,
  X,
  Check,
} from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import WhatsappVerificationModal from '../components/WhatsappVerificationModal';
import IconButton from '../components/IconButton';

const SUPERADMIN_ROLE_NAME = 'Superadmin';

export default function UsersPage() {
  const { hasAnyRole, hasPermission } = useAuth();
  // Hanya Superadmin yang boleh mengelola user (create/update/delete/reset).
  // Lihat backend `users.controller.ts:assertSuperadmin()` — server-side
  // tetap enforce walaupun UI di-hide, jadi layer pertahanan dobel.
  const canManageUsers = hasAnyRole('Superadmin');
  // Permission terpisah untuk ganti nomor WA user lain (Superadmin punya, admin juga bisa dapat)
  const canManageWa = hasPermission('whatsapp.manage');

  const [items, setItems] = useState<any[]>([]);
  const [roles, setRoles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [form, setForm] = useState({
    email: '',
    name: '',
    password: '',
    whatsappNumber: '',
    roleIds: [] as string[],
  });
  const [editing, setEditing] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<{
    name: string;
    email: string;
    whatsappNumber: string;
    roleIds: string[];
  }>({ name: '', email: '', whatsappNumber: '', roleIds: [] });
  const [waModal, setWaModal] = useState<{ userId: string; name: string; current: string } | null>(null);

  // Modal: konfirmasi hapus user.
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string; email: string } | null>(null);
  // Modal: reset password user.
  const [resetTarget, setResetTarget] = useState<{ id: string; name: string; email: string } | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  // Filter/search.
  const [search, setSearch] = useState('');
  const [filterRoleId, setFilterRoleId] = useState('');
  const [filterIsActive, setFilterIsActive] = useState<'all' | 'active' | 'inactive'>('all');

  const load = async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = { pageSize: '100' };
      if (search.trim()) params.search = search.trim();
      if (filterRoleId) params.roleId = filterRoleId;
      if (filterIsActive !== 'all') params.isActive = filterIsActive === 'active' ? 'true' : 'false';
      const [u, r] = await Promise.all([
        api.get('/users', { params }),
        api.get('/roles'),
      ]);
      setItems(u.data.items);
      setRoles(r.data);
    } catch (e: any) {
      toast.error(e?.response?.data?.message ?? e?.message ?? 'Gagal memuat user');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [filterRoleId, filterIsActive]);
  // Debounced search.
  useEffect(() => {
    const t = setTimeout(() => load(), 250);
    return () => clearTimeout(t);
  }, [search]);

  // Hitung jumlah Superadmin aktif — untuk UI guard last-superadmin.
  const activeSuperadminCount = useMemo(
    () =>
      items.filter(
        (u) =>
          u.isActive && u.roles.some((r: any) => r.name === SUPERADMIN_ROLE_NAME),
      ).length,
    [items],
  );
  const isLastSuperadmin = (u: any) =>
    u.isActive &&
    u.roles.some((r: any) => r.name === SUPERADMIN_ROLE_NAME) &&
    activeSuperadminCount === 1;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.email.trim() || !form.name.trim() || !form.password || form.roleIds.length === 0) {
      toast.error('Email, nama, password, dan minimal 1 role wajib diisi');
      return;
    }
    if (form.password.length < 8) {
      toast.error('Password minimal 8 karakter');
      return;
    }
    try {
      await api.post('/users', form);
      toast.success('User dibuat');
      setForm({ email: '', name: '', password: '', whatsappNumber: '', roleIds: [] });
      setShowForm(false);
      load();
    } catch (e: any) {
      toast.error(e?.response?.data?.message ?? e?.message ?? 'Gagal membuat user');
    }
  };

  const toggleActive = async (u: any) => {
    const willActivate = !u.isActive;
    // UI guard: cegah nonaktif Superadmin terakhir.
    if (!willActivate && isLastSuperadmin(u)) {
      toast.error(
        'Tidak dapat menonaktifkan Superadmin terakhir. Minimal harus ada 1 akun Superadmin aktif.',
      );
      return;
    }
    try {
      await api.patch(`/users/${u.id}`, { isActive: willActivate });
      toast.success(willActivate ? 'User diaktifkan' : 'User dinonaktifkan');
      load();
    } catch (e: any) {
      toast.error(e?.response?.data?.message ?? e?.message ?? 'Gagal update status');
    }
  };

  const startEdit = (u: any) => {
    setEditing(u.id);
    setEditDraft({
      name: u.name,
      email: u.email,
      whatsappNumber: u.whatsappNumber ?? '',
      roleIds: (u.roles ?? []).map((r: any) => r.id),
    });
  };

  const cancelEdit = () => {
    setEditing(null);
  };

  const saveEdit = async (id: string) => {
    const { name, email, whatsappNumber, roleIds } = editDraft;
    if (!name.trim() || !email.trim()) {
      toast.error('Nama & email wajib diisi');
      return;
    }
    // UI guard: cegah role berubah melepas Superadmin terakhir.
    const u = items.find((x) => x.id === id);
    if (u && isLastSuperadmin(u)) {
      const stillSuperadmin = roleIds.some((rid) =>
        roles.find((r) => r.id === rid)?.name === SUPERADMIN_ROLE_NAME,
      );
      if (!stillSuperadmin) {
        toast.error(
          'Tidak dapat melepas role Superadmin dari Superadmin terakhir. Minimal harus ada 1 Superadmin aktif.',
        );
        return;
      }
    }
    try {
      // 1) Update nama, email, dan role lewat endpoint utama.
      await api.patch(`/users/${id}`, {
        name: name.trim(),
        email: email.trim(),
        roleIds,
      });
      // 2) Update nomor WA lewat endpoint khusus admin (reset verified + cancel OTP kalau berubah).
      const originalWa = u?.whatsappNumber ?? '';
      if (whatsappNumber !== originalWa) {
        try {
          const wa = await api.put(`/whatsapp/admin/users/${id}/number`, {
            whatsappNumber,
          });
          if (!wa.data?.ok) {
            toast.error(`Nomor WA: ${wa.data?.error ?? 'gagal disimpan'}`);
          }
        } catch (e2: any) {
          toast.error(e2?.response?.data?.error ?? e2?.message ?? 'Gagal update WA');
        }
      }
      toast.success('User disimpan');
      cancelEdit();
      load();
    } catch (e: any) {
      toast.error(e?.response?.data?.message ?? e?.message ?? 'Gagal update user');
    }
  };

  // Hapus PERMANEN (hard delete via API: DELETE /users/:id).
  const handleDelete = async () => {
    if (!deleteTarget) return;
    setActionLoading(true);
    try {
      await api.delete(`/users/${deleteTarget.id}`);
      toast.success(`User ${deleteTarget.name} dihapus permanen`);
      setDeleteTarget(null);
      load();
    } catch (e: any) {
      toast.error(e?.response?.data?.message ?? e?.message ?? 'Gagal menghapus user');
    } finally {
      setActionLoading(false);
    }
  };

  // Reset password oleh Superadmin.
  const handleResetPassword = async () => {
    if (!resetTarget) return;
    if (!newPassword || newPassword.length < 8) {
      toast.error('Password minimal 8 karakter');
      return;
    }
    setActionLoading(true);
    try {
      await api.patch(`/users/${resetTarget.id}/reset-password`, {
        newPassword,
      });
      toast.success(`Password user ${resetTarget.name} direset`);
      setResetTarget(null);
      setNewPassword('');
    } catch (e: any) {
      toast.error(e?.response?.data?.message ?? e?.message ?? 'Gagal reset password');
    } finally {
      setActionLoading(false);
    }
  };

  const formatDate = (d: string) =>
    new Intl.DateTimeFormat('id-ID', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }).format(new Date(d));

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Manajemen User</h1>
          {!canManageUsers && (
            <p className="mt-1 text-xs text-slate-500">
              Hanya role <b>Superadmin</b> yang dapat mengelola user.
            </p>
          )}
        </div>
        {canManageUsers && (
          <button onClick={() => setShowForm(!showForm)} className="btn-primary">
            <Plus size={16} /> {showForm ? 'Tutup' : 'Tambah User'}
          </button>
        )}
      </div>

      {/* ── Form Tambah User ──────────────────────────────────────────── */}
      {showForm && (
        <motion.form
          initial={{ y: -8, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          onSubmit={onSubmit}
          className="card mb-4 space-y-3"
        >
          <h2 className="text-lg font-semibold text-slate-900">Tambah User Baru</h2>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div>
              <label className="label">Email *</label>
              <input
                className="input"
                type="email"
                placeholder="user@smk-pgri3dps.sch.id"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                required
              />
              <p className="mt-1 text-xs text-slate-500">Wajib unik, dipakai untuk login & lupa password.</p>
            </div>
            <div>
              <label className="label">Nama Lengkap *</label>
              <input
                className="input"
                placeholder="Cth: Budi Santoso"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
              />
            </div>
            <div>
              <label className="label">Password awal * (min 8 karakter)</label>
              <div className="relative">
                <input
                  className="input pr-10"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Minimal 8 karakter"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  required
                  minLength={8}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((s) => !s)}
                  className="absolute inset-y-0 right-0 flex items-center px-3 text-slate-500 hover:text-slate-700"
                  aria-label={showPassword ? 'Sembunyikan password' : 'Tampilkan password'}
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>
            <div>
              <label className="label">Nomor WhatsApp (opsional)</label>
              <input
                className="input"
                type="tel"
                placeholder="081234567890 (format Indonesia)"
                value={form.whatsappNumber}
                onChange={(e) => setForm({ ...form, whatsappNumber: e.target.value })}
              />
              <p className="mt-1 text-xs text-slate-500">
                Dipakai untuk menerima notifikasi rekap harian via Fonnte. Bisa diisi nanti.
              </p>
            </div>
            <div className="md:col-span-2">
              <label className="label">Role * (pilih minimal 1)</label>
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
                    <span className="font-medium">{r.name}</span>
                    <span className="text-xs text-slate-500">— {r.description}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
            <button type="button" onClick={() => setShowForm(false)} className="btn-ghost">Batal</button>
            <button type="submit" className="btn-primary">Simpan User</button>
          </div>
        </motion.form>
      )}

      {/* ── Filter bar ──────────────────────────────────────────────────── */}
      <div className="card mb-3 flex flex-wrap items-center gap-2 p-3">
        <input
          className="input max-w-xs"
          placeholder="Cari nama / email…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className="input max-w-xs"
          value={filterRoleId}
          onChange={(e) => setFilterRoleId(e.target.value)}
        >
          <option value="">Semua role</option>
          {roles.map((r) => (
            <option key={r.id} value={r.id}>{r.name}</option>
          ))}
        </select>
        <select
          className="input max-w-xs"
          value={filterIsActive}
          onChange={(e) => setFilterIsActive(e.target.value as any)}
        >
          <option value="all">Semua status</option>
          <option value="active">Aktif</option>
          <option value="inactive">Nonaktif</option>
        </select>
        <div className="ml-auto text-xs text-slate-500">
          {loading ? 'Memuat…' : `${items.length} user`}
        </div>
      </div>

      {/* ── Tabel user ──────────────────────────────────────────────────── */}
      <div className="card overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="border-b border-slate-200 bg-slate-50">
              <tr>
                <th className="table-th">Email</th>
                <th className="table-th">Nama</th>
                <th className="table-th">Role</th>
                <th className="table-th">WhatsApp</th>
                <th className="table-th">Status</th>
                <th className="table-th">Dibuat</th>
                <th className="table-th text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td colSpan={7} className="table-td text-center text-slate-500">Memuat…</td></tr>
              ) : items.length === 0 ? (
                <tr><td colSpan={7} className="table-td text-center text-slate-500">Belum ada user</td></tr>
              ) : items.map((u) => {
                const isEditing = editing === u.id;
                const last = isLastSuperadmin(u);
                return (
                  <tr key={u.id} className={last ? 'bg-amber-50/30' : ''}>
                    <td className="table-td font-mono text-xs">
                      {isEditing ? (
                        <input
                          className="input"
                          type="email"
                          value={editDraft.email}
                          onChange={(e) => setEditDraft({ ...editDraft, email: e.target.value })}
                        />
                      ) : (
                        u.email
                      )}
                    </td>
                    <td className="table-td font-medium">
                      {isEditing ? (
                        <input
                          className="input"
                          value={editDraft.name}
                          onChange={(e) => setEditDraft({ ...editDraft, name: e.target.value })}
                        />
                      ) : (
                        u.name
                      )}
                    </td>
                    <td className="table-td">
                      {isEditing ? (
                        <div className="space-y-1 rounded-lg border border-slate-200 p-2">
                          {roles.map((r) => (
                            <label key={r.id} className="flex items-center gap-2 text-xs">
                              <input
                                type="checkbox"
                                checked={editDraft.roleIds.includes(r.id)}
                                disabled={last && r.name === SUPERADMIN_ROLE_NAME}
                                onChange={(e) => {
                                  const ids = e.target.checked
                                    ? [...editDraft.roleIds, r.id]
                                    : editDraft.roleIds.filter((x) => x !== r.id);
                                  setEditDraft({ ...editDraft, roleIds: ids });
                                }}
                              />
                              {r.name}
                              {last && r.name === SUPERADMIN_ROLE_NAME && (
                                <span className="text-[10px] text-amber-700">(wajib)</span>
                              )}
                            </label>
                          ))}
                        </div>
                      ) : u.roles.length === 0 ? (
                        <span
                          className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500"
                          title="User ini belum punya role — tidak punya akses menu apapun sampai di-assign role."
                        >
                          <ShieldOff size={11} /> Belum Ada Role
                        </span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {u.roles.map((r: any) => (
                            <span key={r.id} className="badge bg-primary-100 text-primary-700">{r.name}</span>
                          ))}
                          {last && (
                            <span
                              className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700"
                              title="Superadmin terakhir, tidak boleh dinonaktifkan/dihapus"
                            >
                              <ShieldAlert size={11} /> Superadmin terakhir
                            </span>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="table-td">
                      {canManageWa && isEditing ? (
                        <input
                          className="input font-mono text-xs"
                          placeholder="081234567890"
                          value={editDraft.whatsappNumber}
                          onChange={(e) =>
                            setEditDraft({ ...editDraft, whatsappNumber: e.target.value })
                          }
                        />
                      ) : u.whatsappNumber ? (
                        <div className="space-y-1">
                          <div className="font-mono text-xs">{u.whatsappNumber}</div>
                          <div className="flex">
                            {u.whatsappVerifiedAt ? (
                              <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
                                <ShieldCheck size={11} /> Verified
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                                <ShieldOff size={11} /> Belum verify
                              </span>
                            )}
                          </div>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400">-</span>
                      )}
                    </td>
                    <td className="table-td">
                      <span
                        className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${
                          u.isActive
                            ? 'bg-emerald-100 text-emerald-700'
                            : 'bg-slate-200 text-slate-600'
                        }`}
                      >
                        <span
                          className={`h-1.5 w-1.5 rounded-full ${
                            u.isActive ? 'bg-emerald-500' : 'bg-slate-400'
                          }`}
                        />
                        {u.isActive ? 'Aktif' : 'Nonaktif'}
                      </span>
                    </td>
                    <td className="table-td text-xs text-slate-500 whitespace-nowrap">
                      {u.createdAt ? formatDate(u.createdAt) : '-'}
                    </td>
                    <td className="table-td">
                      {isEditing ? (
                        <div className="flex justify-end gap-1">
                          <IconButton
                            tone="emerald"
                            label="Simpan perubahan"
                            onClick={() => saveEdit(u.id)}
                          >
                            <Check size={16} />
                          </IconButton>
                          <IconButton tone="slate" label="Batal edit" onClick={cancelEdit}>
                            <X size={16} />
                          </IconButton>
                        </div>
                      ) : (
                        <div className="flex justify-end gap-1">
                          {canManageUsers && (
                            <IconButton
                              tone="primary"
                              label={`Edit user ${u.name}`}
                              onClick={() => startEdit(u)}
                            >
                              <Pencil size={16} />
                            </IconButton>
                          )}
                          {canManageWa && u.whatsappNumber && (
                            <IconButton
                              tone="emerald"
                              label={`Kirim OTP verifikasi WhatsApp ke ${u.whatsappNumber}`}
                              onClick={() =>
                                setWaModal({
                                  userId: u.id,
                                  name: u.name,
                                  current: u.whatsappNumber,
                                })
                              }
                            >
                              <Send size={16} />
                            </IconButton>
                          )}
                          {canManageUsers && (
                            <IconButton
                              tone={u.isActive ? 'amber' : 'emerald'}
                              label={
                                u.isActive
                                  ? `Nonaktifkan ${u.name}`
                                  : `Aktifkan ${u.name}`
                              }
                              disabled={!u.isActive && last}
                              onClick={() => toggleActive(u)}
                            >
                              {u.isActive ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}
                            </IconButton>
                          )}
                          {canManageUsers && (
                            <IconButton
                              tone="blue"
                              label={`Reset password ${u.name}`}
                              onClick={() =>
                                setResetTarget({ id: u.id, name: u.name, email: u.email })
                              }
                            >
                              <KeyRound size={16} />
                            </IconButton>
                          )}
                          {canManageUsers && (
                            <IconButton
                              tone="rose"
                              label={
                                last
                                  ? `Tidak bisa menghapus Superadmin terakhir`
                                  : `Hapus permanen ${u.name}`
                              }
                              disabled={last}
                              onClick={() =>
                                setDeleteTarget({ id: u.id, name: u.name, email: u.email })
                              }
                            >
                              <Trash2 size={16} />
                            </IconButton>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {waModal && (
        <WhatsappVerificationModal
          open={Boolean(waModal)}
          onClose={() => setWaModal(null)}
          initialNumber={waModal.current}
          title={`Verifikasi WhatsApp untuk ${waModal.name}`}
          onSuccess={async () => {
            setWaModal(null);
            await load();
          }}
        />
      )}

      {/* ── Modal Konfirmasi Hapus (HARD DELETE) ───────────────────────── */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="card w-full max-w-md"
          >
            <div className="mb-3 flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-rose-100">
                <AlertTriangle className="text-rose-600" size={20} />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-slate-900">Hapus Permanen User?</h3>
                <p className="mt-1 text-sm text-slate-600">
                  Yakin ingin <b>menghapus permanen</b> user <b>{deleteTarget.name}</b> ({deleteTarget.email})?
                  Akun ini akan hilang dari database dan tidak bisa login lagi.
                </p>
                <p className="mt-2 text-xs text-slate-600">
                  💡 Untuk sementara menonaktifkan user (bisa diaktifkan lagi),
                  gunakan tombol <b>Nonaktifkan</b> di kolom aksi.
                </p>
                <p className="mt-2 text-xs text-amber-700">
                  ⚠️ Data histori (transaksi, log, snapshot pendaftar) tetap tersimpan
                  dengan snapshot nama/email user — audit trail tidak hilang walau
                  akun dihapus.
                </p>
              </div>
              <button onClick={() => setDeleteTarget(null)} className="text-slate-400 hover:text-slate-600">
                <X size={18} />
              </button>
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                disabled={actionLoading}
                className="btn-ghost"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={actionLoading}
                className="btn-primary bg-rose-600 hover:bg-rose-700 disabled:opacity-50"
              >
                {actionLoading ? 'Menghapus…' : 'Ya, Hapus Permanen'}
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* ── Modal Reset Password ────────────────────────────────────────── */}
      {resetTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="card w-full max-w-md"
          >
            <div className="mb-3 flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-100">
                <KeyRound className="text-blue-600" size={20} />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-slate-900">Reset Password</h3>
                <p className="mt-1 text-sm text-slate-600">
                  Set password baru untuk user <b>{resetTarget.name}</b> ({resetTarget.email}).
                  User harus login dengan password baru ini.
                </p>
              </div>
              <button onClick={() => { setResetTarget(null); setNewPassword(''); }} className="text-slate-400 hover:text-slate-600">
                <X size={18} />
              </button>
            </div>
            <div>
              <label className="label">Password Baru (min 8 karakter)</label>
              <div className="relative">
                <input
                  className="input pr-10"
                  type={showNewPassword ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Minimal 8 karakter"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => setShowNewPassword((s) => !s)}
                  className="absolute inset-y-0 right-0 flex items-center px-3 text-slate-500 hover:text-slate-700"
                  tabIndex={-1}
                >
                  {showNewPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              <p className="mt-1 text-xs text-slate-500">
                Pastikan sampaikan password baru ke user via kanal aman (telepon, WhatsApp langsung).
              </p>
            </div>
            <div className="mt-4 flex justify-end gap-2 border-t border-slate-100 pt-3">
              <button
                type="button"
                onClick={() => { setResetTarget(null); setNewPassword(''); }}
                disabled={actionLoading}
                className="btn-ghost"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleResetPassword}
                disabled={actionLoading || !newPassword || newPassword.length < 8}
                className="btn-primary disabled:opacity-50"
              >
                {actionLoading ? 'Menyimpan…' : 'Reset Password'}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
