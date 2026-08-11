import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ValidationPipe, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
import * as path from 'path';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: ['log', 'error', 'warn', 'debug'],
  });

  const config = app.get(ConfigService);
  const port = config.get<number>('BACKEND_PORT', 4000);

  // Security headers
  app.use(helmet());

  // CORS: hanya izinkan origin yang dideklarasikan di .env
  const userOrigin = config.get<string>('FRONTEND_USER_ORIGIN', 'http://localhost:5173');
  const adminOrigin = config.get<string>('FRONTEND_ADMIN_ORIGIN', 'http://localhost:5174');
  app.enableCors({
    origin: [userOrigin, adminOrigin],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

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

  await app.listen(port);
  Logger.log(`🚀 Backend SPMB SMK PGRI 3 Denpasar running at http://localhost:${port}/api`, 'Bootstrap');
}

bootstrap().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Fatal bootstrap error:', err);
  process.exit(1);
});
