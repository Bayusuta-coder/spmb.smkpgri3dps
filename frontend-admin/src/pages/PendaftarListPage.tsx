import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  Search,
  ChevronLeft,
  ChevronRight,
  X,
  XCircle,
  Printer,
  Download,
  RefreshCw,
  AlertTriangle,
  FileSpreadsheet,
  Shirt,
  Wallet,
  Check,
  UserPlus,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import {
  STATUS_COLORS,
  STATUS_LABELS,
  UKURAN_BAJU_OPTIONS,
  METODE_PEMBAYARAN_LABELS,
  KELENGKAPAN_COLORS,
  formatRupiah,
} from '../lib/constants';
import { toast } from 'sonner';
import ExportDaftarUlangModal from '../components/ExportDaftarUlangModal';

/**
 * Status pendaftar sekarang AUTO-COMPUTED di backend dari kombinasi
 * statusPembayaran + ukuranBaju (lihat `computeStatus()` di PendaftarService).
 * Tabel keputusan (HARUS sinkron dengan backend):
 *   BELUM  + null  → MENUNGGU_PERSETUJUAN
 *   BELUM  + "M"   → MENUNGGU_PEMBAYARAN
 *   LUNAS  + null  → MENUNGGU_UKURAN_BAJU
 *   LUNAS  + "M"   → SISWA_AKTIF
 */
type StatusPendaftar =
  | 'MENUNGGU_PERSETUJUAN'
  | 'MENUNGGU_PEMBAYARAN'
  | 'MENUNGGU_UKURAN_BAJU'
  | 'DITOLAK'
  | 'SISWA_AKTIF';

interface PendaftarRow {
  id: string;
  registrationNumber: string;
  namaLengkap: string;
  nisn: string;
  jurusan: { code: string; name: string };
  gelombang: { id: string; name: string };
  status: StatusPendaftar;
  statusLabel: string;
  hasPdf: boolean;
  pdfSignature: string | null;
  // Bendahara fields
  statusPembayaran: 'BELUM' | 'LUNAS';
  metodePembayaran?: 'CASH' | 'TRANSFER' | null;
  tanggalBayar?: string | null;
  nominalPembayaran?: string | number | null;
  dibayarOleh?: { name: string; email: string } | null;
  // TU fields
  ukuranBaju?: string | null;
  tanggalUkuranBaju?: string | null;
  ukuranBajuDisetOleh?: { name: string; email: string } | null;
  createdAt: string;
}

export default function PendaftarListPage() {
  const { hasPermission } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [items, setItems] = useState<PendaftarRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [search, setSearch] = useState(searchParams.get('search') || '');
  const [status, setStatus] = useState(searchParams.get('status') || '');
  const [gelombangId, setGelombangId] = useState(searchParams.get('gelombangId') || '');
  const [gelombangName, setGelombangName] = useState('');
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  // Modal reject state (admin only)
  const [rejectModal, setRejectModal] = useState<{
    open: boolean;
    target: PendaftarRow | null;
    note: string;
    submitting: boolean;
  }>({ open: false, target: null, note: '', submitting: false });

  // Batch C: Modal Pembayaran (Bendahara) — pilih CASH/TRANSFER
  const [bayarModal, setBayarModal] = useState<{
    open: boolean;
    target: PendaftarRow | null;
    metode: 'CASH' | 'TRANSFER';
    nominalSnapshot: number | null;
    submitting: boolean;
  }>({
    open: false,
    target: null,
    metode: 'CASH',
    nominalSnapshot: null,
    submitting: false,
  });

  // Batch C: Modal Ukuran Baju (TU) — pilih XS..XXXL
  const [ukuranModal, setUkuranModal] = useState<{
    open: boolean;
    target: PendaftarRow | null;
    ukuranBaju: string;
    submitting: boolean;
  }>({ open: false, target: null, ukuranBaju: 'M', submitting: false });

  // Modal export Excel
  const [exportOpen, setExportOpen] = useState(false);

  // ─── Modal: Tambah Pendaftar Manual (admin / superadmin) ────────────
  const AGAMA_OPTIONS = ['ISLAM', 'KRISTEN', 'KATOLIK', 'HINDU', 'BUDDHA', 'KONGHUCU'];
  const [createModal, setCreateModal] = useState({
    open: false,
    submitting: false,
    form: {
      namaLengkap: '',
      jenisKelamin: 'L' as 'L' | 'P',
      tempatLahir: '',
      tanggalLahir: '',
      nisn: '',
      sekolahAsal: '',
      alamat: '',
      noTelp: '',
      email: '',
      jumlahNilaiUn: '',
      prestasi: '',
      namaIbu: '',
      noTelpOrtu: '',
      agama: 'ISLAM',
      jurusanId: '',
      gelombangId: '',
    },
  });
  const [gelombangList, setGelombangList] = useState<
    Array<{ id: string; name: string; isActive: boolean }>
  >([]);
  const [jurusanList, setJurusanList] = useState<
    Array<{ id: string; code: string; name: string }>
  >([]);

  const canReject = hasPermission('spmb.reject');
  const canBayar = hasPermission('spmb.bayar');
  const canUkuranBaju = hasPermission('spmb.ukuran_baju');
  const canCreate = hasPermission('spmb.create');

  useEffect(() => {
    if (!gelombangId) {
      setGelombangName('');
      return;
    }
    api
      .get('/gelombang')
      .then((r) => {
        const g = (r.data as any[]).find((x) => x.id === gelombangId);
        setGelombangName(g?.name || gelombangId);
      })
      .catch(() => setGelombangName(gelombangId));
  }, [gelombangId]);

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.get('/pendaftar', {
        params: {
          page,
          pageSize,
          search: search || undefined,
          status: status || undefined,
          gelombangId: gelombangId || undefined,
        },
      });
      setItems(res.data.items);
      setTotal(res.data.total);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  const onSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    load();
  };

  const clearFilter = (key: string) => {
    const next = new URLSearchParams(searchParams);
    next.delete(key);
    setSearchParams(next);
    if (key === 'gelombangId') setGelombangId('');
    if (key === 'status') setStatus('');
    if (key === 'search') setSearch('');
    setPage(1);
    setTimeout(load, 0);
  };

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  // -- Inline actions -------------------------------------------------------

  // Batch C: 2 modal handlers terpisah untuk Bendahara & TU
  const openBayarModal = (p: PendaftarRow) => {
    // Nominal snapshot otomatis di backend dari Settings.harga_daftar_ulang
    // saat submit. Kalau pendaftar sudah pernah LUNAS (re-edit), tampilkan
    // nilai existing sebagai referensi. Kalau belum, null (= akan ke-snapshot
    // saat submit dari setting global).
    const nominalSnapshot =
      p.nominalPembayaran != null ? Number(p.nominalPembayaran) : null;
    setBayarModal({
      open: true,
      target: p,
      metode: (p.metodePembayaran as 'CASH' | 'TRANSFER') || 'CASH',
      nominalSnapshot,
      submitting: false,
    });
  };

  const submitBayar = async () => {
    if (!bayarModal.target) return;
    setBayarModal((m) => ({ ...m, submitting: true }));
    try {
      const res = await api.post<{
        status: StatusPendaftar;
        statusLabel: string;
        pdfGenerated: boolean;
      }>(`/pendaftar/${bayarModal.target.id}/pembayaran`, {
        metode: bayarModal.metode,
      });
      const next = res.data;
      const pesan =
        next.pdfGenerated
          ? `${bayarModal.target.namaLengkap} lunas — status: ${next.statusLabel}. PDF + email terkirim.`
          : `${bayarModal.target.namaLengkap} lunas. Status: ${next.statusLabel}.`;
      toast.success(pesan);
      setBayarModal({
        open: false,
        target: null,
        metode: 'CASH',
        nominalSnapshot: null,
        submitting: false,
      });
      await load();
    } catch (e: any) {
      toast.error(e?.response?.data?.message || e.message);
      setBayarModal((m) => ({ ...m, submitting: false }));
    }
  };

  const openUkuranModal = (p: PendaftarRow) => {
    // Default ukuran = existing value kalau pernah di-set (re-edit), else M
    setUkuranModal({
      open: true,
      target: p,
      ukuranBaju: p.ukuranBaju || 'M',
      submitting: false,
    });
  };

  const submitUkuran = async () => {
    if (!ukuranModal.target) return;
    if (!ukuranModal.ukuranBaju) {
      toast.error('Ukuran baju wajib dipilih');
      return;
    }
    setUkuranModal((m) => ({ ...m, submitting: true }));
    try {
      const res = await api.post<{
        status: StatusPendaftar;
        statusLabel: string;
        pdfGenerated: boolean;
      }>(`/pendaftar/${ukuranModal.target.id}/ukuran-baju`, {
        ukuranBaju: ukuranModal.ukuranBaju,
      });
      const next = res.data;
      const pesan =
        next.pdfGenerated
          ? `${ukuranModal.target.namaLengkap} ukuran ${ukuranModal.ukuranBaju} — status: ${next.statusLabel}. PDF + email terkirim.`
          : `${ukuranModal.target.namaLengkap} ukuran ${ukuranModal.ukuranBaju}. Status: ${next.statusLabel}.`;
      toast.success(pesan);
      setUkuranModal({ open: false, target: null, ukuranBaju: 'M', submitting: false });
      await load();
    } catch (e: any) {
      toast.error(e?.response?.data?.message || e.message);
      setUkuranModal((m) => ({ ...m, submitting: false }));
    }
  };

  const openRejectModal = (p: PendaftarRow) => {
    setRejectModal({ open: true, target: p, note: '', submitting: false });
  };

  const submitReject = async () => {
    if (!rejectModal.target) return;
    if (!rejectModal.note.trim()) {
      toast.error('Alasan penolakan wajib diisi');
      return;
    }
    setRejectModal((m) => ({ ...m, submitting: true }));
    try {
      await api.post(`/pendaftar/${rejectModal.target.id}/verify`, {
        decision: 'REJECT',
        note: rejectModal.note.trim(),
      });
      toast.success(`${rejectModal.target.namaLengkap} berhasil ditolak`);
      setRejectModal({ open: false, target: null, note: '', submitting: false });
      await load();
    } catch (e: any) {
      toast.error(e?.response?.data?.message || e.message);
      setRejectModal((m) => ({ ...m, submitting: false }));
    }
  };

  /**
   * Buka PDF di tab baru — viewer bawaan browser (Chrome/Edge) sudah punya
   * tombol print & download di toolbar.
   * Pakai axios `api.get(..., { responseType: 'blob' })` supaya token JWT
   * otomatis di-inject via interceptor (lihat src/lib/api.ts).
   */
  const cetakPdf = async (p: PendaftarRow) => {
    if (!p.hasPdf || !p.pdfSignature) {
      toast.error('PDF belum tersedia untuk pendaftar ini. Klik "Generate Ulang PDF" terlebih dahulu.');
      return;
    }
    try {
      const res = await api.get<Blob>(`/pendaftar/${p.id}/download-pdf`, {
        responseType: 'blob',
      });
      const blobUrl = URL.createObjectURL(res.data);
      window.open(blobUrl, '_blank', 'noopener,noreferrer');
      // Bersihkan URL setelah window dibuka (delay supaya viewer sempat load)
      setTimeout(() => URL.revokeObjectURL(blobUrl), 30_000);
    } catch (e: any) {
      toast.error(`Gagal membuka PDF: ${e.message}`);
    }
  };

  /**
   * Download file PDF langsung ke komputer petugas.
   * Pakai query `?as=attachment` agar backend kirim Content-Disposition: attachment.
   */
  const downloadPdf = async (p: PendaftarRow) => {
    if (!p.hasPdf || !p.pdfSignature) {
      toast.error('PDF belum tersedia untuk pendaftar ini. Klik "Generate Ulang PDF" terlebih dahulu.');
      return;
    }
    try {
      const res = await api.get<Blob>(`/pendaftar/${p.id}/download-pdf?as=attachment`, {
        responseType: 'blob',
      });
      const blobUrl = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = `Bukti-Pendaftaran-Ulang-${p.registrationNumber}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(blobUrl), 30_000);
    } catch (e: any) {
      toast.error(`Gagal mendownload PDF: ${e.message}`);
    }
  };

  const regeneratePdf = async (p: PendaftarRow) => {
    if (!window.confirm(`Generate ulang PDF bukti pendaftaran ulang untuk ${p.namaLengkap}?`)) return;
    setBusyId(p.id);
    try {
      await api.post(`/pendaftar/${p.id}/regenerate-pdf`);
      toast.success(`PDF berhasil di-generate ulang untuk ${p.namaLengkap}`);
      await load();
    } catch (e: any) {
      toast.error(`Gagal regenerate PDF: ${e?.response?.data?.message || e.message}`);
    } finally {
      setBusyId(null);
    }
  };

  // ─── Create Pendaftar Manual (admin offline input) ─────────────────────
  const openCreateModal = async () => {
    setCreateModal((m) => ({
      ...m,
      open: true,
      form: {
        namaLengkap: '',
        jenisKelamin: 'L',
        tempatLahir: '',
        tanggalLahir: '',
        nisn: '',
        sekolahAsal: '',
        alamat: '',
        noTelp: '',
        email: '',
        jumlahNilaiUn: '',
        prestasi: '',
        namaIbu: '',
        noTelpOrtu: '',
        agama: 'ISLAM',
        jurusanId: '',
        gelombangId: '',
      },
    }));
    // Fetch dropdown options (gelombang + jurusan) — parallel, swallow errors per req
    try {
      const [g, j] = await Promise.all([
        api.get<Array<{ id: string; name: string; isActive: boolean }>>('/gelombang'),
        api.get<Array<{ id: string; code: string; name: string }>>('/jurusan'),
      ]);
      setGelombangList(g.data);
      setJurusanList(j.data);
    } catch (e: any) {
      toast.error(`Gagal memuat dropdown Gelombang/Jurusan: ${e.message}`);
    }
  };

  const submitCreate = async () => {
    const f = createModal.form;
    // Client-side validation — sama persis dengan backend RegisterPendaftarDto
    const missing: string[] = [];
    if (!f.namaLengkap.trim()) missing.push('Nama Lengkap');
    if (!f.tempatLahir.trim()) missing.push('Tempat Lahir');
    if (!f.tanggalLahir) missing.push('Tanggal Lahir');
    if (!f.sekolahAsal.trim()) missing.push('Sekolah Asal');
    if (!f.alamat.trim()) missing.push('Alamat');
    if (!f.noTelp.trim()) missing.push('No. Telp');
    if (!f.namaIbu.trim()) missing.push('Nama Ibu');
    if (!f.noTelpOrtu.trim()) missing.push('No. Telp Ortu');
    if (!f.jurusanId) missing.push('Jurusan');
    if (!f.gelombangId) missing.push('Gelombang');
    if (missing.length > 0) {
      toast.error(`Field wajib: ${missing.join(', ')}`);
      return;
    }
    if (f.nisn && !/^\d{10}$/.test(f.nisn)) {
      toast.error('NISN harus 10 digit angka (atau kosongkan)');
      return;
    }
    setCreateModal((m) => ({ ...m, submitting: true }));
    try {
      const payload: any = {
        namaLengkap: f.namaLengkap.trim(),
        jenisKelamin: f.jenisKelamin,
        tempatLahir: f.tempatLahir.trim(),
        tanggalLahir: f.tanggalLahir,
        sekolahAsal: f.sekolahAsal.trim(),
        alamat: f.alamat.trim(),
        noTelp: f.noTelp.trim(),
        namaIbu: f.namaIbu.trim(),
        noTelpOrtu: f.noTelpOrtu.trim(),
        agama: f.agama,
        jurusanId: f.jurusanId,
        gelombangId: f.gelombangId,
      };
      if (f.nisn) payload.nisn = f.nisn;
      if (f.email) payload.email = f.email.trim();
      if (f.jumlahNilaiUn) payload.jumlahNilaiUn = Number(f.jumlahNilaiUn);
      if (f.prestasi) payload.prestasi = f.prestasi.trim();

      const res = await api.post<{
        id: string;
        registrationNumber: string;
      }>('/pendaftar', payload);
      toast.success(
        `Pendaftar ${f.namaLengkap} berhasil dibuat (${res.data.registrationNumber})`,
      );
      setCreateModal({
        open: false,
        submitting: false,
        form: {
          namaLengkap: '',
          jenisKelamin: 'L',
          tempatLahir: '',
          tanggalLahir: '',
          nisn: '',
          sekolahAsal: '',
          alamat: '',
          noTelp: '',
          email: '',
          jumlahNilaiUn: '',
          prestasi: '',
          namaIbu: '',
          noTelpOrtu: '',
          agama: 'ISLAM',
          jurusanId: '',
          gelombangId: '',
        },
      });
      await load();
    } catch (e: any) {
      const msg = e?.response?.data?.message;
      const text = Array.isArray(msg) ? msg.join(', ') : msg || e.message;
      toast.error(`Gagal: ${text}`);
      setCreateModal((m) => ({ ...m, submitting: false }));
    }
  };

  return (
    <div>
      <div className="mb-4 flex flex-col items-start justify-between gap-2 md:flex-row md:items-center">
        <h1 className="text-2xl font-bold text-slate-900">Daftar Pendaftar</h1>
        <div className="flex flex-wrap gap-2">
          {canCreate && (
            <button
              onClick={openCreateModal}
              className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-primary-700"
            >
              <UserPlus size={16} />
              Tambah Pendaftar Manual
            </button>
          )}
          {hasPermission('export.manage') && (
            <button
              onClick={() => setExportOpen(true)}
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-emerald-700"
            >
              <FileSpreadsheet size={16} />
              Export Excel (Daftar Ulang)
            </button>
          )}
        </div>
      </div>

      <form onSubmit={onSearch} className="card mb-4 flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            className="input pl-9"
            placeholder="Cari no. pendaftaran / nama / NISN / sekolah…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select
          className="input sm:w-56"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="">Semua Status</option>
          {Object.entries(STATUS_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        <button type="submit" className="btn-primary">Cari</button>
      </form>

      {(status || gelombangId || search) && (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className="text-xs text-slate-500">Filter aktif:</span>
          {status && (
            <button
              onClick={() => clearFilter('status')}
              className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-800 hover:bg-amber-200"
            >
              Status: {STATUS_LABELS[status] || status}
              <X size={12} />
            </button>
          )}
          {gelombangId && (
            <button
              onClick={() => clearFilter('gelombangId')}
              className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-3 py-1 text-xs font-medium text-blue-800 hover:bg-blue-200"
            >
              Gelombang: {gelombangName || gelombangId}
              <X size={12} />
            </button>
          )}
          {search && (
            <button
              onClick={() => clearFilter('search')}
              className="inline-flex items-center gap-1 rounded-full bg-slate-200 px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-300"
            >
              Cari: "{search}"
              <X size={12} />
            </button>
          )}
        </div>
      )}

      <div className="card overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="border-b border-slate-200 bg-slate-50">
              <tr>
                <th className="table-th">No. Pendaftaran</th>
                <th className="table-th">Nama</th>
                <th className="table-th">Jurusan</th>
                <th className="table-th">Gelombang</th>
                <th className="table-th">Status</th>
                {/* Batch C: kolom kelengkapan replaces the old "Ukuran Baju"
                    column. Tampilkan 2 badge ringkas (💰 bayar, 👕 ukuran)
                    sekaligus supaya petugas tahu siapa yang masih kurang apa. */}
                <th className="table-th">Kelengkapan</th>
                <th className="table-th">Tgl Daftar</th>
                <th className="table-th text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={8} className="table-td text-center text-slate-500">Memuat…</td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={8} className="table-td text-center text-slate-500">Tidak ada data</td>
                </tr>
              ) : (
                items.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50">
                    <td className="table-td font-mono text-xs">{p.registrationNumber}</td>
                    <td className="table-td">
                      <div className="font-medium text-slate-900">{p.namaLengkap}</div>
                      <div className="text-xs text-slate-500">NISN {p.nisn}</div>
                    </td>
                    <td className="table-td">{p.jurusan.code}</td>
                    <td className="table-td">{p.gelombang.name}</td>
                    <td className="table-td">
                      <span className={`badge ${STATUS_COLORS[p.status]}`}>{p.statusLabel}</span>
                    </td>
                    <td className="table-td">
                      <div className="flex flex-col gap-1">
                        {/* Badge Bayar (Bendahara) */}
                        <span
                          className={`inline-flex w-fit items-center gap-1 rounded-md px-2 py-0.5 text-xs font-semibold ${
                            p.statusPembayaran === 'LUNAS'
                              ? KELENGKAPAN_COLORS.done
                              : KELENGKAPAN_COLORS.pending
                          }`}
                          title={
                            p.statusPembayaran === 'LUNAS'
                              ? `Lunas ${p.metodePembayaran ? `(${METODE_PEMBAYARAN_LABELS[p.metodePembayaran]})` : ''} ${p.tanggalBayar ? '· ' + new Date(p.tanggalBayar).toLocaleDateString('id-ID') : ''}`
                              : 'Belum bayar'
                          }
                        >
                          <Wallet size={11} />
                          {p.statusPembayaran === 'LUNAS'
                            ? `Lunas${p.metodePembayaran ? ` · ${METODE_PEMBAYARAN_LABELS[p.metodePembayaran]}` : ''}`
                            : 'Belum'}
                        </span>
                        {/* Badge Ukuran Baju (TU) */}
                        <span
                          className={`inline-flex w-fit items-center gap-1 rounded-md px-2 py-0.5 text-xs font-semibold ${
                            p.ukuranBaju
                              ? KELENGKAPAN_COLORS.done
                              : KELENGKAPAN_COLORS.pending
                          }`}
                        >
                          <Shirt size={11} />
                          {p.ukuranBaju ? `Ukuran ${p.ukuranBaju}` : 'Belum'}
                        </span>
                      </div>
                    </td>
                    <td className="table-td text-xs text-slate-500">
                      {new Date(p.createdAt).toLocaleDateString('id-ID')}
                    </td>
                    <td className="table-td">
                      <div className="flex items-center justify-end gap-1">
                        {/* Batch C: 2 ikon terpisah, visibility by permission.
                            - Bendahara (spmb.bayar): tombol 💰 catat pembayaran.
                              Tersembunyi kalau sudah LUNAS (klik row → re-edit
                              via detail page).
                            - TU (spmb.ukuran_baju): tombol 👕 input ukuran.
                              Tersembunyi kalau sudah terisi.
                            - Superadmin sees both.
                            - Reject button tetap untuk MENUNGGU_PERSETUJUAN. */}
                        {canBayar && p.statusPembayaran !== 'LUNAS' && p.status !== 'DITOLAK' && (
                          <button
                            onClick={() => openBayarModal(p)}
                            disabled={busyId === p.id}
                            className="rounded p-1.5 text-emerald-600 transition hover:bg-emerald-50 disabled:opacity-50"
                            title="Catat pembayaran (Bendahara)"
                          >
                            <Wallet size={18} />
                          </button>
                        )}
                        {canUkuranBaju && !p.ukuranBaju && p.status !== 'DITOLAK' && (
                          <button
                            onClick={() => openUkuranModal(p)}
                            disabled={busyId === p.id}
                            className="rounded p-1.5 text-indigo-600 transition hover:bg-indigo-50 disabled:opacity-50"
                            title="Input ukuran baju (TU)"
                          >
                            <Shirt size={18} />
                          </button>
                        )}
                        {canReject && p.status !== 'DITOLAK' && p.status !== 'SISWA_AKTIF' && (
                          <button
                            onClick={() => openRejectModal(p)}
                            disabled={busyId === p.id}
                            className="rounded p-1.5 text-red-600 transition hover:bg-red-50 disabled:opacity-50"
                            title="Tolak (wajib isi alasan)"
                          >
                            <XCircle size={18} />
                          </button>
                        )}
                        {/* Aksi PDF — hanya untuk SISWA_AKTIF.
                            - Kalau PDF sudah ada: tampil Print + Download.
                            - Kalau belum ada (generate awal gagal / file hilang):
                              tampil tombol Generate Ulang (superadmin only). */}
                        {p.status === 'SISWA_AKTIF' && p.hasPdf && (
                          <>
                            <button
                              onClick={() => cetakPdf(p)}
                              className="rounded p-1.5 text-primary-600 transition hover:bg-primary-50"
                              title="Buka PDF di tab baru (untuk cetak)"
                            >
                              <Printer size={18} />
                            </button>
                            <button
                              onClick={() => downloadPdf(p)}
                              className="rounded p-1.5 text-slate-600 transition hover:bg-slate-100"
                              title="Download file PDF"
                            >
                              <Download size={18} />
                            </button>
                          </>
                        )}
                        {p.status === 'SISWA_AKTIF' && !p.hasPdf && (
                          <button
                            onClick={() => regeneratePdf(p)}
                            disabled={busyId === p.id}
                            className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-amber-700 transition hover:bg-amber-50 disabled:opacity-50"
                            title="PDF belum tersedia — klik untuk generate ulang"
                          >
                            <AlertTriangle size={14} />
                            <RefreshCw size={14} className={busyId === p.id ? 'animate-spin' : ''} />
                            Generate PDF
                          </button>
                        )}
                        <Link
                          to={`/pendaftar/${p.id}`}
                          className="rounded p-1.5 text-slate-500 transition hover:bg-slate-100 hover:text-primary-600"
                          title="Lihat detail"
                        >
                          <ChevronRight size={18} />
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3 text-sm">
          <div className="text-slate-500">
            Total <b>{total}</b> pendaftar
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="btn-ghost px-2 py-1"
            >
              <ChevronLeft size={16} />
            </button>
            <span className="px-2 text-slate-600">
              Halaman {page} / {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="btn-ghost px-2 py-1"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* Batch C: Modal Pembayaran (Bendahara) — pilih metode CASH/TRANSFER.
          Nominal otomatis di-snapshot di backend dari Settings.harga_daftar_ulang. */}
      <AnimatePresence>
        {bayarModal.open && bayarModal.target && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
            onClick={() =>
              !bayarModal.submitting &&
              setBayarModal({ open: false, target: null, metode: 'CASH', nominalSnapshot: null, submitting: false })
            }
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
                <b>{bayarModal.target.namaLengkap}</b> ({bayarModal.target.registrationNumber}).
                Status akan otomatis berubah. Kalau ukuran baju juga sudah
                diinput TU, pendaftar langsung menjadi{' '}
                <b>Siswa Aktif</b> dan email + PDF akan dikirim.
              </p>

              {/* Nominal snapshot (read-only) */}
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="text-xs uppercase tracking-wider text-slate-500">
                  Nominal pembayaran (snapshot)
                </div>
                <div className="mt-1 text-2xl font-bold text-slate-900">
                  {bayarModal.nominalSnapshot != null
                    ? formatRupiah(bayarModal.nominalSnapshot)
                    : '— (akan di-snapshot saat submit)'}
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  Nominal otomatis dari setting{' '}
                  <code className="font-mono text-[11px]">harga_daftar_ulang</code>{' '}
                  dan tercatat permanen di struk + PDF bukti pendaftaran ulang.
                </p>
              </div>

              {/* Metode Pembayaran */}
              <label className="label mt-4">Metode Pembayaran *</label>
              <div className="grid grid-cols-2 gap-2">
                {(['CASH', 'TRANSFER'] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    disabled={bayarModal.submitting}
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
                  onClick={() =>
                    setBayarModal({ open: false, target: null, metode: 'CASH', nominalSnapshot: null, submitting: false })
                  }
                  disabled={bayarModal.submitting}
                  className="btn-ghost"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={submitBayar}
                  disabled={bayarModal.submitting}
                  className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-700 disabled:opacity-50"
                >
                  <Check size={14} />
                  {bayarModal.submitting ? 'Memproses…' : 'Catat Pembayaran'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Batch C: Modal Ukuran Baju (TU) — pilih dari grid XS..XXXL. */}
      <AnimatePresence>
        {ukuranModal.open && ukuranModal.target && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
            onClick={() =>
              !ukuranModal.submitting &&
              setUkuranModal({ open: false, target: null, ukuranBaju: 'M', submitting: false })
            }
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
                <b>{ukuranModal.target.namaLengkap}</b> ({ukuranModal.target.registrationNumber}).
                Status akan otomatis berubah. Kalau pembayaran juga sudah
                LUNAS, pendaftar langsung menjadi <b>Siswa Aktif</b> dan email + PDF akan dikirim.
              </p>
              <label className="label flex items-center gap-1.5">
                <Shirt size={14} /> Ukuran Baju *
              </label>
              <div className="grid grid-cols-7 gap-1.5">
                {UKURAN_BAJU_OPTIONS.map((size) => (
                  <button
                    key={size}
                    type="button"
                    disabled={ukuranModal.submitting}
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
                  onClick={() =>
                    setUkuranModal({ open: false, target: null, ukuranBaju: 'M', submitting: false })
                  }
                  disabled={ukuranModal.submitting}
                  className="btn-ghost"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={submitUkuran}
                  disabled={ukuranModal.submitting || !ukuranModal.ukuranBaju}
                  className="inline-flex items-center gap-1.5 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-700 disabled:opacity-50"
                >
                  <Check size={14} />
                  {ukuranModal.submitting ? 'Memproses…' : 'Simpan Ukuran Baju'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Modal alasan penolakan */}
      <AnimatePresence>
        {rejectModal.open && rejectModal.target && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
            onClick={() => !rejectModal.submitting && setRejectModal({ open: false, target: null, note: '', submitting: false })}
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
                Anda akan menolak: <b>{rejectModal.target.namaLengkap}</b> ({rejectModal.target.registrationNumber}).
                Alasan penolakan <b>wajib diisi</b> dan akan dikirimkan ke pendaftar via email.
              </p>
              <label className="label">Alasan Penolakan *</label>
              <textarea
                className="input min-h-[100px]"
                value={rejectModal.note}
                onChange={(e) => setRejectModal((m) => ({ ...m, note: e.target.value }))}
                placeholder="Contoh: Nilai UN di bawah passing grade, kuota jurusan sudah terpenuhi, dll."
                autoFocus
                disabled={rejectModal.submitting}
              />
              <div className="mt-5 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setRejectModal({ open: false, target: null, note: '', submitting: false })}
                  disabled={rejectModal.submitting}
                  className="btn-ghost"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={submitReject}
                  disabled={rejectModal.submitting || !rejectModal.note.trim()}
                  className="inline-flex items-center gap-1.5 rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-700 disabled:opacity-50"
                >
                  <XCircle size={14} />
                  {rejectModal.submitting ? 'Memproses…' : 'Tolak Pendaftar'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── Modal: Tambah Pendaftar Manual (admin) ──────────────────── */}
      <AnimatePresence>
        {createModal.open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4"
            onClick={() =>
              !createModal.submitting && setCreateModal((m) => ({ ...m, open: false }))
            }
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
                <UserPlus size={20} />
                <h3 className="text-lg font-semibold">Tambah Pendaftar Manual</h3>
              </div>
              <p className="mb-3 text-sm text-slate-600">
                Input offline untuk pendaftar yang datang langsung ke sekolah atau data dummy. Akan tercatat
                di Audit Log dengan <code className="rounded bg-slate-100 px-1">source: admin_manual</code>.
              </p>
              {/* Warning: gelombang / jurusan kosong */}
              {(gelombangList.length === 0 || jurusanList.length === 0) && (
                <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                  <div className="flex items-start gap-2">
                    <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                    <div>
                      {gelombangList.length === 0 && (
                        <p>
                          <b>Belum ada Gelombang aktif.</b> Silakan setup di menu{' '}
                          <b>Gelombang</b> sebelum input pendaftar.
                        </p>
                      )}
                      {jurusanList.length === 0 && (
                        <p>
                          <b>Belum ada Jurusan.</b> Silakan setup di menu <b>Jurusan</b> terlebih dahulu.
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="label">Nama Lengkap *</label>
                  <input
                    className="input"
                    value={createModal.form.namaLengkap}
                    onChange={(e) =>
                      setCreateModal((m) => ({
                        ...m,
                        form: { ...m.form, namaLengkap: e.target.value },
                      }))
                    }
                    disabled={createModal.submitting}
                  />
                </div>
                <div>
                  <label className="label">Jenis Kelamin *</label>
                  <select
                    className="input"
                    value={createModal.form.jenisKelamin}
                    onChange={(e) =>
                      setCreateModal((m) => ({
                        ...m,
                        form: { ...m.form, jenisKelamin: e.target.value as 'L' | 'P' },
                      }))
                    }
                    disabled={createModal.submitting}
                  >
                    <option value="L">Laki-laki</option>
                    <option value="P">Perempuan</option>
                  </select>
                </div>
                <div>
                  <label className="label">Tempat Lahir *</label>
                  <input
                    className="input"
                    value={createModal.form.tempatLahir}
                    onChange={(e) =>
                      setCreateModal((m) => ({
                        ...m,
                        form: { ...m.form, tempatLahir: e.target.value },
                      }))
                    }
                    disabled={createModal.submitting}
                  />
                </div>
                <div>
                  <label className="label">Tanggal Lahir *</label>
                  <input
                    type="date"
                    className="input"
                    value={createModal.form.tanggalLahir}
                    onChange={(e) =>
                      setCreateModal((m) => ({
                        ...m,
                        form: { ...m.form, tanggalLahir: e.target.value },
                      }))
                    }
                    disabled={createModal.submitting}
                  />
                </div>
                <div>
                  <label className="label">NISN (10 digit, opsional)</label>
                  <input
                    className="input font-mono"
                    maxLength={10}
                    value={createModal.form.nisn}
                    onChange={(e) =>
                      setCreateModal((m) => ({
                        ...m,
                        form: { ...m.form, nisn: e.target.value.replace(/\D/g, '') },
                      }))
                    }
                    placeholder="1234567890"
                    disabled={createModal.submitting}
                  />
                </div>
                <div>
                  <label className="label">Agama *</label>
                  <select
                    className="input"
                    value={createModal.form.agama}
                    onChange={(e) =>
                      setCreateModal((m) => ({
                        ...m,
                        form: { ...m.form, agama: e.target.value },
                      }))
                    }
                    disabled={createModal.submitting}
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
                    value={createModal.form.sekolahAsal}
                    onChange={(e) =>
                      setCreateModal((m) => ({
                        ...m,
                        form: { ...m.form, sekolahAsal: e.target.value },
                      }))
                    }
                    disabled={createModal.submitting}
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="label">Alamat *</label>
                  <textarea
                    className="input min-h-[60px]"
                    value={createModal.form.alamat}
                    onChange={(e) =>
                      setCreateModal((m) => ({
                        ...m,
                        form: { ...m.form, alamat: e.target.value },
                      }))
                    }
                    disabled={createModal.submitting}
                  />
                </div>
                <div>
                  <label className="label">No. Telp (Siswa) *</label>
                  <input
                    className="input"
                    value={createModal.form.noTelp}
                    onChange={(e) =>
                      setCreateModal((m) => ({
                        ...m,
                        form: { ...m.form, noTelp: e.target.value },
                      }))
                    }
                    disabled={createModal.submitting}
                  />
                </div>
                <div>
                  <label className="label">Email (opsional)</label>
                  <input
                    type="email"
                    className="input"
                    value={createModal.form.email}
                    onChange={(e) =>
                      setCreateModal((m) => ({
                        ...m,
                        form: { ...m.form, email: e.target.value },
                      }))
                    }
                    disabled={createModal.submitting}
                  />
                </div>
                <div>
                  <label className="label">Nama Ibu *</label>
                  <input
                    className="input"
                    value={createModal.form.namaIbu}
                    onChange={(e) =>
                      setCreateModal((m) => ({
                        ...m,
                        form: { ...m.form, namaIbu: e.target.value },
                      }))
                    }
                    disabled={createModal.submitting}
                  />
                </div>
                <div>
                  <label className="label">No. Telp Ortu *</label>
                  <input
                    className="input"
                    value={createModal.form.noTelpOrtu}
                    onChange={(e) =>
                      setCreateModal((m) => ({
                        ...m,
                        form: { ...m.form, noTelpOrtu: e.target.value },
                      }))
                    }
                    disabled={createModal.submitting}
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
                    value={createModal.form.jumlahNilaiUn}
                    onChange={(e) =>
                      setCreateModal((m) => ({
                        ...m,
                        form: { ...m.form, jumlahNilaiUn: e.target.value },
                      }))
                    }
                    disabled={createModal.submitting}
                  />
                </div>
                <div>
                  <label className="label">Jurusan *</label>
                  <select
                    className="input"
                    value={createModal.form.jurusanId}
                    onChange={(e) =>
                      setCreateModal((m) => ({
                        ...m,
                        form: { ...m.form, jurusanId: e.target.value },
                      }))
                    }
                    disabled={createModal.submitting || jurusanList.length === 0}
                  >
                    <option value="">— Pilih Jurusan —</option>
                    {jurusanList.map((j) => (
                      <option key={j.id} value={j.id}>
                        {j.code} — {j.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <label className="label">Gelombang *</label>
                  <select
                    className="input"
                    value={createModal.form.gelombangId}
                    onChange={(e) =>
                      setCreateModal((m) => ({
                        ...m,
                        form: { ...m.form, gelombangId: e.target.value },
                      }))
                    }
                    disabled={createModal.submitting || gelombangList.length === 0}
                  >
                    <option value="">— Pilih Gelombang —</option>
                    {gelombangList.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name} {g.isActive ? '' : '(non-aktif)'}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <label className="label">Prestasi (opsional)</label>
                  <textarea
                    className="input min-h-[50px]"
                    value={createModal.form.prestasi}
                    onChange={(e) =>
                      setCreateModal((m) => ({
                        ...m,
                        form: { ...m.form, prestasi: e.target.value },
                      }))
                    }
                    disabled={createModal.submitting}
                  />
                </div>
              </div>
              <div className="mt-5 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setCreateModal((m) => ({ ...m, open: false }))}
                  disabled={createModal.submitting}
                  className="btn-ghost"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={submitCreate}
                  disabled={createModal.submitting}
                  className="inline-flex items-center gap-1.5 rounded-md bg-primary-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-primary-700 disabled:opacity-50"
                >
                  <UserPlus size={14} />
                  {createModal.submitting ? 'Membuat…' : 'Buat Pendaftar'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Modal export Excel multi-sheet (daftar ulang) */}
      <ExportDaftarUlangModal open={exportOpen} onClose={() => setExportOpen(false)} />
    </div>
  );
}