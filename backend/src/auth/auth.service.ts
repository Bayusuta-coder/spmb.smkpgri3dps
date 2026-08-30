import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { Throttle } from '@nestjs/throttler';

import { PrismaService } from '../prisma/prisma.service';
import { JwtUserPayload } from '../common/decorators/current-user.decorator';
import { EmailService } from '../email/email.service';
import { AuditLogService } from '../audit-log/audit-log.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly email: EmailService,
    private readonly audit: AuditLogService,
  ) {}

  /**
   * Login admin/TU/superadmin. Pemblokiran brute force dilakukan via Throttle di controller.
   */
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async login(email: string, password: string) {
    const user = await this.prisma.user.findUnique({
      where: { email },
      include: {
        roles: {
          include: {
            role: {
              include: {
                permissions: {
                  include: { permission: true },
                },
              },
            },
          },
        },
      },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('Email atau password salah');
    }

    const ok = await bcrypt.compare(password, user.password);
    if (!ok) {
      throw new UnauthorizedException('Email atau password salah');
    }

    const permissions = new Set<string>();
    const roles: string[] = [];
    for (const ur of user.roles) {
      roles.push(ur.role.name);
      for (const rp of ur.role.permissions) {
        permissions.add(rp.permission.code);
      }
    }

    const payload: JwtUserPayload = {
      sub: user.id,
      email: user.email,
      name: user.name,
      permissions: Array.from(permissions),
      roles,
    };

    const token = await this.jwt.signAsync(payload);
    const expiresIn = this.config.get<string>('JWT_EXPIRES_IN', '8h');

    return {
      access_token: token,
      token_type: 'Bearer',
      expires_in: expiresIn,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        roles,
        permissions: Array.from(permissions),
      },
    };
  }

  async me(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        roles: {
          include: {
            role: {
              include: {
                permissions: { include: { permission: true } },
              },
            },
          },
        },
      },
    });
    if (!user) throw new UnauthorizedException();

    const permissions = new Set<string>();
    const roles: string[] = [];
    for (const ur of user.roles) {
      roles.push(ur.role.name);
      for (const rp of ur.role.permissions) {
        permissions.add(rp.permission.code);
      }
    }

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      isActive: user.isActive,
      roles,
      permissions: Array.from(permissions),
    };
  }

  // ===========================================================================
  // SELF-SERVICE PASSWORD RESET
  // ===========================================================================

  /** TTL token reset (menit). Default 30 menit. */
  private getResetTtlMinutes(): number {
    const raw = this.config.get<string>('PASSWORD_RESET_TOKEN_TTL');
    const n = raw ? Number(raw) : 30;
    return Number.isFinite(n) && n > 0 ? n : 30;
  }

  /**
   * Hash token raw pakai SHA-256 untuk disimpan di DB.
   * Token raw hanya hidup di URL email — DB dump tidak berguna.
   * SHA-256 cukup karena token raw sudah 32 byte random (256 bit entropy),
   * bukan password low-entropy.
   */
  private hashToken(rawToken: string): string {
    return crypto.createHash('sha256').update(rawToken).digest('hex');
  }

  /**
   * Generate token raw (akan dikirim via email) + hashed form (disimpan DB).
   * 32 byte random → 64 hex char.
   */
  private generateResetToken(): { raw: string; hash: string } {
    const raw = crypto.randomBytes(32).toString('hex');
    return { raw, hash: this.hashToken(raw) };
  }

  /**
   * Compose URL reset yang akan dikirim via email.
   * Berupa `${FRONTEND_ADMIN_ORIGIN}/reset-password/${token}`.
   */
  private buildResetLink(rawToken: string): string {
    const origin =
      this.config.get<string>('FRONTEND_ADMIN_ORIGIN') || 'http://localhost:5174';
    // strip trailing slash supaya URL nggak double
    const base = origin.replace(/\/+$/, '');
    return `${base}/reset-password/${rawToken}`;
  }

  /**
   * STEP 1: User minta link reset.
   *
   * SELALU return sukses (tanpa bocorin apakah email ada atau tidak) —
   * anti-enumeration. Email beneran hanya dikirim kalau user ada & aktif.
   *
   * @returns selalu `{ ok: true, message: ... }` ke caller.
   */
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  async requestPasswordReset(
    email: string,
    meta: { ipAddress?: string; userAgent?: string } = {},
  ) {
    const genericMessage =
      'Jika email terdaftar, link reset telah dikirim ke inbox Anda.';

    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || !user.isActive) {
      // Audit log "requested for unknown/inactive email" — penting untuk
      // deteksi probing, tapi TIDAK membedakan di response.
      await this.audit
        .create({
          userId: null,
          action: 'auth.password_reset_requested',
          module: 'auth',
          entityType: 'User',
          entityId: user?.id ?? undefined,
          ipAddress: meta.ipAddress,
          userAgent: meta.userAgent,
          meta: { email, resolved: !!user, active: user?.isActive ?? false },
        })
        .catch(() => null);
      return { ok: true, message: genericMessage };
    }

    const { raw, hash } = this.generateResetToken();
    const ttlMin = this.getResetTtlMinutes();
    const expires = new Date(Date.now() + ttlMin * 60 * 1000);

    await this.prisma.user.update({
      where: { id: user.id },
      data: { resetTokenHash: hash, resetTokenExpires: expires },
    });

    const link = this.buildResetLink(raw);
    const sendResult = await this.email.sendPasswordReset(
      user.email,
      user.name,
      link,
      ttlMin,
    );

    await this.audit
      .create({
        userId: user.id,
        action: 'auth.password_reset_requested',
        module: 'auth',
        entityType: 'User',
        entityId: user.id,
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
        meta: {
          email,
          emailSent: sendResult.sent,
          emailError: sendResult.error ?? null,
          ttlMinutes: ttlMin,
        },
      })
      .catch(() => null);

    // DEV-MODE PREVIEW: kalau SMTP tidak terkirim beneran (EmailService tandai
    // `preview: true` saat SMTP belum dikonfigurasi) DAN bukan production,
    // sertakan `devResetLink` di response supaya tester bisa klik link tanpa
    // harus setup SMTP. Di production, field ini TIDAK pernah dikembalikan
    // (attacker tidak boleh bisa enumerate reset link via response probing).
    const isProd = this.config.get<string>('NODE_ENV') === 'production';
    const devResetLink =
      !isProd && (sendResult.preview || !sendResult.sent) ? link : null;

    return { ok: true, message: genericMessage, ...(devResetLink ? { devResetLink } : {}) };
  }

  /**
   * STEP 2: User submit password baru dari link di email.
   *
   * Validasi:
   *  - token hash cocok dengan yang di DB
   *  - token belum expired
   *  - user masih aktif
   *
   * Side effects kalau sukses:
   *  - hash password baru (bcrypt cost 12)
   *  - HAPUS resetTokenHash + resetTokenExpires (single-use)
   *  - audit log success
   *
   * Kalau gagal: audit log failure, throw BadRequest generik (jangan bocorin
   * apakah token-nya invalid, expired, atau sudah dipakai — biar attacker
   * nggak bisa enumerate).
   */
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async resetPassword(
    rawToken: string,
    newPassword: string,
    meta: { ipAddress?: string; userAgent?: string } = {},
  ) {
    if (!rawToken || rawToken.length < 32) {
      throw new BadRequestException('Token reset tidak valid');
    }
    const hash = this.hashToken(rawToken);

    // `resetTokenHash` punya @@index tapi bukan @unique (bisa multiple null),
    // jadi pakai findFirst (bukan findUnique).
    const user = await this.prisma.user.findFirst({
      where: { resetTokenHash: hash },
    });

    const failAndAudit = async (reason: string) => {
      await this.audit
        .create({
          userId: user?.id ?? null,
          action: 'auth.password_reset_failed',
          module: 'auth',
          entityType: 'User',
          entityId: user?.id ?? undefined,
          ipAddress: meta.ipAddress,
          userAgent: meta.userAgent,
          meta: { reason },
        })
        .catch(() => null);
      throw new BadRequestException(
        'Token reset tidak valid atau sudah kedaluwarsa. Minta link baru.',
      );
    };

    if (!user) return failAndAudit('token_not_found');
    if (!user.isActive) return failAndAudit('user_inactive');
    if (!user.resetTokenExpires || user.resetTokenExpires < new Date()) {
      // bersihkan token expired supaya DB bersih
      await this.prisma.user.update({
        where: { id: user.id },
        data: { resetTokenHash: null, resetTokenExpires: null },
      }).catch(() => null);
      return failAndAudit('token_expired');
    }

    const newHashed = await bcrypt.hash(newPassword, 12);

    // Single-use: HAPUS token saat berhasil reset.
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        password: newHashed,
        resetTokenHash: null,
        resetTokenExpires: null,
      },
    });

    await this.audit
      .create({
        userId: user.id,
        action: 'auth.password_reset_completed',
        module: 'auth',
        entityType: 'User',
        entityId: user.id,
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
        // JANGAN log password baru / hashnya di meta
        meta: { method: 'email_link' },
      })
      .catch(() => null);

    return { ok: true, message: 'Password berhasil direset. Silakan login dengan password baru.' };
  }
}
