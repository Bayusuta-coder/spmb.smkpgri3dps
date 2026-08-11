import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { STATUS_LABELS } from '../lib/constants';

export default function StatistikPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await api.get('/statistik/summary');
        setData(res.data);
      } catch {} finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <div className="text-slate-500">Memuat…</div>;
  if (!data) return <div className="text-slate-500">Tidak ada data</div>;

  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold text-slate-900">Statistik SPMB</h1>

      <div className="card mb-4">
        <div className="text-sm text-slate-500">Total Pendaftar</div>
        <div className="text-4xl font-bold text-primary-700">{data.total}</div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="card">
          <h2 className="text-lg font-semibold">Per Status</h2>
          <ul className="mt-3 space-y-2">
            {data.byStatus.map((s: any) => {
              const pct = data.total > 0 ? (s.count / data.total) * 100 : 0;
              return (
                <li key={s.status}>
                  <div className="flex items-center justify-between text-sm">
                    <span>{STATUS_LABELS[s.status] || s.status}</span>
                    <span className="font-semibold">{s.count}</span>
                  </div>
                  <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full bg-primary-500"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="card">
          <h2 className="text-lg font-semibold">Per Jurusan</h2>
          <ul className="mt-3 space-y-1 text-sm">
            {data.byJurusan.map((j: any) => (
              <li key={j.jurusanId} className="flex items-center justify-between">
                <span>{j.code} — <span className="text-slate-500">{j.name}</span></span>
                <span className="font-semibold">{j.count}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="card md:col-span-2">
          <h2 className="text-lg font-semibold">Per Gelombang</h2>
          <ul className="mt-3 space-y-1 text-sm">
            {data.byGelombang.map((g: any) => (
              <li key={g.gelombangId} className="flex items-center justify-between">
                <span>{g.name}</span>
                <span className="font-semibold">{g.count}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
