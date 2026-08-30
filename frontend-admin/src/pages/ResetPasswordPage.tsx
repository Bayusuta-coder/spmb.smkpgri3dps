import { useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { motion } from 'framer-motion';
import { Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';
import logoSmk from '../assets/logosmk.png';

/**
 * Halaman "Reset Password" — user datang dari link di email.
 *
 * URL: `/reset-password/:token` (token raw dari email, akan di-hash SHA-256
 * oleh backend sebelum lookup di DB).
 *
 * Setelah berhasil, user di-redirect ke /login untuk login dengan password baru.
 */
export default function ResetPasswordPage() {
  const { user } = useAuth();
  const { token } = useParams<{ token: string }>();
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [done, setDone] = useState(false);
  const [tokenError, setTokenError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<{ newPassword: string; confirmPassword: string }>({
    mode: 'onBlur',
  });

  const newPassword = watch('newPassword');

  // Sudah login → /dashboard
  if (user) return <Navigate to="/" replace />;

  // URL tidak punya token → balik ke forgot-password
  if (!token) return <Navigate to="/forgot-password" replace />;

  const onSubmit = async (data: { newPassword: string; confirmPassword: string }) => {
    if (data.newPassword !== data.confirmPassword) {
      toast.error('Password baru dan konfirmasi tidak cocok');
      return;
    }
    setLoading(true);
    try {
      await api.post('/auth/reset-password', {
        token,
        newPassword: data.newPassword,
      });
      setDone(true);
      setTokenError(null);
      toast.success('Password berhasil direset. Silakan login.');
    } catch (e: any) {
      // Backend return BadRequest generik untuk 3 kondisi (token invalid /
      // expired / already-used) demi anti-enumeration. Di UI kita tampilkan
      // pesan yang user-friendly + CTA minta link baru.
      const msg =
        e?.response?.data?.message ||
        'Link reset password sudah kedaluwarsa atau tidak valid. Silakan minta link baru.';
      setTokenError(msg);
      toast.error(msg);
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
            <h1 className="mt-4 text-xl font-bold text-slate-900">Reset Password</h1>
            <p className="text-sm text-slate-500">SPMB SMK PGRI 3 Denpasar</p>
          </div>

          {done ? (
            <div className="space-y-4 text-center">
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">
                <p className="font-medium">Password berhasil direset!</p>
                <p className="mt-1 text-xs text-emerald-600">
                  Silakan login dengan password baru Anda.
                </p>
              </div>
              <Link to="/login" className="btn-primary inline-block">
                Login Sekarang
              </Link>
            </div>
          ) : (
            <>
              <p className="mb-4 text-sm text-slate-600">
                Masukkan password baru untuk akun Anda.
              </p>

              {tokenError && (
                <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-left text-sm text-red-700">
                  <p className="font-medium">⚠️ Link reset tidak bisa dipakai</p>
                  <p className="mt-1 text-xs text-red-600">{tokenError}</p>
                  <Link
                    to="/forgot-password"
                    className="mt-2 inline-block text-xs font-medium text-red-700 underline hover:text-red-800"
                  >
                    → Minta link reset baru
                  </Link>
                </div>
              )}
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                <div>
                  <label className="label">Password Baru (min 6) *</label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      className="input pr-10"
                      autoFocus
                      {...register('newPassword', {
                        required: 'Wajib diisi',
                        minLength: { value: 6, message: 'Min 6 karakter' },
                      })}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((s) => !s)}
                      className="absolute inset-y-0 right-0 flex items-center px-3 text-slate-500 hover:text-slate-700"
                      aria-label={showPassword ? 'Sembunyikan password' : 'Tampilkan password'}
                      tabIndex={-1}
                    >
                      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                  {errors.newPassword && (
                    <p className="mt-1 text-xs text-red-600">{errors.newPassword.message}</p>
                  )}
                </div>

                <div>
                  <label className="label">Konfirmasi Password Baru *</label>
                  <div className="relative">
                    <input
                      type={showConfirm ? 'text' : 'password'}
                      className="input pr-10"
                      {...register('confirmPassword', {
                        required: 'Wajib diisi',
                        validate: (v) => v === newPassword || 'Password tidak cocok',
                      })}
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirm((s) => !s)}
                      className="absolute inset-y-0 right-0 flex items-center px-3 text-slate-500 hover:text-slate-700"
                      aria-label={showConfirm ? 'Sembunyikan password' : 'Tampilkan password'}
                      tabIndex={-1}
                    >
                      {showConfirm ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                  {errors.confirmPassword && (
                    <p className="mt-1 text-xs text-red-600">{errors.confirmPassword.message}</p>
                  )}
                </div>

                <button type="submit" disabled={loading} className="btn-primary w-full">
                  {loading ? 'Menyimpan…' : 'Simpan Password Baru'}
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