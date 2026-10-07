import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { SettingsService } from './settings.service';
import { Permissions } from '../common/decorators/permissions.decorator';
import { CurrentUser, JwtUserPayload } from '../common/decorators/current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Settings HTTP Controller.
 *
 * Sebelumnya fitur "Pengaturan Harga" di Bendahara tidak berfungsi karena
 * tidak ada HTTP endpoint untuk baca/tulis `harga_daftar_ulang` di tabel
 * `settings` — `SettingsService` hanya dipakai internal oleh PendaftarService
 * untuk snapshot harga saat approval. Sekarang ditambah endpoint supaya
 * Superadmin bisa edit dari UI frontend-admin (menu "Pengaturan Harga",
 * route `/pengaturan-harga`).
 *
 * Audit log perubahan: pakai AuditLog existing dengan action
 * `setting.harga_daftar_ulang_updated`, entityId = `harga_daftar_ulang`.
 * History bisa dilihat di:
 *   - `/audit` (filter module=settings) — semua perubahan
 *   - `/pengaturan-harga` — list 20 terakhir khusus key ini
 *
 * Permission: `settings.manage` (sudah ada di seed.ts Superadmin role).
 */
@ApiTags('settings')
@ApiBearerAuth('bearer')
@Controller('settings')
export class SettingsController {
  constructor(
    private readonly settings: SettingsService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * GET /settings/harga-daftar-ulang
   * Response: { value: number, updatedAt: Date|null, updatedByNama, updatedByEmail }
   */
  @Get('harga-daftar-ulang')
  @Permissions('settings.view')
  async getHargaDaftarUlang() {
    return this.settings.getHargaDaftarUlangWithMeta();
  }

  /**
   * PUT /settings/harga-daftar-ulang
   * Body: { value: number }
   * Permission: settings.manage (Superadmin only via role/permission matrix)
   */
  @Put('harga-daftar-ulang')
  @Permissions('settings.manage')
  async updateHargaDaftarUlang(
    @CurrentUser() user: JwtUserPayload,
    @Body() body: { value?: number | string },
  ) {
    const raw = body?.value;
    const value =
      typeof raw === 'string'
        ? Number(raw.replace(/[^0-9.-]/g, '')) // strip "Rp", ".", dll
        : Number(raw);

    if (!user?.sub) {
      throw new BadRequestException('User tidak terautentikasi');
    }

    return this.settings.updateHargaDaftarUlang({
      userId: user.sub,
      userName: user.name,
      userEmail: user.email,
      value,
    });
  }

  /**
   * GET /settings/audit-log?key=harga_daftar_ulang&page=1&pageSize=20
   * History perubahan untuk satu setting key tertentu. Dipakai oleh UI
   * PengaturanHarga untuk menampilkan list "lama → baru" tanpa harus
   * filter manual di halaman Audit Log utama.
   */
  @Get('audit-log')
  @Permissions('settings.view')
  async getAuditLog(
    @Query('key') key: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    if (!key) {
      throw new BadRequestException('Query "key" wajib diisi');
    }
    const pageNum = Math.max(1, Number(page) || 1);
    const pageSizeNum = Math.min(100, Math.max(1, Number(pageSize) || 20));

    const [items, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({
        where: {
          module: 'settings',
          entityId: key,
        },
        orderBy: { createdAt: 'desc' },
        skip: (pageNum - 1) * pageSizeNum,
        take: pageSizeNum,
      }),
      this.prisma.auditLog.count({
        where: { module: 'settings', entityId: key },
      }),
    ]);

    return {
      items: items.map((it) => ({
        id: it.id,
        action: it.action,
        createdAt: it.createdAt,
        userName: it.userName,
        userEmail: it.userEmail,
        meta: it.meta, // { oldValue, newValue }
      })),
      total,
      page: pageNum,
      pageSize: pageSizeNum,
    };
  }
}