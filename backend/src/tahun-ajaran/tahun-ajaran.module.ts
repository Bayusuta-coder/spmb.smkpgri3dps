import { Module } from '@nestjs/common';
import { TahunAjaranController } from './tahun-ajaran.controller';
import { TahunAjaranService } from './tahun-ajaran.service';
import { AuditLogModule } from '../audit-log/audit-log.module';

@Module({
  imports: [AuditLogModule],
  controllers: [TahunAjaranController],
  providers: [TahunAjaranService],
  exports: [TahunAjaranService],
})
export class TahunAjaranModule {}