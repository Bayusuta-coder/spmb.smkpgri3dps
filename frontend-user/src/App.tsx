import { Routes, Route } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import LandingPage from './pages/LandingPage';
import RegisterPage from './pages/RegisterPage';
import CheckStatusPage from './pages/CheckStatusPage';
import VerifikasiPage from './pages/VerifikasiPage';
import BeritaDetailPage from './pages/BeritaDetailPage';
import Navbar from './components/Navbar';
import Footer from './components/Footer';
import PengumumanModal from './components/PengumumanModal';

export default function App() {
  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="flex-1">
        <AnimatePresence mode="wait">
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/daftar" element={<RegisterPage />} />
            <Route path="/cek-status" element={<CheckStatusPage />} />
            <Route path="/verifikasi/:registrationNumber" element={<VerifikasiPage />} />
            <Route path="/berita/:slug" element={<BeritaDetailPage />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AnimatePresence>
      </main>
      <Footer />
      {/* Popup pengumuman global — sekali per sesi */}
      <PengumumanModal />
    </div>
  );
}

function NotFound() {
  return (
    <div className="container-page py-20 text-center">
      <h1 className="text-3xl font-bold">404 — Halaman tidak ditemukan</h1>
    </div>
  );
}
