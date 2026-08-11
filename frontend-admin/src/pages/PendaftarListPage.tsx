import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Search, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { api } from '../lib/api';
import { STATUS_COLORS, STATUS_LABELS } from '../lib/constants';
import { toast } from 'sonner';

export default function PendaftarListPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [items, setItems] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [search, setSearch] = useState(searchParams.get('search') || '');
  const [status, setStatus] = useState(searchParams.get('status') || '');
  const [gelombangId, setGelombangId] = useState(searchParams.get('gelombangId') || '');
  const [gelombangName, setGelombangName] = useState('');
  const [loading, setLoading] = useState(true);

  // Resolve gelombang name for active filter chip
  useEffect(() => {
    if (!gelombangId) {
      setGelombangName('');
      return;
    }
    api
      .get('/gelombang')
      .then((r) => {
        const g = (r.data as any[]).find((x) => x.id === gelombangId);
        setGelombangName(g?.name || gelombangId);
      })
      .catch(() => setGelombangName(gelombangId));
  }, [gelombangId]);

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.get('/pendaftar', {
        params: {
          page,
          pageSize,
          search: search || undefined,
          status: status || undefined,
          gelombangId: gelombangId || undefined,
        },
      });
      setItems(res.data.items);
      setTotal(res.data.total);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [page]);

  const onSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    load();
  };

  const clearFilter = (key: string) => {
    const next = new URLSearchParams(searchParams);
    next.delete(key);
    setSearchParams(next);
    if (key === 'gelombangId') setGelombangId('');
    if (key === 'status') setStatus('');
    if (key === 'search') setSearch('');
    setPage(1);
    setTimeout(load, 0);
  };

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold text-slate-900">Daftar Pendaftar</h1>

      <form onSubmit={onSearch} className="card mb-4 flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            className="input pl-9"
            placeholder="Cari no. pendaftaran / nama / NISN / sekolah…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select
          className="input sm:w-56"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="">Semua Status</option>
          {Object.entries(STATUS_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        <button type="submit" className="btn-primary">Cari</button>
      </form>

      {(status || gelombangId || search) && (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className="text-xs text-slate-500">Filter aktif:</span>
          {status && (
            <button
              onClick={() => clearFilter('status')}
              className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-800 hover:bg-amber-200"
            >
              Status: {STATUS_LABELS[status] || status}
              <X size={12} />
            </button>
          )}
          {gelombangId && (
            <button
              onClick={() => clearFilter('gelombangId')}
              className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-3 py-1 text-xs font-medium text-blue-800 hover:bg-blue-200"
            >
              Gelombang: {gelombangName || gelombangId}
              <X size={12} />
            </button>
          )}
          {search && (
            <button
              onClick={() => clearFilter('search')}
              className="inline-flex items-center gap-1 rounded-full bg-slate-200 px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-300"
            >
              Cari: "{search}"
              <X size={12} />
            </button>
          )}
        </div>
      )}

      <div className="card overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="border-b border-slate-200 bg-slate-50">
              <tr>
                <th className="table-th">No. Pendaftaran</th>
                <th className="table-th">Nama</th>
                <th className="table-th">Jurusan</th>
                <th className="table-th">Gelombang</th>
                <th className="table-th">Status</th>
                <th className="table-th">Tgl Daftar</th>
                <th className="table-th"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={7} className="table-td text-center text-slate-500">Memuat…</td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={7} className="table-td text-center text-slate-500">Tidak ada data</td>
                </tr>
              ) : (
                items.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50">
                    <td className="table-td font-mono text-xs">{p.registrationNumber}</td>
                    <td className="table-td">
                      <div className="font-medium text-slate-900">{p.namaLengkap}</div>
                      <div className="text-xs text-slate-500">NISN {p.nisn}</div>
                    </td>
                    <td className="table-td">{p.jurusan.code}</td>
                    <td className="table-td">{p.gelombang.name}</td>
                    <td className="table-td">
                      <span className={`badge ${STATUS_COLORS[p.status]}`}>{p.statusLabel}</span>
                    </td>
                    <td className="table-td text-xs text-slate-500">
                      {new Date(p.createdAt).toLocaleDateString('id-ID')}
                    </td>
                    <td className="table-td text-right">
                      <Link to={`/pendaftar/${p.id}`} className="text-primary-600 hover:underline text-sm">
                        Detail →
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3 text-sm">
          <div className="text-slate-500">
            Total <b>{total}</b> pendaftar
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="btn-ghost px-2 py-1"
            >
              <ChevronLeft size={16} />
            </button>
            <span className="px-2 text-slate-600">
              Halaman {page} / {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="btn-ghost px-2 py-1"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
