import { Global, Module } from '@nestjs/common';
import { PermissionsController } from './permissions.controller';
import { PermissionsService } from './permissions.service';

/**
 * PermissionsModule di-mark `@Global()` supaya PermissionsService (yang
 * di-inject ke PermissionsGuard global) bisa dipakai oleh SEMUA module tanpa
 * harus import PermissionsModule satu per satu. Sebelumnya waktu guard
 * hanya pakai `user.permissions` dari snapshot JWT, module ini tidak wajib
 * ada di mana-mana. Sejak B2 fix (re-fetch dari DB di guard), tiap module
 * yang controller-nya kena PermissionsGuard WAJIB import PermissionsModule —
 * supaya kita tidak kena error DI di module manapun.
 *
 * Trade-off: `@Global()` membuat service ini singleton dan tersedia di
 * seluruh app — yang memang intended karena permission check adalah
 * concern lintas module.
 */
@Global()
@Module({
  controllers: [PermissionsController],
  providers: [PermissionsService],
  exports: [PermissionsService],
})
export class PermissionsModule {}
