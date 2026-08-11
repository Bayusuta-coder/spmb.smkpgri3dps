import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, StatusPembayaran } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';

@Injectable()
export class PembayaranService {
  private readonly logger = new Logger(PembayaranService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
  ) {}

  /**
   * Siswa input data transfer. Dipanggil publik dengan menyertakan registration number.
   * Hanya bisa jika status pendaftar = LOLOS_MENUNGGU_DAFTAR_ULANG.
   */
  async submit(opts: {
    registrationNumber: string;
    nominal: number;
    tanggalTransfer: string;
    namaPengirim: string;
    catatan?: string;
  }) {
    const p = await this.prisma.pendaftar.findUnique({
      where: { registrationNumber: opts.registrationNumber },
      include: { pembayaran: true },
    });
    if (!p) throw new NotFoundException('Nomor pendaftaran tidak ditemukan');
    if (p.status !== 'LOLOS_MENUNGGU_DAFTAR_ULANG') {
      throw new BadRequestException(
        'Pendaftaran belum berstatus Lolos - Menunggu Daftar Ulang',
      );
    }
    if (p.pembayaran) {
      throw new BadRequestException('Data pembayaran sudah pernah diinput');
    }

    const created = await this.prisma.pembayaran.create({
      data: {
        pendaftarId: p.id,
        nominal: new Prisma.Decimal(opts.nominal),
        tanggalTransfer: new Date(opts.tanggalTransfer),
        namaPengirim: opts.namaPengirim,
        catatan: opts.catatan,
      },
    });

    // Update status pendaftar
    await this.prisma.pendaftar.update({
      where: { id: p.id },
      data: { status: 'MENUNGGU_VERIFIKASI_PEMBAYARAN' },
    });

    return {
      id: created.id,
      nominal: created.nominal.toString(),
      tanggalTransfer: created.tanggalTransfer,
      namaPengirim: created.namaPengirim,
      status: created.status,
    };
  }

  /**
   * TU verifikasi pembayaran: cocokkan dengan mutasi rekening, lalu set status.
   */
  async verify(
    id: string,
    tuUserId: string,
    decision: 'TERVERIFIKASI' | 'BELUM_DITEMUKAN',
    note?: string,
  ) {
    const pay = await this.prisma.pembayaran.findUnique({
      where: { id },
      include: { pendaftar: true },
    });
    if (!pay) throw new NotFoundException('Pembayaran tidak ditemukan');
    if (pay.status !== 'MENUNGGU_VERIFIKASI') {
      throw new BadRequestException(`Status pembayaran saat ini: ${pay.status}`);
    }

    const updated = await this.prisma.pembayaran.update({
      where: { id },
      data: {
        status: decision,
        verifiedById: tuUserId,
        verifiedAt: new Date(),
        note: note,
      },
    });

    if (decision === 'BELUM_DITEMUKAN') {
      // Kembalikan pendaftar ke LOLOS_MENUNGGU_DAFTAR_ULANG agar bisa input ulang
      await this.prisma.pendaftar.update({
        where: { id: pay.pendaftarId },
        data: { status: 'LOLOS_MENUNGGU_DAFTAR_ULANG' },
      });
    }

    // Notifikasi admin
    if (decision === 'TERVERIFIKASI') {
      const admins = await this.prisma.user.findMany({
        where: {
          isActive: true,
          roles: {
            some: {
              role: {
                permissions: { some: { permission: { code: 'spmb.approve' } } },
              },
            },
          },
        },
        select: { email: true },
      });
      const adminEmails = admins.map((u) => u.email);
      if (adminEmails.length) {
        await this.email
          .notifyAdminPaymentVerified(adminEmails, pay.pendaftar.registrationNumber)
          .catch((e) => this.logger.warn(`Email admin gagal: ${e?.message}`));
      }
    }

    return {
      id: updated.id,
      status: updated.status,
      verifiedAt: updated.verifiedAt,
    };
  }

  async listForTu(opts: {
    status?: StatusPembayaran;
    search?: string;
    page?: number;
    pageSize?: number;
  }) {
    const page = Math.max(1, opts.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, opts.pageSize ?? 20));

    // ----- Query 1: pembayaran records (normal alur) -----
    const where: Prisma.PembayaranWhereInput = {
      pendaftar: { status: { in: ['MENUNGGU_VERIFIKASI_PEMBAYARAN', 'LOLOS_MENUNGGU_DAFTAR_ULANG'] } },
    };
    if (opts.status) where.status = opts.status;
    if (opts.search) {
      where.OR = [
        { pendaftar: { registrationNumber: { contains: opts.search, mode: 'insensitive' } } },
        { pendaftar: { namaLengkap: { contains: opts.search, mode: 'insensitive' } } },
        { namaPengirim: { contains: opts.search, mode: 'insensitive' } },
      ];
    }

    const payments = await this.prisma.pembayaran.findMany({
      where,
      include: {
        pendaftar: {
          select: {
            id: true,
            registrationNumber: true,
            namaLengkap: true,
            nisn: true,
            status: true,
            jurusan: { select: { code: true, name: true } },
          },
        },
        verifiedBy: { select: { name: true, email: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    // ----- Query 2: orphan pendaftar (data anomaly) -----
    // Pendaftar berstatus MENUNGGU_VERIFIKASI_PEMBAYARAN tapi TIDAK punya
    // record pembayaran. Ini bisa terjadi karena bug atau alur yang
    // terputus. Tampilkan di menu TU dengan flag agar bisa ditindaklanjuti.
    const orphanPendaftars = await this.prisma.pendaftar.findMany({
      where: {
        status: 'MENUNGGU_VERIFIKASI_PEMBAYARAN',
        pembayaran: null,
        ...(opts.search
          ? {
              OR: [
                { registrationNumber: { contains: opts.search, mode: 'insensitive' } },
                { namaLengkap: { contains: opts.search, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      include: {
        jurusan: { select: { code: true, name: true } },
      },
      orderBy: { updatedAt: 'desc' },
    });

    // ----- Gabung: pembayaran (proper) + pendaftar orphan -----
    type Combined = {
      id: string;
      kind: 'PAYMENT' | 'ORPHAN';
      pendaftar: any;
      nominal: string;
      tanggalTransfer: Date | null;
      namaPengirim: string;
      catatan: string | null;
      status: string;
      note: string | null;
      verifiedBy: any;
      verifiedAt: Date | null;
      createdAt: Date;
      warning?: string;
    };

    const combined: Combined[] = [
      ...payments.map((p) => ({
        id: p.id,
        kind: 'PAYMENT' as const,
        pendaftar: p.pendaftar,
        nominal: p.nominal.toString(),
        tanggalTransfer: p.tanggalTransfer,
        namaPengirim: p.namaPengirim,
        catatan: p.catatan,
        status: p.status,
        note: p.note,
        verifiedBy: p.verifiedBy,
        verifiedAt: p.verifiedAt,
        createdAt: p.createdAt,
      })),
      ...orphanPendaftars.map((p) => ({
        id: `pendaftar:${p.id}`,
        kind: 'ORPHAN' as const,
        pendaftar: {
          id: p.id,
          registrationNumber: p.registrationNumber,
          namaLengkap: p.namaLengkap,
          nisn: p.nisn,
          status: p.status,
          jurusan: p.jurusan,
        },
        nominal: '0',
        tanggalTransfer: null,
        namaPengirim: '—',
        catatan: null,
        status: 'MENUNGGU_VERIFIKASI',
        note: null,
        verifiedBy: null,
        verifiedAt: null,
        createdAt: p.updatedAt,
        warning:
          'Status pendaftar sudah menunggu verifikasi pembayaran tapi record ' +
          'data transfer tidak ditemukan di database. Minta siswa input ulang ' +
          'data pembayaran di halaman cek-status.',
      })),
    ];

    // Sort: PAYMENT (older first) → ORPHAN, lalu createdAt asc
    combined.sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === 'PAYMENT' ? -1 : 1;
      return a.createdAt.getTime() - b.createdAt.getTime();
    });

    const total = combined.length;
    const start = (page - 1) * pageSize;
    const items = combined.slice(start, start + pageSize);

    return {
      items,
      total,
      page,
      pageSize,
    };
  }
}
