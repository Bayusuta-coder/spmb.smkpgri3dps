import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Trash2, AlertTriangle, X } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { CustomSelect } from '../components/CustomSelect';
import { DateTimePicker } from '../components/DateTimePicker';

// Tab "Riwayat Perubahan" dihapus (F3) — histori Gelombang (action
// `gelombang.*`) bisa dilihat via Audit Log → filter module=Gelombang.

export default function GelombangPage() {
  const { hasPermission } = useAuth();
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
  // Gelombang yang sedang dikonfirmasi untuk dihapus (null = modal tertutup).
  // Pakai state terpisah (bukan langsung panggil api.delete) supaya kita bisa
  // menampilkan modal konfirmasi AnimatePresence + handle error 400 (kalau
  // gelombang masih ada pendaftar terkait) dari backend dengan toast yang
  // ramah.
  const [confirmDelete, setConfirmDelete] = useState<any | null>(null);
  const [deleting, setDeleting] = useState(false);

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

  const onConfirmDelete = async () => {
    if (!confirmDelete) return;
    try {
      setDeleting(true);
      const res = await api.delete(`/gelombang/${confirmDelete.id}`);
      toast.success(`Gelombang "${res.data?.name ?? confirmDelete.name}" berhasil dihapus`);
      setConfirmDelete(null);
      load();
    } catch (e: any) {
      // Backend akan throw 400 dengan pesan ramah kalau masih ada pendaftar
      // terkait. Axios error: e.response.data.message berisi string panjang
      // yang sudah include count + sample nomor pendaftaran.
      const msg =
        e.response?.data?.message ?? e.message ?? 'Gagal menghapus gelombang';
      toast.error(msg, { duration: 6000 });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div>
      <div className="mb-4 flex flex-col items-start justify-between gap-3 md:flex-row md:items-center">
        <h1 className="text-2xl font-bold text-slate-900">Gelombang SPMB</h1>
        {hasPermission('gelombang.manage') && (
          <button onClick={() => setShowForm(!showForm)} className="btn-primary">
            <Plus size={16} /> {showForm ? 'Tutup' : 'Gelombang Baru'}
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="mb-4">
        <h2 className="text-sm font-semibold text-slate-700">Daftar Gelombang</h2>
      </div>

      <AnimatePresence mode="wait">
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
                    <CustomSelect
                      value={form.isActive ? '1' : '0'}
                      onChange={(e) => setForm({ ...form, isActive: e.target.value === '1' })}
                    >
                      <option value="1">Aktif</option>
                      <option value="0">Nonaktif</option>
                    </CustomSelect>
                  </div>
                  <div>
                    <label className="label">Tanggal Mulai *</label>
                    <DateTimePicker
                      value={form.startDate}
                      onChange={(v) => setForm({ ...form, startDate: v })}
                      mode="date"
                      showIcon={false}
                    />
                  </div>
                  <div>
                    <label className="label">Tanggal Selesai (opsional)</label>
                    <DateTimePicker
                      value={form.endDate}
                      onChange={(v) => setForm({ ...form, endDate: v })}
                      mode="date"
                      showIcon={false}
                      min={form.startDate || undefined}
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
                      {hasPermission('gelombang.manage') && (
                        <button
                          onClick={() => setConfirmDelete(g)}
                          className="btn-ghost text-xs text-red-600 hover:bg-red-50 hover:text-red-700"
                          title="Hapus gelombang (gagal kalau masih ada pendaftar terkait)"
                        >
                          <Trash2 size={14} />
                          Hapus
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
      </AnimatePresence>

      {/* Modal konfirmasi hapus gelombang — pakai AnimatePresence agar
          transisi buka/tutup halus. Aksi destructive, jadi default fokus
          ke tombol Batal (Escape-key friendly). */}
      <AnimatePresence>
        {confirmDelete && (
          <motion.div
            key="confirm-delete-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
            onClick={() => !deleting && setConfirmDelete(null)}
          >
            <motion.div
              key="confirm-delete-card"
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={{ duration: 0.18 }}
              className="relative w-full max-w-md rounded-lg bg-white p-6 shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                onClick={() => setConfirmDelete(null)}
                disabled={deleting}
                className="absolute right-3 top-3 p-1 text-slate-400 hover:text-slate-600 disabled:opacity-50"
                aria-label="Tutup"
              >
                <X size={18} />
              </button>
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-100">
                  <AlertTriangle className="text-red-600" size={20} />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-slate-900">
                    Hapus Gelombang?
                  </h3>
                  <p className="mt-1 text-sm text-slate-600">
                    Anda yakin ingin menghapus gelombang{' '}
                    <b>"{confirmDelete.name}"</b>? Tindakan ini{' '}
                    <span className="font-semibold text-red-600">
                      tidak dapat dibatalkan
                    </span>{' '}
                    dan akan tercatat di riwayat perubahan.
                  </p>
                  <div className="mt-3 rounded-md bg-amber-50 border border-amber-200 p-2 text-xs text-amber-800">
                    <b>Penting:</b> Penghapusan akan ditolak oleh sistem jika
                    gelombang ini masih memiliki pendaftar yang terkait. Pastikan
                    tidak ada pendaftar aktif di gelombang ini sebelum menghapus.
                  </div>
                </div>
              </div>
              <div className="mt-5 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setConfirmDelete(null)}
                  disabled={deleting}
                  className="btn-ghost"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={onConfirmDelete}
                  disabled={deleting}
                  className="btn-primary bg-red-600 hover:bg-red-700 disabled:bg-red-300"
                >
                  {deleting ? 'Menghapus…' : 'Ya, Hapus Gelombang'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
