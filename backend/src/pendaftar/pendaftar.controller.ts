import {
  Body,
  Controller,
  Get,
  Param,
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
  Min,
} from 'class-validator';
import { PendaftarService } from './pendaftar.service';
import { Public } from '../common/decorators/public.decorator';
import { Permissions } from '../common/decorators/permissions.decorator';
import { CurrentUser, JwtUserPayload } from '../common/decorators/current-user.decorator';
import { StatusPendaftar } from '@prisma/client';
import { promises as fs } from 'fs';

class RegisterPendaftarDto {
  @IsString() @IsNotEmpty() namaLengkap!: string;
  @IsEnum(['L', 'P']) jenisKelamin!: 'L' | 'P';
  @IsString() @IsNotEmpty() tempatLahir!: string;
  @IsDateString() tanggalLahir!: string;
  @IsString() @Length(10, 10) nisn!: string;
  @IsString() @IsNotEmpty() sekolahAsal!: string;
  @IsString() @IsNotEmpty() alamat!: string;
  @IsString() @IsNotEmpty() noTelp!: string;
  @IsOptional() @IsEmail() email?: string;
  @IsNumber() @Min(0) jumlahNilaiUn!: number;
  @IsOptional() @IsString() prestasi?: string;
  @IsString() @IsNotEmpty() namaIbu!: string;
  @IsString() @IsNotEmpty() noTelpOrtu!: string;
  @IsString() @IsNotEmpty() jurusanId!: string;
  @IsString() @IsNotEmpty() gelombangId!: string;
}

class VerifyDto {
  @IsEnum(['APPROVE', 'REJECT']) decision!: 'APPROVE' | 'REJECT';
  @IsOptional() @IsString() note?: string;
}

class ScanDaftarUlangDto {
  @IsString() @IsNotEmpty() signature!: string;
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

  @Get(':id')
  @Permissions('spmb.view')
  detail(@Param('id') id: string) {
    return this.service.getDetail(id);
  }

  @Post(':id/verify')
  @Permissions('spmb.verify_berkas', 'spmb.reject')
  verify(
    @Param('id') id: string,
    @Body() dto: VerifyDto,
    @CurrentUser() user: JwtUserPayload,
  ) {
    return this.service.verify(id, user.sub, dto.decision, dto.note);
  }

  @Post(':id/approve-final')
  @Permissions('spmb.approve')
  approveFinal(@Param('id') id: string, @CurrentUser() user: JwtUserPayload) {
    return this.service.approveFinal(id, user.sub);
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
}
