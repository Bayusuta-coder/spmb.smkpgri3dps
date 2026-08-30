import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageCircle, Send, ShieldCheck, X, AlertCircle, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../lib/api';

/**
 * Modal input nomor WhatsApp + verifikasi OTP.
 *
 * Flow:
 *   1. User masukkan nomor (form 1) → klik "Kirim Kode OTP"
 *   2. Backend kirim OTP via WhatsApp provider (Meta WhatsApp Cloud API,
 *      template-based).
 *      Response HANYA berisi metadata (expiresInSeconds, resendCooldown).
 *      Kode OTP TIDAK PERNAH dikembalikan via HTTP — user terima di chat WA.
 *   3. User masukkan 6-digit OTP (form 2) → klik "Verifikasi"
 *   4. Backend verify → kalau ok, user.whatsappVerifiedAt di-set
 *   5. Modal close, parent re-fetch status
 *
 * Props:
 *   - open: boolean
 *   - onClose: () => void
 *   - initialNumber?: string — kalau sudah pernah input, pre-fill
 *   - onSuccess: () => void — dipanggil setelah verifikasi sukses
 *
 * Cooldown:
 *   - Backend enforce 60s cooldown antara request OTP berurutan.
 *   - Frontend hitung mundur + disable tombol kirim ulang.
 *
 * SECURITY: Komponen ini dengan sengaja TIDAK menampilkan OTP yang
 * diterima dari response API. Kalau response backend di-bypass (mis.
 * MITM), tetap tidak ada kode OTP yang di-render di UI. Kode hanya sampai
 * ke user via chat WhatsApp.
 */
export interface WhatsappVerificationModalProps {
  open: boolean;
  onClose: () => void;
  initialNumber?: string;
  onSuccess: () => void;
  /** Title override (default: "Verifikasi WhatsApp") */
  title?: string;
}

type Stage = 'phone' | 'otp' | 'success';

export default function WhatsappVerificationModal({
  open,
  onClose,
  initialNumber = '',
  onSuccess,
  title = 'Verifikasi WhatsApp',
}: WhatsappVerificationModalProps) {
  const [stage, setStage] = useState<Stage>('phone');
  const [phone, setPhone] = useState(initialNumber);
  const [otp, setOtp] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cooldownSec, setCooldownSec] = useState(0);
  const [resendHint, setResendHint] = useState<string | null>(null);
  const otpInputRef = useRef<HTMLInputElement>(null);

  // Reset state when modal opens
  useEffect(() => {
    if (open) {
      setStage('phone');
      setPhone(initialNumber);
      setOtp('');
      setError(null);
      setResendHint(null);
      setCooldownSec(0);
    }
  }, [open, initialNumber]);

  // Cooldown timer
  useEffect(() => {
    if (cooldownSec <= 0) return;
    const t = setTimeout(() => setCooldownSec((s) => Math.max(0, s - 1)), 1000);
    return () => clearTimeout(t);
  }, [cooldownSec]);

  // Auto-focus OTP input
  useEffect(() => {
    if (stage === 'otp') {
      setTimeout(() => otpInputRef.current?.focus(), 100);
    }
  }, [stage]);

  const requestOtp = async () => {
    setError(null);
    const trimmed = phone.trim();
    if (!trimmed) {
      setError('Nomor WhatsApp wajib diisi');
      return;
    }
    setBusy(true);
    try {
      const res = await api.post('/whatsapp/request-otp', { phoneNumber: trimmed });
      // Pesan generik — kita TIDAK boleh menampilkan OTP apapun dari
      // response. Backend mengirim OTP via chat WhatsApp; user akan
      // menerimanya langsung di aplikasi WhatsApp.
      toast.success('Kode OTP telah dikirim ke WhatsApp Anda. Silakan cek chat.');
      setStage('otp');
      if (res.data?.resendCooldownSeconds) {
        setCooldownSec(res.data.resendCooldownSeconds);
      }
      const expiresMin = Math.max(
        1,
        Math.floor((res.data?.expiresInSeconds ?? 300) / 60),
      );
      setResendHint(
        `Kode berlaku ${expiresMin} menit. Tidak menerima pesan? Cek koneksi & coba kirim ulang setelah cooldown.`,
      );
    } catch (e: any) {
      const rawMsg = e?.response?.data?.message ?? e?.message ?? 'Gagal mengirim OTP';
      const msg = typeof rawMsg === 'string' ? rawMsg : JSON.stringify(rawMsg);
      setError(msg);
      const retry = e?.response?.data?.retryAfterSeconds;
      if (typeof retry === 'number') setCooldownSec(retry);
      // Friendly short copy kalau server bilang provider belum dikonfigurasi (HTTP 500).
      const toastMsg =
        e?.response?.status === 500 && msg.toLowerCase().includes('belum dikonfigurasi')
          ? 'Layanan WhatsApp belum tersedia. Hubungi admin.'
          : msg;
      toast.error(toastMsg);
    } finally {
      setBusy(false);
    }
  };

  const verifyOtp = async () => {
    setError(null);
    const trimmed = otp.trim();
    if (!/^\d{6}$/.test(trimmed)) {
      setError('Kode OTP harus 6 digit angka');
      return;
    }
    setBusy(true);
    try {
      const res = await api.post('/whatsapp/verify-otp', { code: trimmed });
      if (res.data?.ok) {
        setStage('success');
        toast.success('Nomor WhatsApp berhasil diverifikasi!');
        setTimeout(() => {
          onSuccess();
          onClose();
        }, 1500);
      } else {
        const reason: string = res.data?.reason ?? 'invalid_code';
        const messages: Record<string, string> = {
          no_pending_otp: 'Tidak ada kode OTP yang menunggu. Minta kode baru.',
          expired: 'Kode OTP sudah kedaluwarsa. Minta kode baru.',
          max_attempts_exceeded: 'Terlalu banyak percobaan. Minta kode baru.',
          cancelled: 'Kode OTP ini sudah dibatalkan. Minta kode baru.',
          invalid_code: 'Kode OTP salah. Coba lagi.',
        };
        setError(messages[reason] ?? 'Verifikasi gagal');
        if (typeof res.data?.attemptsLeft === 'number') {
          setResendHint(`Sisa percobaan: ${res.data.attemptsLeft}`);
        }
      }
    } catch (e: any) {
      setError(e?.response?.data?.message ?? e?.message ?? 'Gagal verifikasi');
    } finally {
      setBusy(false);
    }
  };

  const handleResend = () => {
    if (cooldownSec > 0) return;
    setOtp('');
    setStage('phone');
    setResendHint(null);
    setError(null);
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ y: -16, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -16, opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="relative w-full max-w-md rounded-xl bg-white p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={onClose}
              className="absolute right-3 top-3 rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              aria-label="Tutup"
            >
              <X size={18} />
            </button>

            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                {stage === 'success' ? <ShieldCheck size={20} /> : <MessageCircle size={20} />}
              </div>
              <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
            </div>

            {stage === 'phone' && (
              <div className="space-y-3">
                <p className="text-sm text-slate-600">
                  Masukkan nomor WhatsApp Anda. Kami akan mengirim kode OTP 6 digit untuk membuktikan bahwa nomor tersebut milik Anda.
                </p>
                <div>
                  <label className="label">Nomor WhatsApp</label>
                  <input
                    type="tel"
                    className="input"
                    placeholder="081234567890 atau +62 812..."
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    autoFocus
                    disabled={busy}
                  />
                  <p className="mt-1 text-xs text-slate-500">
                    Format lokal (08xxx) atau internasional (+62xxx) diterima.
                  </p>
                </div>

                {error && (
                  <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                    <AlertCircle size={16} className="mt-0.5 shrink-0" />
                    <span>{error}</span>
                  </div>
                )}

                <div className="flex justify-end gap-2 pt-2">
                  <button onClick={onClose} className="btn-ghost" disabled={busy}>
                    Batal
                  </button>
                  <button onClick={requestOtp} className="btn-primary" disabled={busy || !phone.trim()}>
                    <Send size={14} /> {busy ? 'Mengirim…' : 'Kirim Kode OTP'}
                  </button>
                </div>
              </div>
            )}

            {stage === 'otp' && (
              <div className="space-y-3">
                <p className="text-sm text-slate-600">
                  Masukkan 6-digit kode OTP yang dikirim ke WhatsApp Anda:
                </p>
                <div>
                  <label className="label">Kode OTP</label>
                  <input
                    ref={otpInputRef}
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={6}
                    className="input text-center text-2xl font-mono tracking-[0.5em]"
                    placeholder="000000"
                    value={otp}
                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                    disabled={busy}
                  />
                </div>

                {resendHint && (
                  <p className="text-center text-xs text-slate-500">{resendHint}</p>
                )}

                {error && (
                  <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                    <AlertCircle size={16} className="mt-0.5 shrink-0" />
                    <span>{error}</span>
                  </div>
                )}

                <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
                  <button
                    onClick={handleResend}
                    className="btn-ghost text-sm"
                    disabled={cooldownSec > 0 || busy}
                  >
                    Kirim Ulang {cooldownSec > 0 && `(${cooldownSec}s)`}
                  </button>
                  <div className="flex gap-2">
                    <button onClick={onClose} className="btn-ghost" disabled={busy}>
                      Batal
                    </button>
                    <button onClick={verifyOtp} className="btn-primary" disabled={busy || otp.length !== 6}>
                      <CheckCircle2 size={14} /> {busy ? 'Memverifikasi…' : 'Verifikasi'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {stage === 'success' && (
              <div className="space-y-3 py-4 text-center">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                  <ShieldCheck size={28} />
                </div>
                <p className="text-sm font-medium text-emerald-700">
                  Berhasil diverifikasi!
                </p>
                <p className="text-xs text-slate-500">Anda akan menerima laporan harian SPMB via WhatsApp.</p>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}