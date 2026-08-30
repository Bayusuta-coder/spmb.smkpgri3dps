import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { api } from '../lib/api';
import { toast } from 'sonner';
import LogEntryCard from '../components/LogEntryCard';
import { formatLogDetail } from '../lib/logFormatter';

/**
 * Audit Log page — global log viewer.
 *
 * Card/timeline layout (BUKAN tabel) menggunakan <LogEntryCard /> yang
 * sama dengan halaman Riwayat lain (Gelombang, Jurusan, Berita,
 * Pengumuman, Role Permission) supaya styling konsisten.
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
        <select
          className="input w-auto"
          value={moduleFilter}
          onChange={(e) => setModuleFilter(e.target.value)}
        >
          <option value="">Semua</option>
          <option value="spmb">SPMB</option>
          <option value="payment">Payment</option>
          <option value="gelombang">Gelombang</option>
          <option value="jurusan">Jurusan</option>
          <option value="berita">Berita</option>
          <option value="pengumuman">Pengumuman</option>
          <option value="user">User</option>
          <option value="role">Role</option>
          <option value="auth">Auth</option>
        </select>
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