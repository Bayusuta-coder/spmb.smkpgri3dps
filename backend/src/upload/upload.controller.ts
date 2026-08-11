import {
  BadRequestException,
  Controller,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { UploadService } from './upload.service';
import { Permissions } from '../common/decorators/permissions.decorator';

/**
 * Endpoint upload terpusat. Dipakai oleh modul Berita & Pengumuman.
 * Permission: berita.manage ATAU pengumuman.manage.
 *
 * Frontend flow:
 *   1. Pilih file → preview lokal
 *   2. POST /api/upload?folder=berita dengan FormData (field "file")
 *   3. Response { relativePath, url }
 *   4. Submit form create berita/pengumuman dengan field `foto` = relativePath
 */
@Controller('upload')
export class UploadController {
  constructor(private readonly upload: UploadService) {}

  @Post()
  @Permissions('berita.manage', 'pengumuman.manage')
  @UseInterceptors(FileInterceptor('file'))
  async uploadFile(
    @UploadedFile() file: any,
    @Query('folder') folder?: string,
  ) {
    if (!folder) {
      throw new BadRequestException(
        'Query parameter "folder" wajib diisi (mis. ?folder=berita).',
      );
    }
    return this.upload.save(file, folder);
  }
}
