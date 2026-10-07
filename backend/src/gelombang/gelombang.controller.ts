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
import { ApiBearerAuth, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { GelombangService } from './gelombang.service';
import { Permissions } from '../common/decorators/permissions.decorator';
import { Public } from '../common/decorators/public.decorator';
import { CurrentUser, JwtUserPayload } from '../common/decorators/current-user.decorator';
import { AuditLogService } from '../audit-log/audit-log.service';

class KuotaDto {
  @ApiProperty({ type: String, description: 'ID jurusan yang diberi kuota pada gelombang ini' })
  @IsString() @IsNotEmpty() jurusanId!: string;
  @ApiProperty({ type: Number, minimum: 0, description: 'Jumlah kuota untuk jurusan terkait' })
  @IsInt() @Min(0) quota!: number;
}

class CreateGelombangDto {
  @ApiProperty({ type: String, description: 'Nama gelombang pendaftaran' })
  @IsString() @IsNotEmpty() name!: string;
  @ApiProperty({ type: String, description: 'Tanggal mulai gelombang (ISO date string)' })
  @IsDateString() startDate!: string;
  @ApiPropertyOptional({ type: String, description: 'Tanggal akhir gelombang (ISO date string). Opsional' })
  @IsOptional() @IsDateString() endDate?: string;
  @ApiPropertyOptional({ type: Boolean, description: 'Apakah gelombang ini aktif' })
  @IsOptional() @IsBoolean() isActive?: boolean;
  @ApiPropertyOptional({ type: String, description: 'Tanggal daftar ulang (ISO date string)' })
  @IsOptional() @IsDateString() tanggalDaftarUlang?: string;
  @ApiPropertyOptional({ type: String, description: 'Jam daftar ulang (string, mis. "08:00")' })
  @IsOptional() @IsString() jamDaftarUlang?: string;
  @ApiProperty({ type: [KuotaDto], description: 'Daftar kuota per jurusan untuk gelombang ini' })
  @IsArray() @ValidateNested({ each: true }) @Type(() => KuotaDto)
  kuota!: KuotaDto[];
}

class UpdateGelombangDto {
  @ApiPropertyOptional({ type: String, description: 'Nama gelombang pendaftaran' })
  @IsOptional() @IsString() name?: string;
  @ApiPropertyOptional({ type: String, description: 'Tanggal mulai gelombang (ISO date string)' })
  @IsOptional() @IsDateString() startDate?: string;
  @ApiPropertyOptional({ type: String, description: 'Tanggal akhir gelombang (ISO date string)' })
  @IsOptional() @IsDateString() endDate?: string;
  @ApiPropertyOptional({ type: Boolean, description: 'Apakah gelombang ini aktif' })
  @IsOptional() @IsBoolean() isActive?: boolean;
  @ApiPropertyOptional({ type: String, description: 'Tanggal daftar ulang (ISO date string)' })
  @IsOptional() @IsDateString() tanggalDaftarUlang?: string;
  @ApiPropertyOptional({ type: String, description: 'Jam daftar ulang (string, mis. "08:00")' })
  @IsOptional() @IsString() jamDaftarUlang?: string;
  @ApiPropertyOptional({ type: [KuotaDto], description: 'Daftar kuota per jurusan untuk gelombang ini' })
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => KuotaDto)
  kuota?: KuotaDto[];
}

@ApiTags('gelombang')
@ApiBearerAuth('bearer')
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
