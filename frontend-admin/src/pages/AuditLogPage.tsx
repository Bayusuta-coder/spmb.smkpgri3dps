import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { toast } from 'sonner';

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

  useEffect(() => { load(); }, [moduleFilter]);

  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold text-slate-900">Audit Log</h1>

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
          <option value="user">User</option>
          <option value="role">Role</option>
        </select>
      </div>

      <div className="card overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="border-b border-slate-200 bg-slate-50">
              <tr>
                <th className="table-th">Waktu</th>
                <th className="table-th">User</th>
                <th className="table-th">Modul</th>
                <th className="table-th">Aksi</th>
                <th className="table-th">IP</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td colSpan={5} className="table-td text-center text-slate-500">Memuat…</td></tr>
              ) : items.length === 0 ? (
                <tr><td colSpan={5} className="table-td text-center text-slate-500">Belum ada log</td></tr>
              ) : items.map((l) => (
                <tr key={l.id}>
                  <td className="table-td text-xs text-slate-500">
                    {new Date(l.createdAt).toLocaleString('id-ID')}
                  </td>
                  <td className="table-td">{l.user?.name || '-'}</td>
                  <td className="table-td"><span className="badge bg-slate-100 text-slate-700">{l.module}</span></td>
                  <td className="table-td">{l.action}</td>
                  <td className="table-td text-xs text-slate-500">{l.ipAddress || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
