/**
 * Log formatter — konversi raw `meta` JSON dari AuditLog jadi format
 * label:value yang human-readable. Dipakai oleh SEMUA halaman riwayat/log
 * (Riwayat Perubahan Gelombang/Jurusan/Berita/Pengumuman, Role Permission
 * history, Audit Log) supaya tampilan konsisten dan BUKAN raw JSON.
 *
 * Setiap formatter mengembalikan list of {label, value} atau {label,
 * beforeValue, afterValue, kind: 'added'|'removed'|'changed'|'same'}.
 * View layer tinggal render dengan styling yang seragam — lihat
 * `<LogDetailRows />` helper di bawah.
 *
 * Kalau action tidak dikenali, fallback ke JSON.stringify dengan
 * formatting yang lebih ringkas dari biasanya (no indent super dalam).
 */

import type { ReactNode } from 'react';
import { PERMISSION_UI_LABELS } from './constants';

// ─── Tipe data ──────────────────────────────────────────────────────────

export type LogRow =
  | {
      /** Baris label:value biasa */
      kind: 'kv';
      label: string;
      value: ReactNode;
    }
  | {
      /** Baris "Field: lama → baru" untuk diff */
      kind: 'diff';
      label: string;
      before: ReactNode;
      after: ReactNode;
    }
  | {
      /** Baris list item (bullet) */
      kind: 'list';
      label: string;
      items: ReactNode[];
      tone?: 'added' | 'removed' | 'neutral';
    }
  | {
      /** Heading kecil antar-section */
      kind: 'heading';
      label: string;
    };

// ─── Helper kecil ───────────────────────────────────────────────────────

function fmtDateID(iso?: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
}

function fmtDateTimeID(iso?: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('id-ID', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function fmtBool(v: unknown): string {
  if (v === true) return 'Aktif';
  if (v === false) return 'Nonaktif';
  return '—';
}

function fmtQuotaList(kuota: any[] | undefined): ReactNode[] {
  if (!Array.isArray(kuota) || kuota.length === 0) return ['(kosong)'];
  return kuota.map((k) => {
    const name = k.jurusanName || k.jurusan?.name || k.jurusanCode || k.jurusan?.code || '?';
    const code = k.jurusanCode || k.jurusan?.code;
    const qty = k.quota ?? k.jumlah ?? 0;
    // Output plain string — di-render sebagai pill oleh LogDetailRows.
    // Format: "KULINER · 100 siswa" (sesuai spec user)
    const codeStr = code ? `${code} — ${name}` : name;
    return `${codeStr} · ${qty} siswa`;
  });
}

// ─── Per-action formatter ───────────────────────────────────────────────

/** Gelombang: created / updated / deleted / restored */
function formatGelombang(action: string, meta: any): LogRow[] {
  if (action === 'gelombang.created' || action === 'gelombang.restored') {
    return [
      { kind: 'kv', label: 'Nama', value: meta.name || '—' },
      {
        kind: 'kv',
        label: 'Periode',
        value: `${fmtDateID(meta.startDate)} – ${fmtDateID(meta.endDate)}`,
      },
      { kind: 'kv', label: 'Status', value: fmtBool(meta.isActive) },
      ...(meta.tanggalDaftarUlang
        ? [
            {
              kind: 'kv' as const,
              label: 'Jadwal Daftar Ulang',
              value: `${fmtDateID(meta.tanggalDaftarUlang)}${meta.jamDaftarUlang ? ` · ${meta.jamDaftarUlang}` : ''}`,
            },
          ]
        : []),
      { kind: 'heading', label: 'Kuota per Jurusan' },
      { kind: 'list', label: '', items: fmtQuotaList(meta.kuota) },
    ];
  }

  if (action === 'gelombang.updated') {
    // Service log ini belum ada (cek gelombang.service.ts:178 / 273 — yang
    // ada cuma created & deleted). Tetap handle kalau nanti ditambah.
    return formatDiffGeneric(meta);
  }

  if (action === 'gelombang.deleted') {
    return [
      { kind: 'kv', label: 'Nama', value: meta.name || '—' },
      {
        kind: 'kv',
        label: 'Periode',
        value: `${fmtDateID(meta.startDate)} – ${fmtDateID(meta.endDate)}`,
      },
    ];
  }

  return fallbackRows(meta);
}

/** Jurusan: created / updated / deleted / restored */
function formatJurusan(action: string, meta: any): LogRow[] {
  if (action === 'jurusan.created' || action === 'jurusan.restored') {
    return [
      { kind: 'kv', label: 'Kode', value: meta.code || '—' },
      { kind: 'kv', label: 'Nama', value: meta.name || '—' },
      { kind: 'kv', label: 'Status', value: fmtBool(meta.isActive) },
    ];
  }

  if (action === 'jurusan.updated') {
    return formatDiffGeneric(meta);
  }

  if (action === 'jurusan.deleted') {
    return [
      { kind: 'kv', label: 'Kode', value: meta.code || '—' },
      { kind: 'kv', label: 'Nama', value: meta.name || '—' },
    ];
  }

  return fallbackRows(meta);
}

/** Berita: created / updated / deleted / restored */
function formatBerita(action: string, meta: any): LogRow[] {
  if (action === 'berita.created' || action === 'berita.restored') {
    return [
      { kind: 'kv', label: 'Judul', value: meta.judul || meta.title || '—' },
      {
        kind: 'kv',
        label: 'Slug',
        value: meta.slug ? <span className="font-mono text-xs">{meta.slug}</span> : '—',
      },
      {
        kind: 'kv',
        label: 'Status',
        value: meta.status === 'PUBLISHED' ? 'Dipublikasikan' : 'Draft',
      },
      meta.publishedAt && {
        kind: 'kv' as const,
        label: 'Tgl Publish',
        value: fmtDateTimeID(meta.publishedAt),
      },
    ].filter(Boolean) as LogRow[];
  }

  if (action === 'berita.updated') {
    return formatDiffGeneric(meta);
  }

  if (action === 'berita.deleted') {
    return [
      { kind: 'kv', label: 'Judul', value: meta.judul || meta.title || '—' },
      meta.publishedAt && {
        kind: 'kv' as const,
        label: 'Tgl Publish',
        value: fmtDateTimeID(meta.publishedAt),
      },
    ].filter(Boolean) as LogRow[];
  }

  return fallbackRows(meta);
}

/** Pengumuman: created / updated / deleted / restored */
function formatPengumuman(action: string, meta: any): LogRow[] {
  if (action === 'pengumuman.created' || action === 'pengumuman.restored') {
    return [
      { kind: 'kv', label: 'Judul', value: meta.judul || meta.title || '—' },
      { kind: 'kv', label: 'Tipe', value: meta.tipe || '—' },
      { kind: 'kv', label: 'Status', value: fmtBool(meta.isActive) },
      meta.tanggalMulai &&
        ({
          kind: 'kv' as const,
          label: 'Periode Tayang',
          value: `${fmtDateID(meta.tanggalMulai)} – ${fmtDateID(meta.tanggalSelesai)}`,
        } as LogRow),
    ].filter(Boolean) as LogRow[];
  }

  if (action === 'pengumuman.updated') {
    return formatDiffGeneric(meta);
  }

  if (action === 'pengumuman.deleted') {
    return [
      { kind: 'kv', label: 'Judul', value: meta.judul || meta.title || '—' },
    ];
  }

  return fallbackRows(meta);
}

/** Role Permission: created / permissions_updated / deleted */
function formatRole(action: string, meta: any): LogRow[] {
  const roleName = meta.roleName || meta.name || '—';
  if (action === 'role.permissions_updated') {
    const added: string[] = meta.addedPermissionCodes || [];
    const removed: string[] = meta.removedPermissionCodes || [];
    const rows: LogRow[] = [{ kind: 'kv', label: 'Role', value: roleName }];
    if (added.length > 0) {
      rows.push({
        kind: 'heading',
        label: `Permission Ditambahkan (+${added.length})`,
      });
      rows.push({
        kind: 'list',
        label: '',
        tone: 'added',
        items: added.map((c) => permissionLabel(c)),
      });
    }
    if (removed.length > 0) {
      rows.push({
        kind: 'heading',
        label: `Permission Dihapus (−${removed.length})`,
      });
      rows.push({
        kind: 'list',
        label: '',
        tone: 'removed',
        items: removed.map((c) => permissionLabel(c)),
      });
    }
    if (added.length === 0 && removed.length === 0) {
      rows.push({
        kind: 'kv',
        label: 'Perubahan',
        value: '(tidak ada perubahan terdeteksi)',
      });
    }
    return rows;
  }

  if (action === 'role.created') {
    return [
      { kind: 'kv', label: 'Role', value: meta.name || '—' },
      { kind: 'kv', label: 'Deskripsi', value: meta.description || '—' },
      {
        kind: 'kv',
        label: 'Jumlah Permission',
        value: `${meta.permissionIds?.length ?? 0}`,
      },
    ];
  }

  if (action === 'role.deleted') {
    return [
      { kind: 'kv', label: 'Role', value: meta.name || '—' },
      {
        kind: 'kv',
        label: 'Jumlah Permission',
        value: `${meta.permissionCodes?.length ?? 0}`,
      },
    ];
  }

  return fallbackRows(meta);
}

/** Pendaftar: created / updated / deleted / verify (reject) */
function formatPendaftar(action: string, meta: any): LogRow[] {
  if (action === 'pendaftar.created') {
    return [
      { kind: 'kv', label: 'No. Pendaftaran', value: meta.registrationNumber || '—' },
      { kind: 'kv', label: 'Nama', value: meta.namaLengkap || '—' },
      {
        kind: 'kv',
        label: 'Sumber',
        value: meta.source === 'admin_manual' ? 'Input manual oleh admin' : 'Pendaftaran online',
      },
    ];
  }

  if (action === 'pendaftar.updated') {
    const rows: LogRow[] = [
      {
        kind: 'kv',
        label: 'No. Pendaftaran',
        value: meta.registrationNumber || '—',
      },
      { kind: 'heading', label: `Field Berubah (${meta.changedFields?.length ?? 0})` },
    ];
    const before = meta.before || {};
    const after = meta.after || {};
    (meta.changedFields || []).forEach((f: string) => {
      rows.push({
        kind: 'diff',
        label: humanizeFieldName(f),
        before: <span>{stringifyVal(before[f])}</span>,
        after: <span>{stringifyVal(after[f])}</span>,
      });
    });
    return rows;
  }

  if (action === 'pendaftar.deleted') {
    const s = meta.snapshot || {};
    return [
      { kind: 'kv', label: 'No. Pendaftaran', value: meta.registrationNumber || s.registrationNumber || '—' },
      { kind: 'kv', label: 'Nama', value: s.namaLengkap || '—' },
      {
        kind: 'kv',
        label: 'Jurusan',
        value: s.jurusan ? `${s.jurusan.code} — ${s.jurusan.name}` : '—',
      },
      {
        kind: 'kv',
        label: 'Gelombang',
        value: s.gelombang?.name || '—',
      },
      { kind: 'kv', label: 'Status', value: s.status || '—' },
    ];
  }

  if (action === 'pendaftar.verified' || action === 'pendaftar.rejected') {
    return [
      { kind: 'kv', label: 'No. Pendaftaran', value: meta.registrationNumber || '—' },
      { kind: 'kv', label: 'Keputusan', value: action === 'pendaftar.rejected' ? 'Ditolak' : 'Diverifikasi' },
      meta.note && { kind: 'kv' as const, label: 'Catatan', value: meta.note },
      meta.alasanPenolakan && { kind: 'kv' as const, label: 'Alasan', value: meta.alasanPenolakan },
    ].filter(Boolean) as LogRow[];
  }

  if (action === 'pendaftar.pembayaran' || action === 'pendaftar.ukuran_baju') {
    return [
      { kind: 'kv', label: 'No. Pendaftaran', value: meta.registrationNumber || '—' },
      meta.metode && { kind: 'kv' as const, label: 'Metode', value: meta.metode },
      meta.nominal && {
        kind: 'kv' as const,
        label: 'Nominal',
        value: `Rp ${Number(meta.nominal).toLocaleString('id-ID')}`,
      },
      meta.ukuranBaju && { kind: 'kv' as const, label: 'Ukuran Baju', value: meta.ukuranBaju },
    ].filter(Boolean) as LogRow[];
  }

  return fallbackRows(meta);
}

/** Rekap Harian (Fonnte) — kirim Excel rekap harian via WhatsApp Fonnte. */
function formatRekapHarian(action: string, meta: any): LogRow[] {
  const rows: LogRow[] = [];

  const trigger = meta?.trigger ?? '—';
  const totals = meta?.totals ?? {};
  const fonnte = meta?.fonnte ?? {};
  const recipients = Array.isArray(meta?.recipients) ? meta.recipients : [];
  const excelSize = meta?.excelSize;

  rows.push({
    kind: 'kv',
    label: 'Trigger',
    value: trigger === 'cron' ? 'Otomatis (cron)' : trigger === 'manual' ? 'Manual' : trigger,
  });

  rows.push({ kind: 'heading', label: 'Ringkasan Data' });
  rows.push({
    kind: 'kv',
    label: 'Pendaftar Baru',
    value: totals.pendaftarBaru ?? 0,
  });
  rows.push({
    kind: 'kv',
    label: 'Siswa Aktif',
    value: totals.siswaAktif ?? 0,
  });

  rows.push({ kind: 'heading', label: 'Status Pengiriman Fonnte' });
  rows.push({
    kind: 'kv',
    label: 'Fonnte Provider',
    value: fonnte.ready ? 'Aktif' : 'Belum dikonfigurasi',
  });
  rows.push({
    kind: 'kv',
    label: 'Attempted',
    value: fonnte.attempted ?? 0,
  });
  rows.push({
    kind: 'kv',
    label: 'Sent',
    value: fonnte.sent ?? 0,
  });
  rows.push({
    kind: 'kv',
    label: 'Failed',
    value: fonnte.failed ?? 0,
  });
  if ((fonnte.skipped ?? 0) > 0) {
    rows.push({
      kind: 'kv',
      label: 'Skipped',
      value: fonnte.skipped,
    });
  }

  if (typeof excelSize === 'number') {
    rows.push({
      kind: 'kv',
      label: 'Ukuran Excel',
      value: `${(excelSize / 1024).toFixed(1)} KB`,
    });
  }

  if (recipients.length > 0) {
    rows.push({ kind: 'heading', label: `Daftar Penerima (${recipients.length})` });
    const items: ReactNode[] = recipients.map((r: any) => {
      const status = r.ok ? '✓' : '✗';
      const err = r.error ? ` — ${r.error}` : '';
      return `${status} ${r.name ?? '?'} (${r.whatsappNumberMasked ?? '—'})${err}`;
    });
    rows.push({
      kind: 'list',
      label: 'Penerima',
      items,
    });
  }

  return rows;
}

/** Fallback: kalau action/module tidak dikenali */
function fallbackRows(meta: any): LogRow[] {
  if (!meta || Object.keys(meta).length === 0) {
    return [{ kind: 'kv', label: 'Detail', value: '(tidak ada data tambahan)' }];
  }
  // Render key:value umum dari object (skip null/undefined & nested objects
  // yang terlalu dalam — tampilkan ringkas)
  const rows: LogRow[] = [];
  for (const [k, v] of Object.entries(meta)) {
    if (v == null) continue;
    rows.push({
      kind: 'kv',
      label: humanizeFieldName(k),
      value: stringifyVal(v),
    });
  }
  return rows;
}

/** Generic diff: { before: {...}, after: {...}, changedFields: [...] } */
function formatDiffGeneric(meta: any): LogRow[] {
  const before = meta.before || {};
  const after = meta.after || {};
  const fields = meta.changedFields || Object.keys(after);
  if (fields.length === 0) return [{ kind: 'kv', label: 'Perubahan', value: '(tidak ada)' }];
  const rows: LogRow[] = [{ kind: 'heading', label: 'Field yang berubah' }];
  fields.forEach((f: string) => {
    rows.push({
      kind: 'diff',
      label: humanizeFieldName(f),
      before: <span>{stringifyVal(before[f])}</span>,
      after: <span>{stringifyVal(after[f])}</span>,
    });
  });
  return rows;
}

// ─── Util ───────────────────────────────────────────────────────────────

function humanizeFieldName(s: string): string {
  // camelCase → "Camel Case"; plus beberapa alias
  const alias: Record<string, string> = {
    namaLengkap: 'Nama Lengkap',
    jenisKelamin: 'Jenis Kelamin',
    tempatLahir: 'Tempat Lahir',
    tanggalLahir: 'Tanggal Lahir',
    sekolahAsal: 'Sekolah Asal',
    noTelp: 'No. Telp',
    namaIbu: 'Nama Ibu',
    noTelpOrtu: 'No. Telp Ortu',
    jumlahNilaiUn: 'Nilai UN',
    jurusanId: 'Jurusan',
    gelombangId: 'Gelombang',
    statusPembayaran: 'Status Bayar',
    metodePembayaran: 'Metode Bayar',
    tanggalBayar: 'Tgl Bayar',
    tanggalUkuranBaju: 'Tgl Ukuran Baju',
    ukuranBaju: 'Ukuran Baju',
    registrationNumber: 'No. Pendaftaran',
    pdfPath: 'File PDF',
    isActive: 'Status Aktif',
    isSystem: 'Sistem',
    startDate: 'Tgl Mulai',
    endDate: 'Tgl Selesai',
    tanggalDaftarUlang: 'Tgl Daftar Ulang',
    jamDaftarUlang: 'Jam Daftar Ulang',
    tanggalMulai: 'Tgl Mulai',
    tanggalSelesai: 'Tgl Selesai',
    permissionIds: 'Daftar Permission',
    roleName: 'Nama Role',
  };
  if (alias[s]) return alias[s];
  // camelCase → Title Case
  return s
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (c) => c.toUpperCase())
    .trim();
}

function stringifyVal(v: unknown): string {
  if (v == null) return '—';
  if (typeof v === 'boolean') return v ? 'Aktif' : 'Nonaktif';
  if (typeof v === 'number') {
    // Heuristic: nominal besar → rupiah
    if (v >= 1000) return `Rp ${v.toLocaleString('id-ID')}`;
    return String(v);
  }
  if (typeof v === 'string') return v;
  if (Array.isArray(v)) return `${v.length} item`;
  if (typeof v === 'object') {
    const obj = v as Record<string, any>;
    if (obj.code && obj.name) return `${obj.code} — ${obj.name}`;
    if (obj.name) return obj.name;
    try {
      return JSON.stringify(v);
    } catch {
      return String(v);
    }
  }
  return String(v);
}

function permissionLabel(code: string): string {
  const meta = PERMISSION_UI_LABELS[code];
  return meta ? `${meta.uiCode} — ${meta.label}` : code;
}

// ─── Public API ─────────────────────────────────────────────────────────

/**
 * Format meta JSON → human-readable rows. Dispatch berdasarkan action
 * (dan module sebagai fallback kalau action ambigu).
 */
export function formatLogDetail(
  action: string,
  module: string,
  meta: any,
): LogRow[] {
  if (!meta) return [{ kind: 'kv', label: 'Detail', value: '(tidak ada data)' }];

  // Dispatch by action prefix — lebih spesifik
  if (action.startsWith('gelombang.')) return formatGelombang(action, meta);
  if (action.startsWith('jurusan.')) return formatJurusan(action, meta);
  if (action.startsWith('berita.')) return formatBerita(action, meta);
  if (action.startsWith('pengumuman.')) return formatPengumuman(action, meta);
  if (action.startsWith('role.')) return formatRole(action, meta);
  if (action.startsWith('pendaftar.')) return formatPendaftar(action, meta);
  if (action.startsWith('rekap_harian.')) return formatRekapHarian(action, meta);

  // Fallback by module
  switch (module) {
    case 'gelombang':
      return formatGelombang(action, meta);
    case 'jurusan':
      return formatJurusan(action, meta);
    case 'berita':
      return formatBerita(action, meta);
    case 'pengumuman':
      return formatPengumuman(action, meta);
    case 'role':
      return formatRole(action, meta);
    case 'pendaftar':
      return formatPendaftar(action, meta);
    case 'rekap_harian':
      return formatRekapHarian(action, meta);
    default:
      return fallbackRows(meta);
  }
}
