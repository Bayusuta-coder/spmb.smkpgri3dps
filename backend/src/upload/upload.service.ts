import {
  BadRequestException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { promises as fs } from 'fs';
import * as path from 'path';
import { randomBytes } from 'crypto';

/**
 * Upload service — handle foto untuk Berita & Pengumuman.
 *
 * Pakai built-in Express/Multer dari @nestjs/platform-express (sudah dependency).
 * Validasi tipe & ukuran dilakukan di sini supaya konsisten.
 * Disimpan ke ${UPLOADS_DIR}/{folder}/{cuid}.{ext}.
 */

const ALLOWED_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
]);

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB

const EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

@Injectable()
export class UploadService {
  private readonly logger = new Logger(UploadService.name);
  private readonly uploadsDir: string;

  constructor(private readonly config: ConfigService) {
    this.uploadsDir = this.config.get<string>(
      'UPLOADS_DIR',
      path.join(process.cwd(), 'uploads', 'spmb'),
    );
  }

  /**
   * Simpan file hasil upload ke folder tertentu.
   * Folder yang valid: 'berita' | 'pengumuman' (atau sub-folder lain
   * yang dikehendaki di masa depan).
   */
  async save(
    file: any | undefined,
    folder: string,
  ): Promise<{ relativePath: string; url: string }> {
    if (!file) {
      throw new BadRequestException('File tidak ditemukan di request');
    }
    if (!ALLOWED_MIME.has(file.mimetype)) {
      throw new BadRequestException(
        `Tipe file tidak didukung: ${file.mimetype}. Hanya JPEG, PNG, WebP, GIF.`,
      );
    }
    if (file.size > MAX_BYTES) {
      throw new BadRequestException(
        `Ukuran file terlalu besar: ${(file.size / 1024 / 1024).toFixed(1)} MB. Maksimal 5 MB.`,
      );
    }
    const safeFolder = folder.replace(/[^a-z0-9_-]/gi, '').toLowerCase() || 'misc';
    const ext = EXT_BY_MIME[file.mimetype];
    const name = randomBytes(8).toString('hex') + '.' + ext;
    const dir = path.join(this.uploadsDir, safeFolder);
    await fs.mkdir(dir, { recursive: true });
    const abs = path.join(dir, name);
    await fs.writeFile(abs, file.buffer);

    const relativePath = `${safeFolder}/${name}`;
    const url = `/uploads/${relativePath}`;
    this.logger.log(`Uploaded ${url} (${file.size} bytes)`);
    return { relativePath, url };
  }
}
