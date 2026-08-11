import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft, Check, X } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { PAYMENT_STATUS_COLORS, PAYMENT_STATUS_LABELS, STATUS_COLORS } from '../lib/constants';

export default function PendaftarDetailPage() {
  const { id } = useParams();
  const { hasPermission } = useAuth();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [decision, setDecision] = useState<'APPROVE' | 'REJECT'>('APPROVE');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

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

  useEffect(() => { load(); }, [id]);

  const onVerify = async () => {
    setSubmitting(true);
    try {
      await api.post(`/pendaftar/${id}/verify`, { decision, note: note || undefined });
      toast.success('Verifikasi tersimpan');
      setNote('');
      load();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  const onApproveFinal = async () => {
    if (!confirm('Approve final & setujui siswa sebagai Siswa Aktif?')) return;
    setSubmitting(true);
    try {
      await api.post(`/pendaftar/${id}/approve-final`);
      toast.success('Siswa di-approve. Email konfirmasi dikirim.');
      load();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div className="text-slate-500">Memuat…</div>;
  if (!data) return <div className="text-slate-500">Data tidak ditemukan</div>;

  return (
    <div>
      <Link to="/pendaftar" className="inline-flex items-center gap-1 text-sm text-slate-600 hover:text-primary-500">
        <ArrowLeft size={14} /> Kembali
      </Link>
      <div className="mt-2 mb-4 flex flex-col items-start justify-between gap-2 md:flex-row md:items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{data.namaLengkap}</h1>
          <p className="font-mono text-sm text-primary-600">{data.registrationNumber}</p>
        </div>
        <span className={`badge px-3 py-1 text-sm ${STATUS_COLORS[data.status]}`}>
          {data.statusLabel}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="card md:col-span-2">
          <h2 className="text-lg font-semibold text-slate-900">Data Pendaftar</h2>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Item label="Jenis Kelamin" value={data.jenisKelamin === 'L' ? 'Laki-laki' : 'Perempuan'} />
            <Item label="NISN" value={data.nisn} />
            <Item label="Tempat, Tgl Lahir" value={`${data.tempatLahir}, ${new Date(data.tanggalLahir).toLocaleDateString('id-ID')}`} />
            <Item label="Sekolah Asal" value={data.sekolahAsal} />
            <Item label="Alamat" value={data.alamat} full />
            <Item label="No. Telp" value={data.noTelp} />
            <Item label="No. Telp Ortu" value={data.noTelpOrtu} />
            <Item label="Nama Ibu" value={data.namaIbu} />
            <Item label="Nilai UN" value={data.jumlahNilaiUn} />
            <Item label="Prestasi" value={data.prestasi || '-'} />
            <Item label="Jurusan" value={`${data.jurusan.code} - ${data.jurusan.name}`} />
            <Item label="Gelombang" value={data.gelombang.name} />
          </div>
        </div>

        <div className="space-y-4">
          {/* Verifikasi Berkas (admin) */}
          {hasPermission('spmb.verify_berkas') && data.status === 'MENUNGGU_VERIFIKASI' && (
            <div className="card">
              <h2 className="text-lg font-semibold text-slate-900">Verifikasi Berkas</h2>
              <div className="mt-3 space-y-2">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    checked={decision === 'APPROVE'}
                    onChange={() => setDecision('APPROVE')}
                  />
                  <span className="text-emerald-700">Approve (Lolos)</span>
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    checked={decision === 'REJECT'}
                    onChange={() => setDecision('REJECT')}
                  />
                  <span className="text-red-700">Reject (Tolak)</span>
                </label>
                <textarea
                  className="input"
                  rows={3}
                  placeholder={decision === 'REJECT' ? 'Alasan penolakan…' : 'Catatan (opsional)'}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
                <button
                  onClick={onVerify}
                  disabled={submitting}
                  className={decision === 'APPROVE' ? 'btn-primary w-full' : 'btn-danger w-full'}
                >
                  {decision === 'APPROVE' ? <Check size={16} /> : <X size={16} />}
                  {submitting ? 'Menyimpan…' : decision === 'APPROVE' ? 'Approve' : 'Tolak'}
                </button>
              </div>
            </div>
          )}

          {/* Approve Final */}
          {hasPermission('spmb.approve') && data.status === 'MENUNGGU_VERIFIKASI_PEMBAYARAN' && (
            <div className="card">
              <h2 className="text-lg font-semibold text-slate-900">Approve Final</h2>
              <p className="mt-1 text-sm text-slate-500">
                Approve siswa sebagai Siswa Aktif dan kirim email konfirmasi.
              </p>
              <button
                onClick={onApproveFinal}
                disabled={submitting}
                className="btn-primary mt-3 w-full"
              >
                <Check size={16} />
                {submitting ? 'Memproses…' : 'Approve Final & Kirim Email'}
              </button>
            </div>
          )}

          {/* Status info */}
          <div className="card">
            <h2 className="text-lg font-semibold text-slate-900">Riwayat</h2>
            <ul className="mt-3 space-y-2 text-sm">
              <li className="flex items-center justify-between">
                <span className="text-slate-500">Tgl Daftar</span>
                <span className="font-medium">{new Date(data.createdAt).toLocaleString('id-ID')}</span>
              </li>
              {data.verifiedBy && (
                <li className="flex items-center justify-between">
                  <span className="text-slate-500">Diverifikasi</span>
                  <span className="font-medium">{data.verifiedBy.name}</span>
                </li>
              )}
              {data.approvedBy && (
                <li className="flex items-center justify-between">
                  <span className="text-slate-500">Disetujui</span>
                  <span className="font-medium">{data.approvedBy.name}</span>
                </li>
              )}
            </ul>
          </div>

          {/* Pembayaran */}
          {data.pembayaran && (
            <div className="card">
              <h2 className="text-lg font-semibold text-slate-900">Pembayaran</h2>
              <div className="mt-2 text-sm">
                <span className={`badge ${PAYMENT_STATUS_COLORS[data.pembayaran.status]}`}>
                  {PAYMENT_STATUS_LABELS[data.pembayaran.status]}
                </span>
                <ul className="mt-3 space-y-1">
                  <li>Nominal: <b>Rp {Number(data.pembayaran.nominal).toLocaleString('id-ID')}</b></li>
                  <li>Tgl Transfer: <b>{new Date(data.pembayaran.tanggalTransfer).toLocaleDateString('id-ID')}</b></li>
                  <li>Nama Pengirim: <b>{data.pembayaran.namaPengirim}</b></li>
                  {data.pembayaran.catatan && <li>Catatan: {data.pembayaran.catatan}</li>}
                </ul>
              </div>
            </div>
          )}
        </div>
      </div>
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
