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
  IsBoolean,
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { GelombangService } from './gelombang.service';
import { Permissions } from '../common/decorators/permissions.decorator';
import { Public } from '../common/decorators/public.decorator';
import { CurrentUser, JwtUserPayload } from '../common/decorators/current-user.decorator';
import { AuditLogService } from '../audit-log/audit-log.service';

class KuotaDto {
  @IsString() @IsNotEmpty() jurusanId!: string;
  @IsInt() @Min(0) quota!: number;
}

class CreateGelombangDto {
  @IsString() @IsNotEmpty() name!: string;
  @IsDateString() startDate!: string;
  @IsOptional() @IsDateString() endDate?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsDateString() tanggalDaftarUlang?: string;
  @IsOptional() @IsString() jamDaftarUlang?: string;
  @IsArray() @ValidateNested({ each: true }) @Type(() => KuotaDto)
  kuota!: KuotaDto[];
}

class UpdateGelombangDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsDateString() startDate?: string;
  @IsOptional() @IsDateString() endDate?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsDateString() tanggalDaftarUlang?: string;
  @IsOptional() @IsString() jamDaftarUlang?: string;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => KuotaDto)
  kuota?: KuotaDto[];
}

@Controller('gelombang')
export class GelombangController {
  constructor(
    private readonly service: GelombangService,
    private readonly audit: AuditLogService,
  ) {}

  @Public()
  @Get('public/active')
  active() {
    return this.service.getActive();
  }

  @Get()
  @Permissions('gelombang.view')
  list(@Query('activeOnly') activeOnly?: string) {
    return this.service.findAll({ activeOnly: activeOnly === 'true' });
  }

  @Get(':id')
  @Permissions('gelombang.view')
  detail(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Post()
  @Permissions('gelombang.manage')
  create(@Body() dto: CreateGelombangDto, @CurrentUser() user: JwtUserPayload) {
    return this.service.create(dto, user.sub);
  }

  @Patch(':id')
  @Permissions('gelombang.manage')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateGelombangDto,
    @CurrentUser() user: JwtUserPayload,
  ) {
    return this.service.update(id, dto, user.sub);
  }

  @Delete(':id')
  @Permissions('gelombang.manage')
  remove(@Param('id') id: string, @CurrentUser() user: JwtUserPayload) {
    return this.service.remove(id, user.sub);
  }

  /**
   * Riwayat penambahan & perubahan gelombang.
   */
  @Get('audit/history')
  @Permissions('audit.view', 'gelombang.view')
  history(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.audit.findAll({
      module: 'gelombang',
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    });
  }
}
