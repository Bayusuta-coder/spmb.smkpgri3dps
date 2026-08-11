import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import {
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { PembayaranService } from './pembayaran.service';
import { Public } from '../common/decorators/public.decorator';
import { Permissions } from '../common/decorators/permissions.decorator';
import { CurrentUser, JwtUserPayload } from '../common/decorators/current-user.decorator';

class SubmitPaymentDto {
  @IsString() @IsNotEmpty() registrationNumber!: string;
  @IsNumber() @Min(0) nominal!: number;
  @IsDateString() tanggalTransfer!: string;
  @IsString() @IsNotEmpty() namaPengirim!: string;
  @IsOptional() @IsString() catatan?: string;
}

class VerifyPaymentDto {
  @IsEnum(['TERVERIFIKASI', 'BELUM_DITEMUKAN'])
  decision!: 'TERVERIFIKASI' | 'BELUM_DITEMUKAN';
  @IsOptional() @IsString() note?: string;
}

@Controller('pembayaran')
export class PembayaranController {
  constructor(private readonly service: PembayaranService) {}

  @Public()
  @Post('submit')
  submit(@Body() dto: SubmitPaymentDto) {
    return this.service.submit(dto);
  }

  @Get()
  @Permissions('payment.view')
  list(
    @Query('status') status?: string,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.service.listForTu({
      status: status as any,
      search,
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    });
  }

  @Post(':id/verify')
  @Permissions('payment.verify')
  verify(
    @Param('id') id: string,
    @Body() dto: VerifyPaymentDto,
    @CurrentUser() user: JwtUserPayload,
  ) {
    return this.service.verify(id, user.sub, dto.decision, dto.note);
  }
}
