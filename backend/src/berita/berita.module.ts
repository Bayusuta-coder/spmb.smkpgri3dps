import { Module } from '@nestjs/common';
import { BeritaController } from './berita.controller';
import { BeritaService } from './berita.service';
import { AuditLogModule } from '../audit-log/audit-log.module';

@Module({
  imports: [AuditLogModule],
  controllers: [BeritaController],
  providers: [BeritaService],
  exports: [BeritaService],
})
export class BeritaModule {}
