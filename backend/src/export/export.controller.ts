import { Body, Controller, Get, Post, Res } from '@nestjs/common';
import { Response } from 'express';
import { ExportService, DaftarUlangExportRequest } from './export.service';
import { Permissions } from '../common/decorators/permissions.decorator';

@Controller('export')
export class ExportController {
  constructor(private readonly service: ExportService) {}

  /** Export sederhana siswa aktif ke Excel (1 sheet, kolom Dapodik-like). */
  @Get('siswa-aktif.xlsx')
  @Permissions('spmb.export')
  async siswaAktif(@Res() res: Response) {
    const buf = await this.service.exportSiswaAktifToXlsx();
    const filename = `siswa-aktif-${new Date().toISOString().slice(0, 10)}.xlsx`;
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buf);
  }

  /**
   * Export Excel multi-sheet untuk data daftar ulang (siswa_aktif):
   *   Sheet 1: Semua data siswa daftar ulang
   *   Sheet 2: Dikelompokkan per sekolah asal (alfabetis) + ringkasan jumlah
   *   Sheet 3: Ringkasan keseluruhan (kelas + agama counts)
   *   Sheet 4+: 1 sheet per kelas (X KL 1, X KL 2, ..., X PH 1, ...)
   *             dinamis tergantung kelas yang terbentuk
   *   Sheet N+1: 1 sheet per agama (Islam, Hindu, Kristen, ...) — sort by
   *              nama depan A→Z, skip agama tanpa siswa
   *
   * Body berisi parameter kelas per jurusan dan batas maksimal siswa dari
   * sekolah asal sama per kelas (default 3).
   */
  @Post('daftar-ulang.xlsx')
  @Permissions('export.manage')
  async daftarUlang(
    @Body() dto: DaftarUlangExportRequest,
    @Res() res: Response,
  ) {
    const buf = await this.service.exportDaftarUlangToXlsx(dto);
    const filename = `daftar-ulang-${new Date().toISOString().slice(0, 10)}.xlsx`;
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buf);
  }
}