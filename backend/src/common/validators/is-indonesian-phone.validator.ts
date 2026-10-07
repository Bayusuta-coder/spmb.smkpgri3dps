import {
  registerDecorator,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
  ValidationArguments,
} from 'class-validator';

/**
 * Validator untuk nomor telepon Indonesia.
 *
 * Aturan (sesuai brief B4):
 *   - Wajib angka saja (digit-only, tidak ada spasi/dash/plus/dll).
 *   - Wajib diawali "08" (format UI yang ditampilkan ke user).
 *   - Total panjang 10–13 digit.
 *   - Setelah "08", digit ke-3 dst adalah nomor subscriber (wajib digit).
 *
 * Berlaku untuk semua field noTelp di form pendaftar (noTelp pendaftar,
 * noTelpOrtu) dan field whatsappNumber di form user/panitia.
 *
 * Untuk konsistensi dengan normalisasi WhatsApp (lihat whatsapp.util.ts),
 * gunakan pola ini HANYA untuk input UI; backend service akan tetap
 * menormalisasi ke E.164 (62xxxxxxxxxx) saat disimpan ke DB.
 */
@ValidatorConstraint({ name: 'isIndonesianPhone', async: false })
export class IsIndonesianPhoneConstraint implements ValidatorConstraintInterface {
  validate(value: any) {
    if (value == null || value === '') return true; // optional
    if (typeof value !== 'string') return false;
    return /^08\d{8,11}$/.test(value);
  }

  defaultMessage(args: ValidationArguments) {
    const v = args.value;
    if (typeof v !== 'string' || !/^\d+$/.test(v)) {
      return 'Nomor telepon hanya boleh berisi angka';
    }
    if (!v.startsWith('08')) {
      return 'Nomor telepon harus diawali "08" (mis. 081234567890)';
    }
    if (v.length < 10 || v.length > 13) {
      return `Panjang nomor telepon tidak valid (${v.length} digit, harus 10–13 digit)`;
    }
    return 'Nomor telepon tidak valid';
  }
}

export function IsIndonesianPhone(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName,
      options: validationOptions,
      constraints: [],
      validator: IsIndonesianPhoneConstraint,
    });
  };
}
