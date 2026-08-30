import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { api } from '../lib/api';
import { toast } from 'sonner';
import { formatLogDetail } from '../lib/logFormatter';
import LogEntryCard from './LogEntryCard';

/**
 * Reusable history/riwayat tab — card/timeline list (BUKAN tabel).
 *
 * Layout: setiap log entry jadi 1 card terpisah dengan:
 *   - badge aksi berwarna + waktu (small, gray)
 *   - avatar bulat + nama user + email
 *   - divider tipis
 *   - section detail (label:value human-readable, list data as pills)
 *
 * Dipakai oleh:
 *   - GelombangPage   (Riwayat Penambahan & Perubahan Gelombang)
 *   - JurusanPage     (Riwayat Perubahan Master Jurusan)
 *   - BeritaPage      (Riwayat Perubahan Berita)
 *   - PengumumanPage  (Riwayat Perubahan Pengumuman)
 *
 * Untuk Role history (matrix di RolesPage) & Audit Log global, parent
 * page langsung pakai <LogEntryCard /> dengan konfigurasi sendiri
 * (mis. entityName = roleName, atau tanpa entityName untuk audit log).
 */

interface AuditLogItem {
  id: string;
  userId: string | null;
  action: string;
  module: string;
  entityType: string | null;
  entityId: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  meta: any;
  createdAt: string;
  user: { id: string; name: string; email: string } | null;
}

export interface HistoryTabProps {
  module: string;
  title?: string;
  /** Filter action prefix — kalau di-set, hanya log yang action-nya start with salah satu prefix ini yang tampil */
  actionFilter?: string[];
  /** Limit items (default 100) */
  pageSize?: number;
  /** Optional subtitle di atas list (mis. "Filter otomatis menampilkan …") */
  subtitle?: string;
}

export default function HistoryTab({
  module,
  title,
  actionFilter,
  pageSize = 100,
  subtitle,
}: HistoryTabProps) {
  const [items, setItems] = useState<AuditLogItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.get<{ items: AuditLogItem[]; total: number }>('/audit-logs', {
        params: { module, pageSize },
      });
      let filtered = res.data.items;
      if (actionFilter && actionFilter.length > 0) {
        filtered = filtered.filter((it) =>
          actionFilter.some((p) => it.action.startsWith(p)),
        );
      }
      setItems(filtered);
    } catch (e: any) {
      toast.error(`Gagal memuat riwayat: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [module]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18 }}
    >
      {(title || subtitle) && (
        <div className="mb-3">
          {title && (
            <p className="text-sm font-medium text-slate-700">{title}</p>
          )}
          {subtitle && (
            <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>
          )}
        </div>
      )}

      {loading ? (
        <div className="card text-center text-sm text-slate-500">Memuat…</div>
      ) : items.length === 0 ? (
        <div className="card text-center text-sm text-slate-500">
          Belum ada riwayat perubahan.
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {items.map((l) => (
            <LogEntryCard
              key={l.id}
              createdAt={l.createdAt}
              action={l.action}
              user={l.user}
              ipAddress={l.ipAddress}
              rows={formatLogDetail(l.action, l.module, l.meta)}
            />
          ))}
        </div>
      )}
    </motion.div>
  );
}