import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';
import { toast } from 'sonner';
import { ShieldCheck, ShieldOff, MessageCircle, Edit3, Save, X } from 'lucide-react';
import WhatsappVerificationModal from '../components/WhatsappVerificationModal';

/**
 * Halaman Profile / Settings untuk user yang sedang login.
 *
 * Yang bisa di-edit user:
 *   - Nama (update via endpoint users/:id dengan permission user.manage
 *     di-check terpisah — atau endpoint profile/me? Untuk simplicity
 *     pakai endpoint yang ada via admin permission; kalau user non-admin,
 *     tampilkan form nama dalam mode display-only.)
 *   - Nomor WhatsApp sendiri (via /whatsapp/number)
 *   - Verifikasi WhatsApp (via modal)
 */
export default function ProfilePage() {
  const { user: authUser, refreshUser, hasAnyRole } = useAuth();
  const [status, setStatus] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [verifyModal, setVerifyModal] = useState(false);
  const [editingNumber, setEditingNumber] = useState(false);
  const [phoneDraft, setPhoneDraft] = useState('');
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [busy, setBusy] = useState(false);

  const loadStatus = async () => {
    setLoading(true);
    try {
      const res = await api.get('/whatsapp/status');
      setStatus(res.data);
    } catch (e: any) {
      toast.error(e?.message ?? 'Gagal memuat status');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStatus();
  }, []);

  useEffect(() => {
    if (authUser) {
      setNameDraft(authUser.name);
    }
  }, [authUser]);

  const isAdmin = hasAnyRole('Superadmin');

  const handleSaveNumber = async () => {
    const trimmed = phoneDraft.trim();
    if (!trimmed) {
      toast.error('Nomor tidak boleh kosong');
      return;
    }
    setBusy(true);
    try {
      const res = await api.put('/whatsapp/number', { whatsappNumber: trimmed });
      toast.success(res.data?.reset ? 'Nomor disimpan. Status verifikasi di-reset.' : 'Nomor disimpan.');
      setEditingNumber(false);
      await loadStatus();
      await refreshUser();
    } catch (e: any) {
      toast.error(e?.response?.data?.error ?? e?.message ?? 'Gagal menyimpan nomor');
    } finally {
      setBusy(false);
    }
  };

  const handleSaveName = async () => {
    const trimmed = nameDraft.trim();
    if (!trimmed) {
      toast.error('Nama tidak boleh kosong');
      return;
    }
    if (!isAdmin || !authUser?.id) {
      toast.error('Hanya admin yang bisa edit nama lewat halaman ini. Untuk edit sendiri, hubungi admin.');
      return;
    }
    setBusy(true);
    try {
      await api.patch(`/users/${authUser.id}`, { name: trimmed });
      toast.success('Nama disimpan');
      setEditingName(false);
      await refreshUser();
    } catch (e: any) {
      toast.error(e?.response?.data?.message ?? e?.message ?? 'Gagal menyimpan nama');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Profile &amp; Settings</h1>
        <p className="text-sm text-slate-500">
          Kelola informasi akun Anda, termasuk nomor WhatsApp untuk menerima laporan harian.
        </p>
      </div>

      {/* Akun */}
      <div className="card space-y-3">
        <h2 className="text-base font-semibold text-slate-900">Informasi Akun</h2>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div>
            <label className="label">Email</label>
            <input className="input" value={authUser?.email ?? ''} disabled />
            <p className="mt-1 text-xs text-slate-500">Email tidak dapat diubah.</p>
          </div>
          <div>
            <label className="label flex items-center justify-between">
              <span>Nama</span>
              {!editingName && (
                <button
                  onClick={() => {
                    setNameDraft(authUser?.name ?? '');
                    setEditingName(true);
                  }}
                  className="text-xs font-normal text-primary-700 hover:underline"
                  disabled={!isAdmin}
                >
                  <Edit3 size={11} className="inline" /> Edit
                </button>
              )}
            </label>
            {editingName ? (
              <div className="flex gap-1">
                <input
                  className="input"
                  value={nameDraft}
                  onChange={(e) => setNameDraft(e.target.value)}
                  disabled={busy}
                />
                <button onClick={() => setEditingName(false)} className="btn-ghost shrink-0" disabled={busy}>
                  <X size={14} />
                </button>
                <button onClick={handleSaveName} className="btn-primary shrink-0" disabled={busy}>
                  <Save size={14} />
                </button>
              </div>
            ) : (
              <input className="input" value={authUser?.name ?? ''} disabled />
            )}
            {!isAdmin && (
              <p className="mt-1 text-xs text-slate-500">
                Hanya admin/Superadmin yang dapat mengubah nama lewat UI ini.
              </p>
            )}
          </div>
        </div>
        <div>
          <label className="label">Role</label>
          <div className="flex flex-wrap gap-1">
            {authUser?.roles?.map((r) => (
              <span key={r} className="badge bg-primary-50 text-primary-700">
                {r}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* WhatsApp */}
      <div className="card space-y-3">
        <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900">
          <MessageCircle size={18} className="text-emerald-600" />
          Verifikasi WhatsApp
        </h2>

        {loading ? (
          <div className="text-sm text-slate-500">Memuat…</div>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div>
                <label className="label flex items-center justify-between">
                  <span>Nomor WhatsApp</span>
                  {!editingNumber && (
                    <button
                      onClick={() => {
                        setPhoneDraft(status?.whatsappNumber ?? '');
                        setEditingNumber(true);
                      }}
                      className="text-xs font-normal text-primary-700 hover:underline"
                    >
                      <Edit3 size={11} className="inline" /> Edit
                    </button>
                  )}
                </label>
                {editingNumber ? (
                  <div className="flex gap-1">
                    <input
                      className="input"
                      placeholder="081234567890"
                      value={phoneDraft}
                      onChange={(e) => setPhoneDraft(e.target.value)}
                      disabled={busy}
                    />
                    <button
                      onClick={() => setEditingNumber(false)}
                      className="btn-ghost shrink-0"
                      disabled={busy}
                    >
                      <X size={14} />
                    </button>
                    <button onClick={handleSaveNumber} className="btn-primary shrink-0" disabled={busy}>
                      <Save size={14} />
                    </button>
                  </div>
                ) : (
                  <input
                    className="input font-mono"
                    value={status?.whatsappNumber ?? '(belum diatur)'}
                    disabled
                  />
                )}
                <p className="mt-1 text-xs text-slate-500">
                  Format: <code>08xxx</code>, <code>62xxx</code>, atau <code>+62xxx</code>. Akan
                  dinormalisasi ke <code>62xxxxxxxxxx</code>.
                </p>
              </div>

              <div>
                <label className="label">Status Verifikasi</label>
                {status?.isVerified ? (
                  <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700">
                    <ShieldCheck size={16} />
                    <span>Sudah terverifikasi</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-700">
                    <ShieldOff size={16} />
                    <span>Belum terverifikasi</span>
                  </div>
                )}
                {status?.whatsappVerifiedAt && (
                  <p className="mt-1 text-xs text-slate-500">
                    Diverifikasi: {new Date(status.whatsappVerifiedAt).toLocaleString('id-ID')}
                  </p>
                )}
                {status?.provider && (
                  <p className="mt-1 text-xs text-slate-500">
                    Provider: <code>{status.provider}</code>
                    {status.isReady ? ' ✓' : ' (dev mode — tidak terkirim ke WhatsApp)'}
                  </p>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
              <p className="text-xs text-slate-500">
                {status?.isVerified
                  ? 'Laporan harian akan dikirim ke nomor ini (jika channel WA aktif).'
                  : 'Verifikasi nomor untuk mulai menerima laporan/notifikasi via WhatsApp.'}
              </p>
              <div className="flex gap-2">
                {status?.whatsappNumber && !status?.isVerified && (
                  <button onClick={() => setVerifyModal(true)} className="btn-primary">
                    <ShieldCheck size={14} /> Verifikasi Sekarang
                  </button>
                )}
                {status?.isVerified && (
                  <button
                    onClick={() => setVerifyModal(true)}
                    className="btn-ghost"
                    title="Kirim OTP ulang untuk re-verifikasi"
                  >
                    <MessageCircle size={14} /> Kirim Ulang OTP
                  </button>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Catatan keamanan */}
      <div className="card bg-slate-50/60 text-xs text-slate-600">
        <p>
          <b>Keamanan:</b> Kode OTP berlaku 5 menit dan hanya dapat digunakan satu kali. Maksimal 5 percobaan
          verifikasi per kode. Kode lama akan otomatis dibatalkan ketika Anda meminta kode baru atau
          mengubah nomor WhatsApp.
        </p>
      </div>

      <WhatsappVerificationModal
        open={verifyModal}
        onClose={() => setVerifyModal(false)}
        initialNumber={status?.whatsappNumber ?? ''}
        onSuccess={async () => {
          await loadStatus();
          await refreshUser();
        }}
      />
    </div>
  );
}