import { Module } from '@nestjs/common';
import { PendaftarController } from './pendaftar.controller';
import { PendaftarService } from './pendaftar.service';
import { PdfModule } from '../pdf/pdf.module';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { SettingsModule } from '../settings/settings.module';

@Module({
  imports: [PdfModule, AuditLogModule, SettingsModule],
  controllers: [PendaftarController],
  providers: [PendaftarService],
  exports: [PendaftarService],
})
export class PendaftarModule {}
