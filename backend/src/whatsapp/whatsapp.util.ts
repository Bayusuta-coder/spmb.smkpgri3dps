/**
 * Utilitas WhatsApp — normalisasi nomor + OTP generator/helper.
 *
 * Dipakai oleh WhatsappService & WhatsappOtpService. TIDAK ada side effect
 * ke DB / network — pure functions yang gampang di-unit-test.
 */
import { createHash, randomInt } from 'crypto';

// ─── Normalisasi nomor telepon ───────────────────────────────────────────

/**
 * Aturan normalisasi (Indonesia-centric):
 *
 *   081234567890     → 6281234567890      (kode negara 62, drop leading 0)
 *   +62 812 3456 7890 → 6281234567890     (drop +, spaces, leading 0 after 62)
 *   6281234567890    → 6281234567890      (sudah E.164)
 *   +1 555 1234      → reject (bukan ID)
 *
 * Return:
 *   - normalized: E.164 string `62xxxxxxxxxx` (10–13 digit setelah prefix)
 *   - error: string human-readable kalau tidak valid
 */
export interface PhoneNormalizeResult {
  ok: boolean;
  normalized?: string;
  error?: string;
}

const ID_COUNTRY_CODE = '62';
const MIN_LOCAL_LENGTH = 8; // paling pendek: 812345678 (9 digit IDN)
const MAX_LOCAL_LENGTH = 13; // safeguard

export function normalizePhoneNumber(input: string): PhoneNormalizeResult {
  if (input == null || typeof input !== 'string') {
    return { ok: false, error: 'Nomor tidak boleh kosong' };
  }

  // Strip semua whitespace, dash, parens, plus sign di awal
  const cleaned = input.trim().replace(/[\s\-()]/g, '').replace(/^\+/, '');

  // Wajib digit-only setelah cleaning
  if (!/^\d+$/.test(cleaned)) {
    return { ok: false, error: 'Nomor hanya boleh berisi angka' };
  }

  let digits = cleaned;

  // Kalau mulai dengan '0' → drop leading 0, prepend '62'
  if (digits.startsWith('0')) {
    digits = ID_COUNTRY_CODE + digits.slice(1);
  }

  // Kalau belum ada country code & panjangnya local-only (< 5 digit country
  // code) → asumsikan Indonesia (62)
  // Heuristic: kalau bukan '62' prefix dan panjang 8–13 → anggap nomor lokal ID
  if (!digits.startsWith(ID_COUNTRY_CODE)) {
    if (digits.length >= MIN_LOCAL_LENGTH && digits.length <= MAX_LOCAL_LENGTH) {
      digits = ID_COUNTRY_CODE + digits;
    } else {
      return {
        ok: false,
        error: 'Nomor harus diawali 0, 62, atau +62 (Indonesia)',
      };
    }
  }

  // Country code 62 harus diikuti 9–13 digit (no length prefix)
  const local = digits.slice(ID_COUNTRY_CODE.length);
  if (local.length < MIN_LOCAL_LENGTH || local.length > MAX_LOCAL_LENGTH) {
    return {
      ok: false,
      error: `Panjang nomor tidak valid (${local.length} digit setelah 62)`,
    };
  }

  // Nomor Indonesia mobile selalu mulai dengan '8' setelah country code
  if (!local.startsWith('8')) {
    return {
      ok: false,
      error: 'Nomor Indonesia harus dimulai dengan 8 setelah kode negara (mis. 812...)',
    };
  }

  return { ok: true, normalized: digits };
}

/** Cek apakah nomor terlihat seperti nomor valid (untuk sanity-check cepat) */
export function isLikelyValidPhone(input: string | null | undefined): boolean {
  if (!input) return false;
  return normalizePhoneNumber(input).ok;
}

// ─── OTP generation & hashing ────────────────────────────────────────────

/**
 * Generate OTP 6-digit (string). Range 000000–999999, di-zero-pad supaya
 * selalu 6 char (supaya gampang di-input manual). Pakai crypto.randomInt
 * untuk unpredictability — Math.random() tidak aman.
 */
export function generateOtp(length: number = 6): string {
  const max = 10 ** length;
  const n = randomInt(0, max);
  return n.toString().padStart(length, '0');
}

/**
 * Hash OTP dengan SHA-256. Plaintext OTP TIDAK PERNAH disimpan di DB —
 * kalau DB bocor, attacker cuma dapat hash yang tidak bisa di-reverse
 * untuk dapat raw code. Pattern sama dengan resetToken (lihat auth.service.ts).
 */
export function hashOtp(rawOtp: string): string {
  return createHash('sha256').update(rawOtp).digest('hex');
}

/** Verify OTP cocok dengan hash */
export function verifyOtpHash(rawOtp: string, hash: string): boolean {
  return hashOtp(rawOtp) === hash;
}

/**
 * Mask nomor untuk display (privacy). Mis. `6281234567890` → `62812*****890`.
 * Dipakai di log & UI supaya operator tidak lihat full nomor user lain.
 */
export function maskPhone(phone: string | null | undefined): string {
  if (!phone) return '—';
  if (phone.length < 8) return phone;
  const start = phone.slice(0, 5);
  const end = phone.slice(-3);
  const masked = '*'.repeat(Math.max(0, phone.length - 8));
  return `${start}${masked}${end}`;
}

// ─── Format pesan ──────────────────────────────────────────────────────────

/**
 * Replace placeholder {key} di template string dengan value dari data object.
 * Placeholder yang tidak ada di data akan di-skip (tidak di-throw).
 */
export function renderMessageTemplate(
  template: string,
  data: Record<string, string | number>,
): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => {
    const v = data[key];
    return v == null ? `{${key}}` : String(v);
  });
}