import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus,
  Trash2,
  ListChecks,
  Edit3,
  RotateCcw,
  Power,
  Eye,
  EyeOff,
  Calendar,
  Infinity as InfinityIcon,
  Clock,
  CheckCircle2,
} from 'lucide-react';
import { toast } from 'sonner';
import { api, fotoUrl } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import UploadFotoField from '../components/UploadFotoField';
import { DateTimePicker, isoToLocalInput } from '../components/DateTimePicker';

// Tab "Riwayat Perubahan" dihapus (F3) — histori Pengumuman (action
// `pengumuman.*`) bisa dilihat via Audit Log → filter module=Pengumuman.

interface Pengumuman {
  id: string;
  judul: string;
  foto: string;
  aktif: boolean;
  urutan: number;
  /** ISO date string YYYY-MM-DD, atau null */
  tanggalMulai: string | null;
  /** ISO date string YYYY-MM-DD, atau null = unlimited */
  tanggalSelesai: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  createdBy?: { name: string; email: string };
}

interface FormState {
  judul: string;
  foto: string;
  aktif: boolean;
  urutan: number;
  /** "YYYY-MM-DD" atau '' (kosong) */
  tanggalMulai: string;
  /** "YYYY-MM-DD" atau '' (kosong) */
  tanggalSelesai: string;
  /** Kalau true, tanggalSelesai dikosongkan & disabled */
  unlimited: boolean;
}

const EMPTY_FORM: FormState = {
  judul: '',
  foto: '',
  aktif: true,
  urutan: 0,
  tanggalMulai: '',
  tanggalSelesai: '',
  unlimited: false,
};

type StatusBadge = 'aktif' | 'terjadwal' | 'berakhir' | 'unlimited' | 'nonaktif';

/** Hitung status on-the-fly di klien (sama dengan computeStatus di BE). */
function computeStatus(p: {
  aktif: boolean;
  tanggalMulai: string | null;
  tanggalSelesai: string | null;
}, now: Date = new Date()): StatusBadge {
  if (!p.aktif) return 'nonaktif';
  const mulai = p.tanggalMulai ? new Date(`${p.tanggalMulai}T00:00:00.000Z`) : null;
  const selesai = p.tanggalSelesai
    ? new Date(`${p.tanggalSelesai}T23:59:59.999Z`)
    : null;
  if (mulai && now < mulai) return 'terjadwal';
  if (selesai && now > selesai) return 'berakhir';
  if (!selesai) return 'unlimited';
  return 'aktif';
}

const STATUS_BADGE: Record<StatusBadge, { label: string; className: string; icon: any }> = {
  aktif: {
    label: 'Aktif',
    className: 'bg-emerald-100 text-emerald-700',
    icon: CheckCircle2,
  },
  terjadwal: {
    label: 'Terjadwal',
    className: 'bg-amber-100 text-amber-700',
    icon: Clock,
  },
  berakhir: {
    label: 'Berakhir',
    className: 'bg-red-100 text-red-700',
    icon: Calendar,
  },
  unlimited: {
    label: 'Unlimited',
    className: 'bg-blue-100 text-blue-700',
    icon: InfinityIcon,
  },
  nonaktif: {
    label: 'Non-aktif',
    className: 'bg-slate-100 text-slate-600',
    icon: EyeOff,
  },
};

/** Format ISO date "YYYY-MM-DD" → "14 Agt 2026" (id-ID). */
const fmtDate = (iso: string | null) => {
  if (!iso) return '—';
  return new Date(`${iso}T00:00:00.000Z`).toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
};

export default function PengumumanPage() {
  const { hasPermission } = useAuth();
  const [items, setItems] = useState<Pengumuman[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [includeDeleted, setIncludeDeleted] = useState(false);
  const [showInactive, setShowInactive] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.get('/pengumuman', {
        params: {
          includeDeleted: includeDeleted || undefined,
          aktif: showInactive ? undefined : true,
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
  }, [includeDeleted, showInactive]);

  const openCreate = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setShowForm(true);
  };

  const openEdit = (p: Pengumuman) => {
    setEditingId(p.id);
    const tanggalSelesaiAda = Boolean(p.tanggalSelesai);
    setForm({
      judul: p.judul,
      foto: p.foto,
      aktif: p.aktif,
      urutan: p.urutan,
      // Backend return ISO datetime ("2026-01-01T00:00:00.000Z") — normalize
      // ke "YYYY-MM-DD" untuk date-only input.
      tanggalMulai: isoToLocalInput(p.tanggalMulai, 'date'),
      tanggalSelesai: isoToLocalInput(p.tanggalSelesai, 'date'),
      unlimited: !tanggalSelesaiAda && p.aktif,
    });
    setShowForm(true);
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.foto) {
      toast.error('Foto wajib diupload');
      return;
    }
    // Validasi client-side: tanggalSelesai >= tanggalMulai
    if (form.tanggalMulai && form.tanggalSelesai && !form.unlimited) {
      if (form.tanggalSelesai < form.tanggalMulai) {
        toast.error('Tanggal selesai tidak boleh sebelum tanggal mulai');
        return;
      }
    }
    // Kirim null kalau kosong (server treat null = unlimited/no-start)
    const payload = {
      judul: form.judul.trim(),
      foto: form.foto,
      aktif: form.aktif,
      urutan: Number(form.urutan) || 0,
      tanggalMulai: form.tanggalMulai || null,
      tanggalSelesai: form.unlimited ? null : (form.tanggalSelesai || null),
    };
    try {
      if (editingId) {
        await api.patch(`/pengumuman/${editingId}`, payload);
        toast.success('Pengumuman diperbarui');
      } else {
        await api.post('/pengumuman', payload);
        toast.success('Pengumuman dibuat');
      }
      setShowForm(false);
      setEditingId(null);
      setForm(EMPTY_FORM);
      load();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const toggleAktif = async (p: Pengumuman) => {
    try {
      await api.patch(`/pengumuman/${p.id}`, { aktif: !p.aktif });
      toast.success(p.aktif ? 'Pengumuman dinonaktifkan' : 'Pengumuman diaktifkan');
      load();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const softDelete = async (p: Pengumuman) => {
    if (!confirm(`Hapus pengumuman "${p.judul}"? (Soft delete)`)) return;
    try {
      await api.delete(`/pengumuman/${p.id}`);
      toast.success('Pengumuman dihapus');
      load();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const restore = async (p: Pengumuman) => {
    try {
      await api.patch(`/pengumuman/${p.id}/restore`);
      toast.success('Pengumuman dipulihkan');
      load();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  return (
    <div>
      <div className="mb-4 flex flex-col items-start justify-between gap-3 md:flex-row md:items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Manajemen Pengumuman</h1>
          <p className="text-sm text-slate-500">Banner popup yang tampil di landing page user.</p>
        </div>
        {hasPermission('pengumuman.manage') && (
          <button onClick={showForm ? () => setShowForm(false) : openCreate} className="btn-primary">
            <Plus size={16} /> {showForm ? 'Tutup' : 'Pengumuman Baru'}
          </button>
        )}
      </div>

      <div className="mb-4">
        <h2 className="text-sm font-semibold text-slate-700">Daftar Pengumuman</h2>
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key="list"
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
        >
            {showForm && hasPermission('pengumuman.manage') && (
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
                      placeholder="Contoh: Open House 2026"
                    />
                  </div>
                  <div>
                    <label className="label">Urutan</label>
                    <input
                      type="number"
                      className="input"
                      value={form.urutan}
                      onChange={(e) => setForm({ ...form, urutan: Number(e.target.value) })}
                      placeholder="0"
                    />
                    <p className="mt-1 text-[11px] text-slate-500">Angka lebih kecil tampil lebih dulu di carousel.</p>
                  </div>
                </div>

                <UploadFotoField
                  value={form.foto}
                  onChange={(p) => setForm({ ...form, foto: p })}
                  folder="pengumuman"
                />

                {/* Jadwal tayang */}
                <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-3">
                  <div className="mb-2 flex items-center gap-2">
                    <Calendar size={14} className="text-slate-500" />
                    <span className="text-xs font-semibold uppercase tracking-wider text-slate-600">
                      Jadwal Tayang
                    </span>
                  </div>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <div>
                      <label className="label">Tanggal Mulai Tayang</label>
                      <DateTimePicker
                        value={form.tanggalMulai}
                        onChange={(v) => setForm({ ...form, tanggalMulai: v })}
                        mode="date"
                        showIcon={false}
                      />
                      <p className="mt-1 text-[11px] text-slate-500">
                        Kosongkan = langsung tayang saat disimpan.
                      </p>
                    </div>
                    <div>
                      <label className="label">Tanggal Selesai Tayang</label>
                      <DateTimePicker
                        value={form.tanggalSelesai}
                        onChange={(v) => setForm({ ...form, tanggalSelesai: v })}
                        mode="date"
                        showIcon={false}
                        disabled={form.unlimited}
                        min={form.tanggalMulai || undefined}
                      />
                      <p className="mt-1 text-[11px] text-slate-500">
                        Kosongkan = tidak ada batas waktu (jika tidak dicentang Unlimited).
                      </p>
                    </div>
                  </div>
                  <label className="mt-3 flex items-center gap-2 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={form.unlimited}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          unlimited: e.target.checked,
                          // Kalau unlimited diaktifkan, kosongkan tanggalSelesai
                          tanggalSelesai: e.target.checked ? '' : prev.tanggalSelesai,
                        }))
                      }
                    />
                    <InfinityIcon size={14} className="text-blue-600" />
                    <span>
                      <b>Unlimited</b> — tayang terus sampai dinonaktifkan manual
                      lewat toggle Aktif.
                    </span>
                  </label>
                </div>

                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={form.aktif}
                    onChange={(e) => setForm({ ...form, aktif: e.target.checked })}
                  />
                  Aktif (tampil di popup landing page)
                </label>

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
              <label className="flex items-center gap-2 text-sm text-slate-600">
                <input
                  type="checkbox"
                  checked={showInactive}
                  onChange={(e) => setShowInactive(e.target.checked)}
                />
                Tampilkan yang non-aktif
              </label>
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
                      <th className="table-th">Urutan</th>
                      <th className="table-th">Tanggal</th>
                      {hasPermission('pengumuman.manage') && <th className="table-th">Aksi</th>}
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
                          Belum ada pengumuman
                        </td>
                      </tr>
                    ) : (
                      items.map((p) => (
                        <tr key={p.id} className={p.deletedAt ? 'bg-red-50/40' : 'hover:bg-slate-50'}>
                          <td className="table-td">
                            {p.foto ? (
                              <img
                                src={fotoUrl(p.foto)}
                                alt={p.judul}
                                className="h-14 w-14 rounded object-cover ring-1 ring-slate-200"
                              />
                            ) : (
                              <div className="flex h-14 w-14 items-center justify-center rounded bg-slate-100 text-[10px] text-slate-400">
                                no img
                              </div>
                            )}
                          </td>
                          <td className="table-td">
                            <div className="font-medium text-slate-900">{p.judul}</div>
                            {p.deletedAt && (
                              <div className="mt-0.5 text-xs text-red-600">
                                Dihapus {new Date(p.deletedAt).toLocaleDateString('id-ID')}
                              </div>
                            )}
                          </td>
                          <td className="table-td">
                            {(() => {
                              const status = computeStatus(p);
                              const meta = STATUS_BADGE[status];
                              const Icon = meta.icon;
                              return (
                                <span className={`badge ${meta.className}`}>
                                  <Icon size={10} /> {meta.label}
                                </span>
                              );
                            })()}
                            {(p.tanggalMulai || p.tanggalSelesai) && (
                              <div className="mt-1 text-[11px] text-slate-500">
                                {fmtDate(p.tanggalMulai)} →{' '}
                                {p.tanggalSelesai ? fmtDate(p.tanggalSelesai) : '∞'}
                              </div>
                            )}
                          </td>
                          <td className="table-td font-mono text-sm">{p.urutan}</td>
                          <td className="table-td text-xs text-slate-500">
                            {new Date(p.updatedAt).toLocaleDateString('id-ID')}
                          </td>
                          {hasPermission('pengumuman.manage') && (
                            <td className="table-td">
                              <div className="flex flex-wrap gap-1">
                                {!p.deletedAt && (
                                  <>
                                    <button
                                      onClick={() => openEdit(p)}
                                      className="btn-ghost text-xs"
                                      title="Edit"
                                    >
                                      <Edit3 size={12} /> Edit
                                    </button>
                                    <button
                                      onClick={() => toggleAktif(p)}
                                      className={`btn-ghost text-xs ${
                                        p.aktif ? 'text-amber-600' : 'text-emerald-600'
                                      }`}
                                      title={p.aktif ? 'Non-aktifkan' : 'Aktifkan'}
                                    >
                                      <Power size={12} /> {p.aktif ? 'Off' : 'On'}
                                    </button>
                                    <button
                                      onClick={() => softDelete(p)}
                                      className="btn-ghost text-xs text-red-600"
                                    >
                                      <Trash2 size={12} /> Hapus
                                    </button>
                                  </>
                                )}
                                {p.deletedAt && (
                                  <button
                                    onClick={() => restore(p)}
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
      </AnimatePresence>
    </div>
  );
}
