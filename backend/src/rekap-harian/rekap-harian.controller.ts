import {
  Body,
  Controller,
  Get,
  Optional,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { Permissions } from '../common/decorators/permissions.decorator';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import {
  CurrentUser,
  JwtUserPayload,
} from '../common/decorators/current-user.decorator';
import { RekapHarianService } from './rekap-harian.service';
import { FonnteService } from '../fonnte/fonnte.service';

class ManualTriggerDto {
  /** ISO date "YYYY-MM-DD" — kalau kosong, pakai hari ini */
  date?: string;
}

@Controller('rekap-harian')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class RekapHarianController {
  constructor(
    private readonly svc: RekapHarianService,
    private readonly fonnte: FonnteService,
  ) {}

  /**
   * Health/status Fonnte provider — tanpa expose token. Dipakai UI untuk
   * enable/disable tombol "Kirim Sekarang".
   */
  @Get('fonnte/status')
  @Permissions('settings.view')
  fonnteStatus() {
    return {
      provider: this.fonnte.getProviderName(),
      configured: this.fonnte.isReady(),
    };
  }

  /**
   * Preview ringkasan rekap harian TANPA kirim ke channel manapun.
   * Untuk UI admin melihat ringkasan sebelum trigger manual.
   */
  @Get('preview')
  @Permissions('settings.view')
  async preview(@Query('date') date?: string) {
    const tz = 'Asia/Makassar';
    let window;
    if (date) {
      const ymd = date.split('-').map(Number);
      if (ymd.length !== 3 || ymd.some(isNaN)) {
        return { error: 'Format date harus YYYY-MM-DD' };
      }
      const refDate = new Date(Date.UTC(ymd[0], ymd[1] - 1, ymd[2], 12));
      window = RekapHarianService.computeTodayWindow(tz, refDate);
    } else {
      window = RekapHarianService.computeTodayWindow(tz);
    }
    return this.svc.buildReport(window);
  }

  /**
   * Trigger manual rekap harian via Fonnte. Hanya Superadmin/Admin.
   * Tidak perlu field date (generate untuk hari ini by default).
   */
  @Post('trigger')
  @Permissions('settings.manage')
  async trigger(
    @Body() @Optional() _body: ManualTriggerDto | undefined,
    @CurrentUser() user: JwtUserPayload,
  ) {
    const result = await this.svc.generateAndDeliver({
      trigger: 'manual',
      actorUserId: user.sub,
    });
    return result;
  }
}
