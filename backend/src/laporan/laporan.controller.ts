import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { Permissions } from '../common/decorators/permissions.decorator';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { CurrentUser, JwtUserPayload } from '../common/decorators/current-user.decorator';
import { LaporanService } from './laporan.service';

class ManualTriggerDto {
  /** ISO date "YYYY-MM-DD" — kalau kosong, pakai hari ini */
  date?: string;
}

@Controller('laporan')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class LaporanController {
  constructor(private readonly svc: LaporanService) {}

  /**
   * Preview ringkasan laporan TANPA kirim ke channel manapun. Untuk UI
   * admin melihat ringkasan sebelum trigger manual.
   */
  @Get('preview')
  @Permissions('settings.view')
  async preview(@Query('date') date?: string) {
    let window;
    if (date) {
      // Pakai window kustom (full day) — timezone default Asia/Makassar
      const tz = 'Asia/Makassar';
      const ymd = date.split('-').map(Number);
      if (ymd.length !== 3 || ymd.some(isNaN)) {
        return { error: 'Format date harus YYYY-MM-DD' };
      }
      // Hitung window pakai util yang sama
      const refDate = new Date(Date.UTC(ymd[0], ymd[1] - 1, ymd[2], 12));
      window = LaporanService.computeTodayWindow(tz, refDate);
    } else {
      window = LaporanService.computeTodayWindow();
    }
    const data = await this.svc.buildReport(window);
    return data;
  }

  /**
   * Trigger manual laporan (kirim ke email + WhatsApp sesuai setting).
   * Hanya Superadmin / Admin.
   */
  @Post('trigger')
  @Permissions('settings.manage')
  async trigger(
    @Body() body: ManualTriggerDto | undefined,
    @CurrentUser() user: JwtUserPayload,
  ) {
    const result = await this.svc.generateAndDeliver({
      trigger: 'manual',
      actorUserId: user.sub,
    });
    return result;
  }
}