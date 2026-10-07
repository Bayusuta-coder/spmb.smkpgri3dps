/**
 * Controller untuk WhatsApp verifikasi + settings.
 *
 * Endpoint publik (perlu login):
 *   POST /api/whatsapp/request-otp      → minta kode OTP ke nomor baru
 *   POST /api/whatsapp/verify-otp       → submit kode OTP dari user
 *   GET  /api/whatsapp/status           → status verifikasi user saat ini
 *   PUT  /api/whatsapp/number           → update nomor (reset verified kalau berubah)
 *
 * Admin-only (perlu permission):
 *   PUT  /api/whatsapp/admin/users/:userId/number → admin ganti nomor user lain
 *   GET  /api/whatsapp/settings         → list semua setting laporan
 *   PUT  /api/whatsapp/settings         → update setting operasional (non-credential)
 *
 * Throttle rate limit (default 5 per menit per IP) — @nestjs/throttler.
 *
 * Body field conventions:
 *   - `phoneNumber`  → string (lokal 08xxx atau +62xxx). Di-normalisasi server-side.
 *   - `code`         → 6-digit OTP string untuk /verify-otp.
 *
 * Validator pakai class-validator decorator. WAJIB pakai decorator di setiap
 * property — kalau tidak, ValidationPipe({ whitelist: true, forbidNonWhitelisted: true })
 * akan men-strip field dari body dan / atau throw 400.
 */

import {
  Body,
  Controller,
  Get,
  HttpCode,
  Put,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { IsString, IsNotEmpty, Matches, Length, MaxLength } from 'class-validator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { Permissions } from '../common/decorators/permissions.decorator';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { CurrentUser, JwtUserPayload } from '../common/decorators/current-user.decorator';
import { ApiBearerAuth, ApiProperty, ApiTags } from '@nestjs/swagger';
import { WhatsappService } from './whatsapp.service';
import { WhatsappOtpService } from './whatsapp-otp.service';
import { normalizePhoneNumber } from './whatsapp.util';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { UsersService } from '../users/users.service';

interface AuthenticatedRequest extends Request {
  user: JwtUserPayload;
}

/**
 * DTO untuk POST /whatsapp/request-otp.
 *
 * Penting: ValidationPipe({ whitelist: true, forbidNonWhitelisted: true })
 * di main.ts. Karena itu SETIAP property HARUS ada decorator class-validator
 * — kalau tidak, property di-strip (whitelist) atau muncul 400 "property
 * X should not exist" (forbidNonWhitelisted).
 *
 * `phoneNumber` menerima format:
 *   - Lokal Indonesia: `08xxxxxxxxxx` (10-13 digit setelah prefix 0)
 *   - Internasional: `+62xxxxxxxxxx` atau `62xxxxxxxxxx`
 * Server akan normalize ke E.164 `62xxxxxxxxxx` lewat normalizePhoneNumber().
 */
class RequestOtpDto {
  @ApiProperty({ type: String, maxLength: 32, description: 'Nomor WhatsApp tujuan OTP (format 08xxx atau +62xxx)' })
  @IsString({ message: 'phoneNumber harus berupa string' })
  @IsNotEmpty({ message: 'phoneNumber tidak boleh kosong' })
  @MaxLength(32, { message: 'phoneNumber terlalu panjang' })
  // Loose pattern — biarkan server-side normalize yang validasi ketat.
  @Matches(/^[+0-9\s\-()]+$/, {
    message: 'phoneNumber hanya boleh berisi angka, spasi, +, -, kurung',
  })
  phoneNumber!: string;
}

/**
 * DTO untuk POST /whatsapp/verify-otp — kode 6 digit numeric.
 */
class VerifyOtpDto {
  @ApiProperty({ type: String, minLength: 6, maxLength: 6, description: 'Kode OTP 6 digit angka yang diterima via WhatsApp' })
  @IsString({ message: 'code harus berupa string' })
  @IsNotEmpty({ message: 'code tidak boleh kosong' })
  @Length(6, 6, { message: 'code harus tepat 6 digit' })
  @Matches(/^\d{6}$/, { message: 'code hanya boleh berupa 6 digit angka' })
  code!: string;
}

/**
 * DTO untuk PUT /whatsapp/number (user update nomor sendiri).
 * Field dinamakan `whatsappNumber` (bukan `phoneNumber`) supaya konsisten
 * dengan field di User model — biar mapping 1:1 dengan database column.
 */
class UpdateMyNumberDto {
  @ApiProperty({ type: String, maxLength: 32, description: 'Nomor WhatsApp baru user (format 08xxx atau +62xxx)' })
  @IsString({ message: 'whatsappNumber harus berupa string' })
  @IsNotEmpty({ message: 'whatsappNumber tidak boleh kosong' })
  @MaxLength(32)
  @Matches(/^[+0-9\s\-()]+$/, {
    message: 'whatsappNumber hanya boleh berisi angka, spasi, +, -, kurung',
  })
  whatsappNumber!: string;
}

/**
 * DTO untuk PUT /whatsapp/admin/users/:userId/number (admin update user lain).
 */
class UpdateUserNumberDto {
  @ApiProperty({ type: String, maxLength: 32, description: 'Nomor WhatsApp baru untuk user target (format 08xxx atau +62xxx)' })
  @IsString({ message: 'whatsappNumber harus berupa string' })
  @IsNotEmpty({ message: 'whatsappNumber tidak boleh kosong' })
  @MaxLength(32)
  @Matches(/^[+0-9\s\-()]+$/, {
    message: 'whatsappNumber hanya boleh berisi angka, spasi, +, -, kurung',
  })
  whatsappNumber!: string;
}

/**
 * DTO untuk PUT /whatsapp/settings (admin update setting operasional).
 * Validation spesifik per-key dilakukan di service layer (whitelist). Di sini
 * cukup validasi base shape supaya tidak ada 500 dari key random.
 */
class UpdateSettingDto {
  @ApiProperty({ type: String, maxLength: 128, description: 'Key setting laporan yang akan di-update (whitelist di service)' })
  @IsString({ message: 'key harus berupa string' })
  @IsNotEmpty({ message: 'key tidak boleh kosong' })
  @MaxLength(128)
  key!: string;

  @ApiProperty({ type: String, description: 'Nilai baru setting (format string; parsing dilakukan service per-key)' })
  @IsString({ message: 'value harus berupa string' })
  value!: string;
}

// Re-export DTO classes dari module scope untuk testability (ada test yang
// validate class-validator contract di file terpisah). Tetap hanya
// WhatsappController yang di-export sebagai provider Nest.
export {
  RequestOtpDto,
  VerifyOtpDto,
  UpdateMyNumberDto,
  UpdateUserNumberDto,
  UpdateSettingDto,
};

@ApiTags('WhatsApp')
@ApiBearerAuth('bearer')
@Controller('whatsapp')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class WhatsappController {
  constructor(
    private readonly whatsapp: WhatsappService,
    private readonly otp: WhatsappOtpService,
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
    private readonly audit: AuditLogService,
  ) {}

  // ─── Self-service verification flow ──────────────────────────────────

  /**
   * Minta OTP ke nomor baru / nomor lama yang ingin di-reverify.
   * Rate limit: 5/menit per IP (anti-spam).
   *
   * SECURITY: Response TIDAK PERNAH mengandung kode OTP mentah.
   * WhatsappOtpService.requestOtp() return type sudah exclude field OTP
   * mentah; kalau di kemudian hari ada field baru yang ditambahkan ke
   * return value, kita whitelist-strip sebelum return ke HTTP.
   *
   * Error mapping (di-throw oleh service):
   *   - 400: nomor tidak valid
   *   - 429: resend cooldown
   *   - 500: provider belum dikonfigurasi
   *   - 502: provider balas error
   */
  @Post('request-otp')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(200)
  async requestOtp(
    @CurrentUser() user: JwtUserPayload,
    @Body() body: RequestOtpDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const ip = (req as any).ip;
    const ua = (req.headers as any)?.['user-agent'];

    const result = await this.otp.requestOtp({
      userId: user.sub,
      phoneNumber: body.phoneNumber,
      ipAddress: ip,
      userAgent: ua,
    });

    await this.audit.create({
      userId: user.sub,
      action: 'whatsapp.otp_requested',
      module: 'whatsapp',
      entityType: 'User',
      entityId: user.sub,
      ipAddress: ip,
      userAgent: ua,
      meta: {
        phoneTail: body.phoneNumber.slice(-4),
        provider: this.whatsapp.getProviderName(),
      },
    });

    // Whitelist eksplisit: hanya field aman yang boleh sampai ke HTTP.
    // Result tidak punya field OTP lagi, tapi pengaman ini mencegah regresi
    // kalau ada field baru di masa depan.
    const safe: Record<string, unknown> = {
      ok: result.ok,
      expiresInSeconds: result.expiresInSeconds,
      resendCooldownSeconds: result.resendCooldownSeconds,
      nextResendAt: result.nextResendAt,
    };
    return safe;
  }

  /**
   * Submit OTP 6-digit. Kalau benar → set User.whatsappVerifiedAt.
   * Rate limit: 10/menit (allow beberapa percobaan salah cepat).
   */
  @Post('verify-otp')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(200)
  async verifyOtp(
    @CurrentUser() user: JwtUserPayload,
    @Body() body: VerifyOtpDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const ip = (req as any).ip;
    const ua = (req.headers as any)?.['user-agent'];
    const result = await this.otp.verifyOtp({
      userId: user.sub,
      code: body.code,
      ipAddress: ip,
      userAgent: ua,
    });
    await this.audit.create({
      userId: user.sub,
      action: result.ok ? 'whatsapp.otp_verified' : 'whatsapp.otp_failed',
      module: 'whatsapp',
      entityType: 'User',
      entityId: user.sub,
      ipAddress: ip,
      userAgent: ua,
      meta: result.ok ? undefined : { reason: result.reason },
    });
    return result;
  }

  /**
   * Status verifikasi WhatsApp untuk user login saat ini. Untuk UI badge
   * "Sudah terverifikasi" / "Belum terverifikasi" + countdown resend.
   */
  @Get('status')
  async getStatus(@CurrentUser() user: JwtUserPayload) {
    return this.otp.getStatus(user.sub);
  }

  /**
   * Update nomor WhatsApp sendiri (di profile). Kalau nomor berubah dari
   * yang sudah terverifikasi → reset verified, cancel OTP lama.
   *
   * Note: ini endpoint terpisah dari `users.manage.update` — supaya user
   * non-Superadmin (mis. Bendahara) bisa update nomor sendiri tanpa butuh
   * `user.manage` permission.
   */
  @Put('number')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async updateMyNumber(
    @CurrentUser() user: JwtUserPayload,
    @Body() body: UpdateMyNumberDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const norm = normalizePhoneNumber(body.whatsappNumber);
    if (!norm.ok) {
      return { ok: false, error: norm.error };
    }
    const ip = (req as any).ip;
    const ua = (req.headers as any)?.['user-agent'];

    const existing = await this.prisma.user.findUnique({
      where: { id: user.sub },
      select: { whatsappNumber: true, whatsappVerifiedAt: true },
    });
    const isChangingVerified =
      existing?.whatsappNumber === norm.normalized && existing?.whatsappVerifiedAt;

    // Kalau nomor berubah dari nilai existing, reset verified + cancel OTP lama.
    if (existing?.whatsappNumber !== norm.normalized) {
      await this.otp.cancelOtpsForUser(user.sub);
      await this.prisma.user.update({
        where: { id: user.sub },
        data: { whatsappNumber: norm.normalized, whatsappVerifiedAt: null },
      });
    } else if (isChangingVerified) {
      // No-op: nomor sama, tidak ada perubahan
    }

    await this.audit.create({
      userId: user.sub,
      action: 'whatsapp.number_updated',
      module: 'whatsapp',
      entityType: 'User',
      entityId: user.sub,
      ipAddress: ip,
      userAgent: ua,
      meta: { phoneTail: norm.normalized!.slice(-4) },
    });

    return { ok: true, whatsappNumber: norm.normalized, reset: !isChangingVerified && existing?.whatsappNumber !== norm.normalized };
  }

  // ─── Admin: ganti nomor user lain ─────────────────────────────────────

  @Put('admin/users/:userId/number')
  @Permissions('whatsapp.manage')
  async adminUpdateUserNumber(
    @Param('userId') userId: string,
    @Body() body: UpdateUserNumberDto,
    @CurrentUser() user: JwtUserPayload,
    @Req() req: AuthenticatedRequest,
  ) {
    const norm = normalizePhoneNumber(body.whatsappNumber);
    if (!norm.ok) {
      return { ok: false, error: norm.error };
    }
    const ip = (req as any).ip;
    const ua = (req.headers as any)?.['user-agent'];

    const existing = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { whatsappNumber: true },
    });
    if (!existing) return { ok: false, error: 'User tidak ditemukan' };

    // Update + reset verified kalau nomor berubah
    if (existing.whatsappNumber !== norm.normalized) {
      await this.otp.cancelOtpsForUser(userId);
      await this.prisma.user.update({
        where: { id: userId },
        data: { whatsappNumber: norm.normalized, whatsappVerifiedAt: null },
      });
    }

    await this.audit.create({
      userId: user.sub,
      action: 'whatsapp.admin_number_updated',
      module: 'whatsapp',
      entityType: 'User',
      entityId: userId,
      ipAddress: ip,
      userAgent: ua,
      meta: { phoneTail: norm.normalized!.slice(-4) },
    });

    return { ok: true, whatsappNumber: norm.normalized };
  }

  // ─── Settings (admin-only) ─────────────────────────────────────────────

  @Get('settings')
  @Permissions('settings.view')
  async getSettings() {
    return this.whatsapp.getAllSettings();
  }

  @Put('settings')
  @Permissions('settings.manage')
  async updateSetting(
    @Body() body: UpdateSettingDto,
    @CurrentUser() user: JwtUserPayload,
    @Req() req: AuthenticatedRequest,
  ) {
    // Whitelist key yang boleh di-update via UI. Credential tidak boleh.
    const ALLOWED = [
      'laporan_harian.aktif',
      'laporan_harian.email.aktif',
      'laporan_harian.email.recipients',
      'laporan_harian.whatsapp.aktif',
      'laporan_harian.jam_kirim',
      'laporan_harian.timezone',
      'laporan_harian.format_pesan',
      'whatsapp.otp.ttl_seconds',
      'whatsapp.otp.max_attempts',
      'whatsapp.otp.resend_cooldown_seconds',
      'rekap_harian.fonnte.aktif',
      'rekap_harian.fonnte.jam_kirim',
      'rekap_harian.fonnte.timezone',
      'rekap_harian.fonnte.roles',
    ];
    if (!ALLOWED.includes(body.key)) {
      return { ok: false, error: `Setting '${body.key}' tidak boleh diubah via UI` };
    }
    await this.whatsapp.updateSetting(body.key, body.value, user.sub);
    const ip = (req as any).ip;
    const ua = (req.headers as any)?.['user-agent'];
    await this.audit.create({
      userId: user.sub,
      action: 'whatsapp.settings_updated',
      module: 'whatsapp',
      entityType: 'WhatsAppSetting',
      entityId: body.key,
      ipAddress: ip,
      userAgent: ua,
      meta: { key: body.key, valueLength: body.value.length },
    });
    return { ok: true };
  }
}