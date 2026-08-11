import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Check, X, AlertTriangle } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { PAYMENT_STATUS_COLORS, PAYMENT_STATUS_LABELS } from '../lib/constants';

export default function PembayaranListPage() {
  const { hasPermission } = useAuth();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.get('/pembayaran');
      setItems(res.data.items);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const onVerify = async (id: string, decision: 'TERVERIFIKASI' | 'BELUM_DITEMUKAN') => {
    const note = decision === 'BELUM_DITEMUKAN'
      ? prompt('Catatan (opsional):') || undefined
      : undefined;
    if (decision === 'BELUM_DITEMUKAN' && note === null) return;
    try {
      await api.post(`/pembayaran/${id}/verify`, { decision, note });
      toast.success('Pembayaran diperbarui');
      load();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const fmtDate = (d: string | null) =>
    d ? new Date(d).toLocaleDateString('id-ID') : '—';
  const fmtRupiah = (n: string | number) =>
    Number(n).toLocaleString('id-ID');

  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold text-slate-900">Verifikasi Pembayaran (TU)</h1>

      <div className="card overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="border-b border-slate-200 bg-slate-50">
              <tr>
                <th className="table-th">No. Pendaftaran</th>
                <th className="table-th">Nama Siswa</th>
                <th className="table-th">Jurusan</th>
                <th className="table-th">Nominal</th>
                <th className="table-th">Tgl Transfer</th>
                <th className="table-th">Pengirim</th>
                <th className="table-th">Status</th>
                {hasPermission('payment.verify') && <th className="table-th">Aksi</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td colSpan={8} className="table-td text-center text-slate-500">Memuat…</td></tr>
              ) : items.length === 0 ? (
                <tr><td colSpan={8} className="table-td text-center text-slate-500">Tidak ada pembayaran menunggu</td></tr>
              ) : items.map((p) => {
                const isOrphan = p.kind === 'ORPHAN';
                return (
                  <tr
                    key={p.id}
                    className={
                      isOrphan
                        ? 'bg-amber-50/40 hover:bg-amber-50/70'
                        : 'hover:bg-slate-50'
                    }
                  >
                    <td className="table-td font-mono text-xs">
                      <div className="flex items-center gap-1.5">
                        {p.pendaftar.registrationNumber}
                        {isOrphan && (
                          <span
                            title={p.warning}
                            className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700"
                          >
                            <AlertTriangle size={10} />
                            data hilang
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="table-td font-medium">{p.pendaftar.namaLengkap}</td>
                    <td className="table-td">{p.pendaftar.jurusan?.code || '-'}</td>
                    <td className="table-td">
                      {isOrphan ? (
                        <span className="text-slate-400">—</span>
                      ) : (
                        `Rp ${fmtRupiah(p.nominal)}`
                      )}
                    </td>
                    <td className="table-td">{fmtDate(p.tanggalTransfer)}</td>
                    <td className="table-td">{p.namaPengirim || '—'}</td>
                    <td className="table-td">
                      <span className={`badge ${PAYMENT_STATUS_COLORS[p.status]}`}>
                        {PAYMENT_STATUS_LABELS[p.status]}
                      </span>
                    </td>
                    {hasPermission('payment.verify') && !isOrphan && p.status === 'MENUNGGU_VERIFIKASI' && (
                      <td className="table-td">
                        <div className="flex gap-1">
                          <button
                            onClick={() => onVerify(p.id, 'TERVERIFIKASI')}
                            className="rounded bg-emerald-500 px-2 py-1 text-xs font-semibold text-white hover:bg-emerald-600"
                            aria-label="Verifikasi"
                          >
                            <Check size={12} />
                          </button>
                          <button
                            onClick={() => onVerify(p.id, 'BELUM_DITEMUKAN')}
                            className="rounded bg-red-500 px-2 py-1 text-xs font-semibold text-white hover:bg-red-600"
                            aria-label="Tolak"
                          >
                            <X size={12} />
                          </button>
                        </div>
                      </td>
                    )}
                    {hasPermission('payment.verify') && isOrphan && (
                      <td className="table-td">
                        <span className="text-xs text-amber-700" title={p.warning}>
                          Minta siswa input ulang
                        </span>
                      </td>
                    )}
                    {hasPermission('payment.verify') && !isOrphan && p.status !== 'MENUNGGU_VERIFIKASI' && (
                      <td className="table-td text-xs text-slate-500">—</td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {items.some((p) => p.kind === 'ORPHAN') && (
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          <p className="font-semibold">
            <AlertTriangle size={14} className="mr-1 inline" />
            Ada pendaftar dengan status &quot;menunggu verifikasi pembayaran&quot; tapi belum ada
            data transfer yang masuk.
          </p>
          <p className="mt-1 text-xs">
            Minta masing-masing siswa untuk membuka halaman Cek Status dan mengirim ulang
            data transfer-nya. Setelah itu, TU bisa melakukan verifikasi seperti biasa.
          </p>
        </div>
      )}
    </div>
  );
}
