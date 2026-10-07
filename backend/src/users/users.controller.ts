import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import {
  IsArray,
  IsBoolean,
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MinLength,
  Validate,
  ValidatorConstraint,
  ValidatorConstraintInterface,
  ValidationArguments,
} from 'class-validator';
import type { Request } from 'express';
import { ApiBearerAuth, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { Permissions } from '../common/decorators/permissions.decorator';
import { CurrentUser, JwtUserPayload } from '../common/decorators/current-user.decorator';
import { normalizePhoneNumber } from '../whatsapp/whatsapp.util';
import { IsIndonesianPhone } from '../common/validators/is-indonesian-phone.validator';

/**
 * User-management endpoints (create / update / reset-password / delete) DIBATASI
 * hanya untuk role Superadmin. Logic guard ada inline di tiap method (tidak
 * pakai guard/decorator terpisah) karena sederhana & eksplisit — pattern ini
 * konsisten dengan `auth.service.ts` yang juga pakai inline checks.
 *
 * Permission `@Permissions('user.manage')` tetap dipakai supaya PermissionsGuard
 * jalan duluan (sebelum sampe sini), tapi role check adalah lapisan kedua
 * yang memastikan HANYA Superadmin yang bisa lewat — bahkan kalau ada role
 * lain di masa depan yang punya `user.manage`, role ini akan tetap block.
 */
function assertSuperadmin(user: JwtUserPayload) {
  if (!user?.roles?.includes('Superadmin')) {
    throw new ForbiddenException(
      'Hanya role Superadmin yang dapat mengelola user',
    );
  }
}

/**
 * Custom validator untuk nomor WhatsApp: pakai util normalizePhoneNumber()
 * yang sama dengan service. Kalau normalization gagal → validation error.
 */
@ValidatorConstraint({ name: 'isWhatsappNumber', async: false })
class IsWhatsappNumberConstraint implements ValidatorConstraintInterface {
  validate(value: any) {
    if (value == null || value === '') return true; // optional
    if (typeof value !== 'string') return false;
    return normalizePhoneNumber(value).ok;
  }
  defaultMessage(args: ValidationArguments) {
    const r = normalizePhoneNumber(args.value);
    return r.error ?? 'Nomor WhatsApp tidak valid';
  }
}

class CreateUserDto {
  @ApiProperty({ type: String, description: 'Email unik user (digunakan untuk login)' })
  @IsEmail()
  email!: string;

  @ApiProperty({ type: String, description: 'Nama lengkap user' })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiProperty({ type: String, minLength: 8, description: 'Password awal user (minimal 8 karakter)' })
  @IsString()
  @MinLength(8, { message: 'Password minimal 8 karakter' })
  password!: string;

  @ApiProperty({ type: [String], description: 'Daftar ID role yang dimiliki user' })
  @IsArray()
  @IsString({ each: true })
  roleIds!: string[];

  // WhatsApp — opsional. User yang akan menerima laporan/notifikasi WA
  // boleh dibuat tanpa nomor dulu (status: belum terverifikasi). Admin
  // bisa tambahkan nanti lewat profile atau WhatsappController admin endpoint.
  @ApiPropertyOptional({ type: String, description: 'Nomor WhatsApp user (format Indonesia, diahului 08). Opsional' })
  @IsOptional()
  @IsString()
  @IsIndonesianPhone({ message: 'Nomor WhatsApp harus diawali 08 dan 10–13 digit angka' })
  whatsappNumber?: string;
}

class UpdateUserDto {
  @ApiPropertyOptional({ type: String, description: 'Nama lengkap user' })
  @IsOptional() @IsString() @IsNotEmpty()
  name?: string;

  // Email editable oleh Superadmin (mis. user ganti email kantor → kantor).
  // Service tetap validasi unique.
  @ApiPropertyOptional({ type: String, description: 'Email unik user' })
  @IsOptional() @IsEmail()
  email?: string;

  @ApiPropertyOptional({ type: Boolean, description: 'Apakah user aktif' })
  @IsOptional() @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ type: [String], description: 'Daftar ID role yang dimiliki user' })
  @IsOptional() @IsArray() @IsString({ each: true })
  roleIds?: string[];

  // Kalau di-set dan nilainya berubah dari existing, service otomatis reset
  // `whatsappVerifiedAt` ke null — user harus verifikasi ulang.
  @ApiPropertyOptional({ type: String, description: 'Nomor WhatsApp user (format Indonesia)' })
  @IsOptional()
  @IsString()
  @IsIndonesianPhone({ message: 'Nomor WhatsApp harus diawali 08 dan 10–13 digit angka' })
  whatsappNumber?: string;
}

class ResetPasswordDto {
  @ApiProperty({ type: String, minLength: 8, description: 'Password baru user (minimal 8 karakter)' })
  @IsString() @MinLength(8)
  newPassword!: string;
}

@ApiTags('users')
@ApiBearerAuth('bearer')
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  private actorFromReq(user: JwtUserPayload, req: Request) {
    return {
      userId: user.sub,
      ipAddress: (req.headers['x-forwarded-for'] as string) ?? req.ip ?? undefined,
      userAgent: req.headers['user-agent'] as string | undefined,
    };
  }

  @Get()
  @Permissions('user.view')
  list(
    @Query('search') search?: string,
    @Query('roleId') roleId?: string,
    @Query('isActive') isActive?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.users.findAll({
      search,
      roleId,
      isActive: isActive === undefined ? undefined : isActive === 'true',
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    });
  }

  @Get(':id')
  @Permissions('user.view')
  findOne(@Param('id') id: string) {
    return this.users.findOne(id);
  }

  @Post()
  @Permissions('user.manage')
  create(@Body() dto: CreateUserDto, @CurrentUser() user: JwtUserPayload) {
    assertSuperadmin(user);
    return this.users.create(dto);
  }

  @Patch(':id')
  @Permissions('user.manage')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser() user: JwtUserPayload,
    @Req() req: Request,
  ) {
    assertSuperadmin(user);
    return this.users.update(id, dto, this.actorFromReq(user, req));
  }

  @Patch(':id/reset-password')
  @Permissions('user.manage')
  resetPassword(
    @Param('id') id: string,
    @Body() dto: ResetPasswordDto,
    @CurrentUser() user: JwtUserPayload,
    @Req() req: Request,
  ) {
    assertSuperadmin(user);
    return this.users.resetPassword(id, dto.newPassword, this.actorFromReq(user, req));
  }

  @Delete(':id')
  @Permissions('user.manage')
  remove(
    @Param('id') id: string,
    @CurrentUser() user: JwtUserPayload,
    @Req() req: Request,
  ) {
    assertSuperadmin(user);
    return this.users.remove(id, this.actorFromReq(user, req));
  }
}
