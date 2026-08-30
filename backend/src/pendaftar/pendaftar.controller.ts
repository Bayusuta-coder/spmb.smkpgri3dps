import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  IsDateString,
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
} from 'class-validator';
import { PendaftarService } from './pendaftar.service';
import { Public } from '../common/decorators/public.decorator';
import { Permissions } from '../common/decorators/permissions.decorator';
import { CurrentUser, JwtUserPayload } from '../common/decorators/current-user.decorator';
import { StatusPendaftar, Agama } from '@prisma/client';
import { promises as fs } from 'fs';

class RegisterPendaftarDto {
  @IsString() @IsNotEmpty() namaLengkap!: string;
  @IsEnum(['L', 'P']) jenisKelamin!: 'L' | 'P';
  @IsString() @IsNotEmpty() tempatLahir!: string;
  @IsDateString() tanggalLahir!: string;
  // NISN OPSIONAL — banyak calon pendaftar (terutama yang dari sekolah
  // non-formal / homeschooling / pindahan) belum punya NISN saat mendaftar.
  // Kalau diisi, WAJIB 10 digit angka. Kalau kosong, tetap diterima dan
  // dicek duplikasinya hanya jika ada nilai.
  @IsOptional() @IsString() @Length(10, 10) nisn?: string;
  @IsString() @IsNotEmpty() sekolahAsal!: string;
  @IsString() @IsNotEmpty() alamat!: string;
  @IsString() @IsNotEmpty() noTelp!: string;
  @IsOptional() @IsEmail() email?: string;
  // Nilai UN OPSIONAL — banyak pendaftar (homeschooling / pindahan / sekolah
  // tanpa UN) belum punya nilai UN saat mendaftar. Kalau diisi, WAJIB 0-100.
  // Kalau kosong, tetap diterima dan disimpan sebagai null di DB.
  @IsOptional() @IsNumber() @Min(0) @Max(100) jumlahNilaiUn?: number;
  @IsOptional() @IsString() prestasi?: string;
  @IsString() @IsNotEmpty() namaIbu!: string;
  @IsString() @IsNotEmpty() noTelpOrtu!: string;
  @IsEnum(Agama, { message: 'Agama wajib diisi' }) agama!: Agama;
  @IsString() @IsNotEmpty() jurusanId!: string;
  @IsString() @IsNotEmpty() gelombangId!: string;
}

class VerifyDto {
  @IsEnum(['APPROVE', 'REJECT']) decision!: 'APPROVE' | 'REJECT';
  @IsOptional() @IsString() note?: string;
  /**
   * @deprecated Tidak dipakai lagi. Ukuran baju sekarang diinput TU via
   * endpoint `POST /pendaftar/:id/ukuran-baju` terpisah. Field ini di-keep
   * supaya client lama (yg masih kirim body ini) tidak crash — service akan
   * ignore value-nya.
   */
  @IsOptional() @IsString() ukuranBaju?: string;
}

/**
 * Body untuk `POST /pendaftar/:id/pembayaran` (Bendahara).
 * `nominal` di-snapshot otomatis dari Settings.harga_daftar_ulang di service
 * — tidak perlu dikirim dari client (mencegah mismatch antara nominal di
 * struk vs nominal di PDF setelah superadmin ganti harga global).
 */
class SubmitPembayaranDto {
  @IsEnum(['CASH', 'TRANSFER'], { message: 'Metode pembayaran wajib diisi (CASH/TRANSFER)' })
  metode!: 'CASH' | 'TRANSFER';
}

/** Body untuk `POST /pendaftar/:id/ukuran-baju` (TU). */
class SubmitUkuranBajuDto {
  @IsString() @IsNotEmpty({ message: 'Ukuran baju wajib diisi' })
  ukuranBaju!: string;
}

class ScanDaftarUlangDto {
  @IsString() @IsNotEmpty() signature!: string;
}

/**
 * Body untuk `PATCH /pendaftar/:id` (admin edit).
 * Partial update — semua field opsional; hanya field yang dikirim yang di-update.
 */
class UpdatePendaftarDto {
  @IsOptional() @IsString() @IsNotEmpty() namaLengkap?: string;
  @IsOptional() @IsEnum(['L', 'P']) jenisKelamin?: 'L' | 'P';
  @IsOptional() @IsString() @IsNotEmpty() tempatLahir?: string;
  @IsOptional() @IsDateString() tanggalLahir?: string;
  @IsOptional() @IsString() @Length(10, 10) nisn?: string;
  @IsOptional() @IsString() @IsNotEmpty() sekolahAsal?: string;
  @IsOptional() @IsString() @IsNotEmpty() alamat?: string;
  @IsOptional() @IsString() @IsNotEmpty() noTelp?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsNumber() @Min(0) @Max(100) jumlahNilaiUn?: number;
  @IsOptional() @IsString() prestasi?: string;
  @IsOptional() @IsString() @IsNotEmpty() namaIbu?: string;
  @IsOptional() @IsString() @IsNotEmpty() noTelpOrtu?: string;
  @IsOptional() @IsEnum(Agama) agama?: Agama;
  @IsOptional() @IsString() @IsNotEmpty() jurusanId?: string;
  @IsOptional() @IsString() @IsNotEmpty() gelombangId?: string;
}

@Controller('pendaftar')
export class PendaftarController {
  constructor(private readonly service: PendaftarService) {}

  // ---- PUBLIC ------------------------------------------------------------

  @Public()
  @Post('register')
  register(@Body() dto: RegisterPendaftarDto) {
    return this.service.register(dto);
  }

  @Public()
  @Get('check/:registrationNumber')
  checkStatus(@Param('registrationNumber') reg: string) {
    return this.service.checkStatus(reg);
  }

  /**
   * Halaman verifikasi publik — untuk halaman QR.
   * Hanya menampilkan info ringkas (nama, status, jadwal & lokasi daftar ulang)
   * dan tetap butuh signature token agar tidak bisa di-enumerate.
   */
  @Public()
  @Get('verify/:registrationNumber')
  verifyInfo(
    @Param('registrationNumber') reg: string,
    @Query('token') token: string,
  ) {
    return this.service.verifyInfo(reg, token);
  }

  /**
   * Download PDF bukti pendaftaran ulang (publik, tapi signature-based).
   * Frontend cukup pakai URL yang dikembalikan oleh checkStatus.
   */
  @Public()
  @Get('check/:registrationNumber/download-pdf')
  async downloadPdf(
    @Param('registrationNumber') reg: string,
    @Query('s') signature: string,
    @Res() res: Response,
  ) {
    const file = await this.service.downloadPdf(reg, signature);
    // Stream file ke response
    const stat = await fs.stat(file.absolutePath).catch(() => null);
    if (!stat) {
      return res.status(404).json({ message: 'File PDF tidak ditemukan di storage' });
    }
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${file.filename}"`,
    );
    res.setHeader('Content-Length', stat.size.toString());
    const stream = require('fs').createReadStream(file.absolutePath);
    stream.pipe(res);
  }

  // ---- ADMIN -------------------------------------------------------------

  @Get()
  @Permissions('spmb.view')
  list(
    @Query('status') status?: string,
    @Query('gelombangId') gelombangId?: string,
    @Query('jurusanId') jurusanId?: string,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.service.listForAdmin({
      status: status as StatusPendaftar | undefined,
      gelombangId,
      jurusanId,
      search,
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    });
  }

  /**
   * CREATE admin: tambah pendaftar manual (input offline / data dummy).
   * Permission `spmb.create` (role Admin & Superadmin).
   */
  @Post()
  @Permissions('spmb.create')
  createAdmin(
    @Body() dto: RegisterPendaftarDto,
    @CurrentUser() user: JwtUserPayload,
  ) {
    return this.service.create(dto, user.sub);
  }

  @Get(':id')
  @Permissions('spmb.view')
  detail(@Param('id') id: string) {
    return this.service.getDetail(id);
  }

  /**
   * UPDATE: edit data pendaftar. Partial update.
   * Permission `spmb.update` (role Admin & Superadmin).
   * Audit log `pendaftar.updated` dengan diff before/after.
   */
  @Patch(':id')
  @Permissions('spmb.update')
  update(
    @Param('id') id: string,
    @Body() dto: UpdatePendaftarDto,
    @CurrentUser() user: JwtUserPayload,
  ) {
    return this.service.update(id, dto, user.sub);
  }

  /**
   * DELETE: hapus pendaftar (hard delete + hapus PDF di storage).
   * Permission `spmb.delete` (role Admin & Superadmin).
   * Audit log `pendaftar.deleted` dengan snapshot lengkap untuk forensik.
   */
  @Delete(':id')
  @Permissions('spmb.delete')
  remove(
    @Param('id') id: string,
    @CurrentUser() user: JwtUserPayload,
  ) {
    return this.service.remove(id, user.sub);
  }

  /**
   * REJECT pendaftar (satu-satunya decision yang valid di endpoint ini sejak
   * Batch C). Approval satu-langkah sudah dihapus — pendaftar di-approve
   * secara desentralisasi via 2 endpoint terpisah:
   *   - `POST /:id/pembayaran`   (Bendahara)
   *   - `POST /:id/ukuran-baju`  (TU)
   *
   * Permission: `spmb.reject`. Permission `spmb.approve` lama di-keep di
   * seed supaya client lama (kalau masih pakai) tidak crash dengan 403 —
   * fallback ke `spmb.verify_berkas` (admin) supaya admin tetap bisa reject.
   */
  @Post(':id/verify')
  @Permissions('spmb.verify_berkas', 'spmb.reject')
  verify(
    @Param('id') id: string,
    @Body() dto: VerifyDto,
    @CurrentUser() user: JwtUserPayload,
  ) {
    return this.service.verify(
      id,
      user.sub,
      dto.decision,
      dto.note,
      dto.ukuranBaju,
    );
  }

  /**
   * Bendahara: catat pembayaran pendaftar. Snapshot `nominal` otomatis dari
   * Settings.harga_daftar_ulang. Status akan recompute — kalau ukuran baju
   * juga sudah terisi (siapa duluan tidak penting), auto-flip ke SISWA_AKTIF
   * + generate PDF + kirim email.
   */
  @Post(':id/pembayaran')
  @Permissions('spmb.bayar')
  submitPembayaran(
    @Param('id') id: string,
    @Body() dto: SubmitPembayaranDto,
    @CurrentUser() user: JwtUserPayload,
  ) {
    return this.service.submitPembayaran(id, user.sub, dto.metode);
  }

  /**
   * TU: input ukuran baju pendaftar. Status akan recompute — kalau pembayaran
   * juga LUNAS, auto-flip ke SISWA_AKTIF + generate PDF + kirim email.
   */
  @Post(':id/ukuran-baju')
  @Permissions('spmb.ukuran_baju')
  submitUkuranBaju(
    @Param('id') id: string,
    @Body() dto: SubmitUkuranBajuDto,
    @CurrentUser() user: JwtUserPayload,
  ) {
    return this.service.submitUkuranBaju(id, user.sub, dto.ukuranBaju);
  }

  /**
   * Scan QR saat siswa datang ke sekolah untuk daftar ulang fisik.
   * Body berisi signature yang di-decode dari QR code.
   */
  @Post(':id/scan-daftar-ulang')
  @Permissions('spmb.scan_daftar_ulang')
  scanDaftarUlang(
    @Param('id') id: string,
    @Body() dto: ScanDaftarUlangDto,
    @CurrentUser() user: JwtUserPayload,
  ) {
    return this.service.scanDaftarUlang(id, dto.signature, user.sub);
  }

  /**
   * Admin download PDF bukti pendaftaran ulang by ID (tanpa butuh signature).
   * Query `as=attachment` → Content-Disposition: attachment (force download).
   * Default → inline (browser PDF viewer).
   */
  @Get(':id/download-pdf')
  @Permissions('spmb.view')
  async downloadPdfById(
    @Param('id') id: string,
    @Query('as') as: 'attachment' | 'inline' | undefined,
    @Res() res: Response,
  ) {
    const file = await this.service.downloadPdfById(id);
    const stat = await fs.stat(file.absolutePath).catch(() => null);
    if (!stat) {
      return res.status(404).json({ message: 'File PDF tidak ditemukan di storage' });
    }
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `${as === 'attachment' ? 'attachment' : 'inline'}; filename="${file.filename}"`,
    );
    res.setHeader('Content-Length', stat.size.toString());
    const stream = require('fs').createReadStream(file.absolutePath);
    stream.pipe(res);
  }

  /**
   * Regenerate PDF bukti pendaftaran ulang (untuk kasus generate awal gagal
   * atau file PDF hilang dari storage).
   * Hanya untuk pendaftar berstatus SISWA_AKTIF.
   */
  @Post(':id/regenerate-pdf')
  @Permissions('spmb.approve')
  regeneratePdf(
    @Param('id') id: string,
    @CurrentUser() user: JwtUserPayload,
  ) {
    return this.service.regeneratePdf(id, user.sub);
  }
}
