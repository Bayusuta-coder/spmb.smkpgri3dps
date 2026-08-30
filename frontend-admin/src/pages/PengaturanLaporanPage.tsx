import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Save,
  RefreshCw,
  Mail,
  MessageCircle,
  Clock,
  Globe2,
  AlertCircle,
  CheckCircle2,
  PlayCircle,
  Send,
} from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';

/**
 * Halaman admin untuk pengaturan operasional laporan harian & WhatsApp.
 *
 * BUKAN untuk credential. Credential (SMTP host, API token, dll) hanya
 * boleh di-set via environment variable / .env.
 *
 * Settings yang bisa di-edit dari sini:
 *   - laporan_harian.aktif                    (true/false)
 *   - laporan_harian.email.aktif              (true/false)
 *   - laporan_harian.email.recipients         (string emails, dipisah koma)
 *   - laporan_harian.whatsapp.aktif           (true/false)
 *   - laporan_harian.jam_kirim                (HH:MM, 24-hour)
 *   - laporan_harian.timezone                 (IANA tz, default Asia/Makassar)
 *   - laporan_harian.format_pesan             (template teks)
 *   - whatsapp.otp.ttl_seconds                (number)
 *   - whatsapp.otp.max_attempts               (number)
 *   - whatsapp.otp.resend_cooldown_seconds    (number)
 */

interface SettingRow {
  key: string;
  value: string;
  description?: string;
  updatedAt?: string;
}

const SETTING_GROUPS: Array<{
  title: string;
  icon: any;
  keys: string[];
}> = [
  {
    title: 'Laporan Harian — Aktivasi',
    icon: PlayCircle,
    keys: ['laporan_harian.aktif'],
  },
  {
    title: 'Laporan Harian — Email',
    icon: Mail,
    keys: ['laporan_harian.email.aktif', 'laporan_harian.email.recipients'],
  },
  {
    title: 'Laporan Harian — WhatsApp',
    icon: MessageCircle,
    keys: ['laporan_harian.whatsapp.aktif'],
  },
  {
    title: 'Jadwal & Timezone',
    icon: Clock,
    keys: ['laporan_harian.jam_kirim', 'laporan_harian.timezone'],
  },
  {
    title: 'Format Pesan',
    icon: Globe2,
    keys: ['laporan_harian.format_pesan'],
  },
  {
    title: 'Notifikasi Rekap Harian (Fonnte)',
    icon: Send,
    keys: [
      'rekap_harian.fonnte.aktif',
      'rekap_harian.fonnte.jam_kirim',
      'rekap_harian.fonnte.timezone',
      'rekap_harian.fonnte.roles',
    ],
  },
  {
    title: 'WhatsApp OTP — Tuning',
    icon: MessageCircle,
    keys: [
      'whatsapp.otp.ttl_seconds',
      'whatsapp.otp.max_attempts',
      'whatsapp.otp.resend_cooldown_seconds',
    ],
  },
];

const KEY_LABEL: Record<string, string> = {
  'laporan_harian.aktif': 'Aktifkan laporan harian',
  'laporan_harian.email.aktif': 'Kirim via Email',
  'laporan_harian.email.recipients': 'Daftar Penerima Email (pisah koma)',
  'laporan_harian.whatsapp.aktif': 'Kirim via WhatsApp',
  'laporan_harian.jam_kirim': 'Jam Kirim (HH:MM)',
  'laporan_harian.timezone': 'Timezone (IANA)',
  'laporan_harian.format_pesan': 'Template Pesan Singkat (variabel lihat catatan)',
  'rekap_harian.fonnte.aktif': 'Aktifkan Notifikasi Rekap Harian via Fonnte',
  'rekap_harian.fonnte.jam_kirim': 'Jam Kirim Otomatis (HH:MM)',
  'rekap_harian.fonnte.timezone': 'Timezone (IANA)',
  'rekap_harian.fonnte.roles': 'Role Panitia yang Menerima',
  'whatsapp.otp.ttl_seconds': 'Masa Aktif OTP (detik)',
  'whatsapp.otp.max_attempts': 'Maks Percobaan Verifikasi',
  'whatsapp.otp.resend_cooldown_seconds': 'Cooldown Kirim Ulang (detik)',
};

const KEY_HINT: Record<string, string> = {
  'laporan_harian.aktif':
    'Master toggle. Kalau nonaktif, scheduler & trigger manual tidak kirim ke channel manapun.',
  'laporan_harian.email.aktif':
    'Jika aktif, laporan .xlsx + ringkasan dikirim ke setiap recipient. Credential SMTP via env.',
  'laporan_harian.email.recipients':
    'Format: email1@x.com,email2@y.com (dipisah koma, tanpa spasi berlebih).',
  'laporan_harian.whatsapp.aktif':
    'Hanya user dengan nomor terverifikasi yang menerima. Pesan singkat + tautan ke file .xlsx.',
  'laporan_harian.jam_kirim':
    'Format 24-hour, contoh "17:00". Scheduler cek tiap 5 menit, toleransi ± 5 menit.',
  'laporan_harian.timezone':
    'IANA, contoh "Asia/Makassar". Mempengaruhi window hari dan jam kirim.',
  'laporan_harian.format_pesan':
    'Variabel yang didukung: {{date}}, {{registrasiBaru}}, {{daftarUlang}}, {{totalPembayaran}}, {{fileUrl}}',
  'rekap_harian.fonnte.aktif':
    'Master toggle. Kirim Excel rekap harian via Fonnte ke user panitia sesuai role & jam di bawah.',
  'rekap_harian.fonnte.jam_kirim':
    'Format 24-hour, contoh "21:00". Scheduler cek tiap menit, toleransi ± 2 menit.',
  'rekap_harian.fonnte.timezone':
    'IANA, contoh "Asia/Makassar". Mempengaruhi window hari dan jam kirim.',
  'rekap_harian.fonnte.roles':
    'Pilih role panitia yang menerima notifikasi. User harus punya whatsappNumber terisi.',
  'whatsapp.otp.ttl_seconds':
    'Berapa lama kode OTP berlaku sejak diminta. Default 300 = 5 menit.',
  'whatsapp.otp.max_attempts':
    'Maksimal percobaan kode salah sebelum OTP otomatis di-cancel. Default 5.',
  'whatsapp.otp.resend_cooldown_seconds':
    'Jeda minimum antar permintaan OTP. Default 60 detik.',
};

function isBooleanKey(key: string): boolean {
  return [
    'laporan_harian.aktif',
    'laporan_harian.email.aktif',
    'laporan_harian.whatsapp.aktif',
    'rekap_harian.fonnte.aktif',
  ].includes(key);
}

function isNumberKey(key: string): boolean {
  return [
    'whatsapp.otp.ttl_seconds',
    'whatsapp.otp.max_attempts',
    'whatsapp.otp.resend_cooldown_seconds',
  ].includes(key);
}

function isTextareaKey(key: string): boolean {
  return ['laporan_harian.format_pesan'].includes(key);
}

function isRolesCheckboxKey(key: string): boolean {
  return key === 'rekap_harian.fonnte.roles';
}

function isTimeKey(key: string): boolean {
  return key === 'rekap_harian.fonnte.jam_kirim';
}

export default function PengaturanLaporanPage() {
  const { hasPermission } = useAuth();
  const canView = hasPermission('settings.view');
  const canManage = hasPermission('settings.manage');

  const [settings, setSettings] = useState<SettingRow[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [preview, setPreview] = useState<any>(null);
  const [previewing, setPreviewing] = useState(false);
  const [triggering, setTriggering] = useState(false);
  const [triggerResult, setTriggerResult] = useState<any>(null);

  // State khusus rekap-harian
  const [allRoles, setAllRoles] = useState<Array<{ id: string; name: string; description?: string | null }>>([]);
  const [fonnteStatus, setFonnteStatus] = useState<{ configured: boolean; provider: string } | null>(null);
  const [rekapPreview, setRekapPreview] = useState<any>(null);
  const [rekapPreviewing, setRekapPreviewing] = useState(false);
  const [rekapTriggering, setRekapTriggering] = useState(false);
  const [rekapResult, setRekapResult] = useState<any>(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.get('/whatsapp/settings');
      const arr: SettingRow[] = res.data ?? [];
      setSettings(arr);
      const draftMap: Record<string, string> = {};
      for (const r of arr) draftMap[r.key] = r.value ?? '';
      setDrafts(draftMap);
    } catch (e: any) {
      toast.error(e?.response?.data?.message ?? e?.message ?? 'Gagal memuat settings');
    } finally {
      setLoading(false);
    }
  };

  const loadRoles = async () => {
    try {
      const res = await api.get('/roles');
      const list = res.data?.items ?? res.data ?? [];
      setAllRoles(
        list.map((r: any) => ({
          id: r.id,
          name: r.name,
          description: r.description ?? null,
        })),
      );
    } catch {
      // kalau gagal ambil roles, checkbox section jalan dengan list kosong
    }
  };

  const loadFonnteStatus = async () => {
    try {
      const res = await api.get('/rekap-harian/fonnte/status');
      setFonnteStatus(res.data);
    } catch {
      setFonnteStatus({ configured: false, provider: 'fonnte' });
    }
  };

  useEffect(() => {
    if (canView) {
      load();
      loadRoles();
      loadFonnteStatus();
    }
  }, [canView]);

  const handleSave = async (key: string) => {
    if (!canManage) {
      toast.error('Tidak punya izin untuk mengubah setting');
      return;
    }
    const value = drafts[key] ?? '';
    // Validasi ringan
    if ((key === 'laporan_harian.jam_kirim' || key === 'rekap_harian.fonnte.jam_kirim') && !/^\d{2}:\d{2}$/.test(value)) {
      toast.error('Format jam harus HH:MM (contoh 21:00)');
      return;
    }
    if (isNumberKey(key) && value && !/^\d+$/.test(value)) {
      toast.error('Harus angka bulat positif');
      return;
    }
    setSaving(key);
    try {
      await api.put('/whatsapp/settings', { key, value });
      toast.success(`Setting '${key}' disimpan`);
      await load();
    } catch (e: any) {
      toast.error(e?.response?.data?.error ?? e?.message ?? 'Gagal simpan');
    } finally {
      setSaving(null);
    }
  };

  const handleLoadPreview = async () => {
    setPreviewing(true);
    try {
      const res = await api.get('/laporan/preview');
      setPreview(res.data);
    } catch (e: any) {
      toast.error(e?.response?.data?.error ?? e?.message ?? 'Gagal memuat preview');
    } finally {
      setPreviewing(false);
    }
  };

  const handleTrigger = async () => {
    setTriggering(true);
    setTriggerResult(null);
    try {
      const res = await api.post('/laporan/trigger', {});
      setTriggerResult(res.data);
      toast.success('Laporan terkirim (lihat detail di bawah).');
    } catch (e: any) {
      toast.error(e?.response?.data?.error ?? e?.message ?? 'Trigger gagal');
    } finally {
      setTriggering(false);
    }
  };

  // ─── Rekap Harian (Fonnte) actions ────────────────────────────────────
  const toggleRole = (roleName: string) => {
    const current = (drafts['rekap_harian.fonnte.roles'] ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const next = current.includes(roleName)
      ? current.filter((r) => r !== roleName)
      : [...current, roleName];
    setDrafts((d) => ({ ...d, 'rekap_harian.fonnte.roles': next.join(',') }));
  };

  const handleRekapPreview = async () => {
    setRekapPreviewing(true);
    try {
      const res = await api.get('/rekap-harian/preview');
      setRekapPreview(res.data);
    } catch (e: any) {
      toast.error(e?.response?.data?.error ?? e?.message ?? 'Gagal memuat preview');
    } finally {
      setRekapPreviewing(false);
    }
  };

  const handleRekapTrigger = async () => {
    if (!fonnteStatus?.configured) {
      toast.error('Fonnte belum dikonfigurasi (FONNTE_TOKEN kosong di .env). Channel akan di-skip.');
    }
    setRekapTriggering(true);
    setRekapResult(null);
    try {
      const res = await api.post('/rekap-harian/trigger', {});
      setRekapResult(res.data);
      toast.success('Rekap harian terkirim (lihat detail di bawah).');
    } catch (e: any) {
      toast.error(e?.response?.data?.error ?? e?.message ?? 'Trigger gagal');
    } finally {
      setRekapTriggering(false);
    }
  };

  if (!canView) {
    return (
      <div className="card text-sm text-slate-600">
        Anda tidak punya izin <code>settings.view</code>. Hubungi Superadmin.
      </div>
    );
  }

  const grouped = SETTING_GROUPS.map((g) => ({
    ...g,
    rows: settings.filter((s) => g.keys.includes(s.key)),
  })).filter((g) => g.rows.length > 0);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Pengaturan Laporan &amp; WhatsApp</h1>
        <p className="text-sm text-slate-500">
          Atur jadwal laporan harian, channel pengiriman (email + WhatsApp), dan tuning verifikasi OTP.
          Credential (SMTP, WhatsApp API token) tidak dapat diubah dari sini — hanya via environment variable.
        </p>
      </div>

      {/* Peringatan credential */}
      <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
        <AlertCircle size={16} className="mt-0.5 shrink-0" />
        <div>
          <b>Credential tidak bisa diedit dari UI.</b> Untuk mengubah URL/token WhatsApp atau
          SMTP, edit file <code>.env</code> (lihat README) lalu restart backend.
        </div>
      </div>

      {loading ? (
        <div className="card text-sm text-slate-500">Memuat settings…</div>
      ) : (
        <div className="space-y-3">
          {grouped.map((g) => (
            <motion.div
              key={g.title}
              initial={{ y: 8, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ duration: 0.18 }}
              className="card space-y-3"
            >
              <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900">
                <g.icon size={18} className="text-primary-600" />
                {g.title}
              </h2>
              <div className="space-y-3">
                {g.rows.map((row) => (
                  <div key={row.key} className="grid grid-cols-1 gap-2 md:grid-cols-3 md:items-start">
                    <div>
                      <label className="label">{KEY_LABEL[row.key] ?? row.key}</label>
                      {KEY_HINT[row.key] && (
                        <p className="text-xs text-slate-500">{KEY_HINT[row.key]}</p>
                      )}
                    </div>
                    <div className="md:col-span-1">
                      {isBooleanKey(row.key) ? (
                        <label className="inline-flex cursor-pointer items-center gap-2">
                          <input
                            type="checkbox"
                            className="h-4 w-4 rounded border-slate-300 text-primary-600"
                            checked={(drafts[row.key] ?? 'false') === 'true'}
                            onChange={(e) =>
                              setDrafts((d) => ({
                                ...d,
                                [row.key]: e.target.checked ? 'true' : 'false',
                              }))
                            }
                            disabled={!canManage || saving === row.key}
                          />
                          <span className="text-sm">
                            {(drafts[row.key] ?? 'false') === 'true' ? 'Aktif' : 'Nonaktif'}
                          </span>
                        </label>
                      ) : isRolesCheckboxKey(row.key) ? (
                        <div className="flex flex-wrap gap-2">
                          {allRoles.length === 0 ? (
                            <span className="text-xs text-slate-500">
                              Daftar role tidak tersedia. Buka menu Role untuk menambahkan.
                            </span>
                          ) : (
                            allRoles.map((r) => {
                              const selected = (drafts[row.key] ?? '')
                                .split(',')
                                .map((s) => s.trim())
                                .includes(r.name);
                              return (
                                <label
                                  key={r.id}
                                  className={`inline-flex cursor-pointer items-center gap-1 rounded-full border px-3 py-1 text-xs ${
                                    selected
                                      ? 'border-primary-300 bg-primary-50 text-primary-700'
                                      : 'border-slate-200 bg-white text-slate-600'
                                  }`}
                                >
                                  <input
                                    type="checkbox"
                                    className="h-3 w-3"
                                    checked={selected}
                                    onChange={() => toggleRole(r.name)}
                                    disabled={!canManage || saving === row.key}
                                  />
                                  {r.name}
                                </label>
                              );
                            })
                          )}
                        </div>
                      ) : isTimeKey(row.key) ? (
                        <input
                          type="time"
                          className="input"
                          value={drafts[row.key] ?? ''}
                          onChange={(e) =>
                            setDrafts((d) => ({ ...d, [row.key]: e.target.value }))
                          }
                          disabled={!canManage || saving === row.key}
                        />
                      ) : isTextareaKey(row.key) ? (
                        <textarea
                          className="input min-h-[88px]"
                          value={drafts[row.key] ?? ''}
                          onChange={(e) =>
                            setDrafts((d) => ({ ...d, [row.key]: e.target.value }))
                          }
                          disabled={!canManage || saving === row.key}
                        />
                      ) : (
                        <input
                          className="input"
                          value={drafts[row.key] ?? ''}
                          onChange={(e) =>
                            setDrafts((d) => ({ ...d, [row.key]: e.target.value }))
                          }
                          disabled={!canManage || saving === row.key}
                        />
                      )}
                    </div>
                    <div className="flex items-center justify-end gap-2">
                      {canManage && drafts[row.key] !== row.value && (
                        <button
                          onClick={() => handleSave(row.key)}
                          className="btn-primary"
                          disabled={saving === row.key}
                        >
                          <Save size={14} />
                          {saving === row.key ? 'Menyimpan…' : 'Simpan'}
                        </button>
                      )}
                      {drafts[row.key] === row.value && (
                        <span className="inline-flex items-center gap-1 text-xs text-emerald-600">
                          <CheckCircle2 size={12} /> Tersimpan
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          ))}

          <div className="flex items-center justify-end">
            <button onClick={load} className="btn-ghost text-xs">
              <RefreshCw size={12} /> Reload dari DB
            </button>
          </div>
        </div>
      )}

      {/* Preview + Trigger manual */}
      {canView && (
        <div className="card space-y-3">
          <h2 className="text-base font-semibold text-slate-900">Preview &amp; Trigger Manual</h2>
          <p className="text-xs text-slate-500">
            Lihat ringkasan laporan hari ini tanpa kirim ke channel apapun, atau trigger pengiriman
            langsung ke email + WhatsApp (sesuai setting di atas).
          </p>

          <div className="flex flex-wrap gap-2">
            <button onClick={handleLoadPreview} className="btn-secondary" disabled={previewing}>
              <RefreshCw size={14} /> {previewing ? 'Memuat…' : 'Preview Laporan'}
            </button>
            {canManage && (
              <button onClick={handleTrigger} className="btn-primary" disabled={triggering}>
                <PlayCircle size={14} /> {triggering ? 'Mengirim…' : 'Trigger Kirim Sekarang'}
              </button>
            )}
          </div>

          {preview && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
              <div className="font-medium text-slate-900">Ringkasan</div>
              <ul className="mt-1 space-y-0.5 text-xs text-slate-700">
                <li>Window: {preview.window?.start?.slice(0, 16)} → {preview.window?.end?.slice(0, 16)} (tz: {preview.window?.timezone})</li>
                <li>Registrasi Baru (createdAt): <b>{preview.registrasiBaru?.length ?? 0}</b></li>
                <li>Daftar Ulang (LUNAS + ukuran baju): <b>{preview.daftarUlang?.length ?? 0}</b></li>
                <li>Total Bayar Hari Ini: <b>Rp {Number(preview.totalBayarHariIni ?? 0).toLocaleString('id-ID')}</b></li>
                <li>Total Bayar Kumulatif: <b>Rp {Number(preview.totalBayarSemuaHari ?? 0).toLocaleString('id-ID')}</b></li>
              </ul>
            </div>
          )}

          {triggerResult && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm">
              <div className="font-medium text-emerald-800">Trigger selesai</div>
              <ul className="mt-1 space-y-0.5 text-xs text-emerald-700">
                <li>Email terkirim: {triggerResult.email?.success ?? 0} / {triggerResult.email?.total ?? 0}</li>
                <li>WhatsApp terkirim: {triggerResult.whatsapp?.success ?? 0} / {triggerResult.whatsapp?.total ?? 0}</li>
                <li>File laporan: <code>{triggerResult.filePath ?? '(tidak disimpan)'}</code></li>
                {triggerResult.errors?.length > 0 && (
                  <li className="text-amber-700">Errors (channel-specific, tidak menggagalkan yang lain): {triggerResult.errors.length}</li>
                )}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Rekap Harian (Fonnte) — Preview & Trigger */}
      {canView && (
        <div className="card space-y-3">
          <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900">
            <Send size={18} className="text-primary-600" />
            Rekap Harian via Fonnte — Preview &amp; Trigger Manual
          </h2>
          <p className="text-xs text-slate-500">
            Generate Excel rekap harian (pendaftar baru + siswa aktif) dan kirim ke user panitia
            sesuai role yang dipilih di atas. Tidak mengganggu laporan harian Email/WhatsApp di atas.
          </p>

          <div className="flex items-center gap-2">
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs ${
                fonnteStatus?.configured
                  ? 'bg-emerald-100 text-emerald-700'
                  : 'bg-amber-100 text-amber-800'
              }`}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  fonnteStatus?.configured ? 'bg-emerald-500' : 'bg-amber-500'
                }`}
              />
              Fonnte {fonnteStatus?.configured ? 'Aktif' : 'Belum dikonfigurasi (FONNTE_TOKEN kosong)'}
            </span>
            <button onClick={loadFonnteStatus} className="btn-ghost text-xs">
              <RefreshCw size={12} /> Cek ulang
            </button>
          </div>

          <div className="flex flex-wrap gap-2">
            <button onClick={handleRekapPreview} className="btn-secondary" disabled={rekapPreviewing}>
              <RefreshCw size={14} /> {rekapPreviewing ? 'Memuat…' : 'Preview Rekap Harian'}
            </button>
            {canManage && (
              <button
                onClick={handleRekapTrigger}
                className="btn-primary"
                disabled={rekapTriggering}
              >
                <Send size={14} /> {rekapTriggering ? 'Mengirim…' : 'Kirim Sekarang'}
              </button>
            )}
          </div>

          {rekapPreview && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
              <div className="font-medium text-slate-900">Ringkasan Rekap Harian</div>
              <ul className="mt-1 space-y-0.5 text-xs text-slate-700">
                <li>Tanggal: <b>{rekapPreview.window?.displayTanggal ?? '—'}</b></li>
                <li>Pendaftar Isi Form: <b>{rekapPreview.totals?.pendaftarBaruCount ?? 0}</b></li>
                <li>Daftar Ulang / Siswa Aktif: <b>{rekapPreview.totals?.siswaAktifCount ?? 0}</b></li>
              </ul>
            </div>
          )}

          {rekapResult && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm">
              <div className="font-medium text-emerald-800">Kirim selesai</div>
              <ul className="mt-1 space-y-0.5 text-xs text-emerald-700">
                <li>Pendaftar Baru: {rekapResult.totals?.pendaftarBaru ?? 0}</li>
                <li>Siswa Aktif: {rekapResult.totals?.siswaAktif ?? 0}</li>
                <li>
                  Fonnte terkirim: {rekapResult.fonnte?.sent ?? 0} /{' '}
                  {rekapResult.fonnte?.attempted ?? 0}
                  {(rekapResult.fonnte?.failed ?? 0) > 0 && (
                    <span className="text-amber-700">
                      {' '}
                      ({rekapResult.fonnte.failed} gagal)
                    </span>
                  )}
                  {(rekapResult.fonnte?.skipped ?? 0) > 0 && (
                    <span className="text-slate-600">
                      {' '}
                      ({rekapResult.fonnte.skipped} di-skip — Fonnte belum dikonfigurasi)
                    </span>
                  )}
                </li>
                <li>Ukuran Excel: {(rekapResult.excelBufferSize / 1024).toFixed(1)} KB</li>
                <li className="pt-1 text-slate-600">
                  Cek detail per-nomor (masked) di <b>Audit Log</b> → module{' '}
                  <code>rekap_harian</code>.
                </li>
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}