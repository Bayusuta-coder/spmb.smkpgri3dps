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
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';
import { BeritaService } from './berita.service';
import { Public } from '../common/decorators/public.decorator';
import { Permissions } from '../common/decorators/permissions.decorator';
import { CurrentUser, JwtUserPayload } from '../common/decorators/current-user.decorator';
import { AuditLogService } from '../audit-log/audit-log.service';

class CreateBeritaDto {
  @IsString() @IsNotEmpty() judul!: string;
  @IsString() @IsNotEmpty() foto!: string; // relativePath dari /api/upload
  @IsString() @IsNotEmpty() isi!: string;
  @IsOptional() @IsArray() @IsString({ each: true }) hashtag?: string[];
  @IsOptional() @IsEnum(['DRAFT', 'PUBLISHED']) status?: 'DRAFT' | 'PUBLISHED';
}

class UpdateBeritaDto {
  @IsOptional() @IsString() @IsNotEmpty() judul?: string;
  @IsOptional() @IsString() @IsNotEmpty() foto?: string;
  @IsOptional() @IsString() @IsNotEmpty() isi?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) hashtag?: string[];
  @IsOptional() @IsEnum(['DRAFT', 'PUBLISHED']) status?: 'DRAFT' | 'PUBLISHED';
}

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
