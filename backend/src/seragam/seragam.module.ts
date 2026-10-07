import { Module } from '@nestjs/common';
import { SeragamController } from './seragam.controller';
import { SeragamService } from './seragam.service';
import { PdfModule } from '../pdf/pdf.module';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { SettingsModule } from '../settings/settings.module';
import { PendaftarModule } from '../pendaftar/pendaftar.module';

/**
 * Seragam Checklist module — Batch D.
 *
 * Fitur: Formulir Pengambilan Seragam Siswa Baru (mirip form fisik sekolah)
 * dengan master item seragam yang dikelola Superadmin dan checklist per-siswa
 * yang diinput TU (atau admin sebagai fallback).
 *
 * Dependency chain (one-way — tidak ada circular):
 *   SeragamModule → PendaftarModule (butuh afterPartialSubmit untuk status recompute)
 *   PendaftarModule tidak butuh SeragamModule → tidak perlu forwardRef.
 *
 * Modul ini depend pada:
 *   - PdfModule      — generateFormulirSeragam() reuses kopSuratPath internal.
 *   - AuditLogModule — tulis audit log setiap perubahan master/checklist.
 *   - SettingsModule — validasi Ukuran Baju vs Settings.ukuran_baju_options.
 *   - PendaftarModule — recompute status pendaftar setelah submit checklist
 *                        via `afterPartialSubmit()`.
 */
@Module({
  imports: [
    PdfModule,
    AuditLogModule,
    SettingsModule,
    PendaftarModule,
  ],
  controllers: [SeragamController],
  providers: [SeragamService],
  exports: [SeragamService],
})
export class SeragamModule {}
