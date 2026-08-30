import type { ReactNode } from 'react';
import { User as UserIcon } from 'lucide-react';
import LogDetailRows from './LogDetailRows';
import type { LogRow } from '../lib/logFormatter';

/**
 * Reusable log-entry card untuk SEMUA halaman riwayat/log
 * (Riwayat Gelombang/Jurusan/Berita/Pengumuman, Role Permission log,
 * Audit Log, Pendaftar detail history, dst).
 *
 * Layout (bukan tabel — pure card list):
 *   ┌─────────────────────────────────────────┐
 *   │  [Badge Aksi]              [Waktu ↗]   │  ← baris header (atas)
 *   │                                         │
 *   │  ⓢ  Superadmin                          │  ← baris user
 *   │     superadmin@smk-...                  │
 *   │  ─────────────────────────────────────  │  ← divider tipis
 *   │  Detail:                                │
 *   │  Nama: Gelombang 1 - Test 2026          │  ← section detail
 *   │  Periode: 1 Jan – 31 Des 2026           │
 *   │  Status: Aktif                          │
 *   │  Kuota: [KULINER · 100] [TKJ · 50]      │  ← pill style
 *   └─────────────────────────────────────────┘
 *
 * Tidak ada `<table>`, tidak ada border sejajar yang kaku — pure
 * flex/grid layout supaya responsive di mobile (tidak ada scroll
 * horizontal).
 */

export interface LogEntryCardProps {
  /** ISO date string */
  createdAt: string;
  /** Aksi mis. "gelombang.created" → di-format jadi label human-readable */
  action: string;
  /** User yang melakukan aksi (null = sudah dihapus/orphan) */
  user?: { name: string; email: string } | null;
  /**
   * Snapshot nama/email user saat aksi dilakukan. Dipakai FALLBACK kalau
   * `user` null (user sudah dihapus). Audit log tetap readable walau
   * akun user sudah hilang dari sistem.
   */
  userName?: string | null;
  userEmail?: string | null;
  /** Rows dari formatLogDetail() */
  rows: LogRow[];
  /** IP address (optional, tampil kecil di pojok kanan atas) */
  ipAddress?: string | null;
  /** Optional entity name — mis. role name untuk role log */
  entityName?: string;
  /** Optional modul — mis. "spmb", "gelombang" untuk Audit Log global */
  module?: string;
}

const ACTION_LABEL: Record<string, string> = {
  // Generic CRUD — suffix-based
  '.created': 'Tambah',
  '.updated': 'Edit',
  '.deleted': 'Hapus',
  '.restored': 'Restore',
  // Role-specific
  'role.permissions_updated': 'Ubah Permission',
  'role.created': 'Buat Role',
  'role.deleted': 'Hapus Role',
  // Auth
  'auth.login': 'Login',
  'auth.logout': 'Logout',
  'auth.password_reset_requested': 'Minta Reset Password',
  'auth.password_reset_completed': 'Reset Password Selesai',
  'auth.password_reset_failed': 'Reset Password Gagal',
};

function labelFor(action: string): string {
  if (ACTION_LABEL[action]) return ACTION_LABEL[action];
  for (const [suffix, label] of Object.entries(ACTION_LABEL)) {
    if (suffix.startsWith('.') && action.endsWith(suffix)) return label;
  }
  return action;
}

function badgeColor(action: string): string {
  if (action.endsWith('.deleted')) return 'bg-red-100 text-red-800 border-red-200';
  if (action.endsWith('.created')) return 'bg-emerald-100 text-emerald-800 border-emerald-200';
  if (action.endsWith('.updated') || action === 'role.permissions_updated')
    return 'bg-amber-100 text-amber-800 border-amber-200';
  if (action.endsWith('.restored')) return 'bg-blue-100 text-blue-800 border-blue-200';
  if (action.startsWith('auth.login')) return 'bg-slate-100 text-slate-700 border-slate-200';
  if (action.startsWith('auth.')) return 'bg-purple-100 text-purple-800 border-purple-200';
  return 'bg-slate-100 text-slate-700 border-slate-200';
}

/** Generate warna avatar deterministik dari nama user (supaya konsisten tiap render) */
function avatarColor(name: string): string {
  const colors = [
    'bg-rose-100 text-rose-700',
    'bg-orange-100 text-orange-700',
    'bg-amber-100 text-amber-700',
    'bg-lime-100 text-lime-700',
    'bg-emerald-100 text-emerald-700',
    'bg-teal-100 text-teal-700',
    'bg-sky-100 text-sky-700',
    'bg-indigo-100 text-indigo-700',
    'bg-violet-100 text-violet-700',
    'bg-pink-100 text-pink-700',
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return colors[hash % colors.length];
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function formatDate(iso: string): { short: string; full: string } {
  const d = new Date(iso);
  return {
    short: d.toLocaleString('id-ID', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    }),
    full: d.toLocaleString('id-ID', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }),
  };
}

export default function LogEntryCard({
  createdAt,
  action,
  user,
  userName: userNameSnap,
  userEmail: userEmailSnap,
  rows,
  ipAddress,
  entityName,
  module: moduleProp,
}: LogEntryCardProps) {
  const date = formatDate(createdAt);
  // Fallback ke snapshot kalau relasi user null (user sudah dihapus).
  // Snapshot disimpan di kolom AuditLog.userName/userEmail — readable
  // walau akun user hilang dari database.
  const userName = user?.name || userNameSnap || 'User tidak ditemukan';
  const userEmail = user?.email || userEmailSnap || '—';
  const userIsOrphan = !user && !userNameSnap;
  const initials = userIsOrphan ? '?' : getInitials(userName);
  const avatarCls = userIsOrphan
    ? 'bg-slate-200 text-slate-500'
    : avatarColor(userName);

  return (
    <article className="rounded-lg border border-slate-200 bg-white px-5 py-4 shadow-sm transition hover:shadow-md hover:border-slate-300">
      {/* ─── Header: badge aksi + waktu (rata kanan) ─────────── */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium ${badgeColor(action)}`}
          >
            {labelFor(action)}
          </span>
          {moduleProp && (
            <span className="inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 font-mono text-xs font-medium uppercase tracking-wider text-slate-600">
              {moduleProp}
            </span>
          )}
          {entityName && (
            <span className="inline-flex items-center rounded-md bg-primary-50 px-2 py-0.5 font-mono text-xs font-medium text-primary-700">
              {entityName}
            </span>
          )}
        </div>
        <time
          dateTime={createdAt}
          title={date.full}
          className="shrink-0 text-xs text-slate-400"
        >
          {date.short}
        </time>
      </div>

      {/* ─── User info: avatar bulat + nama + email ─────────── */}
      <div className="mt-3 flex items-center gap-2.5">
        <div
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${avatarCls}`}
          aria-hidden="true"
        >
          {userIsOrphan ? <UserIcon size={14} /> : initials}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-slate-900">
            {userName}
          </div>
          <div className="truncate text-xs text-slate-500">{userEmail}</div>
        </div>
        {ipAddress && (
          <code className="hidden shrink-0 rounded bg-slate-50 px-1.5 py-0.5 text-[10px] text-slate-500 sm:inline-block">
            {ipAddress}
          </code>
        )}
      </div>

      {/* ─── Divider tipis ───────────────────────────────────── */}
      <div className="mt-3 border-t border-dashed border-slate-200" />

      {/* ─── Detail section ─────────────────────────────────── */}
      <div className="mt-3">
        <LogDetailRows rows={rows} />
      </div>
    </article>
  );
}
