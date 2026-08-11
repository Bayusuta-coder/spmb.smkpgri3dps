import { Module } from '@nestjs/common';
import { PengumumanController } from './pengumuman.controller';
import { PengumumanService } from './pengumuman.service';
import { AuditLogModule } from '../audit-log/audit-log.module';

@Module({
  imports: [AuditLogModule],
  controllers: [PengumumanController],
  providers: [PengumumanService],
  exports: [PengumumanService],
})
export class PengumumanModule {}
