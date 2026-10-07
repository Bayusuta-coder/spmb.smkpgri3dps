import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { IsString, MinLength } from 'class-validator';
import type { Request } from 'express';
import { TahunAjaranService } from './tahun-ajaran.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { Permissions } from '../common/decorators/permissions.decorator';
import {
  CurrentUser,
  JwtUserPayload,
} from '../common/decorators/current-user.decorator';
import { ApiBearerAuth, ApiProperty, ApiTags } from '@nestjs/swagger';

class ArchiveAndResetDto {
  /** Konfirmasi string — UI harus pass 'ARSIPKAN DAN RESET' persis. */
  @ApiProperty({ type: String, minLength: 8, description: 'Konfirmasi anti fat-finger — harus persis "ARSIPKAN DAN RESET"' })
  @IsString()
  @MinLength(8)
  confirmation!: string;
}

/**
 * Endpoint tahun ajaran — hanya Superadmin (di-check via PermissionsGuard
 * + inline role check di service kalau perlu).
 *
 *   GET  /tahun-ajaran/summary
 *     → return { tahunAjaranLabel, counts: { pendaftar, gelombang, kuota, ... } }
 *
 *   POST /tahun-ajaran/archive-and-reset
 *     → generate Excel arsip → hapus data → tulis audit log. IRREVERSIBLE.
 */
@ApiTags('tahun-ajaran')
@ApiBearerAuth('bearer')
@Controller('tahun-ajaran')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class TahunAjaranController {
  constructor(private readonly svc: TahunAjaranService) {}

  @Get('summary')
  @Permissions('settings.manage')
  async summary() {
    return this.svc.summary();
  }

  @Post('archive-and-reset')
  @Permissions('settings.manage')
  async archiveAndReset(
    @Body() dto: ArchiveAndResetDto,
    @CurrentUser() user: JwtUserPayload,
    @Req() req: Request,
  ) {
    // Guard konfirmasi (anti fat-finger di UI).
    if (dto?.confirmation !== 'ARSIPKAN DAN RESET') {
      throw new Error(
        'Konfirmasi tidak valid. Body harus berisi { confirmation: "ARSIPKAN DAN RESET" }',
      );
    }

    // Ambil snapshot nama/email actor — masuk ke audit log supaya jejak
    // reset tahan walau user di-hard-delete nanti.
    const actor = {
      userId: user.sub,
      userName: user.name ?? '',
      userEmail: user.email ?? '',
    };

    return this.svc.archiveAndReset(actor);
  }
}