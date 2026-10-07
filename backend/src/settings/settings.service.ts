import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from '../audit-log/audit-log.service';

/**
 * Helper service untuk baca key-value settings global.
 *
 * Settings disimpan di tabel `settings` (key-value generic).
 * Diedit oleh superadmin via UI Pengaturan Harga (route `/pengaturan-harga`,
 * permission `settings.manage`). Audit log perubahan disimpan di tabel
 * `audit_logs` dengan action `setting.harga_daftar_ulang_updated` —
 * bisa dilihat di menu Audit Log atau di halaman Pengaturan Harga sendiri.
 *
 * Penggunaan umum:
 *   - settings.hargaDaftarUlang()        → number (Decimal disimpan sebagai string)
 *   - settings.ukuranBajuOptions()       → string[] (CSV)
 *   - settings.get('key')                → string | null
 *   - settings.getNumber('key', default) → number
 *   - settings.updateHargaDaftarUlang()  → write + audit
 */
@Injectable()
export class SettingsService {
  private readonly logger = new Logger(SettingsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogService,
  ) {}

  /** Baca raw value by key. Returns null jika tidak ditemukan. */
  async get(key: string): Promise<string | null> {
    const row = await this.prisma.setting
      .findUnique({ where: { key } })
      .catch(() => null);
    return row?.value ?? null;
  }

  /**
   * Baca value as number. Default 0 jika kosong/invalid (kami log warning supaya
   * operator tahu ada setting corrupt).
   */
  async getNumber(key: string, fallback = 0): Promise<number> {
    const raw = await this.get(key);
    if (raw == null) return fallback;
    const n = Number(raw);
    if (!Number.isFinite(n)) {
      this.logger.warn(`Setting '${key}' corrupt: '${raw}' — fallback ke ${fallback}`);
      return fallback;
    }
    return n;
  }

  /** Harga daftar ulang (snapshot ke pendaftar_spmb.nominalPembayaran saat approve). */
  async hargaDaftarUlang(): Promise<number> {
    return this.getNumber('harga_daftar_ulang', 350000);
  }

  /** Pilihan ukuran baju (CSV: "XS,S,M,L,XL,XXL,XXXL"). */
  async ukuranBajuOptions(): Promise<string[]> {
    const raw = await this.get('ukuran_baju_options');
    if (!raw) return ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL'];
    return raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }

  /**
   * Baca row Setting `harga_daftar_ulang` lengkap dengan metadata updatedBy
   * untuk ditampilkan di UI Pengaturan Harga.
   */
  async getHargaDaftarUlangWithMeta() {
    const row = await this.prisma.setting.findUnique({
      where: { key: 'harga_daftar_ulang' },
    });
    if (!row) {
      return {
        value: await this.hargaDaftarUlang(), // fallback ke default 350000
        updatedAt: null,
        updatedByNama: null,
        updatedByEmail: null,
      };
    }
    return {
      value: Number(row.value),
      updatedAt: row.updatedAt,
      updatedByNama: row.updatedByNama,
      updatedByEmail: row.updatedByEmail,
    };
  }

  /**
   * Update harga daftar ulang. Validasi > 0, simpan snapshot updatedBy
   * (nama + email) supaya readable walau user dihapus, dan tulis audit log
   * dengan before/after value.
   *
   * Snapshot dibuat sebelum update supaya nama user aslinya (yang akan
   * di-snapshot ke baris Setting) di-bind ke nilai user yang SEDANG AKTIF
   * saat update — bukan yang mungkin sudah dihapus/diganti nanti.
   */
  async updateHargaDaftarUlang(opts: {
    userId: string;
    userName: string;
    userEmail: string;
    value: number;
  }) {
    if (!Number.isFinite(opts.value) || opts.value <= 0) {
      throw new BadRequestException('Nominal harga harus angka > 0');
    }
    // Hard cap 100 juta supaya typo tidak nyimpan nilai absurd.
    if (opts.value > 100_000_000) {
      throw new BadRequestException(
        'Nominal harga terlalu besar (maks Rp 100.000.000). Periksa kembali input.',
      );
    }

    const oldValue = await this.hargaDaftarUlang();
    const newValue = Math.round(opts.value); // bulatkan ke rupiah terdekat

    // Upsert dengan snapshot updatedBy
    await this.prisma.setting.upsert({
      where: { key: 'harga_daftar_ulang' },
      create: {
        key: 'harga_daftar_ulang',
        value: String(newValue),
        description: 'Harga daftar ulang per siswa (snapshot ke pendaftar.nominalPembayaran)',
        updatedByUserId: opts.userId,
        updatedByNama: opts.userName,
        updatedByEmail: opts.userEmail,
      },
      update: {
        value: String(newValue),
        updatedByUserId: opts.userId,
        updatedByNama: opts.userName,
        updatedByEmail: opts.userEmail,
      },
    });

    // Audit log perubahan harga
    await this.audit.create({
      userId: opts.userId,
      userName: opts.userName,
      userEmail: opts.userEmail,
      action: 'setting.harga_daftar_ulang_updated',
      module: 'settings',
      entityType: 'Setting',
      entityId: 'harga_daftar_ulang',
      meta: { oldValue, newValue },
    });

    this.logger.log(
      `Harga daftar ulang diubah ${opts.userName} (${opts.userEmail}): ${oldValue} → ${newValue}`,
    );

    return { value: newValue, oldValue };
  }
}