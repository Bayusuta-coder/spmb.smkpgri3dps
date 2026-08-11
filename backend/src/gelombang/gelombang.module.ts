import { Module } from '@nestjs/common';
import { GelombangController } from './gelombang.controller';
import { GelombangService } from './gelombang.service';
import { AuditLogModule } from '../audit-log/audit-log.module';

@Module({
  imports: [AuditLogModule],
  controllers: [GelombangController],
  providers: [GelombangService],
  exports: [GelombangService],
})
export class GelombangModule {}
