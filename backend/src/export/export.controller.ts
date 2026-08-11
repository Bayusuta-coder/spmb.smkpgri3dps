import { Controller, Get, Res } from '@nestjs/common';
import { Response } from 'express';
import { ExportService } from './export.service';
import { Permissions } from '../common/decorators/permissions.decorator';

@Controller('export')
export class ExportController {
  constructor(private readonly service: ExportService) {}

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
}
