import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';
import logoSmk from '../assets/logosmk.png';

// Mode development HANYA muncul di non-production build.
// Vite expose `import.meta.env.MODE` → 'development' | 'production' | 'test'.
// Saat di-build dengan `vite build` (untuk deploy production), MODE='production'
// dan blok dev-mode hilang total dari bundle.
const IS_DEV = import.meta.env.MODE !== 'production';

/**
 * Halaman "Lupa password" — publik (di luar PrivateRoute).
 *
 * Submit email → backend kirim link reset via email (token SHA-256 hashed di DB).
 * Response SELALU generic "Jika email terdaftar, link reset telah dikirim"
 * (anti-enumeration — lihat backend `requestPasswordReset`).
 */
export default function ForgotPasswordPage() {
  const { user } = useAuth();
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [devResetLink, setDevResetLink] = useState<string | null>(null);
  const navigate = useNavigate();
  const { register, handleSubmit, formState: { errors } } = useForm<{ email: string }>({
    mode: 'onBlur',
  });

  // Kalau user sudah login, lempar ke dashboard
  if (user) return <Navigate to="/" replace />;

  const onSubmit = async (data: { email: string }) => {
    setLoading(true);
    try {
      const res = await api.post('/auth/forgot-password', { email: data.email });
      // DEV-MODE ONLY: backend sertakan `devResetLink` di response kalau
      // NODE_ENV !== 'production' (lihat backend auth.service.ts). Field
      // ini hanya ada saat SMTP belum diset supaya tester bisa lanjut
      // tanpa harus kirim email beneran.
      if (res.data?.devResetLink) {
        setDevResetLink(res.data.devResetLink);
      }
      setSubmitted(true);
      toast.success('Jika email terdaftar, link reset telah dikirim.');
    } catch (e: any) {
      // Backend selalu return 200 untuk anti-enumeration, tapi kalau server
      // down / network error, tunjukkan pesan generik supaya tidak bocor.
      toast.error(
        e?.response?.data?.message ||
          'Gagal memproses permintaan. Coba lagi nanti.',
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-primary-500 via-primary-600 to-primary-700 p-4">
      <motion.div
        initial={{ y: 20, opacity: 0, scale: 0.98 }}
        animate={{ y: 0, opacity: 1, scale: 1 }}
        transition={{ duration: 0.25 }}
        className="w-full max-w-md"
      >
        <div className="rounded-2xl bg-white p-8 shadow-2xl">
          <div className="mb-6 text-center">
            <img
              src={logoSmk}
              alt="Logo SMK PGRI 3 Denpasar"
              className="mx-auto h-16 w-16 rounded-xl bg-white object-contain p-1 ring-1 ring-slate-200"
            />
            <h1 className="mt-4 text-xl font-bold text-slate-900">Lupa Password</h1>
            <p className="text-sm text-slate-500">SPMB SMK PGRI 3 Denpasar</p>
          </div>

          {submitted ? (
            <div className="space-y-4 text-center">
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">
                <p className="font-medium">Link reset password sudah dikirim.</p>
                <p className="mt-1 text-xs text-emerald-600">
                  Silakan cek inbox email Anda. Link berlaku selama 30 menit dan hanya bisa dipakai sekali.
                </p>
              </div>

              {IS_DEV && devResetLink && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-left text-xs text-amber-800">
                  <p className="mb-1 font-semibold">⚙️ Mode Development</p>
                  <p className="mb-2 text-amber-700">
                    SMTP belum dikonfigurasi (email hanya log ke console). Klik tombol di bawah untuk simulasi klik link reset:
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      // Extract path dari full URL, navigate ke path di router
                      try {
                        const u = new URL(devResetLink);
                        navigate(u.pathname + u.search);
                      } catch {
                        navigate(devResetLink);
                      }
                    }}
                    className="btn-primary w-full"
                  >
                    Buka Halaman Reset Password
                  </button>
                </div>
              )}

              <Link to="/login" className="text-sm text-primary-600 hover:underline">
                ← Kembali ke halaman login
              </Link>
            </div>
          ) : (
            <>
              <p className="mb-4 text-sm text-slate-600">
                Masukkan email akun Anda. Kami akan mengirim link untuk mengatur password baru.
              </p>
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                <div>
                  <label className="label">Email</label>
                  <input
                    type="email"
                    className="input"
                    autoFocus
                    {...register('email', {
                      required: 'Wajib diisi',
                      pattern: { value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, message: 'Format email tidak valid' },
                    })}
                  />
                  {errors.email && (
                    <p className="mt-1 text-xs text-red-600">{errors.email.message}</p>
                  )}
                </div>
                <button type="submit" disabled={loading} className="btn-primary w-full">
                  {loading ? 'Mengirim…' : 'Kirim Link Reset'}
                </button>
              </form>

              <p className="mt-6 text-center text-sm">
                <Link to="/login" className="text-primary-600 hover:underline">
                  ← Kembali ke halaman login
                </Link>
              </p>
            </>
          )}

          <p className="mt-6 text-center text-xs text-slate-500">
            © {new Date().getFullYear()} SMK PGRI 3 Denpasar
          </p>
        </div>
      </motion.div>
    </div>
  );
}