import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { promises as fs } from 'fs';
import { Agama, MetodePembayaran, Prisma, StatusPendaftar } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { PdfService } from '../pdf/pdf.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { SettingsService } from '../settings/settings.service';
import { getSchoolInfo } from '../common/constants/school';

/**
 * Label publik untuk setiap StatusPendaftar. Dipakai di:
 *   - response API (list/detail/check status)
 *   - subject/body email notifikasi
 *   - badge UI di admin & user
 *
 * Per workflow desentralisasi pembayaran, status di-COMPUTE dari kombinasi
 * (statusPembayaran, ukuranBaju) — lihat `computeAndUpdateStatus()` di bawah.
 */
const STATUS_LABELS: Record<StatusPendaftar, string> = {
  // BELUM + null  → siswa submit form, dua-duanya belum
  MENUNGGU_PERSETUJUAN: 'Menunggu Daftar Ulang',
  // BELUM + "M"  → ukuran baju sudah diinput TU, pembayaran belum
  MENUNGGU_PEMBAYARAN: 'Menunggu Pembayaran',
  // LUNAS + null → pembayaran sudah dicatat Bendahara, ukuran baju belum
  MENUNGGU_UKURAN_BAJU: 'Menunggu Ukuran Baju',
  DITOLAK: 'Ditolak',
  // LUNAS + "M" → dua-duanya sudah, PDF + email auto-terkirim
  SISWA_AKTIF: 'Siswa Aktif',
};

@Injectable()
export class PendaftarService {
  private readonly logger = new Logger(PendaftarService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
    private readonly pdf: PdfService,
    private readonly audit: AuditLogService,
    private readonly settings: SettingsService,
  ) {}

  /**
   * Fetch snapshot nama & email user — disimpan ke kolom `*Nama`/`*Email` di
   * row Pendaftar / AuditLog / dll. Gunanya supaya kalau user di-hard-delete
   * nanti, FK akan di-set NULL tapi text snapshot tetap readable (sejarah
   * tidak hilang).
   *
   * Kalau user null (system actor) → return null object (semua null), supaya
   * caller bisa langsung spread `{...snapshot}` ke data update.
   */
  private async actorSnapshot(userId: string | null | undefined): Promise<{
    userName: string | null;
    userEmail: string | null;
  }> {
    if (!userId) return { userName: null, userEmail: null };
    const u = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { name: true, email: true },
    });
    return {
      userName: u?.name ?? null,
      userEmail: u?.email ?? null,
    };
  }

  /**
   * Fallback untuk response ke UI: kalau relasi user null (user sudah di-
   * hard-delete), pakai snapshot text `*Nama`/`*Email` supaya UI tetap
   * menampilkan nama actor. Kalau snapshot juga null (data lama pra-fitur),
   * return null seperti biasa.
   */
  private fallbackActor(
    rel: { name: string; email: string } | null | undefined,
    snapNama: string | null | undefined,
    snapEmail: string | null | undefined,
  ): { name: string; email: string } | null {
    if (rel) return rel;
    if (snapNama || snapEmail) {
      return { name: snapNama ?? '', email: snapEmail ?? '' };
    }
    return null;
  }

  // -- PUBLIC ----------------------------------------------------------------

  /**
   * Generate nomor pendaftaran REG-YYYYMMDD-XXX.
   * XXX = counter harian 3 digit (001, 002, ...) reset tiap hari.
   *
   * PENTING: counter dihitung dari PREFIX `registrationNumber` (LIKE-based),
   * BUKAN dari range `createdAt`. Alasannya:
   *   1. Timezone-agnostic — server UTC vs WITA tidak masalah. createdAt
   *      di Prisma disimpan sebagai timestamptz (UTC), sedangkan
   *      `new Date(yyyy, mm, dd)` di JS bergantung TZ server. Untuk server
   *      UTC dan user di WITA (UTC+8), range createdAt harian bisa
   *      off-by-one untuk transaksi di subuh WITA.
   *   2. Self-correcting terhadap data historis yang cacat (mis. bug versi
   *      sebelumnya yang hardcode seq=1 → semua jadi REG-...-001). Counter
   *      sekarang akan loncat ke seq berikutnya yang tersedia, bukan
   *      stuck di 001.
   *   3. Lebih cepat — pakai index unique pada kolom registrationNumber
   *      (prefix-based LIKE sudah cukup selektif).
   *
   * Untuk handle race condition (2 request bersamaan dengan count yang
   * sama) atau data historis bentrok (seq sudah dipakai tapi count tidak
   * mencerminkan itu), retry dengan seq yang dinaikkan. Unique constraint
   * pada `registrationNumber` adalah safety net terakhir di level DB.
   */
  private async generateRegistrationNumber(maxRetries = 20): Promise<string> {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const dateStr = `${yyyy}${mm}${dd}`;
    const prefix = `REG-${dateStr}-`;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      // Hitung jumlah pendaftar hari ini BERDASARKAN PREFIX registrationNumber.
      const count = await this.prisma.pendaftar.count({
        where: { registrationNumber: { startsWith: prefix } },
      });
      // attempt 0 → count+1, attempt 1 → count+2, dst (handle bentrok / race)
      const seq = count + 1 + attempt;
      const candidate = `${prefix}${String(seq).padStart(3, '0')}`;

      try {
        const exists = await this.prisma.pendaftar.findUnique({
          where: { registrationNumber: candidate },
          select: { id: true },
        });
        if (!exists) {
          return candidate;
        }
        // seq sudah dipakai tapi count tidak ikut — biasanya data historis
        // bentrok. Loop akan naik seq di attempt berikutnya.
      } catch (e: any) {
        this.logger.warn(
          `generateRegistrationNumber lookup error (attempt ${attempt}): ${e.message}`,
        );
        // Lanjut retry — kalau maxRetries tercapai, fallback di bawah.
      }
    }

    // Fallback sangat tidak mungkin: pakai suffix timestamp untuk absolute uniqueness.
    const ts = Date.now().toString().slice(-6).padStart(6, '0');
    this.logger.error(
      `generateRegistrationNumber: maxRetries=${maxRetries} tercapai untuk prefix ${prefix}, gunakan fallback timestamp`,
    );
    return `${prefix}${ts}`;
  }

  async register(opts: {
    namaLengkap: string;
    jenisKelamin: 'L' | 'P';
    tempatLahir: string;
    tanggalLahir: string;
    /** NISN opsional — boleh kosong (homeschooling/pindahan), tapi kalau
     *  diisi harus 10 digit angka dan unik per gelombang. */
    nisn?: string;
    sekolahAsal: string;
    alamat: string;
    noTelp: string;
    email?: string;
    /** Nilai UN opsional — boleh kosong (homeschooling / pindahan / sekolah
     *  tanpa UN). Kalau diisi, harus 0-100 (float). */
    jumlahNilaiUn?: number;
    prestasi?: string;
    namaIbu: string;
    noTelpOrtu: string;
    agama: Agama;
    jurusanId: string;
    gelombangId: string;
  }) {
    // Validasi: jurusan & gelombang harus ada & aktif (exclude soft-deleted)
    const [jurusan, gelombang] = await Promise.all([
      this.prisma.jurusan.findFirst({
        where: { id: opts.jurusanId, deletedAt: null, isActive: true },
      }),
      this.prisma.gelombang.findUnique({
        where: { id: opts.gelombangId },
        include: { kuota: true },
      }),
    ]);
    if (!jurusan) {
      throw new BadRequestException('Jurusan tidak valid atau tidak aktif');
    }
    if (!gelombang || !gelombang.isActive) {
      throw new BadRequestException('Gelombang tidak valid atau tidak aktif');
    }
    const now = new Date();
    if (gelombang.startDate > now) {
      throw new BadRequestException('Gelombang belum dimulai');
    }
    if (gelombang.endDate && gelombang.endDate < now) {
      throw new BadRequestException('Gelombang sudah berakhir');
    }

    // Cek NISN duplikat pada gelombang yang sama — HANYA jika NISN diisi.
    // NISN sekarang opsional (lihat RegisterPendaftarDto), jadi calon yang
    // belum punya NISN (homeschooling / pindahan) tetap bisa daftar.
    if (opts.nisn && opts.nisn.trim()) {
      const existing = await this.prisma.pendaftar.findFirst({
        where: { nisn: opts.nisn.trim(), gelombangId: opts.gelombangId },
      });
      if (existing) {
        throw new ConflictException(
          `NISN ${opts.nisn} sudah terdaftar di gelombang ini (${existing.registrationNumber})`,
        );
      }
    }

    // Cek kuota
    const k = gelombang.kuota.find((x) => x.jurusanId === opts.jurusanId);
    if (!k) {
      throw new BadRequestException('Jurusan ini tidak dibuka di gelombang tersebut');
    }
    const used = await this.prisma.pendaftar.count({
      where: { gelombangId: opts.gelombangId, jurusanId: opts.jurusanId, status: { not: 'DITOLAK' } },
    });
    if (used >= k.quota) {
      throw new BadRequestException('Kuota untuk jurusan ini sudah penuh');
    }

    const registrationNumber = await this.generateRegistrationNumber();
    const created = await this.prisma.pendaftar.create({
      data: {
        registrationNumber,
        namaLengkap: opts.namaLengkap,
        jenisKelamin: opts.jenisKelamin,
        tempatLahir: opts.tempatLahir,
        tanggalLahir: new Date(opts.tanggalLahir),
        nisn: opts.nisn?.trim() || null,
        sekolahAsal: opts.sekolahAsal,
        alamat: opts.alamat,
        noTelp: opts.noTelp,
        email: opts.email || null,
        // Nilai UN opsional — kalau kosong, simpan null (Decimal nullable)
        jumlahNilaiUn:
          opts.jumlahNilaiUn != null && !Number.isNaN(opts.jumlahNilaiUn)
            ? new Prisma.Decimal(opts.jumlahNilaiUn)
            : null,
        prestasi: opts.prestasi,
        namaIbu: opts.namaIbu,
        noTelpOrtu: opts.noTelpOrtu,
        agama: opts.agama,
        jurusanId: opts.jurusanId,
        gelombangId: opts.gelombangId,
      },
      include: {
        jurusan: { select: { code: true, name: true } },
        gelombang: {
          select: { name: true, tanggalDaftarUlang: true, jamDaftarUlang: true },
        },
      },
    });

    // ---- Tahap 1: Generate PDF "Tanda Bukti Pendaftaran" (MENUNGGU) ----
    // PDF berisi kop surat + QR verifikasi + data pendaftar + status banner
    // "Menunggu Daftar Ulang". Di-attach ke email notifikasi.
    let pdfRelativePath: string | null = null;
    let pdfSignature: string | null = null;
    try {
      const generated = await this.pdf.generateBuktiPendaftaranUlang({
        mode: 'MENUNGGU',
        registrationNumber: created.registrationNumber,
        namaLengkap: created.namaLengkap,
        jenisKelamin: created.jenisKelamin,
        tempatLahir: created.tempatLahir,
        tanggalLahir: created.tanggalLahir,
        nisn: created.nisn ?? undefined,
        sekolahAsal: created.sekolahAsal,
        alamat: created.alamat,
        noTelp: created.noTelp,
        namaIbu: created.namaIbu,
        noTelpOrtu: created.noTelpOrtu,
        jurusan: { code: created.jurusan.code, name: created.jurusan.name },
        gelombang: {
          name: created.gelombang.name,
          tanggalDaftarUlang: created.gelombang.tanggalDaftarUlang,
          jamDaftarUlang: created.gelombang.jamDaftarUlang,
        },
        approvedAt: new Date(), // untuk header "tanggal cetak"
        // tidak ada approver di Tahap 1 — pakai label generik
        approvedBy: undefined,
        // Nilai UN (Decimal nullable → number|null untuk PdfService)
        jumlahNilaiUn:
          created.jumlahNilaiUn != null
            ? Number(created.jumlahNilaiUn)
            : null,
      });
      pdfRelativePath = generated.relativePath;
      pdfSignature = generated.signature;

      // Simpan path + signature ke DB supaya bisa di-download publik via /check
      await this.prisma.pendaftar.update({
        where: { id: created.id },
        data: {
          pdfPath: generated.relativePath,
          pdfSignature: generated.signature,
          pdfGeneratedAt: new Date(),
        },
      });

      // Audit: PDF Tahap 1 tergenerate
      await this.auditLog(
        null,
        'spmb.pdf_generated_tahap1',
        'spmb',
        created.id,
        {
          registrationNumber: created.registrationNumber,
          pdfPath: generated.relativePath,
        },
      );
    } catch (e: any) {
      // Gagal generate PDF Tahap 1 TIDAK menggagalkan registrasi.
      // Siswa tetap terdaftar dan akan di-generate saat admin approve (Tahap 2).
      this.logger.error(
        `Gagal generate PDF Tahap 1 untuk ${created.registrationNumber}: ${e.message}`,
      );
      await this.auditLog(
        null,
        'spmb.pdf_generated_failed',
        'spmb',
        created.id,
        { registrationNumber: created.registrationNumber, error: e.message, phase: 'tahap1' },
      );
    }

    // ---- Kirim email notifikasi (dengan attachment PDF Tahap 1) ----
    const recipientEmail = opts.email;
    if (recipientEmail) {
      const attachment = pdfRelativePath && pdfSignature
        ? [
            {
              filename: `Tanda-Bukti-Pendaftaran-${created.registrationNumber}.pdf`,
              path: this.pdf.getAbsolutePath(pdfRelativePath),
              contentType: 'application/pdf',
            },
          ]
        : undefined;

      this.email
        .sendRegistrationReceived(
          recipientEmail,
          registrationNumber,
          attachment,
          pdfSignature,
        )
        .catch((e) => this.logger.warn(`Email notif gagal: ${e?.message}`));
    }

    // Notify admin (email user yang punya permission spmb.verify_berkas)
    this.notifyAdminsNewPendaftar(registrationNumber, opts.namaLengkap).catch((e) =>
      this.logger.warn(`Notify admin gagal: ${e?.message}`),
    );

    return {
      id: created.id,
      registrationNumber: created.registrationNumber,
      status: created.status,
      statusLabel: STATUS_LABELS[created.status],
      // URL untuk langsung download dari response API (mis. QRIS/konfirmasi page)
      pdfDownloadUrl: pdfSignature
        ? `/api/pendaftar/check/${registrationNumber}/download-pdf?s=${pdfSignature}`
        : null,
    };
  }

  private async notifyAdminsNewPendaftar(regNumber: string, name: string) {
    // Cari semua user yang punya permission spmb.verify_berkas
    const perms = await this.prisma.user.findMany({
      where: {
        isActive: true,
        roles: {
          some: {
            role: {
              permissions: { some: { permission: { code: 'spmb.verify_berkas' } } },
            },
          },
        },
      },
      select: { email: true },
    });
    const emails = perms.map((u) => u.email);
    if (emails.length) {
      await this.email.notifyAdminNewPendaftar(emails, regNumber, name);
    }
  }

  async checkStatus(registrationNumber: string) {
    const p = await this.prisma.pendaftar.findUnique({
      where: { registrationNumber },
      include: {
        jurusan: { select: { code: true, name: true } },
        gelombang: { select: { name: true } },
      },
    });
    if (!p) throw new NotFoundException('Nomor pendaftaran tidak ditemukan');

    return {
      registrationNumber: p.registrationNumber,
      namaLengkap: p.namaLengkap,
      jurusan: p.jurusan,
      gelombang: p.gelombang,
      status: p.status,
      statusLabel: STATUS_LABELS[p.status],
      rejectionNote: p.rejectionNote,
      // PDF tersedia jika sudah pernah di-generate (status SISWA_AKTIF)
      hasPdf: !!p.pdfPath && !!p.pdfSignature,
      pdfDownloadUrl: p.pdfSignature
        ? `/api/pendaftar/check/${p.registrationNumber}/download-pdf?s=${p.pdfSignature}`
        : null,
      // Konfirmasi kehadiran daftar ulang (di-scan dari QR)
      daftarUlangConfirmedAt: p.daftarUlangConfirmedAt,
      createdAt: p.createdAt,
    };
  }

  /**
   * Endpoint publik untuk halaman verifikasi (dipanggil dari halaman
   * /verifikasi/:regNumber yang dibuka saat user scan QR Code di PDF).
   * Hanya menampilkan info ringkas yang aman dipublikasikan:
   *   - registrationNumber, namaLengkap (konfirmasi identitas)
   *   - status, statusLabel
   *   - info gelombang (name, tanggalDaftarUlang, jamDaftarUlang)
   *   - info sekolah (alamat & telp)
   *   - approvedAt / confirmedAt
   * Tetap butuh token/signature untuk mencegah enumerasi nomor pendaftaran.
   */
  async verifyInfo(registrationNumber: string, token?: string) {
    const p = await this.prisma.pendaftar.findUnique({
      where: { registrationNumber },
      include: {
        jurusan: { select: { code: true, name: true } },
        gelombang: {
          select: {
            name: true,
            tanggalDaftarUlang: true,
            jamDaftarUlang: true,
          },
        },
      },
    });
    if (!p) throw new NotFoundException('Nomor pendaftaran tidak ditemukan');
    if (!p.pdfSignature || !token || p.pdfSignature !== token) {
      throw new BadRequestException(
        'Token verifikasi tidak valid. Pastikan QR tidak terpotong saat dipindai.',
      );
    }

    const school = getSchoolInfo();

    return {
      valid: true,
      registrationNumber: p.registrationNumber,
      namaLengkap: p.namaLengkap,
      jenisKelamin: p.jenisKelamin,
      status: p.status,
      statusLabel: STATUS_LABELS[p.status],
      isActive: p.status === 'SISWA_AKTIF',
      jurusan: p.jurusan,
      gelombang: {
        name: p.gelombang.name,
        tanggalDaftarUlang: p.gelombang.tanggalDaftarUlang,
        jamDaftarUlang: p.gelombang.jamDaftarUlang,
      },
      school,
      approvedAt: p.approvedAt,
      daftarUlangConfirmedAt: p.daftarUlangConfirmedAt,
      // Tandai kalau kehadiran sudah dikonfirmasi TU/admin
      attendanceConfirmed: !!p.daftarUlangConfirmedAt,
    };
  }

  /**
   * Endpoint publik untuk download PDF bukti pendaftaran ulang.
   * Validasi signature cocok (mencegah enumerasi nomor pendaftaran).
   */
  async downloadPdf(registrationNumber: string, signature: string): Promise<{
    absolutePath: string;
    filename: string;
  }> {
    if (!signature) {
      throw new BadRequestException('Signature wajib diisi');
    }
    const p = await this.prisma.pendaftar.findUnique({
      where: { registrationNumber },
      select: { pdfPath: true, pdfSignature: true, registrationNumber: true, status: true },
    });
    if (!p || !p.pdfPath || !p.pdfSignature) {
      throw new NotFoundException('Bukti pendaftaran ulang belum tersedia untuk nomor ini');
    }
    if (p.pdfSignature !== signature) {
      throw new BadRequestException('Signature tidak valid');
    }
    // Tahap 1 (status MENUNGGU_PERSETUJUAN) vs Tahap 2 (SISWA_AKTIF) — beda nama file
    const filename =
      p.status === 'SISWA_AKTIF'
        ? `Bukti-Pendaftaran-Ulang-${p.registrationNumber}.pdf`
        : `Tanda-Bukti-Pendaftaran-${p.registrationNumber}.pdf`;
    return {
      absolutePath: this.pdf.getAbsolutePath(p.pdfPath),
      filename,
    };
  }

  // -- ADMIN ----------------------------------------------------------------

  async listForAdmin(opts: {
    status?: StatusPendaftar;
    gelombangId?: string;
    jurusanId?: string;
    search?: string;
    page?: number;
    pageSize?: number;
  }) {
    const page = Math.max(1, opts.page ?? 1);
    const pageSize = Math.min(1000, Math.max(1, opts.pageSize ?? 20));
    const where: Prisma.PendaftarWhereInput = {};
    if (opts.status) where.status = opts.status;
    if (opts.gelombangId) where.gelombangId = opts.gelombangId;
    if (opts.jurusanId) where.jurusanId = opts.jurusanId;
    if (opts.search) {
      where.OR = [
        { registrationNumber: { contains: opts.search, mode: 'insensitive' } },
        { namaLengkap: { contains: opts.search, mode: 'insensitive' } },
        { nisn: { contains: opts.search, mode: 'insensitive' } },
        { sekolahAsal: { contains: opts.search, mode: 'insensitive' } },
      ];
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.pendaftar.findMany({
        where,
        include: {
          jurusan: { select: { id: true, code: true, name: true } },
          gelombang: { select: { id: true, name: true } },
          verifiedBy: { select: { name: true, email: true } },
          approvedBy: { select: { name: true, email: true } },
          dibayarOleh: { select: { name: true, email: true } },
          ukuranBajuDisetOleh: { select: { name: true, email: true } },
          daftarUlangConfirmedBy: { select: { name: true, email: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.pendaftar.count({ where }),
    ]);

    return {
      items: items.map((p) => ({
        id: p.id,
        registrationNumber: p.registrationNumber,
        namaLengkap: p.namaLengkap,
        jenisKelamin: p.jenisKelamin,
        nisn: p.nisn,
        sekolahAsal: p.sekolahAsal,
        agama: p.agama,
        jurusan: p.jurusan,
        gelombang: p.gelombang,
        status: p.status,
        statusLabel: STATUS_LABELS[p.status],
        rejectionNote: p.rejectionNote,
        verifiedBy: this.fallbackActor(p.verifiedBy, p.verifiedByNama, p.verifiedByEmail),
        verifiedAt: p.verifiedAt,
        approvedBy: this.fallbackActor(p.approvedBy, p.approvedByNama, p.approvedByEmail),
        approvedAt: p.approvedAt,
        // Field pembayaran (Bendahara) — dipakai badge "💰 Lunas/Belum" di list
        statusPembayaran: p.statusPembayaran,
        metodePembayaran: p.metodePembayaran,
        tanggalBayar: p.tanggalBayar,
        dibayarOleh: this.fallbackActor(p.dibayarOleh, p.dibayarOlehNama, p.dibayarOlehEmail),
        nominalPembayaran: p.nominalPembayaran?.toString() ?? null,
        // Field ukuran baju (TU) — dipakai badge "👕 Sudah/Belum" di list
        ukuranBaju: p.ukuranBaju,
        tanggalUkuranBaju: p.tanggalUkuranBaju,
        ukuranBajuDisetOleh: this.fallbackActor(
          p.ukuranBajuDisetOleh,
          p.ukuranBajuDisetOlehNama,
          p.ukuranBajuDisetOlehEmail,
        ),
        hasPdf: !!p.pdfPath,
        pdfSignature: p.pdfSignature,
        daftarUlangConfirmedAt: p.daftarUlangConfirmedAt,
        daftarUlangConfirmedBy: p.daftarUlangConfirmedBy,
        createdAt: p.createdAt,
      })),
      total,
      page,
      pageSize,
    };
  }

  async getDetail(id: string) {
    const p = await this.prisma.pendaftar.findUnique({
      where: { id },
      include: {
        jurusan: true,
        gelombang: true,
        verifiedBy: { select: { name: true, email: true } },
        approvedBy: { select: { name: true, email: true } },
        dibayarOleh: { select: { name: true, email: true } },
        ukuranBajuDisetOleh: { select: { name: true, email: true } },
        daftarUlangConfirmedBy: { select: { name: true, email: true } },
      },
    });
    if (!p) throw new NotFoundException('Pendaftar tidak ditemukan');
    return {
      ...p,
      jumlahNilaiUn: p.jumlahNilaiUn?.toString() ?? null,
      nominalPembayaran: p.nominalPembayaran?.toString() ?? null,
      statusLabel: STATUS_LABELS[p.status],
      // Snapshot fallback untuk UI — kalau user di-hard-delete, relasi jadi
      // null tapi snapshot text di kolom `*Nama`/`*Email` masih readable.
      verifiedBy: this.fallbackActor(p.verifiedBy, p.verifiedByNama, p.verifiedByEmail),
      approvedBy: this.fallbackActor(p.approvedBy, p.approvedByNama, p.approvedByEmail),
      dibayarOleh: this.fallbackActor(p.dibayarOleh, p.dibayarOlehNama, p.dibayarOlehEmail),
      ukuranBajuDisetOleh: this.fallbackActor(
        p.ukuranBajuDisetOleh,
        p.ukuranBajuDisetOlehNama,
        p.ukuranBajuDisetOlehEmail,
      ),
      daftarUlangConfirmedBy: this.fallbackActor(
        p.daftarUlangConfirmedBy,
        p.daftarUlangConfirmedByNama,
        p.daftarUlangConfirmedByEmail,
      ),
    };
  }

  /**
   * Admin REJECT pendaftar.
   *
   * Workflow desentralisasi (Batch C): approval dipecah jadi 2 endpoint
   * terpisah — lihat `submitPembayaran()` (Bendahara) dan `submitUkuranBaju()`
   * (TU). Endpoint `verify` ini jadi REJECT-only; permission `spmb.reject` lama
   * tetap dipakai untuk backward compat.
   *
   * Reject diizinkan dari status apapun KECUALI terminal:
   *   - DITOLAK    (sudah ditolak)
   *   - SISWA_AKTIF (sudah disetujui final, harus lewat alur pembatalan lain)
   *
   * Endpoint: POST /pendaftar/:id/verify body { decision: 'REJECT', note }
   * Parameter `ukuranBaju` di-ignore — dipertahankan di signature supaya tidak
   * breaking call site lama yang masih kirim field tsb.
   */
  async verify(
    id: string,
    adminUserId: string,
    decision: 'APPROVE' | 'REJECT',
    note?: string,
    /** @deprecated Tidak dipakai lagi — ukuran baju diinput via endpoint TU terpisah. */
    _ukuranBaju?: string,
  ) {
    if (decision === 'APPROVE') {
      // Approval satu-langkah sudah dihapus — panggil 2 endpoint terpisah.
      throw new BadRequestException(
        'Approval satu-langkah sudah tidak berlaku. ' +
          'Gunakan POST /:id/pembayaran (Bendahara) dan POST /:id/ukuran-baju ' +
          '(TU) secara terpisah.',
      );
    }

    const p = await this.prisma.pendaftar.findUnique({ where: { id } });
    if (!p) throw new NotFoundException('Pendaftar tidak ditemukan');
    if (p.status === 'DITOLAK' || p.status === 'SISWA_AKTIF') {
      throw new BadRequestException(
        `Tidak bisa menolak pendaftar berstatus ${STATUS_LABELS[p.status]}`,
      );
    }
    if (!note || !note.trim()) {
      throw new BadRequestException('Alasan penolakan wajib diisi saat reject');
    }

    const updatedAt = new Date();
    const snap = await this.actorSnapshot(adminUserId);
    const updated = await this.prisma.pendaftar.update({
      where: { id },
      data: {
        status: 'DITOLAK',
        verifiedById: adminUserId,
        verifiedAt: updatedAt,
        verifiedByNama: snap.userName,
        verifiedByEmail: snap.userEmail,
        rejectionNote: note.trim(),
      },
    });

    // Audit log: pendaftar ditolak
    await this.auditLog(
      adminUserId,
      'pendaftar.rejected',
      'pendaftar',
      updated.id,
      {
        registrationNumber: updated.registrationNumber,
        rejectionNote: updated.rejectionNote,
      },
    );

    // Email notifikasi ke pendaftar
    if (updated.email) {
      this.email
        .sendStatusUpdate(
          updated.email,
          updated.registrationNumber,
          STATUS_LABELS[updated.status],
          updated.rejectionNote || undefined,
        )
        .catch((e) => this.logger.warn(`Email status gagal: ${e?.message}`));
    }

    return {
      id: updated.id,
      registrationNumber: updated.registrationNumber,
      status: updated.status,
      statusLabel: STATUS_LABELS[updated.status],
    };
  }

  /**
   * Bendahara: catat pembayaran pendaftar (nominal snapshot + metode).
   *
   * Setelah pembayaran dicatat, status akan di-recompute via
   * `computeAndUpdateStatus()`. Kalau ukuran baju juga sudah terisi (siapa
   * duluan antara Bendahara/TU tidak penting), pendaftar otomatis flip ke
   * `SISWA_AKTIF` dan PDF Tahap 2 + email dikirim.
   *
   * Endpoint: POST /pendaftar/:id/pembayaran body { metode: 'CASH' | 'TRANSFER' }
   * Permission: `spmb.bayar` (Bendahara role).
   */
  async submitPembayaran(id: string, userId: string, metode: MetodePembayaran) {
    const p = await this.prisma.pendaftar.findUnique({ where: { id } });
    if (!p) throw new NotFoundException('Pendaftar tidak ditemukan');
    if (p.status === 'DITOLAK' || p.status === 'SISWA_AKTIF') {
      throw new BadRequestException(
        `Tidak bisa catat pembayaran untuk pendaftar berstatus ${STATUS_LABELS[p.status]}`,
      );
    }

    // Snapshot harga global saat Bendahara catat (bukan saat status berubah).
    // PDF historical jadi konsisten walau superadmin ganti harga di kemudian hari.
    const nominalSnapshot = await this.settings.hargaDaftarUlang();
    const updatedAt = new Date();
    const paySnap = await this.actorSnapshot(userId);

    await this.prisma.pendaftar.update({
      where: { id },
      data: {
        statusPembayaran: 'LUNAS',
        metodePembayaran: metode,
        tanggalBayar: updatedAt,
        dibayarOlehUserId: userId,
        dibayarOlehNama: paySnap.userName,
        dibayarOlehEmail: paySnap.userEmail,
        nominalPembayaran: new Prisma.Decimal(nominalSnapshot),
      },
    });

    // Audit log
    await this.auditLog(
      userId,
      'pendaftar.payment_recorded',
      'pendaftar',
      id,
      {
        registrationNumber: p.registrationNumber,
        metode,
        nominal: nominalSnapshot,
      },
    );

    // Recompute status (jika baju sudah terisi → flip ke SISWA_AKTIF + generate PDF)
    return this.afterPartialSubmit(id, userId, updatedAt);
  }

  /**
   * TU: input ukuran baju pendaftar.
   *
   * Setelah ukuran baju di-input, status akan di-recompute via
   * `computeAndUpdateStatus()`. Kalau pembayaran juga sudah LUNAS (siapa
   * duluan antara Bendahara/TU tidak penting), pendaftar otomatis flip ke
   * `SISWA_AKTIF` dan PDF Tahap 2 + email dikirim.
   *
   * Endpoint: POST /pendaftar/:id/ukuran-baju body { ukuranBaju }
   * Permission: `spmb.ukuran_baju` (TU role).
   */
  async submitUkuranBaju(id: string, userId: string, ukuranBaju: string) {
    if (!ukuranBaju || !ukuranBaju.trim()) {
      throw new BadRequestException('Ukuran baju wajib diisi');
    }
    const allowed = await this.settings.ukuranBajuOptions();
    if (!allowed.includes(ukuranBaju.trim())) {
      throw new BadRequestException(
        `Ukuran baju '${ukuranBaju}' tidak valid. Pilihan: ${allowed.join(', ')}`,
      );
    }

    const p = await this.prisma.pendaftar.findUnique({ where: { id } });
    if (!p) throw new NotFoundException('Pendaftar tidak ditemukan');
    if (p.status === 'DITOLAK' || p.status === 'SISWA_AKTIF') {
      throw new BadRequestException(
        `Tidak bisa input ukuran baju untuk pendaftar berstatus ${STATUS_LABELS[p.status]}`,
      );
    }

    const updatedAt = new Date();
    const bajuSnap = await this.actorSnapshot(userId);
    await this.prisma.pendaftar.update({
      where: { id },
      data: {
        ukuranBaju: ukuranBaju.trim(),
        tanggalUkuranBaju: updatedAt,
        ukuranBajuDisetOlehUserId: userId,
        ukuranBajuDisetOlehNama: bajuSnap.userName,
        ukuranBajuDisetOlehEmail: bajuSnap.userEmail,
      },
    });

    // Audit log
    await this.auditLog(
      userId,
      'pendaftar.ukuran_baju_recorded',
      'pendaftar',
      id,
      {
        registrationNumber: p.registrationNumber,
        ukuranBaju: ukuranBaju.trim(),
      },
    );

    // Recompute status (jika pembayaran juga LUNAS → flip ke SISWA_AKTIF + generate PDF)
    return this.afterPartialSubmit(id, userId, updatedAt);
  }

  /**
   * Helper yang dipanggil oleh `submitPembayaran()` dan `submitUkuranBaju()`
   * setelah satu field diisi. Tugasnya:
   *   1. Re-read pendaftar (untuk dapat state terbaru dari field satunya)
   *   2. Hitung status baru via `computeAndUpdateStatus()`
   *   3. Kalau status baru = SISWA_AKTIF, generate PDF Tahap 2 + kirim email
   *
   * Asumsi: caller sudah update field masing-masing & audit log. Method ini
   * fokus pada recomputation + side effect (PDF + email).
   */
  private async afterPartialSubmit(id: string, userId: string, _at: Date) {
    const p = await this.prisma.pendaftar.findUnique({
      where: { id },
      include: {
        jurusan: { select: { code: true, name: true } },
        gelombang: {
          select: { name: true, tanggalDaftarUlang: true, jamDaftarUlang: true },
        },
      },
    });
    if (!p) throw new NotFoundException('Pendaftar tidak ditemukan');

    const newStatus = this.computeStatus(p.statusPembayaran, p.ukuranBaju);

    // Update field status + approvedBy/At ke user yg trigger flip (siapa saja
    // di antara Bendahara/TU yang submit TERAKHIR).
    let updated = p;
    if (newStatus !== p.status) {
      const data: Prisma.PendaftarUpdateInput = { status: newStatus };
      if (newStatus === 'SISWA_AKTIF') {
        const approveSnap = await this.actorSnapshot(userId);
        data.approvedBy = { connect: { id: userId } };
        data.approvedAt = new Date();
        data.approvedByNama = approveSnap.userName;
        data.approvedByEmail = approveSnap.userEmail;
      }
      updated = await this.prisma.pendaftar.update({
        where: { id },
        data,
        include: {
          jurusan: { select: { code: true, name: true } },
          gelombang: {
            select: { name: true, tanggalDaftarUlang: true, jamDaftarUlang: true },
          },
          approvedBy: { select: { name: true, email: true } },
        },
      });
    }

    // Hanya generate PDF + kirim email saat baru mencapai SISWA_AKTIF.
    // Partial state (MENUNGGU_PEMBAYARAN / MENUNGGU_UKURAN_BAJU) tidak kirim
    // email apapun — sesuai klarifikasi user.
    let pdfGenerated = false;
    let pdfSignature: string | null = null;
    if (
      newStatus === 'SISWA_AKTIF' &&
      p.status !== 'SISWA_AKTIF'
    ) {
      const result = await this.generateTahapan2Pdf(updated, userId);
      pdfGenerated = result.pdfGenerated;
      pdfSignature = result.signature;
    }

    return {
      id: updated.id,
      registrationNumber: updated.registrationNumber,
      status: updated.status,
      statusLabel: STATUS_LABELS[updated.status],
      statusPembayaran: updated.statusPembayaran,
      metodePembayaran: updated.metodePembayaran,
      tanggalBayar: updated.tanggalBayar,
      ukuranBaju: updated.ukuranBaju,
      nominalPembayaran: updated.nominalPembayaran?.toString() ?? null,
      pdfGenerated,
      pdfDownloadUrl: pdfGenerated && pdfSignature
        ? `/api/pendaftar/check/${updated.registrationNumber}/download-pdf?s=${pdfSignature}`
        : null,
    };
  }

  /**
   * Pure function: hitung status pendaftar dari kombinasi 2 field.
   * Single source of truth — dipakai oleh `afterPartialSubmit()` setelah
   * salah satu field berubah.
   *
   * Tabel keputusan (lihat juga comment di `STATUS_LABELS`):
   *   BELUM + null  → MENUNGGU_PERSETUJUAN
   *   BELUM + "M"   → MENUNGGU_PEMBAYARAN  (TU duluan)
   *   LUNAS + null  → MENUNGGU_UKURAN_BAJU (Bendahara duluan)
   *   LUNAS + "M"   → SISWA_AKTIF
   *
   * Caller harus skip recompute kalau status saat ini = DITOLAK (terminal).
   */
  private computeStatus(
    statusPembayaran: 'BELUM' | 'LUNAS',
    ukuranBaju: string | null,
  ): StatusPendaftar {
    if (statusPembayaran === 'LUNAS' && ukuranBaju) return 'SISWA_AKTIF';
    if (statusPembayaran === 'LUNAS') return 'MENUNGGU_UKURAN_BAJU';
    if (ukuranBaju) return 'MENUNGGU_PEMBAYARAN';
    return 'MENUNGGU_PERSETUJUAN';
  }

  /**
   * Generate PDF Tahap 2 (Siswa Aktif) + simpan ke DB + kirim email ke siswa.
   * Dipakai oleh 3 caller (semua hasil akhir = status SISWA_AKTIF):
   *   1. `afterPartialSubmit()` — auto-flip saat submit ke-2 (Bendahara/TU)
   *   2. `regeneratePdf()` — admin klik tombol "Generate Ulang PDF"
   *
   * Returns metadata yang diperlukan caller (pdfGenerated, signature).
   */
  private async generateTahapan2Pdf(
    p: {
      id: string;
      registrationNumber: string;
      namaLengkap: string;
      jenisKelamin: 'L' | 'P';
      tempatLahir: string;
      tanggalLahir: Date;
      nisn: string | null;
      sekolahAsal: string;
      alamat: string;
      noTelp: string;
      namaIbu: string;
      noTelpOrtu: string;
      ukuranBaju: string | null;
      nominalPembayaran: Prisma.Decimal | null;
      jumlahNilaiUn: Prisma.Decimal | null;
      email: string | null;
      jurusan: { code: string; name: string };
      gelombang: {
        name: string;
        tanggalDaftarUlang: Date | null;
        jamDaftarUlang: string | null;
      };
      approvedBy?: { name: string; email: string } | null;
    },
    triggeredByUserId: string,
  ): Promise<{ pdfGenerated: boolean; signature: string | null }> {
    let pdfGenerated = false;
    let pdfRelativePath: string | null = null;
    let signature: string | null = null;

    try {
      const generated = await this.pdf.generateBuktiPendaftaranUlang({
        mode: 'AKTIF',
        registrationNumber: p.registrationNumber,
        namaLengkap: p.namaLengkap,
        jenisKelamin: p.jenisKelamin,
        tempatLahir: p.tempatLahir,
        tanggalLahir: p.tanggalLahir,
        nisn: p.nisn ?? undefined,
        sekolahAsal: p.sekolahAsal,
        alamat: p.alamat,
        noTelp: p.noTelp,
        namaIbu: p.namaIbu,
        noTelpOrtu: p.noTelpOrtu,
        ukuranBaju: p.ukuranBaju ?? undefined,
        nominalPembayaran: p.nominalPembayaran?.toString() ?? null,
        jurusan: p.jurusan,
        gelombang: p.gelombang,
        approvedAt: new Date(),
        approvedBy: {
          name: p.approvedBy?.name || 'Petugas SPMB',
          email: p.approvedBy?.email || 'admin@smk-pgri3dps.sch.id',
        },
        jumlahNilaiUn:
          p.jumlahNilaiUn != null ? Number(p.jumlahNilaiUn) : null,
      });
      pdfRelativePath = generated.relativePath;
      signature = generated.signature;

      await this.prisma.pendaftar.update({
        where: { id: p.id },
        data: {
          pdfPath: generated.relativePath,
          pdfGeneratedAt: new Date(),
          pdfSignature: generated.signature,
        },
      });
      pdfGenerated = true;

      await this.auditLog(
        triggeredByUserId,
        'spmb.pdf_generated_tahap2',
        'spmb',
        p.id,
        {
          registrationNumber: p.registrationNumber,
          pdfPath: generated.relativePath,
        },
      );
    } catch (e: any) {
      // Gagal generate PDF TIDAK menggagalkan flip status (status tetap SISWA_AKTIF).
      // Admin bisa pakai tombol "Generate Ulang PDF" nanti untuk retry.
      this.logger.error(`Gagal generate PDF Tahap 2 untuk ${p.registrationNumber}: ${e.message}`);
      await this.auditLog(
        triggeredByUserId,
        'spmb.pdf_generated_failed',
        'spmb',
        p.id,
        {
          registrationNumber: p.registrationNumber,
          error: e.message,
          phase: 'tahap2',
        },
      );
    }

    // Kirim email hanya kalau PDF berhasil di-generate. (Klarifikasi user:
    // tidak ada email untuk partial submit.)
    if (pdfGenerated && p.email && pdfRelativePath && signature) {
      const attachment = [
        {
          filename: `Bukti-Pendaftaran-Ulang-${p.registrationNumber}.pdf`,
          path: this.pdf.getAbsolutePath(pdfRelativePath),
          contentType: 'application/pdf',
        },
      ];
      this.email
        .sendDaftarUlangSuccess(
          p.email,
          p.registrationNumber,
          p.approvedBy?.name || 'Panitia SPMB',
          p.approvedBy?.email,
          signature,
          attachment,
          {
            ukuranBaju: p.ukuranBaju ?? undefined,
            nominalPembayaran: p.nominalPembayaran?.toString() ?? null,
          },
        )
        .catch((e) => this.logger.warn(`Email daftar ulang gagal: ${e?.message}`));
    }

    return { pdfGenerated, signature };
  }

  /**
   * Scan QR pendaftar saat datang daftar ulang fisik ke sekolah.
   * Validasi signature dari QR cocok dengan DB dan pendaftar berstatus SISWA_AKTIF.
   */
  async scanDaftarUlang(id: string, signature: string, adminUserId: string) {
    const p = await this.prisma.pendaftar.findUnique({
      where: { id },
      include: {
        daftarUlangConfirmedBy: { select: { name: true, email: true } },
      },
    });
    if (!p) throw new NotFoundException('Pendaftar tidak ditemukan');

    if (p.status !== 'SISWA_AKTIF') {
      throw new BadRequestException(
        `Pendaftar belum berstatus SISWA_AKTIF (saat ini: ${STATUS_LABELS[p.status]})`,
      );
    }
    if (!p.pdfSignature) {
      throw new BadRequestException(
        'QR tidak tersedia — bukti pendaftaran ulang belum pernah di-generate',
      );
    }
    if (p.pdfSignature !== signature) {
      throw new BadRequestException('Signature QR tidak cocok (kemungkinan QR dipalsukan)');
    }
    if (p.daftarUlangConfirmedAt) {
      throw new ConflictException(
        `Kehadiran sudah pernah dikonfirmasi pada ${p.daftarUlangConfirmedAt.toISOString()} ` +
          `oleh ${p.daftarUlangConfirmedBy?.name || 'petugas'}`,
      );
    }

    const confirmSnap = await this.actorSnapshot(adminUserId);
    const updated = await this.prisma.pendaftar.update({
      where: { id },
      data: {
        daftarUlangConfirmedAt: new Date(),
        daftarUlangConfirmedByUserId: adminUserId,
        daftarUlangConfirmedByNama: confirmSnap.userName,
        daftarUlangConfirmedByEmail: confirmSnap.userEmail,
      },
      include: {
        daftarUlangConfirmedBy: { select: { name: true, email: true } },
      },
    });

    await this.auditLog(
      adminUserId,
      'spmb.scan_daftar_ulang',
      'spmb',
      updated.id,
      {
        registrationNumber: updated.registrationNumber,
        confirmedAt: updated.daftarUlangConfirmedAt,
      },
    );

    return {
      id: updated.id,
      registrationNumber: updated.registrationNumber,
      namaLengkap: updated.namaLengkap,
      status: updated.status,
      daftarUlangConfirmedAt: updated.daftarUlangConfirmedAt,
      confirmedBy: updated.daftarUlangConfirmedBy,
    };
  }

  /**
   * Download PDF by pendaftar ID (admin-only, tanpa butuh signature token).
   * Return path absolut + filename untuk streaming di controller.
   */
  async downloadPdfById(id: string): Promise<{ absolutePath: string; filename: string }> {
    const p = await this.prisma.pendaftar.findUnique({
      where: { id },
      select: { pdfPath: true, registrationNumber: true, status: true },
    });
    if (!p) throw new NotFoundException('Pendaftar tidak ditemukan');
    if (p.status !== 'SISWA_AKTIF') {
      throw new BadRequestException(
        `Pendaftar belum berstatus SISWA_AKTIF — PDF belum tersedia`,
      );
    }
    if (!p.pdfPath) {
      throw new NotFoundException(
        'Bukti PDF belum pernah di-generate untuk pendaftar ini. ' +
          'Gunakan tombol "Generate Ulang PDF" terlebih dahulu.',
      );
    }
    const absolutePath = this.pdf.getAbsolutePath(p.pdfPath);
    const stat = await fs.stat(absolutePath).catch(() => null);
    if (!stat) {
      throw new NotFoundException(
        `File PDF hilang dari storage (path: ${p.pdfPath}). ` +
          'Gunakan tombol "Generate Ulang PDF" untuk membuat ulang.',
      );
    }
    return {
      absolutePath,
      filename: `Bukti-Pendaftaran-Ulang-${p.registrationNumber}.pdf`,
    };
  }

  /**
   * Regenerate PDF bukti pendaftaran ulang (untuk kasus generate awal gagal
   * atau file hilang dari storage). Hanya untuk SISWA_AKTIF.
   *
   * Setelah refactor Batch C: logic generate PDF Tahap 2 ada di
   * `generateTahapan2Pdf()` helper (shared dengan afterPartialSubmit). Method
   * ini validate status + delegate + audit log khusus regenerate.
   */
  async regeneratePdf(id: string, adminUserId: string) {
    const p = await this.prisma.pendaftar.findUnique({
      where: { id },
      include: {
        jurusan: { select: { code: true, name: true } },
        gelombang: {
          select: { name: true, tanggalDaftarUlang: true, jamDaftarUlang: true },
        },
        approvedBy: { select: { name: true, email: true } },
      },
    });
    if (!p) throw new NotFoundException('Pendaftar tidak ditemukan');
    if (p.status !== 'SISWA_AKTIF') {
      throw new BadRequestException(
        `Hanya pendaftar berstatus SISWA_AKTIF yang bisa regenerate PDF ` +
          `(saat ini: ${STATUS_LABELS[p.status]})`,
      );
    }

    const result = await this.generateTahapan2Pdf(p, adminUserId);

    // Audit log khusus regenerate (selain spmb.pdf_generated_tahap2 yang
    // sudah di-emit oleh helper) supaya trace "siapa klik tombol Generate
    // Ulang" lebih jelas di audit trail.
    await this.auditLog(adminUserId, 'spmb.pdf_regenerated', 'spmb', id, {
      registrationNumber: p.registrationNumber,
      reason: 'manual regenerate',
      pdfGenerated: result.pdfGenerated,
    });

    if (!result.pdfGenerated) {
      // Helper tidak throw, jadi kita lempar error supaya caller tahu gagal
      throw new InternalServerErrorException(
        `Gagal generate PDF. Silakan coba lagi atau hubungi admin sistem.`,
      );
    }

    this.logger.log(`PDF regenerated untuk ${p.registrationNumber}`);
    const updated = await this.prisma.pendaftar.findUnique({
      where: { id },
      select: { id: true, registrationNumber: true, pdfGeneratedAt: true },
    });
    return {
      id: updated!.id,
      registrationNumber: updated!.registrationNumber,
      pdfGeneratedAt: updated!.pdfGeneratedAt,
      hasPdf: true,
    };
  }

  // -- helpers --------------------------------------------------------------

  /**
   * Hapus file PDF di storage kalau ada. Best-effort — kalau file hilang
   * (mis. sudah dihapus manual atau storage corrupt), jangan gagalkan
   * proses hapus pendaftar di DB.
   */
  private async deletePdfFile(pdfPath?: string | null) {
    if (!pdfPath) return;
    try {
      const abs = this.pdf.getAbsolutePath(pdfPath);
      await fs.unlink(abs);
      this.logger.log(`PDF dihapus: ${pdfPath}`);
    } catch (e: any) {
      if (e?.code !== 'ENOENT') {
        this.logger.warn(`Gagal hapus PDF ${pdfPath}: ${e?.message}`);
      }
    }
  }

  // ===========================================================================
  // CRUD ADMIN (spmb.create / spmb.update / spmb.delete)
  // ===========================================================================

  /**
   * Admin: tambah pendaftar manual (input offline / data dummy). Beda dengan
   * `register()` (publik) di:
   *   - `userId: null` (admin yang input, bukan self-register)
   *   - Audit log `pendaftar.created` dengan `source: 'admin_manual'`
   *   - Generate PDF + kirim notif JANGAN dilakukan — admin yang input
   *     offline biasanya sudah punya konteks sendiri, dan supaya tidak
   *     spam email kalau input banyak sekaligus.
   *     Kalau perlu, bisa generate PDF via regeneratePdf nanti.
   */
  async create(
    opts: {
      namaLengkap: string;
      jenisKelamin: 'L' | 'P';
      tempatLahir: string;
      tanggalLahir: string;
      nisn?: string;
      sekolahAsal: string;
      alamat: string;
      noTelp: string;
      email?: string;
      jumlahNilaiUn?: number;
      prestasi?: string;
      namaIbu: string;
      noTelpOrtu: string;
      agama: Agama;
      jurusanId: string;
      gelombangId: string;
    },
    createdByUserId: string,
  ) {
    // Reuse validasi yang sama dengan register() — extract inline
    // (tidak dipisah jadi helper karena register() punya extra Tahap 1 PDF
    // flow yang berbeda).
    const [jurusan, gelombang] = await Promise.all([
      this.prisma.jurusan.findFirst({
        where: { id: opts.jurusanId, deletedAt: null, isActive: true },
      }),
      this.prisma.gelombang.findUnique({
        where: { id: opts.gelombangId },
        include: { kuota: true },
      }),
    ]);
    if (!jurusan) {
      throw new BadRequestException('Jurusan tidak valid atau tidak aktif');
    }
    if (!gelombang || !gelombang.isActive) {
      throw new BadRequestException('Gelombang tidak valid atau tidak aktif');
    }

    if (opts.nisn && opts.nisn.trim()) {
      const existing = await this.prisma.pendaftar.findFirst({
        where: { nisn: opts.nisn.trim(), gelombangId: opts.gelombangId },
      });
      if (existing) {
        throw new ConflictException(
          `NISN ${opts.nisn} sudah terdaftar di gelombang ini (${existing.registrationNumber})`,
        );
      }
    }

    const k = gelombang.kuota.find((x) => x.jurusanId === opts.jurusanId);
    if (!k) {
      throw new BadRequestException('Jurusan ini tidak dibuka di gelombang tersebut');
    }
    const used = await this.prisma.pendaftar.count({
      where: { gelombangId: opts.gelombangId, jurusanId: opts.jurusanId, status: { not: 'DITOLAK' } },
    });
    if (used >= k.quota) {
      throw new BadRequestException('Kuota untuk jurusan ini sudah penuh');
    }

    const registrationNumber = await this.generateRegistrationNumber();
    const created = await this.prisma.pendaftar.create({
      data: {
        registrationNumber,
        namaLengkap: opts.namaLengkap,
        jenisKelamin: opts.jenisKelamin,
        tempatLahir: opts.tempatLahir,
        tanggalLahir: new Date(opts.tanggalLahir),
        nisn: opts.nisn?.trim() || null,
        sekolahAsal: opts.sekolahAsal,
        alamat: opts.alamat,
        noTelp: opts.noTelp,
        email: opts.email || null,
        jumlahNilaiUn:
          opts.jumlahNilaiUn != null && !Number.isNaN(opts.jumlahNilaiUn)
            ? new Prisma.Decimal(opts.jumlahNilaiUn)
            : null,
        prestasi: opts.prestasi,
        namaIbu: opts.namaIbu,
        noTelpOrtu: opts.noTelpOrtu,
        agama: opts.agama,
        jurusanId: opts.jurusanId,
        gelombangId: opts.gelombangId,
        // Status default MENUNGGU_PERSETUJUAN — Bendahara & TU belum input apapun
        // Kalau admin mau langsung set Siswa Aktif, bisa lewat update endpoint
      },
    });

    await this.auditLog(createdByUserId, 'pendaftar.created', 'pendaftar', created.id, {
      source: 'admin_manual',
      createdByUserId,
      registrationNumber: created.registrationNumber,
      namaLengkap: created.namaLengkap,
      jurusanId: opts.jurusanId,
      gelombangId: opts.gelombangId,
    });

    return this.getDetail(created.id);
  }

  /**
   * Admin: edit data pendaftar. Partial update — hanya field yang dikirim.
   * Audit log `pendaftar.updated` dengan diff before/after supaya forensik.
   *
   * Kalau status sudah SISWA_AKTIF dan field yang di-edit adalah field yang
   * muncul di PDF (namaLengkap, NISN, ukuranBaju, dll), PDF akan di-regenerate
   * supaya konsisten dengan data terbaru.
   */
  async update(
    id: string,
    opts: {
      namaLengkap?: string;
      jenisKelamin?: 'L' | 'P';
      tempatLahir?: string;
      tanggalLahir?: string;
      nisn?: string;
      sekolahAsal?: string;
      alamat?: string;
      noTelp?: string;
      email?: string;
      jumlahNilaiUn?: number;
      prestasi?: string;
      namaIbu?: string;
      noTelpOrtu?: string;
      agama?: Agama;
      jurusanId?: string;
      gelombangId?: string;
    },
    actorUserId: string,
  ) {
    const before = await this.prisma.pendaftar.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('Pendaftar tidak ditemukan');

    // Validasi ulang kalau ganti jurusan/gelombang
    if (opts.jurusanId && opts.jurusanId !== before.jurusanId) {
      const j = await this.prisma.jurusan.findFirst({
        where: { id: opts.jurusanId, deletedAt: null, isActive: true },
      });
      if (!j) throw new BadRequestException('Jurusan tidak valid atau tidak aktif');
    }
    if (opts.gelombangId && opts.gelombangId !== before.gelombangId) {
      const g = await this.prisma.gelombang.findUnique({ where: { id: opts.gelombangId } });
      if (!g || !g.isActive) {
        throw new BadRequestException('Gelombang tidak valid atau tidak aktif');
      }
    }

    // NISN duplicate check (exclude current pendaftar)
    if (opts.nisn && opts.nisn.trim() && opts.nisn.trim() !== before.nisn) {
      const gelombangId = opts.gelombangId || before.gelombangId;
      const existing = await this.prisma.pendaftar.findFirst({
        where: { nisn: opts.nisn.trim(), gelombangId, id: { not: id } },
      });
      if (existing) {
        throw new ConflictException(
          `NISN ${opts.nisn} sudah dipakai pendaftar lain (${existing.registrationNumber})`,
        );
      }
    }

    // Build update data — hanya field yang dikirim
    const data: Prisma.PendaftarUpdateInput = {};
    const changedFields: string[] = [];
    const beforeValues: Record<string, any> = {};
    const afterValues: Record<string, any> = {};

    const setIfPresent = (key: string, beforeVal: any, afterVal: any) => {
      if (afterVal !== undefined && afterVal !== beforeVal) {
        changedFields.push(key);
        beforeValues[key] = beforeVal;
        afterValues[key] = afterVal;
        (data as any)[key] = afterVal;
      }
    };

    setIfPresent('namaLengkap', before.namaLengkap, opts.namaLengkap);
    setIfPresent('jenisKelamin', before.jenisKelamin, opts.jenisKelamin);
    setIfPresent('tempatLahir', before.tempatLahir, opts.tempatLahir);
    if (opts.tanggalLahir) {
      const newDate = new Date(opts.tanggalLahir);
      if (
        !before.tanggalLahir ||
        newDate.getTime() !== before.tanggalLahir.getTime()
      ) {
        changedFields.push('tanggalLahir');
        beforeValues.tanggalLahir = before.tanggalLahir?.toISOString();
        afterValues.tanggalLahir = newDate.toISOString();
        data.tanggalLahir = newDate;
      }
    }
    setIfPresent('nisn', before.nisn, opts.nisn ? opts.nisn.trim() : opts.nisn);
    setIfPresent('sekolahAsal', before.sekolahAsal, opts.sekolahAsal);
    setIfPresent('alamat', before.alamat, opts.alamat);
    setIfPresent('noTelp', before.noTelp, opts.noTelp);
    setIfPresent('email', before.email, opts.email);
    if (opts.jumlahNilaiUn !== undefined) {
      const newDec =
        opts.jumlahNilaiUn != null && !Number.isNaN(opts.jumlahNilaiUn)
          ? new Prisma.Decimal(opts.jumlahNilaiUn)
          : null;
      const beforeStr = before.jumlahNilaiUn?.toString() ?? null;
      const afterStr = newDec?.toString() ?? null;
      if (beforeStr !== afterStr) {
        changedFields.push('jumlahNilaiUn');
        beforeValues.jumlahNilaiUn = beforeStr;
        afterValues.jumlahNilaiUn = afterStr;
        data.jumlahNilaiUn = newDec;
      }
    }
    setIfPresent('prestasi', before.prestasi, opts.prestasi);
    setIfPresent('namaIbu', before.namaIbu, opts.namaIbu);
    setIfPresent('noTelpOrtu', before.noTelpOrtu, opts.noTelpOrtu);
    setIfPresent('agama', before.agama, opts.agama);
    if (opts.jurusanId && opts.jurusanId !== before.jurusanId) {
      changedFields.push('jurusanId');
      beforeValues.jurusanId = before.jurusanId;
      afterValues.jurusanId = opts.jurusanId;
      data.jurusan = { connect: { id: opts.jurusanId } };
    }
    if (opts.gelombangId && opts.gelombangId !== before.gelombangId) {
      changedFields.push('gelombangId');
      beforeValues.gelombangId = before.gelombangId;
      afterValues.gelombangId = opts.gelombangId;
      data.gelombang = { connect: { id: opts.gelombangId } };
    }

    if (changedFields.length === 0) {
      // Nothing berubah — return as-is, jangan tulis audit log
      return this.getDetail(id);
    }

    await this.prisma.pendaftar.update({ where: { id }, data });

    await this.auditLog(actorUserId, 'pendaftar.updated', 'pendaftar', id, {
      changedFields,
      before: beforeValues,
      after: afterValues,
    });

    // Regenerate PDF kalau status SISWA_AKTIF dan field yang berubah muncul di PDF
    const pdfCritical = changedFields.some((f) =>
      ['namaLengkap', 'jenisKelamin', 'tempatLahir', 'tanggalLahir', 'nisn',
       'sekolahAsal', 'alamat', 'noTelp', 'namaIbu', 'noTelpOrtu',
       'jumlahNilaiUn', 'jurusanId', 'gelombangId'].includes(f),
    );
    const after = await this.prisma.pendaftar.findUnique({ where: { id } });
    if (pdfCritical && after && after.status === 'SISWA_AKTIF') {
      this.regeneratePdf(id, actorUserId).catch((e) =>
        this.logger.warn(`Auto-regenerate PDF gagal setelah update: ${e?.message}`),
      );
    }

    return this.getDetail(id);
  }

  /**
   * Admin: hard delete pendaftar + file PDF di storage.
   * Audit log `pendaftar.deleted` dengan snapshot lengkap untuk forensik.
   */
  async remove(id: string, actorUserId: string) {
    const before = await this.prisma.pendaftar.findUnique({
      where: { id },
      include: {
        jurusan: { select: { code: true, name: true } },
        gelombang: { select: { name: true } },
      },
    });
    if (!before) throw new NotFoundException('Pendaftar tidak ditemukan');

    // Snapshot untuk audit log — supaya trail forensik tetap ada walau
    // baris DB sudah hilang.
    const snapshot = {
      id: before.id,
      registrationNumber: before.registrationNumber,
      namaLengkap: before.namaLengkap,
      jenisKelamin: before.jenisKelamin,
      tempatLahir: before.tempatLahir,
      tanggalLahir: before.tanggalLahir?.toISOString(),
      nisn: before.nisn,
      sekolahAsal: before.sekolahAsal,
      alamat: before.alamat,
      noTelp: before.noTelp,
      email: before.email,
      jumlahNilaiUn: before.jumlahNilaiUn?.toString() ?? null,
      prestasi: before.prestasi,
      namaIbu: before.namaIbu,
      noTelpOrtu: before.noTelpOrtu,
      agama: before.agama,
      status: before.status,
      statusPembayaran: before.statusPembayaran,
      metodePembayaran: before.metodePembayaran,
      tanggalBayar: before.tanggalBayar?.toISOString() ?? null,
      nominalPembayaran: before.nominalPembayaran?.toString() ?? null,
      ukuranBaju: before.ukuranBaju,
      tanggalUkuranBaju: before.tanggalUkuranBaju?.toISOString() ?? null,
      pdfPath: before.pdfPath,
      pdfSignature: before.pdfSignature,
      createdAt: before.createdAt?.toISOString(),
      jurusan: before.jurusan,
      gelombang: before.gelombang,
    };

    // Hapus file PDF dulu (best-effort)
    await this.deletePdfFile(before.pdfPath);

    // Hard delete — cascade ke relasi one-to-one di dalam Pendaftar otomatis
    // (Prisma schema). AuditLog.userId sudah SetNull jadi tidak ikut hapus.
    await this.prisma.pendaftar.delete({ where: { id } });

    await this.auditLog(actorUserId, 'pendaftar.deleted', 'pendaftar', id, {
      snapshot,
      registrationNumber: before.registrationNumber,
    });

    return {
      ok: true,
      deletedId: id,
      registrationNumber: before.registrationNumber,
      message: `Pendaftar ${before.registrationNumber} (${before.namaLengkap}) berhasil dihapus.`,
    };
  }

  private async auditLog(
    userId: string | null,
    action: string,
    module: string,
    entityId: string | null,
    meta?: any,
  ) {
    await this.audit
      .create({
        userId: userId ?? undefined,
        action,
        module,
        entityType: module,
        entityId: entityId ?? undefined,
        meta,
      })
      .catch((e) => this.logger.warn(`Audit log gagal: ${e?.message}`));
  }
}
