import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { api } from '../lib/api';
import { toast } from 'sonner';
import LogEntryCard from '../components/LogEntryCard';
import { formatLogDetail } from '../lib/logFormatter';
import { CustomSelect } from '../components/CustomSelect';

/**
 * Audit Log page — global log viewer.
 *
 * Card/timeline layout (BUKAN tabel) menggunakan <LogEntryCard /> yang
 * sama dengan halaman Riwayat lain (Gelombang, Jurusan, Berita,
 * Pengumuman, Role Permission) supaya styling konsisten.
 *
 * Filter modul diperbaiki (F3a): sekarang lengkap sesuai module yang ditulis
 * oleh backend — sebelumnya dropdown punya 'payment' & 'spmb' (redundant)
 * tapi TIDAK punya 'pendaftar' dan 'settings' sehingga log pembayaran &
 * perubahan harga tidak pernah muncul kecuali user pilih "Semua".
 */
export default function AuditLogPage() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [moduleFilter, setModuleFilter] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.get('/audit-logs', {
        params: { module: moduleFilter || undefined, pageSize: 100 },
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
  }, [moduleFilter]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18 }}
    >
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-slate-900">Audit Log</h1>
        <p className="text-sm text-slate-500">
          Jejak semua aksi sensitif yang dilakukan admin/operator di sistem.
        </p>
      </div>

      <div className="card mb-4 flex items-center gap-2">
        <label className="text-sm text-slate-600">Filter Modul:</label>
        <CustomSelect
          containerClassName="w-auto"
          className="w-auto"
          value={moduleFilter}
          onChange={(e) => setModuleFilter(e.target.value)}
        >
          <option value="">Semua</option>
          <option value="pendaftar">Pendaftar (pembayaran, ukuran baju, edit data)</option>
          <option value="spmb">SPMB (verifikasi, scan, regenerate PDF)</option>
          <option value="settings">Settings (harga daftar ulang, dll)</option>
          <option value="gelombang">Gelombang</option>
          <option value="jurusan">Jurusan</option>
          <option value="berita">Berita</option>
          <option value="pengumuman">Pengumuman</option>
          <option value="user">User</option>
          <option value="role">Role &amp; Permission</option>
          <option value="auth">Auth (login, password reset)</option>
        </CustomSelect>
      </div>

      {loading ? (
        <div className="card text-center text-sm text-slate-500">Memuat…</div>
      ) : items.length === 0 ? (
        <div className="card text-center text-sm text-slate-500">
          Belum ada log.
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {items.map((l) => (
            <LogEntryCard
              key={l.id}
              createdAt={l.createdAt}
              action={l.action}
              user={l.user}
              userName={l.userName}
              userEmail={l.userEmail}
              ipAddress={l.ipAddress}
              module={l.module}
              rows={formatLogDetail(l.action, l.module, l.meta)}
            />
          ))}
        </div>
      )}
    </motion.div>
  );
}