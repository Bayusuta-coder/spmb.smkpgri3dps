import { Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { AnimatePresence } from 'framer-motion';
import AppLayout from './components/AppLayout';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import PendaftarListPage from './pages/PendaftarListPage';
import PendaftarDetailPage from './pages/PendaftarDetailPage';
import PembayaranListPage from './pages/PembayaranListPage';
import GelombangPage from './pages/GelombangPage';
import JurusanPage from './pages/JurusanPage';
import UsersPage from './pages/UsersPage';
import RolesPage from './pages/RolesPage';
import StatistikPage from './pages/StatistikPage';
import AuditLogPage from './pages/AuditLogPage';
import BeritaPage from './pages/BeritaPage';
import PengumumanPage from './pages/PengumumanPage';

function PrivateRoute() {
  const { user, loading } = useAuth();
  if (loading) {
    return <div className="flex h-screen items-center justify-center text-slate-500">Memuat…</div>;
  }
  if (!user) return <Navigate to="/login" replace />;
  return (
    <AppLayout>
      <AnimatePresence mode="wait">
        <Outlet />
      </AnimatePresence>
    </AppLayout>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<PrivateRoute />}>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/pendaftar" element={<PendaftarListPage />} />
        <Route path="/pendaftar/:id" element={<PendaftarDetailPage />} />
        <Route path="/pembayaran" element={<PembayaranListPage />} />
        <Route path="/gelombang" element={<GelombangPage />} />
        <Route path="/jurusan" element={<JurusanPage />} />
        <Route path="/users" element={<UsersPage />} />
        <Route path="/roles" element={<RolesPage />} />
        <Route path="/statistik" element={<StatistikPage />} />
        <Route path="/audit" element={<AuditLogPage />} />
        <Route path="/berita" element={<BeritaPage />} />
        <Route path="/pengumuman" element={<PengumumanPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
