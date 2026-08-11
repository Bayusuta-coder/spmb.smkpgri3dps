import { Module } from '@nestjs/common';
import { JurusanController } from './jurusan.controller';
import { JurusanService } from './jurusan.service';
import { AuditLogModule } from '../audit-log/audit-log.module';

@Module({
  imports: [AuditLogModule],
  controllers: [JurusanController],
  providers: [JurusanService],
  exports: [JurusanService],
})
export class JurusanModule {}
