import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_ONLY_KEY } from '../decorators/roles-only.decorator';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { JwtUserPayload } from '../decorators/current-user.decorator';

/**
 * Guard untuk endpoint yang harus diakses hanya oleh role tertentu
 * (paling ketat — di atas permission check). Dipakai oleh RolesController
 * supaya halaman Role & Permission hanya bisa di-edit oleh user dengan
 * role literal "Superadmin", terlepas dari permission `role.manage`.
 *
 * PENTING: jalan SETELAH JwtAuthGuard (supaya `req.user` sudah terisi)
 * dan setelah PermissionsGuard (permission check tetap dilakukan dulu).
 * Guard ini di-decorate di controller level — tidak perlu pakai global.
 */
@Injectable()
export class RolesOnlyGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    // Public endpoint skip
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const required = this.reflector.getAllAndOverride<string[]>(ROLES_ONLY_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true; // tidak ada constraint

    const req = context.switchToHttp().getRequest();
    const user = req.user as JwtUserPayload | undefined;
    if (!user) throw new ForbiddenException('Tidak terautentikasi');

    const userRoles = (user.roles || []).map((r) => r.toLowerCase());
    const ok = required.some((r) => userRoles.includes(r.toLowerCase()));
    if (!ok) {
      throw new ForbiddenException(
        `Akses ditolak. Endpoint ini hanya untuk role: ${required.join(', ')}`,
      );
    }
    return true;
  }
}
