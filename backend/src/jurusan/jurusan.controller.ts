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
import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ApiBearerAuth, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { JurusanService } from './jurusan.service';
import { Permissions } from '../common/decorators/permissions.decorator';
import { Public } from '../common/decorators/public.decorator';
import { CurrentUser, JwtUserPayload } from '../common/decorators/current-user.decorator';
import { AuditLogService } from '../audit-log/audit-log.service';

class CreateJurusanDto {
  @ApiProperty({ type: String, description: 'Kode unik jurusan (mis. "TKJ", "AKL")' })
  @IsString() @IsNotEmpty() code!: string;
  @ApiProperty({ type: String, description: 'Nama lengkap jurusan' })
  @IsString() @IsNotEmpty() name!: string;
}

class UpdateJurusanDto {
  @ApiPropertyOptional({ type: String, description: 'Kode unik jurusan' })
  @IsOptional() @IsString() code?: string;
  @ApiPropertyOptional({ type: String, description: 'Nama lengkap jurusan' })
  @IsOptional() @IsString() name?: string;
  @ApiPropertyOptional({ type: Boolean, description: 'Apakah jurusan ini aktif' })
  @IsOptional() @IsBoolean() isActive?: boolean;
}

@ApiTags('jurusan')
@ApiBearerAuth('bearer')
@Controller('jurusan')
export class JurusanController {
  constructor(
    private readonly service: JurusanService,
    private readonly audit: AuditLogService,
  ) {}

  @Public()
  @Get('public')
  publicList() {
    return this.service.findAll({ activeOnly: true });
  }

  @Get()
  @Permissions('jurusan.view')
  list(
    @Query('activeOnly') activeOnly?: string,
    @Query('includeDeleted') includeDeleted?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.service.findAll({
      activeOnly: activeOnly === 'true',
      includeDeleted: includeDeleted === 'true',
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    });
  }

  @Get(':id')
  @Permissions('jurusan.view')
  detail(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Post()
  @Permissions('jurusan.manage')
  create(@Body() dto: CreateJurusanDto, @CurrentUser() user: JwtUserPayload) {
    return this.service.create(dto, user.sub);
  }

  @Patch(':id')
  @Permissions('jurusan.manage')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateJurusanDto,
    @CurrentUser() user: JwtUserPayload,
  ) {
    return this.service.update(id, dto, user.sub);
  }

  @Delete(':id')
  @Permissions('jurusan.manage')
  remove(@Param('id') id: string, @CurrentUser() user: JwtUserPayload) {
    return this.service.remove(id, user.sub);
  }

  @Patch(':id/restore')
  @Permissions('jurusan.manage')
  restore(@Param('id') id: string, @CurrentUser() user: JwtUserPayload) {
    return this.service.restore(id, user.sub);
  }

  /**
   * Riwayat perubahan (audit log) modul Jurusan.
   * Hanya menampilkan entry action=jurusan.* (created, updated, deleted, restored).
   */
  @Get('audit/history')
  @Permissions('audit.view', 'jurusan.view')
  history(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.audit.findAll({
      module: 'jurusan',
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    });
  }
}
