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
  IsArray,
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  Validate,
  ValidatorConstraint,
  ValidatorConstraintInterface,
  ValidationArguments,
} from 'class-validator';
import { ApiBearerAuth, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { BeritaService } from './berita.service';
import { Public } from '../common/decorators/public.decorator';
import { Permissions } from '../common/decorators/permissions.decorator';
import { CurrentUser, JwtUserPayload } from '../common/decorators/current-user.decorator';
import { AuditLogService } from '../audit-log/audit-log.service';

/**
 * Validasi silang: kalau `tayang_sampai` diisi, tidak boleh lebih awal dari
 * `tayang_dari`. Keduanya boleh null (artinya "tidak ada batas" / "tidak
 * ada batas awal"). Class-validator @Validate() custom dipakai supaya
 * payload create & update bisa sharing rule yang sama.
 */
@ValidatorConstraint({ name: 'TayangWindowValid', async: false })
class TayangWindowValidConstraint implements ValidatorConstraintInterface {
  validate(_value: any, args: ValidationArguments) {
    const obj = args.object as { tayangDari?: string | null; tayangSampai?: string | null };
    if (!obj.tayangDari || !obj.tayangSampai) return true;
    const a = new Date(obj.tayangDari).getTime();
    const b = new Date(obj.tayangSampai).getTime();
    if (isNaN(a) || isNaN(b)) return true; // biarkan IsDateString yang handle format
    return b >= a;
  }
  defaultMessage(args: ValidationArguments) {
    const obj = args.object as { tayangSampai?: string | null; tayangDari?: string | null };
    return `tayang_sampai (${obj.tayangSampai}) tidak boleh lebih awal dari tayang_dari (${obj.tayangDari})`;
  }
}

class CreateBeritaDto {
  @ApiProperty({ type: String, description: 'Judul berita' })
  @IsString() @IsNotEmpty() judul!: string;
  @ApiProperty({ type: String, description: 'Path foto berita (relativePath dari /api/upload)' })
  @IsString() @IsNotEmpty() foto!: string; // relativePath dari /api/upload
  @ApiProperty({ type: String, description: 'Isi/ konten berita' })
  @IsString() @IsNotEmpty() isi!: string;
  @ApiPropertyOptional({ type: [String], description: 'Daftar hashtag berita (opsional)' })
  @IsOptional() @IsArray() @IsString({ each: true }) hashtag?: string[];
  @ApiPropertyOptional({ enum: ['DRAFT', 'PUBLISHED'], description: 'Status publikasi berita' })
  @IsOptional() @IsEnum(['DRAFT', 'PUBLISHED']) status?: 'DRAFT' | 'PUBLISHED';
  /** ISO datetime, nullable. Default null = langsung tayang. */
  @ApiPropertyOptional({ type: String, nullable: true, description: 'Waktu mulai tayang (ISO datetime). Null = langsung tayang' })
  @IsOptional() @IsDateString() tayangDari?: string | null;
  /** ISO datetime, nullable. Default null = tidak ada batas akhir. */
  @ApiPropertyOptional({ type: String, nullable: true, description: 'Waktu akhir tayang (ISO datetime). Null = tidak ada batas akhir' })
  @IsOptional() @IsDateString() tayangSampai?: string | null;
  @Validate(TayangWindowValidConstraint)
  _tayangWindowCheck?: unknown;
}

class UpdateBeritaDto {
  @ApiPropertyOptional({ type: String, description: 'Judul berita' })
  @IsOptional() @IsString() @IsNotEmpty() judul?: string;
  @ApiPropertyOptional({ type: String, description: 'Path foto berita (relativePath dari /api/upload)' })
  @IsOptional() @IsString() @IsNotEmpty() foto?: string;
  @ApiPropertyOptional({ type: String, description: 'Isi/ konten berita' })
  @IsOptional() @IsString() @IsNotEmpty() isi?: string;
  @ApiPropertyOptional({ type: [String], description: 'Daftar hashtag berita (opsional)' })
  @IsOptional() @IsArray() @IsString({ each: true }) hashtag?: string[];
  @ApiPropertyOptional({ enum: ['DRAFT', 'PUBLISHED'], description: 'Status publikasi berita' })
  @IsOptional() @IsEnum(['DRAFT', 'PUBLISHED']) status?: 'DRAFT' | 'PUBLISHED';
  @ApiPropertyOptional({ type: String, nullable: true, description: 'Waktu mulai tayang (ISO datetime)' })
  @IsOptional() @IsDateString() tayangDari?: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, description: 'Waktu akhir tayang (ISO datetime)' })
  @IsOptional() @IsDateString() tayangSampai?: string | null;
  @Validate(TayangWindowValidConstraint)
  _tayangWindowCheck?: unknown;
}

@ApiTags('Berita')
@ApiBearerAuth('bearer')
@Controller('berita')
export class BeritaController {
  constructor(
    private readonly service: BeritaService,
    private readonly audit: AuditLogService,
  ) {}

  // ---- PUBLIC ------------------------------------------------------------

  @Public()
  @Get('public')
  publicList(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.service.findPublic({
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    });
  }

  @Public()
  @Get('public/:slug')
  publicDetail(@Param('slug') slug: string) {
    return this.service.findPublicBySlug(slug);
  }

  // ---- ADMIN -------------------------------------------------------------

  @Get()
  @Permissions('berita.view')
  list(
    @Query('status') status?: 'DRAFT' | 'PUBLISHED',
    @Query('search') search?: string,
    @Query('includeDeleted') includeDeleted?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.service.findAllForAdmin({
      status,
      search,
      includeDeleted: includeDeleted === 'true',
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    });
  }

  @Get(':id')
  @Permissions('berita.view')
  detail(@Param('id') id: string) {
    return this.service.findOneForAdmin(id);
  }

  @Post()
  @Permissions('berita.manage')
  create(@Body() dto: CreateBeritaDto, @CurrentUser() user: JwtUserPayload) {
    return this.service.create(dto, user.sub);
  }

  @Patch(':id')
  @Permissions('berita.manage')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateBeritaDto,
    @CurrentUser() user: JwtUserPayload,
  ) {
    return this.service.update(id, dto, user.sub);
  }

  @Delete(':id')
  @Permissions('berita.manage')
  remove(@Param('id') id: string, @CurrentUser() user: JwtUserPayload) {
    return this.service.remove(id, user.sub);
  }

  @Patch(':id/restore')
  @Permissions('berita.manage')
  restore(@Param('id') id: string, @CurrentUser() user: JwtUserPayload) {
    return this.service.restore(id, user.sub);
  }

  /**
   * Riwayat perubahan modul Berita (untuk tab history di UI admin).
   */
  @Get('audit/history')
  @Permissions('audit.view', 'berita.view')
  history(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.audit.findAll({
      module: 'berita',
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    });
  }
}
