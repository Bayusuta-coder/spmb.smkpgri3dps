import { Body, Controller, Get, Post } from '@nestjs/common';
import { IsEmail, IsNotEmpty, IsString, MinLength } from 'class-validator';
import { AuthService } from './auth.service';
import { Public } from '../common/decorators/public.decorator';
import { CurrentUser, JwtUserPayload } from '../common/decorators/current-user.decorator';

class LoginDto {
  @IsEmail({}, { message: 'Email tidak valid' })
  email!: string;

  @IsString()
  @IsNotEmpty({ message: 'Password wajib diisi' })
  @MinLength(6, { message: 'Password minimal 6 karakter' })
  password!: string;
}

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto.email, dto.password);
  }

  @Get('me')
  me(@CurrentUser() user: JwtUserPayload) {
    return this.auth.me(user.sub);
  }
}
