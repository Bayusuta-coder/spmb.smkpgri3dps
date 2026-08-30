import { useEffect, useRef, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import {
  ArrowLeft,
  XCircle,
  Printer,
  Download,
  RefreshCw,
  AlertTriangle,
  Check,
  Mail,
  Calendar,
  Shirt,
  Wallet,
  Receipt,
  Clock,
  Edit3,
  Trash2,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import {
  STATUS_COLORS,
  UKURAN_BAJU_OPTIONS,
  METODE_PEMBAYARAN_LABELS,
  formatRupiah,
} from '../lib/constants';

type StatusPendaftar =
  | 'MENUNGGU_PERSETUJUAN'
  | 'MENUNGGU_PEMBAYARAN'
  | 'MENUNGGU_UKURAN_BAJU'
  | 'DITOLAK'
  | 'SISWA_AKTIF';

/**
 * Bentuk default form untuk Edit modal. Dipakai untuk prefill dari `data`.
 * Optional fields pakai `null` (bukan undefined) supaya controlled input
 * tetap menampilkan nilai awalnya.
 */
interface EditFormState {
  namaLengkap: string;
  jenisKelamin: 'L' | 'P';
  tempatLahir: string;
  tanggalLahir: string;
  nisn: string;
  sekolahAsal: string;
  alamat: string;
  noTelp: string;
  email: string;
  jumlahNilaiUn: string;
  prestasi: string;
  namaIbu: string;
  noTelpOrtu: string;
  agama: string;
}

const AGAMA_OPTIONS = [
  'ISLAM',
  'KRISTEN',
  'KATOLIK',
  'HINDU',
  'BUDDHA',
  'KHONGHUCU',
];

export default function PendaftarDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { hasPermission } = useAuth();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  // Modal reject state
  const [rejectModal, setRejectModal] = useState<{ open: boolean; note: string }>({
    open: false,
    note: '',
  });

  // Batch C: Modal Pembayaran (Bendahara)
  const [bayarModal, setBayarModal] = useState<{ open: boolean; metode: 'CASH' | 'TRANSFER' }>({
    open: false,
    metode: 'CASH',
  });

  // Batch C: Modal Ukuran Baju (TU)
  const [ukuranModal, setUkuranModal] = useState<{ open: boolean; ukuranBaju: string }>({
    open: false,
    ukuranBaju: 'M',
  });

  // CRUD: Modal Edit (Admin/Superadmin, gate: spmb.update)
  const [editModal, setEditModal] = useState<{ open: boolean; form: Partial<EditFormState> }>({
    open: false,
    form: {},
  });

  // CRUD: Modal Delete (Admin/Superadmin, gate: spmb.delete)
  const [deleteModal, setDeleteModal] = useState<{ open: boolean; confirmText: string }>({
    open: false,
    confirmText: '',
  });

  // Batch C: Print struk view (window.print() based — no PDF)
  const strukRef = useRef<HTMLDivElement>(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.get(`/pendaftar/${id}`);
      setData(res.data);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // -- Actions --------------------------------------------------------------

  const submitReject = async () => {
    if (!rejectModal.note.trim()) {
      toast.error('Alasan penolakan wajib diisi');
      return;
    }
    setBusy(true);
    try {
      await api.post(`/pendaftar/${id}/verify`, {
        decision: 'REJECT',
        note: rejectModal.note.trim(),
      });
      toast.success('Pendaftar berhasil ditolak');
      setRejectModal({ open: false, note: '' });
      await load();
    } catch (e: any) {
      toast.error(e?.response?.data?.message || e.message);
    } finally {
      setBusy(false);
    }
  };

  const submitBayar = async () => {
    setBusy(true);
    try {
      const res = await api.post<{ pdfGenerated: boolean; statusLabel: string }>(
        `/pendaftar/${id}/pembayaran`,
        { metode: bayarModal.metode },
      );
      toast.success(
        res.data?.pdfGenerated
          ? `Pembayaran tercatat — status: ${res.data.statusLabel}. PDF + email terkirim.`
          : `Pembayaran tercatat — status: ${res.data.statusLabel}.`,
      );
      setBayarModal({ open: false, metode: 'CASH' });
      await load();
    } catch (e: any) {
      toast.error(e?.response?.data?.message || e.message);
    } finally {
      setBusy(false);
    }
  };

  const submitUkuran = async () => {
    if (!ukuranModal.ukuranBaju) {
      toast.error('Ukuran baju wajib dipilih');
      return;
    }
    setBusy(true);
    try {
      const res = await api.post<{ pdfGenerated: boolean; statusLabel: string }>(
        `/pendaftar/${id}/ukuran-baju`,
        { ukuranBaju: ukuranModal.ukuranBaju },
      );
      toast.success(
        res.data?.pdfGenerated
          ? `Ukuran ${ukuranModal.ukuranBaju} tercatat — status: ${res.data.statusLabel}. PDF + email terkirim.`
          : `Ukuran ${ukuranModal.ukuranBaju} tercatat — status: ${res.data.statusLabel}.`,
      );
      setUkuranModal({ open: false, ukuranBaju: 'M' });
      await load();
    } catch (e: any) {
      toast.error(e?.response?.data?.message || e.message);
    } finally {
      setBusy(false);
    }
  };

  // ===========================================================================
  // CRUD ADMIN (spmb.update / spmb.delete)
  // ===========================================================================

  /**
   * Buka modal Edit dengan form pre-filled dari `data`.
   * Hanya field yang dikirim ke backend yang akan di-update (partial).
   */
  const openEdit = () => {
    if (!data) return;
    setEditModal({
      open: true,
      form: {
        namaLengkap: data.namaLengkap || '',
        jenisKelamin: data.jenisKelamin || 'L',
        tempatLahir: data.tempatLahir || '',
        tanggalLahir: data.tanggalLahir
          ? new Date(data.tanggalLahir).toISOString().slice(0, 10)
          : '',
        nisn: data.nisn || '',
        sekolahAsal: data.sekolahAsal || '',
        alamat: data.alamat || '',
        noTelp: data.noTelp || '',
        email: data.email || '',
        jumlahNilaiUn: data.jumlahNilaiUn != null ? String(data.jumlahNilaiUn) : '',
        prestasi: data.prestasi || '',
        namaIbu: data.namaIbu || '',
        noTelpOrtu: data.noTelpOrtu || '',
        agama: data.agama || 'ISLAM',
      },
    });
  };

  const submitEdit = async () => {
    const f = editModal.form;
    if (!f.namaLengkap?.trim()) return toast.error('Nama lengkap wajib diisi');
    if (!f.tempatLahir?.trim()) return toast.error('Tempat lahir wajib diisi');
    if (!f.tanggalLahir) return toast.error('Tanggal lahir wajib diisi');
    if (!f.sekolahAsal?.trim()) return toast.error('Sekolah asal wajib diisi');
    if (!f.alamat?.trim()) return toast.error('Alamat wajib diisi');
    if (!f.noTelp?.trim()) return toast.error('No. telp wajib diisi');
    if (!f.namaIbu?.trim()) return toast.error('Nama ibu wajib diisi');
    if (!f.noTelpOrtu?.trim()) return toast.error('No. telp ortu wajib diisi');
    if (f.nisn && f.nisn.length !== 10) {
      return toast.error('NISN harus 10 digit angka (atau kosongkan)');
    }
    if (f.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email)) {
      return toast.error('Format email tidak valid');
    }

    // Build payload — hanya field yang dikirim (partial update)
    const payload: any = {
      namaLengkap: f.namaLengkap.trim(),
      jenisKelamin: f.jenisKelamin,
      tempatLahir: f.tempatLahir.trim(),
      tanggalLahir: new Date(f.tanggalLahir).toISOString(),
      sekolahAsal: f.sekolahAsal.trim(),
      alamat: f.alamat.trim(),
      noTelp: f.noTelp.trim(),
      namaIbu: f.namaIbu.trim(),
      noTelpOrtu: f.noTelpOrtu.trim(),
      agama: f.agama,
    };
    if (f.nisn?.trim()) payload.nisn = f.nisn.trim();
    if (f.email?.trim()) payload.email = f.email.trim();
    if (f.prestasi?.trim()) payload.prestasi = f.prestasi.trim();
    if (f.jumlahNilaiUn && !Number.isNaN(Number(f.jumlahNilaiUn))) {
      payload.jumlahNilaiUn = Number(f.jumlahNilaiUn);
    }

    setBusy(true);
    try {
      await api.patch(`/pendaftar/${id}`, payload);
      toast.success('Data pendaftar diperbarui');
      setEditModal({ open: false, form: {} });
      await load();
    } catch (e: any) {
      toast.error(e?.response?.data?.message || e.message);
    } finally {
      setBusy(false);
    }
  };

  /**
   * Submit delete — butuh user ketik "HAPUS" untuk konfirmasi (2-step).
   * Setelah sukses: redirect ke list + toast.
   */
  const submitDelete = async () => {
    if (deleteModal.confirmText !== 'HAPUS') {
      return toast.error('Ketik "HAPUS" (huruf besar) untuk konfirmasi');
    }
    setBusy(true);
    try {
      await api.delete(`/pendaftar/${id}`);
      toast.success(
        `Pendaftar ${data.registrationNumber} berhasil dihapus`,
      );
      setDeleteModal({ open: false, confirmText: '' });
      navigate('/pendaftar');
    } catch (e: any) {
      toast.error(e?.response?.data?.message || e.message);
    } finally {
      setBusy(false);
    }
  };

  /**
   * Buka PDF di tab baru — viewer bawaan browser sudah punya tombol print.
   * Pakai axios `api.get(..., { responseType: 'blob' })` supaya token JWT
   * otomatis di-inject via interceptor (lihat src/lib/api.ts).
   */
  const cetakPdf = async () => {
    if (!data?.pdfPath) {
      toast.error('PDF belum tersedia. Generate ulang terlebih dahulu.');
      return;
    }
    try {
      const res = await api.get<Blob>(`/pendaftar/${data.id}/download-pdf`, {
        responseType: 'blob',
      });
      const blobUrl = URL.createObjectURL(res.data);
      window.open(blobUrl, '_blank', 'noopener,noreferrer');
      setTimeout(() => URL.revokeObjectURL(blobUrl), 30_000);
    } catch (e: any) {
      toast.error(`Gagal membuka PDF: ${e.message}`);
    }
  };

  /**
   * Download file PDF langsung ke komputer petugas.
   * Pakai query `?as=attachment` agar backend kirim Content-Disposition: attachment.
   */
  const downloadPdf = async () => {
    if (!data?.pdfPath) {
      toast.error('PDF belum tersedia. Generate ulang terlebih dahulu.');
      return;
    }
    try {
      const res = await api.get<Blob>(`/pendaftar/${data.id}/download-pdf?as=attachment`, {
        responseType: 'blob',
      });
      const blobUrl = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = `Bukti-Pendaftaran-Ulang-${data.registrationNumber}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(blobUrl), 30_000);
    } catch (e: any) {
      toast.error(`Gagal mendownload PDF: ${e.message}`);
    }
  };

  const regeneratePdf = async () => {
    if (!window.confirm(`Generate ulang PDF bukti pendaftaran ulang untuk ${data.namaLengkap}?`)) return;
    setBusy(true);
    try {
      await api.post(`/pendaftar/${data.id}/regenerate-pdf`);
      toast.success('PDF berhasil di-generate ulang');
      await load();
    } catch (e: any) {
      toast.error(`Gagal regenerate: ${e?.response?.data?.message || e.message}`);
    } finally {
      setBusy(false);
    }
  };

  /**
   * Cetak struk pembayaran — gunakan `window.print()` ke elemen tersembunyi.
   * TIDAK generate PDF terpisah; struk adalah view-only + print-only.
   * Browser default print dialog akan muncul dengan layout yang sudah di-style
   * untuk kertas thermal / A5.
   */
  const cetakStruk = () => {
    // CSS @media print di struk-print.css (TODO: add ke index.css) akan
    // sembunyikan seluruh UI kecuali elemen #struk-print-area.
    document.body.classList.add('printing-struk');
    window.print();
    // Cleanup setelah dialog ditutup (setelah print() return)
    setTimeout(() => document.body.classList.remove('printing-struk'), 500);
  };

  if (loading) return <div className="text-slate-500">Memuat…</div>;
  if (!data) return <div className="text-slate-500">Data tidak ditemukan</div>;

  const apiOrigin = api.defaults.baseURL?.replace(/\/api$/, '') || '';
  const canBayar = hasPermission('spmb.bayar');
  const canUkuranBaju = hasPermission('spmb.ukuran_baju');
  const canReject = hasPermission('spmb.reject');
  const canUpdate = hasPermission('spmb.update');
  const canDelete = hasPermission('spmb.delete');

  // Status helpers
  const isLunas = data.statusPembayaran === 'LUNAS';
  const isUkuranSet = !!data.ukuranBaju;
  const isAktif = data.status === 'SISWA_AKTIF';
  const isDitolak = data.status === 'DITOLAK';

  return (
    <div>
      <Link
        to="/pendaftar"
        className="inline-flex items-center gap-1 text-sm text-slate-600 hover:text-primary-500"
      >
        <ArrowLeft size={14} /> Kembali ke Daftar
      </Link>
      <div className="mt-2 mb-4 flex flex-col items-start justify-between gap-2 md:flex-row md:items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{data.namaLengkap}</h1>
          <p className="font-mono text-sm text-primary-600">{data.registrationNumber}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className={`badge px-3 py-1 text-sm ${STATUS_COLORS[data.status as StatusPendaftar]}`}>
            {data.statusLabel}
          </span>
          {/* CRUD admin: tombol Edit + Delete di header (gate: spmb.update / spmb.delete) */}
          {canUpdate && (
            <button
              onClick={openEdit}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
            >
              <Edit3 size={14} /> Edit Data
            </button>
          )}
          {canDelete && (
            <button
              onClick={() => setDeleteModal({ open: true, confirmText: '' })}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-md border border-red-300 bg-white px-3 py-1.5 text-xs font-medium text-red-700 transition hover:bg-red-50 disabled:opacity-50"
            >
              <Trash2 size={14} /> Hapus
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="card md:col-span-2">
          <h2 className="text-lg font-semibold text-slate-900">Data Pendaftar</h2>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Item label="Jenis Kelamin" value={data.jenisKelamin === 'L' ? 'Laki-laki' : 'Perempuan'} />
            <Item label="NISN" value={data.nisn} />
            <Item
              label="Tempat, Tgl Lahir"
              value={`${data.tempatLahir}, ${new Date(data.tanggalLahir).toLocaleDateString('id-ID')}`}
            />
            <Item label="Sekolah Asal" value={data.sekolahAsal} />
            <Item label="Alamat" value={data.alamat} full />
            <Item label="No. Telp" value={data.noTelp} />
            <Item label="No. Telp Ortu" value={data.noTelpOrtu} />
            <Item label="Nama Ibu" value={data.namaIbu} />
            <Item label="Nilai UN" value={data.jumlahNilaiUn} />
            <Item label="Prestasi" value={data.prestasi || '-'} />
            <Item label="Jurusan" value={`${data.jurusan.code} - ${data.jurusan.name}`} />
            <Item label="Gelombang" value={data.gelombang.name} />
            {data.email && <Item label="Email" value={data.email} full />}

            {/* Batch C: Data daftar ulang SELALU tampil (tidak di-gate ke
                status SISWA_AKTIF lagi), supaya Bendahara/TU bisa lihat
                progress parsial masing-masing. Kalau field belum diisi,
                tampil "-". */}
            <div className="sm:col-span-2 mt-2 border-t border-slate-200 pt-3">
              <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <Receipt size={12} />
                Data Daftar Ulang
              </div>
            </div>
            <Item
              label="Ukuran Baju"
              value={data.ukuranBaju ? `Ukuran ${data.ukuranBaju}` : '-'}
            />
            <Item
              label="Total Pembayaran"
              value={
                data.nominalPembayaran != null
                  ? formatRupiah(data.nominalPembayaran)
                  : '-'
              }
            />
          </div>

          {/* Tampilkan alasan penolakan kalau DITOLAK */}
          {isDitolak && data.rejectionNote && (
            <div className="mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
              <div className="flex items-start gap-2">
                <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                <div>
                  <div className="font-semibold">Alasan Penolakan:</div>
                  <div className="mt-0.5">{data.rejectionNote}</div>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="space-y-4">
          {/* Batch C: 2 action card terpisah (Bayar + Ukuran Baju).
              Visibility per permission. Disable kalau DITOLAK (terminal). */}
          {canBayar && !isDitolak && (
            <div className={`card border-2 ${isLunas ? 'border-emerald-200 bg-emerald-50/40' : 'border-amber-200 bg-amber-50/40'}`}>
              <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
                <Wallet size={18} className={isLunas ? 'text-emerald-600' : 'text-amber-600'} />
                Pembayaran (Bendahara)
              </h2>
              {isLunas ? (
                <div className="mt-3 space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Status</span>
                    <span className="inline-flex items-center gap-1 rounded-md bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800">
                      <Check size={11} /> LUNAS
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Nominal</span>
                    <span className="font-medium">{formatRupiah(data.nominalPembayaran)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Metode</span>
                    <span className="font-medium">
                      {data.metodePembayaran ? METODE_PEMBAYARAN_LABELS[data.metodePembayaran] : '-'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Tanggal</span>
                    <span className="font-medium">
                      {data.tanggalBayar ? new Date(data.tanggalBayar).toLocaleString('id-ID') : '-'}
                    </span>
                  </div>
                  {data.dibayarOleh && (
                    <div className="flex justify-between">
                      <span className="text-slate-500">Dicatat oleh</span>
                      <span className="font-medium">{data.dibayarOleh.name}</span>
                    </div>
                  )}
                </div>
              ) : (
                <p className="mt-1 text-sm text-slate-600">
                  Pembayaran belum tercatat. Klik tombol di bawah untuk catat metode (CASH / TRANSFER).
                  Nominal otomatis dari setting <code className="font-mono text-[11px]">harga_daftar_ulang</code>.
                </p>
              )}
              <button
                onClick={() => setBayarModal({ open: true, metode: (data.metodePembayaran as 'CASH' | 'TRANSFER') || 'CASH' })}
                disabled={busy}
                className={`mt-4 inline-flex w-full items-center justify-center gap-1.5 rounded-md px-4 py-2.5 text-sm font-medium text-white transition disabled:opacity-50 ${
                  isLunas
                    ? 'bg-slate-600 hover:bg-slate-700'
                    : 'bg-emerald-600 hover:bg-emerald-700'
                }`}
              >
                <Wallet size={16} />
                {isLunas ? 'Re-edit Pembayaran' : 'Catat Pembayaran'}
              </button>
              {isLunas && (
                <button
                  onClick={cetakStruk}
                  disabled={busy}
                  className="mt-2 inline-flex w-full items-center justify-center gap-1.5 rounded-md border border-emerald-600 bg-white px-4 py-2 text-sm font-medium text-emerald-700 transition hover:bg-emerald-50 disabled:opacity-50"
                >
                  <Printer size={16} />
                  Cetak Struk
                </button>
              )}
            </div>
          )}

          {canUkuranBaju && !isDitolak && (
            <div className={`card border-2 ${isUkuranSet ? 'border-indigo-200 bg-indigo-50/40' : 'border-amber-200 bg-amber-50/40'}`}>
              <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
                <Shirt size={18} className={isUkuranSet ? 'text-indigo-600' : 'text-amber-600'} />
                Ukuran Baju (TU)
              </h2>
              {isUkuranSet ? (
                <div className="mt-3 space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Status</span>
                    <span className="inline-flex items-center gap-1 rounded-md bg-indigo-100 px-2 py-0.5 text-xs font-semibold text-indigo-800">
                      <Check size={11} /> SUDAH
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Ukuran</span>
                    <span className="font-mono text-base font-bold">{data.ukuranBaju}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Tanggal</span>
                    <span className="font-medium">
                      {data.tanggalUkuranBaju ? new Date(data.tanggalUkuranBaju).toLocaleString('id-ID') : '-'}
                    </span>
                  </div>
                  {data.ukuranBajuDisetOleh && (
                    <div className="flex justify-between">
                      <span className="text-slate-500">Dicatat oleh</span>
                      <span className="font-medium">{data.ukuranBajuDisetOleh.name}</span>
                    </div>
                  )}
                </div>
              ) : (
                <p className="mt-1 text-sm text-slate-600">
                  Ukuran baju belum diinput. Klik tombol di bawah untuk pilih XS..XXXL.
                </p>
              )}
              <button
                onClick={() => setUkuranModal({ open: true, ukuranBaju: data.ukuranBaju || 'M' })}
                disabled={busy}
                className={`mt-4 inline-flex w-full items-center justify-center gap-1.5 rounded-md px-4 py-2.5 text-sm font-medium text-white transition disabled:opacity-50 ${
                  isUkuranSet
                    ? 'bg-slate-600 hover:bg-slate-700'
                    : 'bg-indigo-600 hover:bg-indigo-700'
                }`}
              >
                <Shirt size={16} />
                {isUkuranSet ? 'Re-edit Ukuran Baju' : 'Input Ukuran Baju'}
              </button>
            </div>
          )}

          {/* Tombol Reject — untuk status yang masih bisa di-reject (pre-AKTIF) */}
          {canReject && !isDitolak && !isAktif && (
            <div className="card border-2 border-slate-200 bg-slate-50/40">
              <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
                <XCircle size={18} className="text-slate-500" />
                Tolak Pendaftar
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                Menolak bersifat <b>terminal</b> — pendaftar tidak akan muncul di aksi
                Bayar/Ukuran lagi. Gunakan hanya untuk pendaftar yang memang tidak memenuhi
                syarat.
              </p>
              <button
                onClick={() => setRejectModal({ open: true, note: '' })}
                disabled={busy}
                className="mt-4 inline-flex w-full items-center justify-center gap-1.5 rounded-md bg-red-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-red-700 disabled:opacity-50"
              >
                <XCircle size={16} />
                Tolak Pendaftar
              </button>
            </div>
          )}

          {/* Cetak Bukti PDF — hanya untuk SISWA_AKTIF.
              PDF + email auto-terkirim saat status berubah ke SISWA_AKTIF. */}
          {isAktif && (
            <div className="card border-2 border-emerald-200 bg-emerald-50/40">
              <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
                <Printer size={18} className="text-emerald-600" />
                Cetak Bukti Pendaftaran Ulang
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                {data.pdfPath
                  ? 'PDF siap dicetak. Klik Buka untuk lihat di tab baru, atau Download untuk simpan file.'
                  : 'PDF belum tersedia — kemungkinan generate awal gagal atau file hilang dari storage.'}
              </p>

              {data.pdfPath ? (
                <div className="mt-4 grid grid-cols-2 gap-2">
                  <button onClick={cetakPdf} className="btn-primary">
                    <Printer size={16} />
                    Buka / Cetak
                  </button>
                  <button onClick={downloadPdf} className="btn-ghost border border-slate-300">
                    <Download size={16} />
                    Download
                  </button>
                </div>
              ) : (
                <button
                  onClick={regeneratePdf}
                  disabled={busy}
                  className="mt-4 inline-flex w-full items-center justify-center gap-1.5 rounded-md bg-amber-500 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-amber-600 disabled:opacity-50"
                >
                  <RefreshCw size={16} className={busy ? 'animate-spin' : ''} />
                  {busy ? 'Generating…' : 'Generate Ulang PDF'}
                </button>
              )}
            </div>
          )}

          {/* Riwayat */}
          <div className="card">
            <h2 className="text-lg font-semibold text-slate-900">Riwayat</h2>
            <ul className="mt-3 space-y-2 text-sm">
              <li className="flex items-center justify-between">
                <span className="text-slate-500">Tgl Daftar</span>
                <span className="font-medium">
                  <Calendar size={12} className="mr-1 inline" />
                  {new Date(data.createdAt).toLocaleString('id-ID')}
                </span>
              </li>
              {data.verifiedBy && (
                <li className="flex items-center justify-between">
                  <span className="text-slate-500">Ditolak oleh</span>
                  <span className="font-medium">{data.verifiedBy.name}</span>
                </li>
              )}
              {data.dibayarOleh && (
                <li className="flex items-center justify-between">
                  <span className="text-slate-500">Pembayaran</span>
                  <span className="font-medium">
                    {data.dibayarOleh.name} ·{' '}
                    {data.tanggalBayar ? new Date(data.tanggalBayar).toLocaleString('id-ID') : '-'}
                  </span>
                </li>
              )}
              {data.ukuranBajuDisetOleh && (
                <li className="flex items-center justify-between">
                  <span className="text-slate-500">Ukuran baju</span>
                  <span className="font-medium">
                    {data.ukuranBajuDisetOleh.name} ·{' '}
                    {data.tanggalUkuranBaju ? new Date(data.tanggalUkuranBaju).toLocaleString('id-ID') : '-'}
                  </span>
                </li>
              )}
              {data.approvedBy && (
                <li className="flex items-center justify-between">
                  <span className="text-slate-500">Siswa Aktif</span>
                  <span className="font-medium">{data.approvedBy.name}</span>
                </li>
              )}
              {data.approvedAt && (
                <li className="flex items-center justify-between">
                  <span className="text-slate-500">Tgl Siswa Aktif</span>
                  <span className="font-medium">{new Date(data.approvedAt).toLocaleString('id-ID')}</span>
                </li>
              )}
              {data.email && (
                <li className="flex items-center justify-between gap-2">
                  <span className="text-slate-500">Email notif</span>
                  <span className="flex items-center gap-1 truncate font-mono text-xs">
                    <Mail size={12} />
                    {data.email}
                  </span>
                </li>
              )}
              {data.daftarUlangConfirmedAt && (
                <li className="flex items-center justify-between">
                  <span className="text-slate-500">Daftar Ulang</span>
                  <span className="font-medium text-emerald-700">
                    <Check size={12} className="mr-1 inline" />
                    {new Date(data.daftarUlangConfirmedAt).toLocaleString('id-ID')}
                  </span>
                </li>
              )}
            </ul>
          </div>

          {/* Info alur desentralisasi */}
          <div className="card bg-slate-50/60 text-xs text-slate-500">
            <p>
              <b>Alur desentralisasi:</b> siswa submit form → Bendahara catat
              pembayaran (💰) → TU input ukuran baju (👕) → Siswa Aktif.
              Bisa siapa duluan. Email + PDF Bukti Pendaftaran Ulang otomatis
              saat status menjadi Siswa Aktif.
            </p>
            <p className="mt-1 font-mono text-[10px] text-slate-400">
              PDF URL: {apiOrigin}/pendaftar/check/{data.registrationNumber}/download-pdf?s=***
            </p>
          </div>
        </div>
      </div>

      {/* Batch C: Modal Pembayaran (Bendahara) */}
      <AnimatePresence>
        {bayarModal.open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
            onClick={() => !busy && setBayarModal({ open: false, metode: 'CASH' })}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="card w-full max-w-md p-6"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-1 flex items-center gap-2 text-emerald-600">
                <Wallet size={20} />
                <h3 className="text-lg font-semibold">Catat Pembayaran</h3>
              </div>
              <p className="mb-4 text-sm text-slate-600">
                Anda akan mencatat pembayaran dari:{' '}
                <b>{data.namaLengkap}</b> ({data.registrationNumber}).
                Status akan otomatis berubah. Kalau ukuran baju juga sudah
                diinput TU, pendaftar langsung menjadi <b>Siswa Aktif</b> dan email + PDF akan dikirim.
              </p>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="text-xs uppercase tracking-wider text-slate-500">
                  Nominal pembayaran (snapshot)
                </div>
                <div className="mt-1 text-2xl font-bold text-slate-900">
                  {data.nominalPembayaran != null
                    ? formatRupiah(data.nominalPembayaran)
                    : '— (akan di-snapshot saat submit)'}
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  Nominal otomatis dari setting{' '}
                  <code className="font-mono text-[11px]">harga_daftar_ulang</code>.
                </p>
              </div>
              <label className="label mt-4">Metode Pembayaran *</label>
              <div className="grid grid-cols-2 gap-2">
                {(['CASH', 'TRANSFER'] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    disabled={busy}
                    onClick={() => setBayarModal((mod) => ({ ...mod, metode: m }))}
                    className={`rounded-md border px-3 py-2.5 text-sm font-medium transition ${
                      bayarModal.metode === m
                        ? 'border-emerald-500 bg-emerald-50 text-emerald-700 ring-1 ring-emerald-500'
                        : 'border-slate-300 bg-white text-slate-700 hover:border-slate-400'
                    }`}
                  >
                    {METODE_PEMBAYARAN_LABELS[m]}
                  </button>
                ))}
              </div>
              <div className="mt-5 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setBayarModal({ open: false, metode: 'CASH' })}
                  disabled={busy}
                  className="btn-ghost"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={submitBayar}
                  disabled={busy}
                  className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-700 disabled:opacity-50"
                >
                  <Check size={14} />
                  {busy ? 'Memproses…' : 'Catat Pembayaran'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Batch C: Modal Ukuran Baju (TU) */}
      <AnimatePresence>
        {ukuranModal.open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
            onClick={() => !busy && setUkuranModal({ open: false, ukuranBaju: 'M' })}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="card w-full max-w-md p-6"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-1 flex items-center gap-2 text-indigo-600">
                <Shirt size={20} />
                <h3 className="text-lg font-semibold">Input Ukuran Baju</h3>
              </div>
              <p className="mb-4 text-sm text-slate-600">
                Anda akan mencatat ukuran baju untuk:{' '}
                <b>{data.namaLengkap}</b> ({data.registrationNumber}).
                Status akan otomatis berubah. Kalau pembayaran juga sudah LUNAS, pendaftar langsung menjadi <b>Siswa Aktif</b> dan email + PDF akan dikirim.
              </p>
              <label className="label flex items-center gap-1.5">
                <Shirt size={14} /> Ukuran Baju *
              </label>
              <div className="grid grid-cols-7 gap-1.5">
                {UKURAN_BAJU_OPTIONS.map((size) => (
                  <button
                    key={size}
                    type="button"
                    disabled={busy}
                    onClick={() => setUkuranModal((m) => ({ ...m, ukuranBaju: size }))}
                    className={`rounded-md border px-2 py-2 text-sm font-medium transition ${
                      ukuranModal.ukuranBaju === size
                        ? 'border-indigo-500 bg-indigo-50 text-indigo-700 ring-1 ring-indigo-500'
                        : 'border-slate-300 bg-white text-slate-700 hover:border-slate-400'
                    }`}
                  >
                    {size}
                  </button>
                ))}
              </div>
              <div className="mt-5 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setUkuranModal({ open: false, ukuranBaju: 'M' })}
                  disabled={busy}
                  className="btn-ghost"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={submitUkuran}
                  disabled={busy || !ukuranModal.ukuranBaju}
                  className="inline-flex items-center gap-1.5 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-700 disabled:opacity-50"
                >
                  <Check size={14} />
                  {busy ? 'Memproses…' : 'Simpan Ukuran Baju'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* CRUD: Modal Edit Data Pendaftar */}
      <AnimatePresence>
        {editModal.open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4"
            onClick={() => !busy && setEditModal({ open: false, form: {} })}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="card my-8 w-full max-w-2xl p-6"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-1 flex items-center gap-2 text-primary-600">
                <Edit3 size={20} />
                <h3 className="text-lg font-semibold">Edit Data Pendaftar</h3>
              </div>
              <p className="mb-4 text-sm text-slate-600">
                Edit data untuk: <b>{data.namaLengkap}</b> ({data.registrationNumber}).
                Hanya field yang Anda ubah yang akan tersimpan (partial update).
                {data.status === 'SISWA_AKTIF' && (
                  <span className="mt-1 block rounded bg-amber-50 px-2 py-1 text-xs text-amber-800">
                    ⚠️ Status Siswa Aktif — PDF bukti pendaftaran ulang akan di-regenerate otomatis jika field yang tampil di PDF diubah.
                  </span>
                )}
              </p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="label">Nama Lengkap *</label>
                  <input
                    className="input"
                    value={editModal.form.namaLengkap || ''}
                    onChange={(e) =>
                      setEditModal((m) => ({ ...m, form: { ...m.form, namaLengkap: e.target.value } }))
                    }
                    disabled={busy}
                  />
                </div>
                <div>
                  <label className="label">Jenis Kelamin *</label>
                  <select
                    className="input"
                    value={editModal.form.jenisKelamin || 'L'}
                    onChange={(e) =>
                      setEditModal((m) => ({
                        ...m,
                        form: { ...m.form, jenisKelamin: e.target.value as 'L' | 'P' },
                      }))
                    }
                    disabled={busy}
                  >
                    <option value="L">Laki-laki</option>
                    <option value="P">Perempuan</option>
                  </select>
                </div>
                <div>
                  <label className="label">Tempat Lahir *</label>
                  <input
                    className="input"
                    value={editModal.form.tempatLahir || ''}
                    onChange={(e) =>
                      setEditModal((m) => ({ ...m, form: { ...m.form, tempatLahir: e.target.value } }))
                    }
                    disabled={busy}
                  />
                </div>
                <div>
                  <label className="label">Tanggal Lahir *</label>
                  <input
                    type="date"
                    className="input"
                    value={editModal.form.tanggalLahir || ''}
                    onChange={(e) =>
                      setEditModal((m) => ({ ...m, form: { ...m.form, tanggalLahir: e.target.value } }))
                    }
                    disabled={busy}
                  />
                </div>
                <div>
                  <label className="label">NISN (10 digit, opsional)</label>
                  <input
                    className="input font-mono"
                    maxLength={10}
                    value={editModal.form.nisn || ''}
                    onChange={(e) =>
                      setEditModal((m) => ({ ...m, form: { ...m.form, nisn: e.target.value.replace(/\D/g, '') } }))
                    }
                    placeholder="1234567890"
                    disabled={busy}
                  />
                </div>
                <div>
                  <label className="label">Agama *</label>
                  <select
                    className="input"
                    value={editModal.form.agama || 'ISLAM'}
                    onChange={(e) =>
                      setEditModal((m) => ({ ...m, form: { ...m.form, agama: e.target.value } }))
                    }
                    disabled={busy}
                  >
                    {AGAMA_OPTIONS.map((a) => (
                      <option key={a} value={a}>
                        {a}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <label className="label">Sekolah Asal *</label>
                  <input
                    className="input"
                    value={editModal.form.sekolahAsal || ''}
                    onChange={(e) =>
                      setEditModal((m) => ({ ...m, form: { ...m.form, sekolahAsal: e.target.value } }))
                    }
                    disabled={busy}
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="label">Alamat *</label>
                  <textarea
                    className="input min-h-[60px]"
                    value={editModal.form.alamat || ''}
                    onChange={(e) =>
                      setEditModal((m) => ({ ...m, form: { ...m.form, alamat: e.target.value } }))
                    }
                    disabled={busy}
                  />
                </div>
                <div>
                  <label className="label">No. Telp (Siswa) *</label>
                  <input
                    className="input"
                    value={editModal.form.noTelp || ''}
                    onChange={(e) =>
                      setEditModal((m) => ({ ...m, form: { ...m.form, noTelp: e.target.value } }))
                    }
                    disabled={busy}
                  />
                </div>
                <div>
                  <label className="label">Email (opsional)</label>
                  <input
                    type="email"
                    className="input"
                    value={editModal.form.email || ''}
                    onChange={(e) =>
                      setEditModal((m) => ({ ...m, form: { ...m.form, email: e.target.value } }))
                    }
                    disabled={busy}
                  />
                </div>
                <div>
                  <label className="label">Nama Ibu *</label>
                  <input
                    className="input"
                    value={editModal.form.namaIbu || ''}
                    onChange={(e) =>
                      setEditModal((m) => ({ ...m, form: { ...m.form, namaIbu: e.target.value } }))
                    }
                    disabled={busy}
                  />
                </div>
                <div>
                  <label className="label">No. Telp Ortu *</label>
                  <input
                    className="input"
                    value={editModal.form.noTelpOrtu || ''}
                    onChange={(e) =>
                      setEditModal((m) => ({ ...m, form: { ...m.form, noTelpOrtu: e.target.value } }))
                    }
                    disabled={busy}
                  />
                </div>
                <div>
                  <label className="label">Nilai UN (0-100, opsional)</label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step="0.01"
                    className="input"
                    value={editModal.form.jumlahNilaiUn || ''}
                    onChange={(e) =>
                      setEditModal((m) => ({ ...m, form: { ...m.form, jumlahNilaiUn: e.target.value } }))
                    }
                    disabled={busy}
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="label">Prestasi (opsional)</label>
                  <textarea
                    className="input min-h-[50px]"
                    value={editModal.form.prestasi || ''}
                    onChange={(e) =>
                      setEditModal((m) => ({ ...m, form: { ...m.form, prestasi: e.target.value } }))
                    }
                    disabled={busy}
                  />
                </div>
              </div>
              <div className="mt-5 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEditModal({ open: false, form: {} })}
                  disabled={busy}
                  className="btn-ghost"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={submitEdit}
                  disabled={busy}
                  className="inline-flex items-center gap-1.5 rounded-md bg-primary-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-primary-700 disabled:opacity-50"
                >
                  <Check size={14} />
                  {busy ? 'Menyimpan…' : 'Simpan Perubahan'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* CRUD: Modal Hapus Pendaftar (2-step confirmation) */}
      <AnimatePresence>
        {deleteModal.open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
            onClick={() => !busy && setDeleteModal({ open: false, confirmText: '' })}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="card w-full max-w-md p-6"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-1 flex items-center gap-2 text-red-600">
                <Trash2 size={20} />
                <h3 className="text-lg font-semibold">Hapus Data Pendaftar</h3>
              </div>
              <p className="mb-3 text-sm text-slate-600">
                Anda akan <b className="text-red-700">menghapus permanen</b> data berikut:
              </p>
              <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm">
                <div className="font-medium text-slate-900">{data.namaLengkap}</div>
                <div className="font-mono text-xs text-slate-500">{data.registrationNumber}</div>
                <div className="mt-1 text-xs text-slate-600">
                  Jurusan: {data.jurusan.code} - {data.jurusan.name}
                  <br />
                  Status: {data.statusLabel}
                </div>
              </div>
              <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                <p>
                  <b>⚠️ Perhatian:</b> Aksi ini akan menghapus baris pendaftar dari database
                  secara permanen (hard delete), termasuk file PDF bukti pendaftaran ulang
                  di storage. <b>Tidak bisa di-restore.</b>
                </p>
                <p className="mt-1">
                  Audit log tetap mencatat snapshot lengkap untuk forensik.
                </p>
              </div>
              <label className="label">
                Ketik <b className="font-mono">HAPUS</b> (huruf besar) untuk konfirmasi:
              </label>
              <input
                className="input font-mono"
                value={deleteModal.confirmText}
                onChange={(e) =>
                  setDeleteModal((m) => ({ ...m, confirmText: e.target.value }))
                }
                placeholder="HAPUS"
                autoFocus
                disabled={busy}
              />
              <div className="mt-5 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setDeleteModal({ open: false, confirmText: '' })}
                  disabled={busy}
                  className="btn-ghost"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={submitDelete}
                  disabled={busy || deleteModal.confirmText !== 'HAPUS'}
                  className="inline-flex items-center gap-1.5 rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-700 disabled:opacity-50"
                >
                  <Trash2 size={14} />
                  {busy ? 'Menghapus…' : 'Hapus Permanen'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Modal alasan penolakan */}
      <AnimatePresence>
        {rejectModal.open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
            onClick={() => !busy && setRejectModal({ open: false, note: '' })}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="card w-full max-w-md p-6"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-1 flex items-center gap-2 text-red-600">
                <XCircle size={20} />
                <h3 className="text-lg font-semibold">Tolak Pendaftar</h3>
              </div>
              <p className="mb-4 text-sm text-slate-600">
                Anda akan menolak: <b>{data.namaLengkap}</b> ({data.registrationNumber}). Alasan penolakan{' '}
                <b>wajib diisi</b> dan akan dikirimkan ke pendaftar via email.
              </p>
              <label className="label">Alasan Penolakan *</label>
              <textarea
                className="input min-h-[100px]"
                value={rejectModal.note}
                onChange={(e) => setRejectModal((m) => ({ ...m, note: e.target.value }))}
                placeholder="Contoh: Nilai UN di bawah passing grade, kuota jurusan sudah terpenuhi, dll."
                autoFocus
                disabled={busy}
              />
              <div className="mt-5 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setRejectModal({ open: false, note: '' })}
                  disabled={busy}
                  className="btn-ghost"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={submitReject}
                  disabled={busy || !rejectModal.note.trim()}
                  className="inline-flex items-center gap-1.5 rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-700 disabled:opacity-50"
                >
                  <XCircle size={14} />
                  {busy ? 'Memproses…' : 'Tolak Pendaftar'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ============================================================ */}
      {/* BATCH C: Struk Pembayaran — print-only view via window.print().
          Hidden di screen (CSS @media print di bawah), visible saat print. */}
      {/* ============================================================ */}
      <div ref={strukRef} className="struk-print-area hidden print:block">
        <div className="struk-paper mx-auto p-6 font-mono text-xs">
          <div className="text-center">
            <h1 className="text-base font-bold">SMK PGRI 3 DENPASAR</h1>
            <p className="text-[10px]">Bukti Pembayaran Daftar Ulang</p>
          </div>
          <hr className="my-2 border-dashed border-slate-400" />
          <div className="space-y-0.5">
            <div className="flex justify-between">
              <span>No. Pendaftaran</span>
              <span className="font-bold">{data.registrationNumber}</span>
            </div>
            <div className="flex justify-between">
              <span>Nama</span>
              <span className="text-right">{data.namaLengkap}</span>
            </div>
            <div className="flex justify-between">
              <span>Jurusan</span>
              <span>{data.jurusan.code}</span>
            </div>
            <div className="flex justify-between">
              <span>Gelombang</span>
              <span className="text-right text-[10px]">{data.gelombang.name}</span>
            </div>
            <div className="flex justify-between">
              <span>Tanggal Bayar</span>
              <span>
                {data.tanggalBayar
                  ? new Date(data.tanggalBayar).toLocaleString('id-ID')
                  : '-'}
              </span>
            </div>
            <div className="flex justify-between">
              <span>Metode</span>
              <span>
                {data.metodePembayaran ? METODE_PEMBAYARAN_LABELS[data.metodePembayaran] : '-'}
              </span>
            </div>
            {data.dibayarOleh && (
              <div className="flex justify-between">
                <span>Dicatat oleh</span>
                <span className="text-right text-[10px]">{data.dibayarOleh.name}</span>
              </div>
            )}
          </div>
          <hr className="my-2 border-dashed border-slate-400" />
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold">TOTAL</span>
            <span className="text-base font-bold">
              {data.nominalPembayaran != null ? formatRupiah(data.nominalPembayaran) : '-'}
            </span>
          </div>
          <hr className="my-2 border-dashed border-slate-400" />
          <p className="text-center text-[9px] text-slate-600">
            Simpan struk ini sebagai bukti pembayaran yang sah.
            <br />
            Struk di-generate otomatis oleh sistem — tidak perlu tanda tangan.
          </p>
        </div>
      </div>

      {/* CSS print-only: sembunyikan seluruh UI saat print kecuali struk */}
      <style>{`
        @media print {
          body.printing-struk > *:not(.struk-print-area) { display: none !important; }
          body.printing-struk { background: white !important; }
          .struk-print-area { display: block !important; }
          .struk-paper { max-width: 80mm; }
          @page { size: auto; margin: 5mm; }
        }
      `}</style>
    </div>
  );
}

function Item({ label, value, full }: { label: string; value: any; full?: boolean }) {
  return (
    <div className={full ? 'sm:col-span-2' : ''}>
      <div className="text-xs text-slate-500">{label}</div>
      <div className="text-sm font-medium text-slate-900">{value || '-'}</div>
    </div>
  );
}