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
import { JurusanService } from './jurusan.service';
import { Permissions } from '../common/decorators/permissions.decorator';
import { Public } from '../common/decorators/public.decorator';
import { CurrentUser, JwtUserPayload } from '../common/decorators/current-user.decorator';
import { AuditLogService } from '../audit-log/audit-log.service';

class CreateJurusanDto {
  @IsString() @IsNotEmpty() code!: string;
  @IsString() @IsNotEmpty() name!: string;
}

class UpdateJurusanDto {
  @IsOptional() @IsString() code?: string;
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

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
  ) {
    return this.service.findAll({
      activeOnly: activeOnly === 'true',
      includeDeleted: includeDeleted === 'true',
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
