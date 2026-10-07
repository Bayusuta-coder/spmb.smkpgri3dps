import { Body, Controller, Get, Post, Req } from '@nestjs/common';
import { IsEmail, IsNotEmpty, IsString, MinLength } from 'class-validator';
import type { Request } from 'express';
import { AuthService } from './auth.service';
import { Public } from '../common/decorators/public.decorator';
import { CurrentUser, JwtUserPayload } from '../common/decorators/current-user.decorator';
import { ApiBearerAuth, ApiProperty, ApiTags } from '@nestjs/swagger';

class LoginDto {
  @ApiProperty({ type: String, description: 'Email akun pengguna yang akan login' })
  @IsEmail({}, { message: 'Email tidak valid' })
  email!: string;

  @ApiProperty({ type: String, minLength: 6, description: 'Password akun pengguna (minimal 6 karakter)' })
  @IsString()
  @IsNotEmpty({ message: 'Password wajib diisi' })
  @MinLength(6, { message: 'Password minimal 6 karakter' })
  password!: string;
}

class ForgotPasswordDto {
  @ApiProperty({ type: String, description: 'Email akun yang ingin di-reset passwordnya' })
  @IsEmail({}, { message: 'Email tidak valid' })
  email!: string;
}

class ResetPasswordDto {
  @ApiProperty({ type: String, description: 'Token reset password yang diterima via email' })
  @IsString()
  @IsNotEmpty({ message: 'Token wajib diisi' })
  token!: string;

  @ApiProperty({ type: String, minLength: 6, description: 'Password baru untuk akun (minimal 6 karakter)' })
  @IsString()
  @IsNotEmpty({ message: 'Password baru wajib diisi' })
  @MinLength(6, { message: 'Password baru minimal 6 karakter' })
  newPassword!: string;
}

/**
 * Ambil IP + User-Agent dari request Express untuk audit log.
 * Pakai `trust proxy` setting kalau di belakang reverse proxy (Hostinger VPS).
 */
function reqMeta(req: Request) {
  const ip =
    (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() ||
    req.ip ||
    req.socket?.remoteAddress ||
    undefined;
  const ua = (req.headers['user-agent'] as string | undefined) || undefined;
  return { ipAddress: ip, userAgent: ua };
}

@ApiTags('auth')
@ApiBearerAuth('bearer')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto.email, dto.password);
  }

  @Public()
  @Post('forgot-password')
  forgotPassword(@Body() dto: ForgotPasswordDto, @Req() req: Request) {
    // Response SELALU sama — anti-enumeration. Email beneran hanya dikirim
    // kalau user ada & aktif (lihat AuthService.requestPasswordReset).
    return this.auth.requestPasswordReset(dto.email, reqMeta(req));
  }

  @Public()
  @Post('reset-password')
  resetPassword(@Body() dto: ResetPasswordDto, @Req() req: Request) {
    return this.auth.resetPassword(dto.token, dto.newPassword, reqMeta(req));
  }

  @Get('me')
  me(@CurrentUser() user: JwtUserPayload) {
    return this.auth.me(user.sub);
  }
}
