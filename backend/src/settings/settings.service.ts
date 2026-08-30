import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Helper service untuk baca key-value settings global.
 *
 * Settings disimpan di tabel `settings` (key-value generic).
 * Diedit oleh superadmin via UI Bendahara (akan dibangun di iterasi berikutnya).
 *
 * Penggunaan umum:
 *   - settings.hargaDaftarUlang()        → number (Decimal disimpan sebagai string)
 *   - settings.ukuranBajuOptions()       → string[] (CSV)
 *   - settings.get('key')                → string | null
 *   - settings.getNumber('key', default) → number
 */
@Injectable()
export class SettingsService {
  private readonly logger = new Logger(SettingsService.name);

  constructor(private readonly prisma: PrismaService) {}

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
}