import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  IsBoolean,
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { ApiBearerAuth, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { PengumumanService } from './pengumuman.service';
import { Public } from '../common/decorators/public.decorator';
import { Permissions } from '../common/decorators/permissions.decorator';
import { CurrentUser, JwtUserPayload } from '../common/decorators/current-user.decorator';
import { AuditLogService } from '../audit-log/audit-log.service';

class CreatePengumumanDto {
  @ApiProperty({ type: String, description: 'Judul pengumuman' })
  @IsString() @IsNotEmpty() judul!: string;
  @ApiProperty({ type: String, description: 'Path foto pengumuman (relativePath dari /api/upload)' })
  @IsString() @IsNotEmpty() foto!: string;
  @ApiPropertyOptional({ type: Boolean, description: 'Apakah pengumuman sedang aktif ditampilkan' })
  @IsOptional() @IsBoolean() aktif?: boolean;
  @ApiPropertyOptional({ type: Number, minimum: 0, description: 'Urutan tampil pengumuman' })
  @IsOptional() @IsInt() @Min(0) urutan?: number;
  // Jadwal tayang. Format: "YYYY-MM-DD" dari <input type="date">.
  // null/empty = tidak dibatasi di sisi itu.
  @ApiPropertyOptional({ type: String, description: 'Tanggal mulai tayang pengumuman (YYYY-MM-DD)' })
  @IsOptional() @IsDateString() tanggalMulai?: string;
  @ApiPropertyOptional({ type: String, description: 'Tanggal selesai tayang pengumuman (YYYY-MM-DD)' })
  @IsOptional() @IsDateString() tanggalSelesai?: string;
}

class UpdatePengumumanDto {
  @ApiPropertyOptional({ type: String, description: 'Judul pengumuman' })
  @IsOptional() @IsString() @IsNotEmpty() judul?: string;
  @ApiPropertyOptional({ type: String, description: 'Path foto pengumuman' })
  @IsOptional() @IsString() @IsNotEmpty() foto?: string;
  @ApiPropertyOptional({ type: Boolean, description: 'Apakah pengumuman sedang aktif ditampilkan' })
  @IsOptional() @IsBoolean() aktif?: boolean;
  @ApiPropertyOptional({ type: Number, minimum: 0, description: 'Urutan tampil pengumuman' })
  @IsOptional() @IsInt() @Min(0) urutan?: number;
  @ApiPropertyOptional({ type: String, description: 'Tanggal mulai tayang pengumuman (YYYY-MM-DD)' })
  @IsOptional() @IsDateString() tanggalMulai?: string;
  @ApiPropertyOptional({ type: String, description: 'Tanggal selesai tayang pengumuman (YYYY-MM-DD)' })
  @IsOptional() @IsDateString() tanggalSelesai?: string;
}

@ApiTags('Pengumuman')
@ApiBearerAuth('bearer')
@Controller('pengumuman')
export class PengumumanController {
  constructor(
    private readonly service: PengumumanService,
    private readonly audit: AuditLogService,
  ) {}

  // ---- PUBLIC ------------------------------------------------------------

  @Public()
  @Get('public/active')
  publicActive() {
    return this.service.findActive();
  }

  // ---- ADMIN -------------------------------------------------------------

  @Get()
  @Permissions('pengumuman.view')
  list(
    @Query('search') search?: string,
    @Query('aktif') aktif?: string,
    @Query('includeDeleted') includeDeleted?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.service.findAllForAdmin({
      search,
      aktif: aktif === undefined ? undefined : aktif === 'true',
      includeDeleted: includeDeleted === 'true',
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    });
  }

  @Get(':id')
  @Permissions('pengumuman.view')
  detail(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Post()
  @Permissions('pengumuman.manage')
  create(@Body() dto: CreatePengumumanDto, @CurrentUser() user: JwtUserPayload) {
    return this.service.create(dto, user.sub);
  }

  @Patch(':id')
  @Permissions('pengumuman.manage')
  update(
    @Param('id') id: string,
    @Body() dto: UpdatePengumumanDto,
    @CurrentUser() user: JwtUserPayload,
  ) {
    return this.service.update(id, dto, user.sub);
  }

  @Delete(':id')
  @Permissions('pengumuman.manage')
  remove(@Param('id') id: string, @CurrentUser() user: JwtUserPayload) {
    return this.service.remove(id, user.sub);
  }

  @Patch(':id/restore')
  @Permissions('pengumuman.manage')
  restore(@Param('id') id: string, @CurrentUser() user: JwtUserPayload) {
    return this.service.restore(id, user.sub);
  }

  @Get('audit/history')
  @Permissions('audit.view', 'pengumuman.view')
  history(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.audit.findAll({
      module: 'pengumuman',
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    });
  }
}
