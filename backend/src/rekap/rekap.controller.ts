import { Controller, Get, Query, Res } from '@nestjs/common';
import { Response } from 'express';
import { Permissions } from '../common/decorators/permissions.decorator';
import { RekapService, RekapFilter } from './rekap.service';

@Controller('rekap')
export class RekapController {
  constructor(private readonly service: RekapService) {}

  /**
   * GET /rekap/pendapatan
   * Query: startDate (YYYY-MM-DD), endDate (YYYY-MM-DD), gelombangId, metode (CASH|TRANSFER)
   * Permission: spmb.bayar (Bendahara + Superadmin/Admin yang sudah punya perm ini).
   *
   * Response:
   *   - summary: { totalPendapatan, totalCash, totalTransfer, jumlahTransaksi }
   *   - perGelombang: [{ gelombangId, name, total, count, cashTotal, transferTotal }]
   *   - transactions: [{ id, registrationNumber, namaLengkap, nominal, metode, tanggalBayar, gelombang, dibayarOleh }]
   */
  @Get('pendapatan')
  @Permissions('spmb.bayar')
  getPendapatan(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('gelombangId') gelombangId?: string,
    @Query('metode') metode?: 'CASH' | 'TRANSFER',
  ) {
    return this.service.getPendapatan({ startDate, endDate, gelombangId, metode });
  }

  /**
   * GET /rekap/pendapatan.xlsx
   * Same query params as above. Returns multi-sheet Excel workbook:
   *   1. Ringkasan
   *   2. Per Gelombang
   *   3. Transaksi
   */
  @Get('pendapatan.xlsx')
  @Permissions('spmb.bayar')
  async exportPendapatan(
    @Res() res: Response,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('gelombangId') gelombangId?: string,
    @Query('metode') metode?: 'CASH' | 'TRANSFER',
  ) {
    const filter: RekapFilter = { startDate, endDate, gelombangId, metode };
    const buf = await this.service.exportPendapatanExcel(filter);
    const stamp = new Date().toISOString().slice(0, 10);
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="rekap-pendapatan-${stamp}.xlsx"`,
    );
    res.setHeader('Content-Length', buf.length);
    res.send(buf);
  }
}
