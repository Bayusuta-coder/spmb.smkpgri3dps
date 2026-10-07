import { CanActivate, ExecutionContext, ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { JwtUserPayload } from '../decorators/current-user.decorator';
import { PermissionsService } from '../../permissions/permissions.service';

/**
 * Guard enforce `@Permissions()` decorator.
 *
 * SECURITY MODEL (Fix B2 — permission harus follow DB, bukan snapshot JWT):
 *
 *   - Token JWT membawa snapshot permissions saat login (lihat auth.service.ts).
 *   - Tanpa re-fetch, perubahan permission role (toggle off lewat halaman
 *     Role & Permission) baru berlaku setelah user logout/login lagi karena
 *     JWT sudah kadaluarsa (8h). Ini bug yang ditemukan user: superadmin
 *     masih bisa akses endpoint reject walau permission `spmb.reject` di-off.
 *   - Fix: setiap request yang masuk ke endpoint ber-decorator `@Permissions()`,
 *     guard re-fetch permission codes fresh dari DB (1 query via
 *     PermissionsService.resolveForUser). Hasil ini jadi acuan, BUKAN
 *     `user.permissions` dari JWT.
 *
 * DECISION: Superadmin TIDAK otomatis bypass permission check. Kalau superadmin
 * role di-toggle permission-nya off lewat matrix, superadmin kehilangan akses
 * sampai permission di-toggle on lagi — sama seperti role lain. Tidak ada
 * implicit "superadmin always full access". Kalau mau exception, harus
 * didokumentasikan eksplisit dan ditambah di branch terpisah (sengaja tidak
 * ditambah di sini).
 *
 * FAIL-OPEN / FAIL-CLOSED: kalau DB error saat re-fetch, fallback ke
 * `user.permissions` dari JWT supaya availability terjaga. Kalau DB error
 * persisten, login/logout ulang akan refresh. Trade-off: prefer availability
 * over strict security untuk guard helper (vs authorization-critical endpoints
 * yang punya role check inline seperti UsersController.assertSuperadmin).
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  private readonly logger = new Logger(PermissionsGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly perms: PermissionsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const required = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const req = context.switchToHttp().getRequest();
    const user = req.user as JwtUserPayload | undefined;
    if (!user) throw new ForbiddenException('Tidak terautentikasi');

    // Re-fetch fresh permissions dari DB. Fallback ke JWT kalau DB error.
    let effectivePerms: string[];
    try {
      effectivePerms = await this.perms.resolveForUser(user.sub);
    } catch (e: any) {
      this.logger.warn(
        `Gagal re-fetch permission untuk user ${user.sub}: ${e?.message}. Fallback ke snapshot JWT.`,
      );
      effectivePerms = user.permissions || [];
    }

    const userPerms = new Set(effectivePerms);
    const ok = required.some((code) => userPerms.has(code));
    if (!ok) {
      throw new ForbiddenException(
        `Akses ditolak. Butuh salah satu permission: ${required.join(', ')}`,
      );
    }
    return true;
  }
}
