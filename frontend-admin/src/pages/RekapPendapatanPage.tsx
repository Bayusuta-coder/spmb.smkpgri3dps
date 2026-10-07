import { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import {
  RefreshCw,
  FileSpreadsheet,
  Wallet,
  TrendingUp,
  CalendarDays,
  Filter,
  Download,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { api } from '../lib/api';
import { formatRupiah, METODE_PEMBAYARAN_LABELS } from '../lib/constants';
import { CustomSelect } from '../components/CustomSelect';
// NOTE: PengaturanHargaSection dulu di-embed di sini sebagai preview harga
// saat Catat Pembayaran, tapi fitur edit/view harga sudah dipindah total
// ke menu dedicated /pengaturan-harga (lihat PengaturanHargaPage.tsx).
// Untuk menghindari duplikasi UI, section ini dihilangkan dari Bendahara.
// Form "Catat Pembayaran" di PendaftarListPage / PendaftarDetailPage tetap
// fetch harga sendiri lewat /settings/harga-daftar-ulang — tidak bergantung
// pada komponen ini.

interface RekapSummary {
  totalPendapatan: number;
  totalCash: number;
  totalTransfer: number;
  jumlahTransaksi: number;
}

interface RekapGelombang {
  gelombangId: string | null;
  name: string;
  total: number;
  count: number;
  cashTotal: number;
  transferTotal: number;
}

interface RekapTransaction {
  id: string;
  registrationNumber: string;
  namaLengkap: string;
  nominal: number;
  metode: 'CASH' | 'TRANSFER' | null;
  tanggalBayar: string | null;
  gelombang: { id: string; name: string } | null;
  dibayarOleh: { name: string; email: string } | null;
}

interface GelombangOption {
  id: string;
  name: string;
}

interface RekapFilters {
  startDate: string;
  endDate: string;
  gelombangId: string;
  metode: '' | 'CASH' | 'TRANSFER';
}

const EMPTY_FILTERS: RekapFilters = {
  startDate: '',
  endDate: '',
  gelombangId: '',
  metode: '',
};

/** Pagination: 20 transaksi per halaman (sama dengan PendaftarListPage). */
const PAGE_SIZE = 20;

export default function RekapPendapatanPage() {
  const [data, setData] = useState<{
    summary: RekapSummary;
    perGelombang: RekapGelombang[];
    transactions: RekapTransaction[];
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [filters, setFilters] = useState<RekapFilters>(EMPTY_FILTERS);
  const [gelombangList, setGelombangList] = useState<GelombangOption[]>([]);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const pollRef = useRef<number | null>(null);
  // Pagination tabel transaksi (client-side). Reset ke 1 setiap filter berubah.
  const [page, setPage] = useState(1);

  const fetchRekap = useCallback(async () => {
    try {
      const params: Record<string, string> = {};
      if (filters.startDate) params.startDate = filters.startDate;
      if (filters.endDate) params.endDate = filters.endDate;
      if (filters.gelombangId) params.gelombangId = filters.gelombangId;
      if (filters.metode) params.metode = filters.metode;
      const res = await api.get('/rekap/pendapatan', { params });
      setData(res.data);
      setLastUpdated(new Date());
    } catch (e) {
      console.error('Gagal memuat rekap:', e);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  const fetchGelombang = useCallback(async () => {
    try {
      const res = await api.get('/gelombang');
      const items: GelombangOption[] = (res.data?.items ?? res.data ?? []).map(
        (g: any) => ({ id: g.id, name: g.name }),
      );
      setGelombangList(items);
    } catch (e) {
      console.warn('Gagal load gelombang list (filter dropdown):', e);
    }
  }, []);

  // Initial fetch + polling (auto-refresh supaya data real-time setiap 30 detik)
  useEffect(() => {
    fetchRekap();
    fetchGelombang();
    pollRef.current = window.setInterval(() => {
      fetchRekap();
    }, 30_000);
    return () => {
      if (pollRef.current) window.clearInterval(pollRef.current);
    };
  }, [fetchRekap, fetchGelombang]);

  const onFilterChange = (k: keyof RekapFilters, v: string) => {
    setFilters((prev) => ({ ...prev, [k]: v }));
    // Filter berubah → kembali ke halaman 1 supaya tidak stuck di halaman kosong
    setPage(1);
  };

  const onResetFilter = () => {
    setFilters(EMPTY_FILTERS);
    setPage(1);
  };

  const onExportExcel = async () => {
    try {
      setExporting(true);
      const params: Record<string, string> = {};
      if (filters.startDate) params.startDate = filters.startDate;
      if (filters.endDate) params.endDate = filters.endDate;
      if (filters.gelombangId) params.gelombangId = filters.gelombangId;
      if (filters.metode) params.metode = filters.metode;
      const res = await api.get('/rekap/pendapatan.xlsx', {
        params,
        responseType: 'blob',
      });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `rekap-pendapatan-${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error('Gagal export Excel:', e);
      alert('Gagal export Excel. Coba lagi.');
    } finally {
      setExporting(false);
    }
  };

  if (loading && !data) {
    return <div className="text-slate-500">Memuat rekap pendapatan…</div>;
  }

  const summary = data?.summary;
  const perGelombang = data?.perGelombang ?? [];
  const transactions = data?.transactions ?? [];

  // Pagination client-side: 20 baris per halaman. Pola sama dengan PendaftarListPage.
  const totalPages = Math.max(1, Math.ceil(transactions.length / PAGE_SIZE));
  // Guard supaya `page` selalu valid (mis. kalau filter lama menghasilkan
  // halaman 5, lalu ganti filter jadi 1 halaman total → page di-reset ke 1
  // di onFilterChange, tapi defensive check di sini juga)
  const safePage = Math.min(Math.max(1, page), totalPages);
  const pageStart = (safePage - 1) * PAGE_SIZE;
  const pagedTransactions = transactions.slice(pageStart, pageStart + PAGE_SIZE);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Bendahara</h1>
          <p className="mt-1 text-sm text-slate-500">
            Ringkasan pembayaran yang sudah dicatat Bendahara (LUNAS).
            {lastUpdated && (
              <>
                {' '}
                Update terakhir:{' '}
                <span className="font-medium text-slate-700">
                  {lastUpdated.toLocaleTimeString('id-ID')}
                </span>
              </>
            )}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => {
              setLoading(true);
              fetchRekap();
            }}
            disabled={loading}
            className="btn-ghost"
            title="Refresh data"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
          <button
            onClick={onExportExcel}
            disabled={exporting || !data}
            className="btn-primary"
            title="Download rekap sebagai Excel (.xlsx)"
          >
            {exporting ? (
              <RefreshCw size={16} className="animate-spin" />
            ) : (
              <FileSpreadsheet size={16} />
            )}
            Export Excel
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <motion.div
          initial={{ y: 6, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.18 }}
          className="card border-l-4 border-emerald-500"
        >
          <div className="flex items-center justify-between">
            <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Total Pendapatan
            </div>
            <Wallet className="text-emerald-500" size={18} />
          </div>
          <div className="mt-2 text-2xl font-bold text-emerald-700">
            {formatRupiah(summary?.totalPendapatan ?? 0)}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            {summary?.jumlahTransaksi ?? 0} transaksi tercatat
          </div>
        </motion.div>

        <motion.div
          initial={{ y: 6, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.18, delay: 0.04 }}
          className="card border-l-4 border-sky-500"
        >
          <div className="flex items-center justify-between">
            <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Total Tunai (CASH)
            </div>
            <TrendingUp className="text-sky-500" size={18} />
          </div>
          <div className="mt-2 text-2xl font-bold text-sky-700">
            {formatRupiah(summary?.totalCash ?? 0)}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            {summary && summary.totalPendapatan > 0
              ? `${((summary.totalCash / summary.totalPendapatan) * 100).toFixed(1)}% dari total`
              : '0% dari total'}
          </div>
        </motion.div>

        <motion.div
          initial={{ y: 6, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.18, delay: 0.08 }}
          className="card border-l-4 border-indigo-500"
        >
          <div className="flex items-center justify-between">
            <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Total Transfer
            </div>
            <TrendingUp className="text-indigo-500" size={18} />
          </div>
          <div className="mt-2 text-2xl font-bold text-indigo-700">
            {formatRupiah(summary?.totalTransfer ?? 0)}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            {summary && summary.totalPendapatan > 0
              ? `${((summary.totalTransfer / summary.totalPendapatan) * 100).toFixed(1)}% dari total`
              : '0% dari total'}
          </div>
        </motion.div>

        <motion.div
          initial={{ y: 6, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.18, delay: 0.12 }}
          className="card border-l-4 border-amber-500"
        >
          <div className="flex items-center justify-between">
            <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Rata-rata per Transaksi
            </div>
            <CalendarDays className="text-amber-500" size={18} />
          </div>
          <div className="mt-2 text-2xl font-bold text-amber-700">
            {formatRupiah(
              summary && summary.jumlahTransaksi > 0
                ? summary.totalPendapatan / summary.jumlahTransaksi
                : 0,
            )}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            Nominal snapshot saat Bendahara catat
          </div>
        </motion.div>
      </div>

      {/* Per Gelombang breakdown */}
      <div className="card">
        <h2 className="text-lg font-semibold text-slate-900">Breakdown per Gelombang</h2>
        {perGelombang.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">
            Belum ada pembayaran yang tercatat untuk filter saat ini.
          </p>
        ) : (
          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
            {perGelombang.map((g) => {
              const pct =
                summary && summary.totalPendapatan > 0
                  ? (g.total / summary.totalPendapatan) * 100
                  : 0;
              const cashPct = g.total > 0 ? (g.cashTotal / g.total) * 100 : 0;
              const transferPct = g.total > 0 ? (g.transferTotal / g.total) * 100 : 0;
              return (
                <div key={g.gelombangId ?? '__none__'} className="rounded-lg border border-slate-200 p-4">
                  <div className="flex items-center justify-between">
                    <div className="font-semibold text-slate-900">{g.name}</div>
                    <div className="text-xs text-slate-500">
                      {g.count} transaksi
                    </div>
                  </div>
                  <div className="mt-2 text-xl font-bold text-emerald-700">
                    {formatRupiah(g.total)}
                  </div>
                  <div className="mt-1 text-xs text-slate-500">
                    {pct.toFixed(1)}% dari total pendapatan
                  </div>
                  {/* Split bar: cash vs transfer */}
                  <div className="mt-3 flex h-2 overflow-hidden rounded-full bg-slate-200">
                    <div
                      className="bg-sky-500"
                      style={{ width: `${cashPct}%` }}
                      title={`Tunai: ${cashPct.toFixed(1)}%`}
                    />
                    <div
                      className="bg-indigo-500"
                      style={{ width: `${transferPct}%` }}
                      title={`Transfer: ${transferPct.toFixed(1)}%`}
                    />
                  </div>
                  <div className="mt-2 flex flex-wrap gap-3 text-xs">
                    <span className="flex items-center gap-1">
                      <span className="inline-block h-2 w-2 rounded-full bg-sky-500" />
                      Tunai: <strong>{formatRupiah(g.cashTotal)}</strong>
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="inline-block h-2 w-2 rounded-full bg-indigo-500" />
                      Transfer: <strong>{formatRupiah(g.transferTotal)}</strong>
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="card">
        <div className="mb-3 flex items-center gap-2">
          <Filter size={16} className="text-slate-500" />
          <h2 className="text-lg font-semibold text-slate-900">Filter Transaksi</h2>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className="label">Dari Tanggal</label>
            <input
              type="date"
              className="input"
              value={filters.startDate}
              onChange={(e) => onFilterChange('startDate', e.target.value)}
            />
          </div>
          <div>
            <label className="label">Sampai Tanggal</label>
            <input
              type="date"
              className="input"
              value={filters.endDate}
              onChange={(e) => onFilterChange('endDate', e.target.value)}
            />
          </div>
          <div>
            <label className="label">Gelombang</label>
            <CustomSelect
              value={filters.gelombangId}
              onChange={(e) => onFilterChange('gelombangId', e.target.value)}
            >
              <option value="">— Semua Gelombang —</option>
              {gelombangList.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </CustomSelect>
          </div>
          <div>
            <label className="label">Metode Pembayaran</label>
            <CustomSelect
              value={filters.metode}
              onChange={(e) => onFilterChange('metode', e.target.value as RekapFilters['metode'])}
            >
              <option value="">— Semua Metode —</option>
              <option value="CASH">{METODE_PEMBAYARAN_LABELS.CASH}</option>
              <option value="TRANSFER">{METODE_PEMBAYARAN_LABELS.TRANSFER}</option>
            </CustomSelect>
          </div>
        </div>
        <div className="mt-3 flex justify-end">
          <button onClick={onResetFilter} className="btn-ghost text-xs">
            Reset Filter
          </button>
        </div>
      </div>

      {/* Transactions table — struktur & className 1:1 dengan PendaftarListPage
          (`card overflow-hidden p-0` + `overflow-x-auto` + `table-th`/`table-td`
          classes) supaya styling konsisten. min-w-[Xpx] per kolom dipakai
          sebagai floor width — di layar kecil tabel akan scroll horizontal,
          di layar besar kolom akan melar natural dengan whitespace proporsional. */}
      <div className="card overflow-hidden p-0">
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-3">
          <h2 className="text-lg font-semibold text-slate-900">
            Daftar Transaksi ({transactions.length})
          </h2>
          <button
            onClick={onExportExcel}
            disabled={exporting || transactions.length === 0}
            className="btn-ghost text-xs"
          >
            <Download size={14} />
            {exporting ? 'Menyiapkan…' : 'Download Excel'}
          </button>
        </div>
        {transactions.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-slate-500">
            Tidak ada transaksi untuk filter saat ini.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-slate-200 bg-slate-50">
                <tr>
                  <th className="table-th min-w-[150px]">No. Pendaftaran</th>
                  <th className="table-th min-w-[220px]">Nama Siswa</th>
                  <th className="table-th min-w-[150px]">Gelombang</th>
                  <th className="table-th min-w-[140px] text-right">Nominal</th>
                  <th className="table-th min-w-[120px] text-center">Metode</th>
                  <th className="table-th min-w-[160px]">Tanggal Dicatat</th>
                  <th className="table-th min-w-[180px]">Dicatat Oleh</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pagedTransactions.map((t) => (
                  <tr key={t.id} className="hover:bg-slate-50">
                    <td className="table-td font-mono text-xs text-slate-600">
                      {t.registrationNumber}
                    </td>
                    <td className="table-td">
                      <div
                        className="truncate font-medium text-slate-900"
                        style={{ maxWidth: '260px' }}
                        title={t.namaLengkap}
                      >
                        {t.namaLengkap}
                      </div>
                    </td>
                    <td className="table-td text-slate-700">
                      {t.gelombang?.name ? (
                        <div
                          className="truncate"
                          style={{ maxWidth: '180px' }}
                          title={t.gelombang.name}
                        >
                          {t.gelombang.name}
                        </div>
                      ) : (
                        <span className="text-slate-400">-</span>
                      )}
                    </td>
                    <td className="table-td text-right font-semibold text-emerald-700">
                      {formatRupiah(t.nominal)}
                    </td>
                    <td className="table-td text-center">
                      {t.metode ? (
                        <span
                          className={
                            t.metode === 'CASH'
                              ? 'badge bg-sky-100 text-sky-800'
                              : 'badge bg-indigo-100 text-indigo-800'
                          }
                        >
                          {METODE_PEMBAYARAN_LABELS[t.metode]}
                        </span>
                      ) : (
                        <span className="text-slate-400">-</span>
                      )}
                    </td>
                    <td className="table-td text-xs text-slate-600">
                      {t.tanggalBayar
                        ? new Date(t.tanggalBayar).toLocaleString('id-ID', {
                            dateStyle: 'short',
                            timeStyle: 'short',
                          })
                        : '-'}
                    </td>
                    <td className="table-td text-slate-700">
                      {t.dibayarOleh?.name ? (
                        <div
                          className="truncate"
                          style={{ maxWidth: '200px' }}
                          title={t.dibayarOleh.name}
                        >
                          {t.dibayarOleh.name}
                        </div>
                      ) : (
                        <span className="text-slate-400">-</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {/* Pagination footer — sama style dengan PendaftarListPage */}
        {transactions.length > 0 && (
          <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3 text-sm">
            <div className="text-slate-500">
              Menampilkan{' '}
              <b>
                {pageStart + 1}–{Math.min(pageStart + PAGE_SIZE, transactions.length)}
              </b>{' '}
              dari <b>{transactions.length}</b> transaksi
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={safePage === 1}
                className="btn-ghost px-2 py-1"
                title="Halaman sebelumnya"
              >
                <ChevronLeft size={16} />
              </button>
              <span className="px-2 text-slate-600">
                Halaman {safePage} / {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={safePage === totalPages}
                className="btn-ghost px-2 py-1"
                title="Halaman selanjutnya"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
