import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  ChevronDown,
  ChevronRight,
  Plus,
  Save,
  Shield,
  Undo2,
  History,
  Lock,
} from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import ToggleSwitch from '../components/ToggleSwitch';
import LogEntryCard from '../components/LogEntryCard';
import { formatLogDetail } from '../lib/logFormatter';
import {
  PERMISSION_UI_LABELS,
  PERMISSION_SECTION_ORDER,
  type PermissionMeta,
} from '../lib/constants';

/**
 * Roles & Permission Matrix View (Final Redesign).
 *
 * AKSES — hanya Superadmin yang boleh EDIT (lihat backend RolesController
 * yang sudah di-gate `@RolesOnly('Superadmin')`). Permission `role.manage`
 * saja tidak cukup karena permission itu sendiri bisa di-toggle dari UI.
 * Pembatasan ada di level halaman/backend, bukan di setiap toggle.
 *
 * UI behaviour:
 *   - User non-Superadmin: halaman tetap render tapi SEMUA toggle disabled,
 *     banner merah "Akses read-only". Tombol Simpan/Batal hidden.
 *   - User Superadmin: SEMUA toggle bisa diklik (termasuk kolom Superadmin
 *     sendiri — boleh restrict akses Superadmin kalau perlu).
 *
 * Audit Log (Fix #2): setiap save yang berhasil → backend catat diff
 * `role.permissions_updated` di tabel AuditLog. Page ini fetch history
 * lewat `/audit-logs?module=role` dan tampilkan di panel collapsible
 * "Log Perubahan" di bawah matrix.
 */

interface Permission {
  id: string;
  code: string;
  module: string;
  action: string;
  description: string;
}

interface Role {
  id: string;
  name: string;
  description: string;
  isSystem: boolean;
  userCount: number;
  permissions: Permission[];
}

interface RoleAuditEntry {
  id: string;
  action: string;
  module?: string;
  entityId: string;
  createdAt: string;
  ipAddress: string | null;
  user: { id: string; name: string; email: string } | null;
  meta: {
    roleName?: string;
    addedPermissionCodes?: string[];
    removedPermissionCodes?: string[];
    before?: { permissionCodes: string[] };
    after?: { permissionCodes: string[] };
  } | null;
}

export default function RolesPage() {
  const { hasPermission, hasAnyRole } = useAuth();
  const isSuperadmin = hasAnyRole('Superadmin');

  const [roles, setRoles] = useState<Role[]>([]);
  const [perms, setPerms] = useState<Permission[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);

  // Editing state — `matrixDraft` menyimpan snapshot awal (originals) supaya
  // bisa revert on "Batal". `matrixCurrent` = state aktif (dirty).
  const [matrixDraft, setMatrixDraft] = useState<Record<string, Set<string>>>({});
  const [matrixCurrent, setMatrixCurrent] = useState<Record<string, Set<string>>>({});

  // Section collapse state — section default collapse supaya matrix tidak overwhelming
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>(() => {
    const open: Record<string, boolean> = {};
    PERMISSION_SECTION_ORDER.forEach((s, i) => {
      open[s] = i > 2; // index 0,1,2 (Pendaftar, Bendahara, TU) open by default
    });
    return open;
  });

  // History panel state (Fix #2)
  const [historyOpen, setHistoryOpen] = useState(false);
  const [history, setHistory] = useState<RoleAuditEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Create-role form state
  const [createForm, setCreateForm] = useState({
    name: '',
    description: '',
    permissionIds: [] as string[],
  });

  const load = async () => {
    setLoading(true);
    try {
      const [r, p] = await Promise.all([
        api.get<Role[]>('/roles'),
        api.get<Permission[]>('/permissions'),
      ]);
      setRoles(r.data);
      setPerms(p.data);

      // Init matrix state — key by role id → Set of permission codes
      const draft: Record<string, Set<string>> = {};
      r.data.forEach((role) => {
        draft[role.id] = new Set(role.permissions.map((perm) => perm.code));
      });
      setMatrixDraft(draft);
      setMatrixCurrent(draft);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  // Load permission-change history (Fix #2)
  const loadHistory = async () => {
    setHistoryLoading(true);
    try {
      const r = await api.get<{ items: RoleAuditEntry[]; total: number }>(
        '/audit-logs?module=role&pageSize=50',
      );
      // Filter hanya entry permission change (skip role.created/role.deleted
      // yang bukan toggle action). Tetap tampilkan semuanya supaya admin
      // bisa lihat role baru & role dihapus juga.
      setHistory(r.data.items);
    } catch (e: any) {
      toast.error('Gagal memuat log perubahan: ' + e.message);
    } finally {
      setHistoryLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  // Group permissions by section (untuk render matrix per-section)
  const groupedBySection = useMemo(() => {
    const groups: Record<string, Array<Permission & { meta?: PermissionMeta }>> = {};
    PERMISSION_SECTION_ORDER.forEach((s) => {
      groups[s] = [];
    });
    perms.forEach((p) => {
      const meta = PERMISSION_UI_LABELS[p.code];
      const section = meta?.section || 'Lainnya';
      if (!groups[section]) groups[section] = [];
      groups[section].push({ ...p, meta });
    });
    return groups;
  }, [perms]);

  // Check if matrix has dirty state (ada perbedaan dengan draft)
  const isDirty = useMemo(() => {
    for (const roleId in matrixCurrent) {
      const current = matrixCurrent[roleId];
      const draft = matrixDraft[roleId];
      if (!draft) return true;
      if (current.size !== draft.size) return true;
      for (const code of current) {
        if (!draft.has(code)) return true;
      }
    }
    return false;
  }, [matrixCurrent, matrixDraft]);

  // Count dirty roles (untuk badge di footer)
  const dirtyRoleCount = useMemo(() => {
    let count = 0;
    for (const roleId in matrixCurrent) {
      const current = matrixCurrent[roleId];
      const draft = matrixDraft[roleId];
      if (!draft) {
        count++;
        continue;
      }
      if (current.size !== draft.size) {
        count++;
        continue;
      }
      for (const code of current) {
        if (!draft.has(code)) {
          count++;
          break;
        }
      }
    }
    return count;
  }, [matrixCurrent, matrixDraft]);

  const toggleForRole = (roleId: string, permCode: string, checked: boolean) => {
    setMatrixCurrent((prev) => {
      const next = { ...prev };
      const set = new Set(next[roleId] || []);
      if (checked) set.add(permCode);
      else set.delete(permCode);
      next[roleId] = set;
      return next;
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const updates: Array<{ id: string; permissionIds: string[] }> = [];
      for (const role of roles) {
        const draft = matrixDraft[role.id] || new Set();
        const current = matrixCurrent[role.id] || new Set();
        if (draft.size === current.size && [...draft].every((c) => current.has(c))) {
          continue;
        }
        const permIds = perms
          .filter((p) => current.has(p.code))
          .map((p) => p.id);
        updates.push({ id: role.id, permissionIds: permIds });
      }

      if (updates.length === 0) {
        toast.info('Tidak ada perubahan');
        return;
      }

      const results = await Promise.allSettled(
        updates.map((u) => api.patch(`/roles/${u.id}`, { permissionIds: u.permissionIds })),
      );
      const failed = results.filter((r) => r.status === 'rejected');
      if (failed.length === 0) {
        toast.success(`${updates.length} role berhasil diperbarui`);
        await load();
        // Refresh history kalau panel lagi dibuka
        if (historyOpen) loadHistory();
      } else {
        const failedNames = updates
          .filter((_, i) => results[i].status === 'rejected')
          .map((u) => roles.find((r) => r.id === u.id)?.name || u.id);
        toast.error(
          `${updates.length - failed.length} role tersimpan, ${failed.length} gagal: ${failedNames.join(', ')}. Refresh halaman untuk sync ulang.`,
        );
        await load();
      }
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setMatrixCurrent({ ...matrixDraft });
    toast.info('Perubahan di-reset');
  };

  const onCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post('/roles', createForm);
      toast.success('Role dibuat');
      setShowForm(false);
      setCreateForm({ name: '', description: '', permissionIds: [] });
      load();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const toggleSection = (section: string) => {
    setCollapsedSections((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  const toggleCreatePerm = (id: string, checked: boolean) => {
    setCreateForm((f) => ({
      ...f,
      permissionIds: checked
        ? [...f.permissionIds, id]
        : f.permissionIds.filter((x) => x !== id),
    }));
  };

  return (
    <div>
      {/* Header */}
      <div className="mb-4 flex flex-col items-start justify-between gap-2 md:flex-row md:items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Role & Permission</h1>
          <p className="text-sm text-slate-500">
            Atur permission per-role dengan toggle. Klik <b>Simpan Perubahan</b> untuk
            commit. Perubahan tercatat otomatis di Log Perubahan &amp; Audit Log.
          </p>
        </div>
        {isSuperadmin && hasPermission('role.manage') && (
          <button
            onClick={() => setShowForm((s) => !s)}
            className="btn-primary"
          >
            <Plus size={16} /> {showForm ? 'Tutup' : 'Role Baru'}
          </button>
        )}
      </div>

      {/* Banner non-superadmin: read-only */}
      {!isSuperadmin && (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          <Lock size={16} className="mt-0.5 shrink-0" />
          <div>
            <b>Akses read-only.</b> Hanya Superadmin yang boleh mengubah permission.
            Toggle di bawah disabled — backend juga akan menolak perubahan (403).
          </div>
        </div>
      )}

      {/* Create role form */}
      {showForm && isSuperadmin && (
        <motion.form
          initial={{ y: -8, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          onSubmit={onCreateSubmit}
          className="card mb-4 space-y-3"
        >
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div>
              <label className="label">Nama Role *</label>
              <input
                className="input"
                value={createForm.name}
                onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                required
              />
            </div>
            <div>
              <label className="label">Deskripsi</label>
              <input
                className="input"
                value={createForm.description}
                onChange={(e) =>
                  setCreateForm({ ...createForm, description: e.target.value })
                }
              />
            </div>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-slate-700">Permission</h3>
            <div className="mt-2 grid grid-cols-2 gap-1 sm:grid-cols-3">
              {perms.map((p) => {
                const meta = PERMISSION_UI_LABELS[p.code];
                return (
                  <label key={p.id} className="flex items-start gap-2 text-xs">
                    <input
                      type="checkbox"
                      className="mt-0.5"
                      checked={createForm.permissionIds.includes(p.id)}
                      onChange={(e) => toggleCreatePerm(p.id, e.target.checked)}
                    />
                    <div>
                      <div className="font-mono text-slate-500">{meta?.uiCode || p.code}</div>
                      <div className="text-slate-700">{meta?.label || p.description}</div>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setShowForm(false)} className="btn-ghost">
              Batal
            </button>
            <button type="submit" className="btn-primary">
              Buat Role
            </button>
          </div>
        </motion.form>
      )}

      {/* Role list (informational) */}
      {!loading && (
        <div className="mb-4 grid grid-cols-2 gap-2 md:grid-cols-4">
          {roles.map((r) => (
            <div key={r.id} className="card flex items-center gap-2 p-3">
              <Shield
                size={14}
                className={r.name === 'Superadmin' ? 'text-amber-500' : 'text-primary-500'}
              />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-slate-900">
                  {r.name}
                  {r.isSystem && (
                    <span className="ml-1 text-xs text-slate-400">(sistem)</span>
                  )}
                </div>
                <div className="text-xs text-slate-500">
                  {r.userCount} user · {matrixCurrent[r.id]?.size || 0}/{perms.length} permission
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Matrix */}
      {loading ? (
        <div className="text-slate-500">Memuat…</div>
      ) : (
        <div className="card overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-slate-200 bg-slate-50">
                <tr>
                  <th className="table-th w-2/5 text-left">Permission</th>
                  {roles.map((r) => (
                    <th
                      key={r.id}
                      className="table-th text-center"
                      style={{ minWidth: 110 }}
                    >
                      <div className="flex flex-col items-center gap-0.5">
                        <span className="font-semibold">{r.name}</span>
                        <span className="text-[10px] font-normal text-slate-400">
                          {matrixCurrent[r.id]?.size || 0}/{perms.length}
                        </span>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {PERMISSION_SECTION_ORDER.map((section) => {
                  const permsInSection = groupedBySection[section] || [];
                  if (permsInSection.length === 0) return null;
                  const isCollapsed = collapsedSections[section];
                  return (
                    <SectionGroup
                      key={section}
                      section={section}
                      permissions={permsInSection}
                      roles={roles}
                      matrixCurrent={matrixCurrent}
                      matrixDraft={matrixDraft}
                      isCollapsed={isCollapsed}
                      disabled={!isSuperadmin}
                      onToggleSection={() => toggleSection(section)}
                      onToggle={toggleForRole}
                    />
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Sticky footer untuk save action (Superadmin only) */}
      {isSuperadmin && hasPermission('role.manage') && (
        <div
          className={`sticky bottom-0 mt-4 rounded-lg border p-3 transition-colors ${
            isDirty
              ? 'border-amber-300 bg-amber-50'
              : 'border-slate-200 bg-white'
          }`}
        >
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm">
              {isDirty ? (
                <span className="font-semibold text-amber-700">
                  {dirtyRoleCount} perubahan belum disimpan
                </span>
              ) : (
                <span className="text-slate-500">Tidak ada perubahan</span>
              )}
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleReset}
                disabled={!isDirty || saving}
                className="btn-ghost"
              >
                <Undo2 size={14} /> Batal
              </button>
              <button
                onClick={handleSave}
                disabled={!isDirty || saving}
                className="btn-primary"
              >
                <Save size={14} /> {saving ? 'Menyimpan…' : 'Simpan Perubahan'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── History Panel (Fix #2) ───────────────────────────────────── */}
      <div className="mt-6 card p-0">
        <button
          type="button"
          onClick={() => {
            const next = !historyOpen;
            setHistoryOpen(next);
            if (next && history.length === 0) loadHistory();
          }}
          className="flex w-full items-center justify-between gap-2 p-4 text-left transition hover:bg-slate-50"
        >
          <div className="flex items-center gap-2">
            <History size={16} className="text-slate-600" />
            <h3 className="text-sm font-semibold text-slate-900">Log Perubahan Role &amp; Permission</h3>
            {history.length > 0 && (
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                {history.length} entri
              </span>
            )}
          </div>
          {historyOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </button>
        {historyOpen && (
          <div className="border-t border-slate-200 p-4">
            {historyLoading ? (
              <div className="text-sm text-slate-500">Memuat log…</div>
            ) : history.length === 0 ? (
              <div className="text-sm text-slate-500">
                Belum ada perubahan permission. Log akan muncul di sini otomatis setiap
                ada role yang disimpan.
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {history.map((h) => {
                  const role = roles.find((r) => r.id === h.entityId);
                  const roleName = h.meta?.roleName || role?.name || h.entityId;
                  return (
                    <LogEntryCard
                      key={h.id}
                      createdAt={h.createdAt}
                      action={h.action}
                      user={h.user}
                      ipAddress={h.ipAddress}
                      entityName={roleName}
                      rows={formatLogDetail(
                        h.action,
                        h.module || 'role',
                        h.meta,
                      )}
                    />
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Section group: header collapsible + rows untuk permissions di section ini.
 * `disabled` prop: kalau user bukan Superadmin, semua toggle di section ini disabled.
 */
function SectionGroup({
  section,
  permissions,
  roles,
  matrixCurrent,
  matrixDraft,
  isCollapsed,
  disabled,
  onToggleSection,
  onToggle,
}: {
  section: string;
  permissions: Array<Permission & { meta?: PermissionMeta }>;
  roles: Role[];
  matrixCurrent: Record<string, Set<string>>;
  matrixDraft: Record<string, Set<string>>;
  isCollapsed: boolean;
  disabled: boolean;
  onToggleSection: () => void;
  onToggle: (roleId: string, permCode: string, checked: boolean) => void;
}) {
  return (
    <>
      <tr className="border-b border-slate-200 bg-slate-50/60">
        <td colSpan={1 + roles.length} className="px-3 py-2">
          <button
            type="button"
            onClick={onToggleSection}
            className="flex w-full items-center gap-1.5 text-left text-xs font-semibold uppercase tracking-wider text-slate-600 hover:text-slate-900"
          >
            {isCollapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
            {section}
            <span className="ml-2 font-normal normal-case text-slate-400">
              ({permissions.length})
            </span>
          </button>
        </td>
      </tr>
      {!isCollapsed &&
        permissions.map((p) => (
          <tr key={p.id} className="border-b border-slate-100">
            <td className="px-3 py-2">
              <div className="flex items-start gap-2">
                <span className="inline-block min-w-[60px] rounded bg-slate-100 px-1.5 py-0.5 text-center font-mono text-[10px] font-semibold text-slate-700">
                  {p.meta?.uiCode || p.code}
                </span>
                <div className="min-w-0">
                  <div className="text-sm font-medium text-slate-900">
                    {p.meta?.label || p.description}
                  </div>
                  <div className="font-mono text-[10px] text-slate-400">{p.code}</div>
                </div>
              </div>
            </td>
            {roles.map((r) => {
              // SEMUA toggle enabled untuk Superadmin (Fix #1). Untuk user
              // non-Superadmin, semua toggle disabled (read-only banner sudah
              // muncul di atas matrix).
              const current = matrixCurrent[r.id]?.has(p.code) || false;
              const dirty =
                current !== (matrixDraft[r.id]?.has(p.code) || false);
              return (
                <td
                  key={r.id}
                  className={`px-3 py-2 text-center ${
                    dirty ? 'bg-amber-50/40' : ''
                  }`}
                >
                  <div className="inline-flex">
                    <ToggleSwitch
                      checked={current}
                      disabled={disabled}
                      onChange={(checked) => onToggle(r.id, p.code, checked)}
                      ariaLabel={`${r.name} - ${p.code}`}
                    />
                  </div>
                </td>
              );
            })}
          </tr>
        ))}
    </>
  );
}
