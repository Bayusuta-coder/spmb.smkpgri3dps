import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ValidationPipe, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
import * as path from 'path';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: ['log', 'error', 'warn', 'debug'],
  });

  const config = app.get(ConfigService);
  const port = config.get<number>('BACKEND_PORT', 4000);

  // Security headers (CSP dilonggarkan di bawah, lihat blok helmet nanti)
  // app.use(helmet()); // — disabled, replaced with custom CSP below

  // CORS: hanya izinkan origin yang dideklarasikan di .env
  const userOrigin = config.get<string>('FRONTEND_USER_ORIGIN', 'http://localhost:5173');
  const adminOrigin = config.get<string>('FRONTEND_ADMIN_ORIGIN', 'http://localhost:5174');
  app.enableCors({
    origin: [userOrigin, adminOrigin],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  // Security headers — tapi CSP perlu dilonggarkan supaya frontend (origin berbeda
  // dari backend) bisa request <img src="http://backend:4000/uploads/...">.
  // Default helmet CSP mengunci img-src hanya ke 'self' + data:, yang memblokir
  // foto yang static-serve dari origin lain.
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          // Izinkan image dari origin frontend (user & admin) supaya <img>
          // cross-origin dari static-serve backend bisa render.
          imgSrc: ["'self'", 'data:', 'blob:', userOrigin, adminOrigin],
          // Izinkan style dari Tailwind/Vite (inline + http eksternal utk font)
          styleSrc: ["'self'", "'unsafe-inline'", 'https:'],
          // Frontend butuh connect ke API (XHR/fetch dari origin berbeda)
          connectSrc: ["'self'", userOrigin, adminOrigin],
          // Script self + unsafe-inline untuk Vite HMR dev mode
          scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
          fontSrc: ["'self'", 'https:', 'data:'],
        },
      },
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      crossOriginEmbedderPolicy: false,
    }),
  );

  // Static serve folder upload agar URL foto dari upload.service
  // (relativePath) bisa diakses publik via /uploads/...
  const uploadsDir = config.get<string>(
    'UPLOADS_DIR',
    path.join(process.cwd(), 'uploads', 'spmb'),
  );
  app.useStaticAssets(uploadsDir, { prefix: '/uploads' });

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // Global prefix
  app.setGlobalPrefix('api');

  // ===========================================================================
  // SWAGGER (B3) — dokumentasi interaktif di /api/docs
  // ===========================================================================
  const swaggerConfig = new DocumentBuilder()
    .setTitle('SPMB SMK PGRI 3 Denpasar API')
    .setDescription(
      'REST API untuk Sistem Penerimaan Murid Baru SMK PGRI 3 Denpasar. ' +
        'Semua endpoint di bawah /api dengan prefix global. ' +
        'Endpoint ber-decorator @Public() tidak butuh token. ' +
        'Untuk yang butuh auth: klik "Authorize" di kanan atas dan masukkan JWT.',
    )
    .setVersion('1.0.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        name: 'Authorization',
        description: 'Masukkan JWT hasil dari POST /api/auth/login',
        in: 'header',
      },
      'bearer',
    )
    .addTag('auth', 'Login, logout, password reset')
    .addTag('pendaftar', 'Pendaftaran, verifikasi, pembayaran, ukuran baju')
    .addTag('users', 'Manajemen user (Superadmin only)')
    .addTag('roles', 'Manajemen role & permission (Superadmin only)')
    .addTag('permissions', 'Katalog permission')
    .addTag('jurusan', 'Master jurusan')
    .addTag('gelombang', 'Master gelombang pendaftaran')
    .addTag('tahun-ajaran', 'Tahun ajaran & arsip')
    .addTag('berita', 'CMS berita')
    .addTag('pengumuman', 'CMS pengumuman')
    .addTag('settings', 'Pengaturan (harga daftar ulang, dll)')
    .addTag('audit-log', 'Jejak audit global')
    .addTag('statistik', 'Statistik agregat')
    .addTag('rekap', 'Rekap pendapatan Bendahara')
    .addTag('export', 'Export Excel/PDF')
    .addTag('upload', 'Upload foto/dokumen')
    .addTag('seragam', 'Master item seragam & kelengkapan pendaftar')
    .addTag('whatsapp', 'Verifikasi & notifikasi WhatsApp')
    .addTag('laporan', 'Laporan terstruktur')
    .addTag('rekap-harian', 'Rekap harian Bendahara')
    .addTag('public', 'Endpoint publik (tanpa auth)')
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document, {
    swaggerOptions: { persistAuthorization: true },
    customSiteTitle: 'SPMB SMK PGRI 3 — API Docs',
  });

  await app.listen(port);
  Logger.log(`🚀 Backend SPMB SMK PGRI 3 Denpasar running at http://localhost:${port}/api`, 'Bootstrap');
  Logger.log(`📚 Swagger UI available at http://localhost:${port}/api/docs`, 'Bootstrap');
}

bootstrap().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Fatal bootstrap error:', err);
  process.exit(1);
});
