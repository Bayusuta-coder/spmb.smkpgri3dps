import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { LaporanService } from './laporan.service';
import { LaporanController } from './laporan.controller';
import { LaporanScheduler } from './laporan.scheduler';
import { EmailModule } from '../email/email.module';
import { WhatsappModule } from '../whatsapp/whatsapp.module';
import { AuditLogModule } from '../audit-log/audit-log.module';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    EmailModule,
    WhatsappModule,
    AuditLogModule,
  ],
  controllers: [LaporanController],
  providers: [LaporanService, LaporanScheduler],
  exports: [LaporanService],
})
export class LaporanModule {}