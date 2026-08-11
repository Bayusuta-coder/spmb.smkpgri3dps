import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, StatusPendaftar } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { PdfService } from '../pdf/pdf.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { getSchoolInfo } from '../common/constants/school';

const STATUS_LABELS: Record<StatusPendaftar, string> = {
  MENUNGGU_VERIFIKASI: 'Menunggu Verifikasi',
  DITOLAK: 'Ditolak',
  LOLOS_MENUNGGU_DAFTAR_ULANG: 'Lolos - Menunggu Daftar Ulang',
  MENUNGGU_VERIFIKASI_PEMBAYARAN: 'Menunggu Verifikasi Pembayaran',
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
  ) {}

  // -- PUBLIC ----------------------------------------------------------------

  /**
   * Generate nomor pendaftaran REG-YYYYMMDD-XXX.
   * XXX = counter harian 3 digit (001, 002, ...) reset tiap hari.
   * Untuk atomicity, kita hitung jumlah pendaftar hari ini + 1.
   */
  private async generateRegistrationNumber(): Promise<string> {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const dateStr = `${yyyy}${mm}${dd}`;
    const start = new Date(yyyy, now.getMonth(), now.getDate());
    const end = new Date(yyyy, now.getMonth(), now.getDate() + 1);

    const count = await this.prisma.pendaftar.count({
      where: { createdAt: { gte: start, lt: end } },
    });
    const seq = String(count + 1).padStart(3, '0');
    return `REG-${dateStr}-${seq}`;
  }

  async register(opts: {
    namaLengkap: string;
    jenisKelamin: 'L' | 'P';
    tempatLahir: string;
    tanggalLahir: string;
    nisn: string;
    sekolahAsal: string;
    alamat: string;
    noTelp: string;
    email?: string;
    jumlahNilaiUn: number;
    prestasi?: string;
    namaIbu: string;
    noTelpOrtu: string;
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

    // Cek NISN duplikat pada gelombang & jurusan yang sama
    const existing = await this.prisma.pendaftar.findFirst({
      where: { nisn: opts.nisn, gelombangId: opts.gelombangId },
    });
    if (existing) {
      throw new ConflictException(
        `NISN ${opts.nisn} sudah terdaftar di gelombang ini (${existing.registrationNumber})`,
      );
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
        nisn: opts.nisn,
        sekolahAsal: opts.sekolahAsal,
        alamat: opts.alamat,
        noTelp: opts.noTelp,
        email: opts.email || null,
        jumlahNilaiUn: new Prisma.Decimal(opts.jumlahNilaiUn),
        prestasi: opts.prestasi,
        namaIbu: opts.namaIbu,
        noTelpOrtu: opts.noTelpOrtu,
        jurusanId: opts.jurusanId,
        gelombangId: opts.gelombangId,
      },
    });

    // Kirim email notifikasi (tidak tunggu hasilnya)
    const recipientEmail = opts.email;
    if (recipientEmail) {
      this.email
        .sendRegistrationReceived(recipientEmail, registrationNumber)
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
        pembayaran: true,
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
      canInputPayment: p.status === 'LOLOS_MENUNGGU_DAFTAR_ULANG',
      // PDF tersedia jika sudah pernah di-generate
      hasPdf: !!p.pdfPath && !!p.pdfSignature,
      pdfDownloadUrl: p.pdfSignature
        ? `/api/pendaftar/check/${p.registrationNumber}/download-pdf?s=${p.pdfSignature}`
        : null,
      // Konfirmasi kehadiran daftar ulang (di-scan dari QR)
      daftarUlangConfirmedAt: p.daftarUlangConfirmedAt,
      pembayaran: p.pembayaran
        ? {
            nominal: p.pembayaran.nominal.toString(),
            tanggalTransfer: p.pembayaran.tanggalTransfer,
            namaPengirim: p.pembayaran.namaPengirim,
            status: p.pembayaran.status,
            note: p.pembayaran.note,
          }
        : null,
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
    return {
      absolutePath: this.pdf.getAbsolutePath(p.pdfPath),
      filename: `Bukti-Pendaftaran-Ulang-${p.registrationNumber}.pdf`,
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
    const pageSize = Math.min(100, Math.max(1, opts.pageSize ?? 20));
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
          jurusan: { select: { code: true, name: true } },
          gelombang: { select: { id: true, name: true } },
          pembayaran: true,
          verifiedBy: { select: { name: true, email: true } },
          approvedBy: { select: { name: true, email: true } },
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
        jurusan: p.jurusan,
        gelombang: p.gelombang,
        status: p.status,
        statusLabel: STATUS_LABELS[p.status],
        rejectionNote: p.rejectionNote,
        verifiedBy: p.verifiedBy,
        verifiedAt: p.verifiedAt,
        approvedBy: p.approvedBy,
        approvedAt: p.approvedAt,
        hasPdf: !!p.pdfPath,
        daftarUlangConfirmedAt: p.daftarUlangConfirmedAt,
        daftarUlangConfirmedBy: p.daftarUlangConfirmedBy,
        hasPayment: !!p.pembayaran,
        paymentStatus: p.pembayaran?.status,
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
        pembayaran: true,
        verifiedBy: { select: { name: true, email: true } },
        approvedBy: { select: { name: true, email: true } },
        daftarUlangConfirmedBy: { select: { name: true, email: true } },
      },
    });
    if (!p) throw new NotFoundException('Pendaftar tidak ditemukan');
    return {
      ...p,
      jumlahNilaiUn: p.jumlahNilaiUn.toString(),
      statusLabel: STATUS_LABELS[p.status],
    };
  }

  async verify(id: string, adminUserId: string, decision: 'APPROVE' | 'REJECT', note?: string) {
    const p = await this.prisma.pendaftar.findUnique({ where: { id } });
    if (!p) throw new NotFoundException('Pendaftar tidak ditemukan');
    if (p.status !== 'MENUNGGU_VERIFIKASI') {
      throw new BadRequestException(
        `Tidak bisa verifikasi: status saat ini ${STATUS_LABELS[p.status]}`,
      );
    }

    const newStatus: StatusPendaftar =
      decision === 'APPROVE' ? 'LOLOS_MENUNGGU_DAFTAR_ULANG' : 'DITOLAK';

    const updated = await this.prisma.pendaftar.update({
      where: { id },
      data: {
        status: newStatus,
        verifiedById: adminUserId,
        verifiedAt: new Date(),
        rejectionNote: decision === 'REJECT' ? note || 'Ditolak' : null,
      },
    });

    // Email notifikasi ke pendaftar
    const recipient = updated.email;
    if (recipient) {
      this.email
        .sendStatusUpdate(
          recipient,
          updated.registrationNumber,
          STATUS_LABELS[newStatus],
          note,
        )
        .catch((e) => this.logger.warn(`Email status gagal: ${e?.message}`));
    }

    // Jika Lolos, kirim instruksi pembayaran
    if (newStatus === 'LOLOS_MENUNGGU_DAFTAR_ULANG' && recipient) {
      this.email
        .sendPaymentInstruction(recipient, updated.registrationNumber)
        .catch((e) => this.logger.warn(`Email payment instr gagal: ${e?.message}`));
    }

    return {
      id: updated.id,
      registrationNumber: updated.registrationNumber,
      status: updated.status,
      statusLabel: STATUS_LABELS[updated.status],
    };
  }

  async approveFinal(id: string, adminUserId: string) {
    const p = await this.prisma.pendaftar.findUnique({
      where: { id },
      include: {
        pembayaran: true,
        jurusan: true,
        gelombang: true,
        approvedBy: { select: { id: true, name: true, email: true } },
      },
    });
    if (!p) throw new NotFoundException('Pendaftar tidak ditemukan');
    if (p.status !== 'MENUNGGU_VERIFIKASI_PEMBAYARAN') {
      throw new BadRequestException(
        `Tidak bisa approve final: status saat ini ${STATUS_LABELS[p.status]}`,
      );
    }
    if (!p.pembayaran || p.pembayaran.status !== 'TERVERIFIKASI') {
      throw new BadRequestException('Pembayaran belum diverifikasi TU');
    }

    // Setujui ke status SISWA_AKTIF dulu
    const updatedAt = new Date();
    let updated = await this.prisma.pendaftar.update({
      where: { id },
      data: {
        status: 'SISWA_AKTIF',
        approvedById: adminUserId,
        approvedAt: updatedAt,
      },
      include: {
        approvedBy: { select: { name: true, email: true } },
      },
    });

    // Generate PDF + simpan ke storage lokal
    let pdfGenerated = false;
    let pdfRelativePath: string | null = null;
    let signature: string | null = null;
    try {
      const generated = await this.pdf.generateBuktiPendaftaranUlang({
        registrationNumber: updated.registrationNumber,
        namaLengkap: updated.namaLengkap,
        jenisKelamin: updated.jenisKelamin,
        tempatLahir: updated.tempatLahir,
        tanggalLahir: updated.tanggalLahir,
        sekolahAsal: updated.sekolahAsal,
        alamat: updated.alamat,
        noTelp: updated.noTelp,
        namaIbu: updated.namaIbu,
        noTelpOrtu: updated.noTelpOrtu,
        jurusan: { code: p.jurusan.code, name: p.jurusan.name },
        gelombang: {
          name: p.gelombang.name,
          tanggalDaftarUlang: p.gelombang.tanggalDaftarUlang,
          jamDaftarUlang: p.gelombang.jamDaftarUlang,
        },
        approvedAt: updatedAt,
        approvedBy: {
          name: updated.approvedBy?.name || 'Petugas SPMB',
          email: updated.approvedBy?.email || 'admin@smk-pgri3dps.sch.id',
        },
      });
      pdfRelativePath = generated.relativePath;
      signature = generated.signature;

      // Simpan path + signature ke DB supaya bisa di-download ulang / di-scan
      updated = await this.prisma.pendaftar.update({
        where: { id },
        data: {
          pdfPath: generated.relativePath,
          pdfGeneratedAt: new Date(),
          pdfSignature: generated.signature,
        },
        include: {
          approvedBy: { select: { name: true, email: true } },
        },
      });
      pdfGenerated = true;

      // Audit: PDF tergenerate
      await this.auditLog(
        adminUserId,
        'spmb.pdf_generated',
        'spmb',
        updated.id,
        {
          registrationNumber: updated.registrationNumber,
          pdfPath: generated.relativePath,
        },
      );
    } catch (e: any) {
      // Gagal generate PDF tidak menggagalkan approval (status tetap SISWA_AKTIF)
      this.logger.error(`Gagal generate PDF untuk ${updated.registrationNumber}: ${e.message}`);
      await this.auditLog(
        adminUserId,
        'spmb.pdf_generated_failed',
        'spmb',
        updated.id,
        {
          registrationNumber: updated.registrationNumber,
          error: e.message,
        },
      );
    }

    // Kirim email notifikasi (dengan attachment PDF jika berhasil)
    const recipient = updated.email;
    if (recipient) {
      const attachment = pdfGenerated && pdfRelativePath && signature
        ? [
            {
              filename: `Bukti-Pendaftaran-Ulang-${updated.registrationNumber}.pdf`,
              path: this.pdf.getAbsolutePath(pdfRelativePath),
              contentType: 'application/pdf',
            },
          ]
        : undefined;

      this.email
        .sendDaftarUlangSuccess(
          recipient,
          updated.registrationNumber,
          updated.approvedBy?.name || 'Panitia SPMB',
          updated.approvedBy?.email,
          signature,
          attachment,
        )
        .catch((e) => this.logger.warn(`Email daftar ulang gagal: ${e?.message}`));
    }

    return {
      id: updated.id,
      registrationNumber: updated.registrationNumber,
      status: updated.status,
      statusLabel: STATUS_LABELS[updated.status],
      pdfGenerated,
      pdfDownloadUrl: pdfGenerated && signature
        ? `/api/pendaftar/check/${updated.registrationNumber}/download-pdf?s=${signature}`
        : null,
    };
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

    const updated = await this.prisma.pendaftar.update({
      where: { id },
      data: {
        daftarUlangConfirmedAt: new Date(),
        daftarUlangConfirmedByUserId: adminUserId,
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

  // -- helpers --------------------------------------------------------------

  private async auditLog(
    userId: string,
    action: string,
    module: string,
    entityId: string | null,
    meta?: any,
  ) {
    await this.audit
      .create({
        userId,
        action,
        module,
        entityType: module,
        entityId: entityId ?? undefined,
        meta,
      })
      .catch((e) => this.logger.warn(`Audit log gagal: ${e?.message}`));
  }
}
