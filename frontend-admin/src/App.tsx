import { Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { AnimatePresence } from 'framer-motion';
import AppLayout from './components/AppLayout';
import LoginPage from './pages/LoginPage';
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import ResetPasswordPage from './pages/ResetPasswordPage';
import DashboardPage from './pages/DashboardPage';
import PendaftarListPage from './pages/PendaftarListPage';
import PendaftarDetailPage from './pages/PendaftarDetailPage';
import GelombangPage from './pages/GelombangPage';
import JurusanPage from './pages/JurusanPage';
import UsersPage from './pages/UsersPage';
import RolesPage from './pages/RolesPage';
import AuditLogPage from './pages/AuditLogPage';
import BeritaPage from './pages/BeritaPage';
import PengumumanPage from './pages/PengumumanPage';
import RekapPendapatanPage from './pages/RekapPendapatanPage';
import ProfilePage from './pages/ProfilePage';
import PengaturanLaporanPage from './pages/PengaturanLaporanPage';
import PengaturanHargaPage from './pages/PengaturanHargaPage';
import TahunAjaranPage from './pages/TahunAjaranPage';
import SeragamItemMasterPage from './pages/SeragamItemMasterPage';
import SeragamChecklistPage from './pages/SeragamChecklistPage';

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
      {/* Public auth routes — di luar PrivateRoute agar tidak perlu JWT */}
      <Route path="/login" element={<LoginPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password/:token" element={<ResetPasswordPage />} />

      <Route element={<PrivateRoute />}>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/pendaftar" element={<PendaftarListPage />} />
        <Route path="/pendaftar/:id" element={<PendaftarDetailPage />} />
        <Route path="/gelombang" element={<GelombangPage />} />
        <Route path="/jurusan" element={<JurusanPage />} />
        <Route path="/users" element={<UsersPage />} />
        <Route path="/roles" element={<RolesPage />} />
        <Route path="/audit" element={<AuditLogPage />} />
        <Route path="/berita" element={<BeritaPage />} />
        <Route path="/pengumuman" element={<PengumumanPage />} />
        <Route path="/rekap-pendapatan" element={<RekapPendapatanPage />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/pengaturan-laporan" element={<PengaturanLaporanPage />} />
        <Route path="/pengaturan-harga" element={<PengaturanHargaPage />} />
        <Route path="/tahun-ajaran" element={<TahunAjaranPage />} />
        <Route path="/seragam-item-master" element={<SeragamItemMasterPage />} />
        <Route path="/pendaftar/:id/seragam" element={<SeragamChecklistPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
