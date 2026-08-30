/**
 * WhatsappOtpService — issue & verify OTP untuk verifikasi nomor WhatsApp.
 *
 * Lifecycle:
 *
 *   requestOtp(userId, phoneNumber, meta)
 *     ├─ Cancel OTP lama user (kalau ada yg pending) → set status='cancelled'
 *     ├─ Generate OTP 6-digit raw
 *     ├─ Insert WhatsAppOtp row: codeHash = SHA-256(rawOtp), expiresAt, dst.
 *     ├─ Kirim OTP via WhatsappService.sendOtp (template-based Meta Cloud)
 *     └─ Return result tanpa raw OTP. Throw:
 *         - 400 BadRequest: nomor invalid
 *         - 429 TooManyRequests: resend cooldown
 *         - 500 InternalServerError: provider belum dikonfigurasi
 *         - 502 BadGateway: provider balas error (4xx/5xx/network)
 *
 *   verifyOtp(userId, rawOtp, meta)
 *     ├─ Cek hash, expired, attempts, dst.
 *     └─ Audit log
 *
 *   cancelOtpsForUser(userId): cancel semua OTP pending user.
 *
 * SECURITY:
 *   - Raw OTP TIDAK PERNAH dikembalikan ke HTTP caller (frontend).
 *   - OTP dikirim ke user hanya via WhatsApp chat (template-based).
 *   - Logger: hanya userId, provider name, masked phone, providerMessageId.
 *     TIDAK log raw OTP / token / body.
 */

import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsappService } from './whatsapp.service';
import {
  generateOtp,
  hashOtp,
  normalizePhoneNumber,
  verifyOtpHash,
} from './whatsapp.util';

const DEFAULT_TTL_SECONDS = 300;
const DEFAULT_MAX_ATTEMPTS = 5;
const DEFAULT_RESEND_COOLDOWN_SECONDS = 60;

export interface RequestOtpOptions {
  userId: string;
  /** Nomor WhatsApp. Bisa format lokal (+628xxx/08xxx). */
  phoneNumber: string;
  ipAddress?: string | null;
  userAgent?: string | null;
}

export interface RequestOtpResult {
  /** Selalu true kalau validasi awal lulus. */
  ok: boolean;
  /** Seconds sampai OTP expire */
  expiresInSeconds: number;
  /** Seconds sampai user boleh request lagi (resend cooldown) */
  resendCooldownSeconds: number;
  /** ISO timestamp kapan bisa request lagi */
  nextResendAt: string;
}

export interface VerifyOtpOptions {
  userId: string;
  /** Raw OTP 6-digit dari user input */
  code: string;
  ipAddress?: string | null;
  userAgent?: string | null;
}

export type VerifyOtpResult =
  | { ok: true }
  | {
      ok: false;
      reason:
        | 'no_pending_otp'
        | 'expired'
        | 'max_attempts_exceeded'
        | 'cancelled'
        | 'invalid_code';
      attemptsLeft?: number;
    };

@Injectable()
export class WhatsappOtpService {
  private readonly logger = new Logger(WhatsappOtpService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly whatsapp: WhatsappService,
  ) {}

  private async getSettingNumber(key: string, fallback: number): Promise<number> {
    const v = await this.whatsapp.getSetting(key, undefined);
    if (v == null) return fallback;
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : fallback;
  }

  /**
   * Issue OTP baru untuk user. Cancel OTP lama, normalisasi nomor,
   * hash code, kirim via template-based Meta WhatsApp Cloud API.
   *
   * Throw:
   *   - BadRequestException — nomor tidak valid
   *   - HttpException 429   — resend cooldown
   *   - HttpException 500   — provider belum dikonfigurasi
   *   - HttpException 502   — provider balas error (4xx/5xx/network)
   */
  async requestOtp(opts: RequestOtpOptions): Promise<RequestOtpResult> {
    const norm = normalizePhoneNumber(opts.phoneNumber);
    if (!norm.ok || !norm.normalized) {
      throw new BadRequestException({
        message: 'Nomor WhatsApp tidak valid',
        error: norm.error ?? 'unknown',
      });
    }
    const normalized = norm.normalized;

    const ttl = await this.getSettingNumber(
      'whatsapp.otp.ttl_seconds',
      DEFAULT_TTL_SECONDS,
    );
    const maxAttempts = await this.getSettingNumber(
      'whatsapp.otp.max_attempts',
      DEFAULT_MAX_ATTEMPTS,
    );
    const cooldown = await this.getSettingNumber(
      'whatsapp.otp.resend_cooldown_seconds',
      DEFAULT_RESEND_COOLDOWN_SECONDS,
    );

    const recent = await this.prisma.whatsAppOtp.findFirst({
      where: { userId: opts.userId, status: 'pending' },
      orderBy: { createdAt: 'desc' },
    });
    if (recent) {
      const ageMs = Date.now() - recent.createdAt.getTime();
      const cooldownMs = cooldown * 1000;
      if (ageMs < cooldownMs) {
        const waitSeconds = Math.ceil((cooldownMs - ageMs) / 1000);
        throw new HttpException(
          {
            message: `Tunggu ${waitSeconds} detik sebelum meminta kode baru`,
            retryAfterSeconds: waitSeconds,
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    }

    await this.prisma.whatsAppOtp.updateMany({
      where: { userId: opts.userId, status: 'pending' },
      data: { status: 'cancelled', cancelledAt: new Date() },
    });

    const raw = generateOtp(6);
    const codeHash = hashOtp(raw);
    const expiresAt = new Date(Date.now() + ttl * 1000);

    const otpRow = await this.prisma.whatsAppOtp.create({
      data: {
        userId: opts.userId,
        phoneNumber: normalized,
        codeHash,
        status: 'pending',
        attempts: 0,
        maxAttempts,
        expiresAt,
        ipAddress: opts.ipAddress ?? null,
        userAgent: opts.userAgent ?? null,
      },
    });

    const sendResult = await this.whatsapp.sendOtp(normalized, raw);

    await this.prisma.whatsAppOtp.update({
      where: { id: otpRow.id },
      data: {
        meta: {
          provider: this.whatsapp.getProviderName(),
          ...(sendResult.providerMessageId
            ? { providerMessageId: sendResult.providerMessageId }
            : {}),
          ...(sendResult.error ? { sendError: sendResult.error } : {}),
        },
      },
    });

    if (!sendResult.ok) {
      this.logger.warn(
        `OTP send gagal userId=${opts.userId} provider=${this.whatsapp.getProviderName()} ` +
          `phone=${normalized.slice(0, 5)}*** msgId=${sendResult.providerMessageId ?? '-'} ` +
          `reason=${sendResult.error ?? 'unknown'}`,
      );
      const errorLower = (sendResult.error ?? '').toLowerCase();
      const isProviderNotConfigured =
        errorLower.includes('belum dikonfigurasi') ||
        errorLower.includes('not configured');
      throw new HttpException(
        {
          message: isProviderNotConfigured
            ? 'WhatsApp provider belum dikonfigurasi. Hubungi admin.'
            : 'Gagal mengirim OTP via WhatsApp. Coba lagi atau hubungi admin.',
          providerError: sendResult.error,
        },
        isProviderNotConfigured
          ? HttpStatus.INTERNAL_SERVER_ERROR
          : HttpStatus.BAD_GATEWAY,
      );
    }

    this.logger.log(
      `OTP issued userId=${opts.userId} provider=${this.whatsapp.getProviderName()} ` +
        `phone=${normalized.slice(0, 5)}*** msgId=${sendResult.providerMessageId ?? '?'}`,
    );

    const nextResendAt = new Date(Date.now() + cooldown * 1000).toISOString();

    return {
      ok: true,
      expiresInSeconds: ttl,
      resendCooldownSeconds: cooldown,
      nextResendAt,
    };
  }

  /**
   * Verify OTP. Compare hash, cek expiry, increment attempts, audit log.
   * Tidak throw — return discriminated union supaya UI bisa render pesan
   * error spesifik.
   */
  async verifyOtp(opts: VerifyOtpOptions): Promise<VerifyOtpResult> {
    if (!/^\d{6}$/.test(opts.code)) {
      return { ok: false, reason: 'invalid_code' };
    }

    const otp = await this.prisma.whatsAppOtp.findFirst({
      where: { userId: opts.userId, status: 'pending' },
      orderBy: { createdAt: 'desc' },
    });

    if (!otp) {
      return { ok: false, reason: 'no_pending_otp' };
    }

    if (otp.expiresAt.getTime() < Date.now()) {
      await this.prisma.whatsAppOtp.update({
        where: { id: otp.id },
        data: { status: 'expired' },
      });
      return { ok: false, reason: 'expired' };
    }

    if (otp.attempts >= otp.maxAttempts) {
      await this.prisma.whatsAppOtp.update({
        where: { id: otp.id },
        data: { status: 'cancelled', cancelledAt: new Date() },
      });
      return { ok: false, reason: 'max_attempts_exceeded' };
    }

    const match = verifyOtpHash(opts.code, otp.codeHash);
    if (!match) {
      const newAttempts = otp.attempts + 1;
      const cancelled = newAttempts >= otp.maxAttempts;
      await this.prisma.whatsAppOtp.update({
        where: { id: otp.id },
        data: {
          attempts: newAttempts,
          status: cancelled ? 'cancelled' : 'pending',
          cancelledAt: cancelled ? new Date() : null,
        },
      });
      return {
        ok: false,
        reason: cancelled ? 'max_attempts_exceeded' : 'invalid_code',
        attemptsLeft: cancelled ? 0 : otp.maxAttempts - newAttempts,
      };
    }

    const verifiedAt = new Date();
    await this.prisma.$transaction([
      this.prisma.whatsAppOtp.update({
        where: { id: otp.id },
        data: { status: 'verified', verifiedAt },
      }),
      this.prisma.user.update({
        where: { id: opts.userId },
        data: {
          whatsappNumber: otp.phoneNumber,
          whatsappVerifiedAt: verifiedAt,
        },
      }),
      this.prisma.whatsAppOtp.updateMany({
        where: {
          userId: opts.userId,
          status: 'pending',
          id: { not: otp.id },
        },
        data: { status: 'cancelled', cancelledAt: new Date() },
      }),
    ]);

    return { ok: true };
  }

  async cancelOtpsForUser(userId: string): Promise<{ count: number }> {
    const result = await this.prisma.whatsAppOtp.updateMany({
      where: { userId, status: 'pending' },
      data: { status: 'cancelled', cancelledAt: new Date() },
    });
    return { count: result.count };
  }

  async getStatus(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        whatsappNumber: true,
        whatsappVerifiedAt: true,
      },
    });
    if (!user) throw new NotFoundException('User tidak ditemukan');

    const latestOtp = await this.prisma.whatsAppOtp.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: {
        status: true,
        attempts: true,
        maxAttempts: true,
        expiresAt: true,
        phoneNumber: true,
        createdAt: true,
      },
    });

    const cooldown = await this.getSettingNumber(
      'whatsapp.otp.resend_cooldown_seconds',
      DEFAULT_RESEND_COOLDOWN_SECONDS,
    );

    let canResend = true;
    let nextResendAt: string | null = null;
    if (latestOtp?.status === 'pending') {
      const ageMs = Date.now() - latestOtp.createdAt.getTime();
      const cooldownMs = cooldown * 1000;
      if (ageMs < cooldownMs) {
        canResend = false;
        nextResendAt = new Date(latestOtp.createdAt.getTime() + cooldownMs).toISOString();
      }
    }

    return {
      whatsappNumber: user.whatsappNumber,
      whatsappVerifiedAt: user.whatsappVerifiedAt,
      isVerified: Boolean(user.whatsappVerifiedAt),
      provider: this.whatsapp.getProviderName(),
      isReady: this.whatsapp.isReady(),
      latestOtp,
      canResend,
      nextResendAt,
      resendCooldownSeconds: cooldown,
    };
  }
}
