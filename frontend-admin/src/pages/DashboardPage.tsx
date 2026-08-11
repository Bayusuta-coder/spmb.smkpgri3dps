import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Link, useNavigate } from 'react-router-dom';
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
} from 'recharts';
import {
  GraduationCap,
  Wallet,
  UserCheck,
  Users,
  ArrowRight,
  CalendarDays,
  ChevronRight,
} from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { STATUS_LABELS } from '../lib/constants';

/**
 * Categorical palette untuk 5 status (validated OKLab ×100, CVD ≥ 8, normal ≥ 15).
 * Urutan slot dipakai fix per referensi dataviz — bukan di-cycle per chart.
 * Slot 1 biru (LOLOS_MENUNGGU_DAFTAR_ULANG), 2 oranye (DITOLAK),
 * 3 aqua (SISWA_AKTIF), 4 kuning (MENUNGGU_VERIFIKASI), 5 magenta
 * (MENUNGGU_VERIFIKASI_PEMBAYARAN).
 */
const STATUS_PALETTE: Record<string, string> = {
  LOLOS_MENUNGGU_DAFTAR_ULANG: '#2a78d6',
  DITOLAK: '#eb6834',
  SISWA_AKTIF: '#1baf7a',
  MENUNGGU_VERIFIKASI: '#eda100',
  MENUNGGU_VERIFIKASI_PEMBAYARAN: '#e87ba4',
};

export default function DashboardPage() {
  const { user, hasPermission, hasAnyRole } = useAuth();
  const navigate = useNavigate();
  const [summary, setSummary] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!hasPermission('statistik.view')) return;
    (async () => {
      try {
        const res = await api.get('/statistik/summary');
        setSummary(res.data);
      } catch {} finally {
        setLoading(false);
      }
    })();
  }, [hasPermission]);

  const getCount = (status: string) =>
    summary?.byStatus?.find((s: any) => s.status === status)?.count ?? 0;

  const totalPendaftar = summary?.total ?? 0;
  const menungguVerifikasiCount = getCount('MENUNGGU_VERIFIKASI');

  // Data untuk donut chart — pastikan setiap status punya nilai (default 0)
  const chartData = useMemo(() => {
    const all = [
      'MENUNGGU_VERIFIKASI',
      'DITOLAK',
      'LOLOS_MENUNGGU_DAFTAR_ULANG',
      'MENUNGGU_VERIFIKASI_PEMBAYARAN',
      'SISWA_AKTIF',
    ];
    return all.map((status) => ({
      status,
      label: STATUS_LABELS[status],
      value: getCount(status),
      color: STATUS_PALETTE[status] || '#94a3b8',
    }));
  }, [summary]);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">
          Selamat datang, {user?.name}!
        </h1>
        <p className="text-slate-500">Role aktif: {user?.roles.join(', ')}</p>
      </div>

      {hasAnyRole('Admin', 'Superadmin') && (
        <>
          {/* Baris 1: 4 stat cards */}
          <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatCard
              label="Total Pendaftar"
              value={totalPendaftar}
              icon={GraduationCap}
              color="bg-primary-100 text-primary-700"
              loading={loading}
            />
            <StatCard
              label="Siswa Aktif"
              value={getCount('SISWA_AKTIF')}
              icon={UserCheck}
              color="bg-emerald-100 text-emerald-700"
              loading={loading}
            />
            <StatCard
              label="Lolos - Daftar Ulang"
              value={getCount('LOLOS_MENUNGGU_DAFTAR_ULANG')}
              icon={Wallet}
              color="bg-blue-100 text-blue-700"
              loading={loading}
            />
            <StatCard
              // Card ini clickable — klik langsung ke halaman Pendaftar
              // dengan filter otomatis status=MENUNGGU_VERIFIKASI
              label="Menunggu Verifikasi"
              value={menungguVerifikasiCount}
              icon={Users}
              color="bg-amber-100 text-amber-700"
              loading={loading}
              clickable
              highlight={menungguVerifikasiCount > 0}
              onClick={() => navigate('/pendaftar?status=MENUNGGU_VERIFIKASI')}
            />
          </div>

          {/* Baris 2: Chart + Per-Gelombang (2 kolom di desktop, stack di mobile) */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <StatusBreakdownCard data={chartData} loading={loading} total={totalPendaftar} />
            <GelombangBreakdown
              items={summary?.byGelombang ?? []}
              loading={loading}
              canManageGelombang={hasPermission('gelombang.view')}
            />
          </div>
        </>
      )}
    </div>
  );
}

/* ====================================================================== */
/* Stat card (default + variant clickable)                                 */
/* ====================================================================== */
function StatCard({
  label,
  value,
  icon: Icon,
  color,
  loading,
  clickable = false,
  highlight = false,
  onClick,
}: {
  label: string;
  value?: number;
  icon: any;
  color: string;
  loading: boolean;
  clickable?: boolean;
  highlight?: boolean;
  onClick?: () => void;
}) {
  const Wrapper: any = clickable ? motion.button : motion.div;
  const wrapperProps = clickable
    ? { onClick, type: 'button', whileHover: { y: -2 }, whileTap: { scale: 0.98 } }
    : {};
  return (
    <Wrapper
      initial={{ y: 8, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.18 }}
      {...wrapperProps}
      className={`card relative text-left transition ${
        clickable ? 'cursor-pointer hover:shadow-md hover:border-primary-200' : ''
      } ${highlight ? 'ring-2 ring-amber-300' : ''}`}
    >
      <div className="flex items-center gap-3">
        <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${color}`}>
          <Icon size={18} />
        </div>
        <div className="flex-1">
          <div className="text-xs text-slate-500">{label}</div>
          <div className="text-xl font-bold text-slate-900">
            {loading ? '…' : (value ?? 0)}
          </div>
        </div>
        {clickable && (
          <ArrowRight size={16} className="shrink-0 text-slate-400" />
        )}
      </div>
      {/* Badge notifikasi ketika highlight aktif */}
      {highlight && (
        <motion.span
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.25, type: 'spring', stiffness: 240 }}
          className="absolute -right-1 -top-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-500 px-1.5 text-[10px] font-bold text-white shadow"
        >
          Perlu tindakan
        </motion.span>
      )}
    </Wrapper>
  );
}

/* ====================================================================== */
/* Donut chart breakdown status                                            */
/* ====================================================================== */
function StatusBreakdownCard({
  data,
  loading,
  total,
}: {
  data: Array<{ status: string; label: string; value: number; color: string }>;
  loading: boolean;
  total: number;
}) {
  // Hanya tampilkan segment yang punya nilai > 0 (sisanya tidak dirender supaya
  // pie tidak penuh dengan irisan kosong 0%).
  const visibleData = data.filter((d) => d.value > 0);
  const isEmpty = visibleData.length === 0;

  return (
    <motion.div
      initial={{ y: 8, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.22, delay: 0.08 }}
      className="card"
    >
      <div className="mb-2 flex items-baseline justify-between">
        <h2 className="text-lg font-semibold text-slate-900">Status Pendaftar</h2>
        <span className="text-xs text-slate-500">
          Total {loading ? '…' : total} pendaftar
        </span>
      </div>

      {loading ? (
        <div className="flex h-72 items-center justify-center text-slate-400">Memuat…</div>
      ) : isEmpty ? (
        <div className="flex h-72 items-center justify-center text-slate-400">
          Belum ada data pendaftar
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-[180px_1fr]">
          {/* Donut */}
          <motion.div
            initial={{ scale: 0.92, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.35, ease: 'easeOut' }}
            className="relative h-44 w-full"
          >
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={visibleData}
                  dataKey="value"
                  nameKey="label"
                  innerRadius={48}
                  outerRadius={78}
                  paddingAngle={2}
                  stroke="#ffffff"
                  strokeWidth={2}
                  isAnimationActive
                  animationDuration={650}
                  animationBegin={150}
                >
                  {visibleData.map((entry) => (
                    <Cell key={entry.status} fill={entry.color} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            {/* Center label — stacked di tengah donut, terpisah dari SVG chart */}
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <div className="text-[10px] font-medium uppercase tracking-wider text-slate-500">
                Total
              </div>
              <div className="-mt-0.5 text-2xl font-bold leading-none text-slate-900 tabular-nums">
                {total}
              </div>
            </div>
          </motion.div>

          {/* Legend + angka (direct labels — agar tidak color-alone) */}
          <ul className="space-y-1.5">
            {data.map((d, idx) => {
              const pct = total > 0 ? Math.round((d.value / total) * 100) : 0;
              return (
                <motion.li
                  key={d.status}
                  initial={{ x: 8, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  transition={{ duration: 0.2, delay: 0.2 + idx * 0.05 }}
                  className="flex items-center justify-between rounded-md px-2 py-1 hover:bg-slate-50"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <span
                      className="inline-block h-3 w-3 shrink-0 rounded-sm"
                      style={{ backgroundColor: d.color }}
                      aria-hidden
                    />
                    <span className="truncate text-xs text-slate-700">{d.label}</span>
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-sm font-semibold tabular-nums text-slate-900">
                      {d.value}
                    </span>
                    <span className="text-[10px] tabular-nums text-slate-500">
                      {pct}%
                    </span>
                  </div>
                </motion.li>
              );
            })}
          </ul>
        </div>
      )}
    </motion.div>
  );
}

/* ====================================================================== */
/* Card klik → filter Pendaftar per gelombang                              */
/* ====================================================================== */
function GelombangBreakdown({
  items,
  loading,
  canManageGelombang,
}: {
  items: Array<{ gelombangId: string; name: string; count: number }>;
  loading: boolean;
  canManageGelombang: boolean;
}) {
  return (
    <motion.div
      initial={{ y: 8, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.22, delay: 0.12 }}
      className="card"
    >
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
          <CalendarDays size={18} className="text-primary-600" />
          Pendaftar per Gelombang
        </h2>
        {canManageGelombang && (
          <Link
            to="/gelombang"
            className="inline-flex items-center gap-1 text-xs font-medium text-primary-600 hover:underline"
          >
            Kelola gelombang <ChevronRight size={12} />
          </Link>
        )}
      </div>

      {loading ? (
        <div className="flex h-32 items-center justify-center text-slate-400">Memuat…</div>
      ) : items.length === 0 ? (
        <div className="flex h-32 items-center justify-center text-slate-400">
          Belum ada gelombang dengan pendaftar
        </div>
      ) : (
        <ul className="space-y-2">
          {items.map((g, idx) => {
            const max = Math.max(...items.map((x) => x.count), 1);
            const widthPct = Math.max(8, Math.round((g.count / max) * 100));
            return (
              <motion.li
                key={g.gelombangId}
                initial={{ y: 6, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ duration: 0.22, delay: 0.15 + idx * 0.05 }}
              >
                <Link
                  to={`/pendaftar?gelombangId=${encodeURIComponent(g.gelombangId)}`}
                  className="group block rounded-lg border border-slate-200 bg-white p-3 transition hover:border-primary-300 hover:bg-primary-50/40 hover:shadow-sm"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-slate-900">
                        {g.name}
                      </div>
                      <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-100">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${widthPct}%` }}
                          transition={{
                            duration: 0.55,
                            ease: 'easeOut',
                            delay: 0.25 + idx * 0.05,
                          }}
                          className="h-full rounded-full bg-primary-500"
                        />
                      </div>
                    </div>
                    <div className="flex items-center gap-1 text-right">
                      <div className="tabular-nums text-lg font-bold text-slate-900">
                        {g.count}
                      </div>
                      <ChevronRight
                        size={14}
                        className="text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-primary-600"
                      />
                    </div>
                  </div>
                </Link>
              </motion.li>
            );
          })}
        </ul>
      )}
    </motion.div>
  );
}