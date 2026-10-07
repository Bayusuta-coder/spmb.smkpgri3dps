import { motion } from 'framer-motion';
import PengaturanHargaSection from '../components/PengaturanHargaSection';

/**
 * Halaman dedicated Pengaturan Harga (route /pengaturan-harga).
 *
 * Halaman ini adalah wrapper sederhana untuk PengaturanHargaSection — section
 * yang sama juga di-embed di /rekap-pendapatan (halaman Bendahara) supaya
 * Superadmin bisa update harga tanpa harus navigasi ke halaman lain.
 *
 * Bedanya dengan embed:
 *   - Di sini history defaultnya EXPANDED (compact=false)
 *   - Ada header + deskripsi panjang di atas
 *
 * Permission: settings.view untuk lihat, settings.manage untuk update.
 * settings.manage hanya di Superadmin role (lihat seed.ts Superadmin).
 */
export default function PengaturanHargaPage() {
  return (
    <div className="space-y-6">
      {/* Header halaman dedicated */}
      <motion.div
        initial={{ y: 6, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
      >
        <h1 className="text-2xl font-bold text-slate-900">Pengaturan Harga</h1>
        <p className="mt-1 text-sm text-slate-600">
          Atur nominal harga daftar ulang yang akan dipakai untuk transaksi
          pembayaran siswa berikutnya. Perubahan tidak mempengaruhi transaksi
          yang sudah tercatat (sudah ter-snapshot per-siswa — PDF historical
          tetap konsisten walau harga global diubah).
        </p>
      </motion.div>

      <PengaturanHargaSection compact={false} />
    </div>
  );
}
