import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiBearerAuth, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { SeragamService } from './seragam.service';
import { Permissions } from '../common/decorators/permissions.decorator';
import { CurrentUser, JwtUserPayload } from '../common/decorators/current-user.decorator';
import { promises as fs } from 'fs';

/**
 * =====================================================================
 * SERAGAM CONTROLLER — REST endpoints untuk fitur Formulir Pengambilan
 * Seragam Siswa Baru.
 *
 * Endpoints:
 *   GET    /seragam/items                      → list master item (any role yg punya spmb.checklist_seragam.view)
 *   POST   /seragam/items                      → tambah master item (Superadmin: spmb.seragam_item.manage)
 *   PATCH  /seragam/items/:id                  → edit master item (Superadmin)
 *   DELETE /seragam/items/:id                  → hapus master item (Superadmin) — ditolak kalau sudah dipakai
 *
 *   GET    /seragam/checklist/:pendaftarId     → get checklist per siswa (spmb.checklist_seragam.view)
 *   POST   /seragam/checklist/:pendaftarId     → submit/update checklist (spmb.checklist_seragam.manage)
 *   GET    /seragam/checklist/:pendaftarId/pdf → download PDF formulir (spmb.checklist_seragam.view)
 *
 * Permission gating dilakukan oleh `@Permissions()` decorator + global
 * PermissionsGuard (lihat app.module.ts).
 */

class ChecklistItemDto {
  @ApiProperty({ type: String, description: 'ID master item seragam yang dicentang' })
  @IsString() @IsNotEmpty() itemMasterId!: string;
  @ApiProperty({ type: Boolean, description: 'Apakah item sudah didapat siswa' })
  @IsBoolean() sudahDidapat!: boolean;
  @ApiPropertyOptional({ type: String, nullable: true, description: 'Keterangan/catatan per item (opsional)' })
  @IsOptional() @IsString() keterangan?: string | null;
}

class SubmitChecklistDto {
  @ApiProperty({ type: String, description: 'Ukuran seragam siswa (mis. S, M, L, XL)' })
  @IsString() @IsNotEmpty() ukuran!: string;
  @ApiProperty({ type: String, description: 'Tanggal pengambilan seragam (ISO date string)' })
  @IsDateString() tanggalPengambilan!: string;
  @ApiPropertyOptional({ type: String, nullable: true, description: 'Nama penerima seragam (opsional)' })
  @IsOptional() @IsString() penerimaNama?: string | null;
  @ApiProperty({ type: [ChecklistItemDto], description: 'Daftar item seragam yang dicentang' })
  @IsArray() @ValidateNested({ each: true }) @Type(() => ChecklistItemDto)
  items!: ChecklistItemDto[];
  /**
   * Alasan perubahan — WAJIB diisi untuk re-edit checklist seragam setelah
   * pendaftar berstatus SISWA_AKTIF (Opsi A). Untuk submit pertama,
   * field ini opsional. Disimpan ke audit log untuk forensik.
   */
  @ApiPropertyOptional({ type: String, description: 'Alasan perubahan (WAJIB untuk re-edit setelah SISWA_AKTIF)' })
  @IsOptional() @IsString() @IsNotEmpty()
  reason?: string;
}

class CreateItemDto {
  @ApiProperty({ type: String, description: 'Nama item seragam (mis. "Baju Seragam Putih")' })
  @IsString() @IsNotEmpty() nama!: string;
  @ApiPropertyOptional({ type: Number, description: 'Urutan tampil item (opsional)' })
  @IsOptional() urutan?: number;
  @ApiPropertyOptional({ type: Boolean, description: 'Apakah item aktif (default true)' })
  @IsOptional() isActive?: boolean;
}

class UpdateItemDto {
  @ApiPropertyOptional({ type: String, description: 'Nama item seragam' })
  @IsOptional() @IsString() @IsNotEmpty() nama?: string;
  @ApiPropertyOptional({ type: Number, description: 'Urutan tampil item' })
  @IsOptional() urutan?: number;
  @ApiPropertyOptional({ type: Boolean, description: 'Apakah item aktif' })
  @IsOptional() isActive?: boolean;
}

@ApiTags('Seragam')
@ApiBearerAuth('bearer')
@Controller('seragam')
export class SeragamController {
  constructor(private readonly service: SeragamService) {}

  // ==== MASTER ITEM ====================================================

  /**
   * GET /seragam/items?includeInactive=true
   * List item seragam, urut by urutan ASC.
   * `includeInactive=true` → sertakan item non-aktif (default: hanya aktif).
   */
  @Get('items')
  @Permissions('spmb.checklist_seragam.view', 'spmb.seragam_item.manage')
  async listItems(@Query('includeInactive') includeInactive?: string) {
    return this.service.listItems({ includeInactive: includeInactive === 'true' });
  }

  /**
   * POST /seragam/items
   * Tambah item baru. Body: { nama, urutan?, isActive? }.
   * Restricted: Superadmin only (spmb.seragam_item.manage).
   */
  @Post('items')
  @Permissions('spmb.seragam_item.manage')
  async createItem(
    @CurrentUser() user: JwtUserPayload,
    @Body() dto: CreateItemDto,
  ) {
    return this.service.createItem(dto, {
      userId: user.sub,
      userName: user.name,
      userEmail: user.email,
    });
  }

  /**
   * PATCH /seragam/items/:id
   * Edit item. Partial update.
   */
  @Patch('items/:id')
  @Permissions('spmb.seragam_item.manage')
  async updateItem(
    @CurrentUser() user: JwtUserPayload,
    @Param('id') id: string,
    @Body() dto: UpdateItemDto,
  ) {
    return this.service.updateItem(
      id,
      dto,
      {
        userId: user.sub,
        userName: user.name,
        userEmail: user.email,
      },
    );
  }

  /**
   * DELETE /seragam/items/:id
   * Hapus item. Service akan tolak kalau item sudah pernah dipakai di
   * checklist manapun — admin harus pakai PATCH isActive=false untuk
   * soft disable supaya histori PDF tetap valid.
   */
  @Delete('items/:id')
  @Permissions('spmb.seragam_item.manage')
  async deleteItem(
    @CurrentUser() user: JwtUserPayload,
    @Param('id') id: string,
  ) {
    return this.service.deleteItem(id, {
      userId: user.sub,
      userName: user.name,
      userEmail: user.email,
    });
  }

  // ==== CHECKLIST PER SISWA ============================================

  /**
   * GET /seragam/checklist/:pendaftarId
   * Ambil checklist + items + data siswa + available item masters
   * untuk render form.
   */
  @Get('checklist/:pendaftarId')
  @Permissions('spmb.checklist_seragam.view', 'spmb.seragam_item.manage')
  async getChecklist(@Param('pendaftarId') pendaftarId: string) {
    return this.service.getChecklistForPendaftar(pendaftarId);
  }

  /**
   * POST /seragam/checklist/:pendaftarId
   * Submit/update checklist. Idempotent. TU/admin/Superadmin.
   *
   * Body:
   *   {
   *     ukuran: 'M',
   *     tanggalPengambilan: '2026-09-05',
   *     penerimaNama?: 'Budi Santoso',
   *     items: [{ itemMasterId, sudahDidapat, keterangan? }, ...]
   *   }
   *
   * Response: status + statusLabel pendaftar setelah recompute.
   */
  @Post('checklist/:pendaftarId')
  @Permissions('spmb.checklist_seragam.manage')
  async submitChecklist(
    @CurrentUser() user: JwtUserPayload,
    @Param('pendaftarId') pendaftarId: string,
    @Body() dto: SubmitChecklistDto,
  ) {
    if (!user?.sub) {
      throw new BadRequestException('User tidak terautentikasi');
    }
    return this.service.submitChecklist(
      pendaftarId,
      { userId: user.sub, userName: user.name, userEmail: user.email },
      dto,
    );
  }

  /**
   * GET /seragam/checklist/:pendaftarId/pdf?as=inline|attachment
   * Download PDF Formulir Pengambilan Seragam.
   *
   * Query `as=attachment` → force download. Default inline (browser PDF viewer).
   */
  @Get('checklist/:pendaftarId/pdf')
  @Permissions('spmb.checklist_seragam.view', 'spmb.seragam_item.manage')
  async downloadPdf(
    @Param('pendaftarId') pendaftarId: string,
    @Query('as') asMode: 'attachment' | 'inline' | undefined,
    @Res() res: Response,
  ) {
    const file = await this.service.generateFormulirPdf(pendaftarId);

    const stat = await fs.stat(file.absolutePath).catch(() => null);
    if (!stat) {
      return res.status(404).json({ message: 'File PDF tidak ditemukan di storage' });
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `${asMode === 'attachment' ? 'attachment' : 'inline'}; filename="${file.filename}"`,
    );
    res.setHeader('Content-Length', stat.size.toString());
    const stream = require('fs').createReadStream(file.absolutePath);
    stream.pipe(res);
  }
}
