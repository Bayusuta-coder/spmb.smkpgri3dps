import { useState } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { useAuth } from '../context/AuthContext';
import logoSmk from '../assets/logosmk.png';

export default function LoginPage() {
  const { user, login } = useAuth();
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { register, handleSubmit, formState: { errors } } = useForm<{
    email: string;
    password: string;
  }>({ mode: 'onBlur' });

  if (user) return <Navigate to="/" replace />;

  const onSubmit = async (data: { email: string; password: string }) => {
    setLoading(true);
    try {
      await login(data.email, data.password);
      toast.success('Login berhasil');
      navigate('/');
    } catch (e: any) {
      toast.error(e.message);
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
            <h1 className="mt-4 text-xl font-bold text-slate-900">Admin SPMB</h1>
            <p className="text-sm text-slate-500">SMK PGRI 3 Denpasar</p>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <label className="label">Email</label>
              <input
                type="email"
                className="input"
                autoFocus
                {...register('email', { required: 'Wajib diisi' })}
              />
              {errors.email && <p className="mt-1 text-xs text-red-600">{errors.email.message}</p>}
            </div>
            <div>
              <label className="label">Password</label>
              <input
                type="password"
                className="input"
                {...register('password', { required: 'Wajib diisi', minLength: { value: 6, message: 'Min 6 karakter' } })}
              />
              {errors.password && (
                <p className="mt-1 text-xs text-red-600">{errors.password.message}</p>
              )}
            </div>
            <button type="submit" disabled={loading} className="btn-primary w-full">
              {loading ? 'Memproses…' : 'Login'}
            </button>
          </form>

          <p className="mt-6 text-center text-xs text-slate-500">
            © {new Date().getFullYear()} SMK PGRI 3 Denpasar
          </p>
        </div>
      </motion.div>
    </div>
  );
}
