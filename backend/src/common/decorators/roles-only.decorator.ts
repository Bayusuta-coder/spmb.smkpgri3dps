import { SetMetadata } from '@nestjs/common';

export const ROLES_ONLY_KEY = 'rolesOnly';

/**
 * Batasi endpoint ke role tertentu (case-insensitive).
 *
 * Dipakai untuk aksi-aksi ekstra-sensitif (mis. edit permission role, hapus
 * role) yang terlalu berisiko kalau hanya di-gate by `Permissions` decorator
 * (yang bisa di-bypass kalau permission di-toggle). Untuk Role Permission
 * page, kita MAINKAN pakai role check — hanya user dengan role "Superadmin"
 * yang boleh update role & permission, tidak peduli permission `role.manage`
 * aktif atau tidak.
 *
 * Contoh:
 *   @RolesOnly('Superadmin')
 *   @Patch(':id')
 *   update(...) { ... }
 *
 * Dicek oleh RolesOnlyGuard (lihat src/common/guards/roles-only.guard.ts).
 */
export const RolesOnly = (...roles: string[]) => SetMetadata(ROLES_ONLY_KEY, roles);
