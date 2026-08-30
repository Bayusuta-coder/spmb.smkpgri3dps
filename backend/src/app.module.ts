import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';

import { PrismaModule } from './prisma/prisma.module';
import { EmailModule } from './email/email.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { RolesModule } from './roles/roles.module';
import { PermissionsModule } from './permissions/permissions.module';
import { JurusanModule } from './jurusan/jurusan.module';
import { GelombangModule } from './gelombang/gelombang.module';
import { PendaftarModule } from './pendaftar/pendaftar.module';
import { AuditLogModule } from './audit-log/audit-log.module';
import { StatistikModule } from './statistik/statistik.module';
import { ExportModule } from './export/export.module';
import { HealthModule } from './health/health.module';
import { UploadModule } from './upload/upload.module';
import { BeritaModule } from './berita/berita.module';
import { PengumumanModule } from './pengumuman/pengumuman.module';
import { SettingsModule } from './settings/settings.module';
import { RekapModule } from './rekap/rekap.module';
import { WhatsappModule } from './whatsapp/whatsapp.module';
import { LaporanModule } from './laporan/laporan.module';
import { FonnteModule } from './fonnte/fonnte.module';
import { RekapHarianModule } from './rekap-harian/rekap-harian.module';
import { TahunAjaranModule } from './tahun-ajaran/tahun-ajaran.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // Cari .env di beberapa lokasi: CWD (untuk Docker & script dari root),
      // folder backend (untuk `npm run dev` dari dalam folder backend),
      // dan parent folder (untuk root-level `npm run dev`).
      envFilePath: ['.env', '../.env', '../../.env'],
    }),
    // Global rate limit (bisa di-override per-endpoint dengan @Throttle)
    ThrottlerModule.forRoot([
      { name: 'short', ttl: 1000, limit: 10 },
      { name: 'long',  ttl: 60_000, limit: 100 },
    ]),
    PrismaModule,
    EmailModule,
    AuthModule,
    UsersModule,
    RolesModule,
    PermissionsModule,
    JurusanModule,
    GelombangModule,
    PendaftarModule,
    AuditLogModule,
    StatistikModule,
    ExportModule,
    HealthModule,
    UploadModule,
    BeritaModule,
    PengumumanModule,
    RekapModule,
    WhatsappModule,
    LaporanModule,
    FonnteModule,
    RekapHarianModule,
    TahunAjaranModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
