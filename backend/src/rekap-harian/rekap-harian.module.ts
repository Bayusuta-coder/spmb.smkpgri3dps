import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { RekapHarianService } from './rekap-harian.service';
import { RekapHarianController } from './rekap-harian.controller';
import { RekapHarianScheduler } from './rekap-harian.scheduler';
import { FonnteModule } from '../fonnte/fonnte.module';
import { WhatsappModule } from '../whatsapp/whatsapp.module';
import { AuditLogModule } from '../audit-log/audit-log.module';

/**
 * RekapHarianModule — module untuk notifikasi rekap harian via Fonnte.
 *
 * Dependencies:
 *   - FonnteModule   : provider Fonnte (independent dari OTP WA)
 *   - WhatsappModule : baca setting DB via WhatsappService.getSetting() —
 *                      HANYA untuk method getSetting, TIDAK reuse provider
 *                      WA Meta apapun. WhatsappService di-import supaya
 *                      tidak duplikasi logic baca setting.
 *   - AuditLogModule : tulis audit log per delivery
 *   - ScheduleModule : cron job scheduler
 */
@Module({
  imports: [
    ScheduleModule.forRoot(),
    FonnteModule,
    WhatsappModule,
    AuditLogModule,
  ],
  controllers: [RekapHarianController],
  providers: [RekapHarianService, RekapHarianScheduler],
  exports: [RekapHarianService],
})
export class RekapHarianModule {}
