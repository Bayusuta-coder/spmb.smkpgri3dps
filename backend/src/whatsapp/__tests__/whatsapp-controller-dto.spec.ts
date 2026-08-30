/**
 * Integration-style test untuk WhatsappController DTO ValidationPipe.
 *
 * Tujuan: pastikan DTO `RequestOtpDto` divalidasi dengan benar oleh class-validator
 * global ValidationPipe. Tes ini menghindari network call — langsung instantiate
 * class dengan payload dan panggil validateSync() untuk mirror apa yang dilakukan
 * oleh pipe sebelum controller method dipanggil.
 *
 * Catatan penting (untuk referensi engineer berikutnya):
 *
 *   ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })
 *   di main.ts artinya:
 *     1. Property di body WAJIB ada decorator di DTO, kalau tidak → di-strip (whitelist).
 *     2. Kalau ada property ekstra di body yang TIDAK ada di DTO → 400 "property X
 *        should not exist".
 *     3. Payload otomatis di-cast sesuai tipe DTO + transform.
 *
 *   Untuk /api/whatsapp/request-otp:
 *     - Body harus punya `phoneNumber` saja (lokal/internasional).
 *     - Kalau body kosong, atau property nama salah (e.g. "no_wa"), atau
 *       `phoneNumber` invalid → akan dapat 400.
 */
import { validateSync } from 'class-validator';
import { plainToInstance } from 'class-transformer';

import {
  RequestOtpDto,
  VerifyOtpDto,
  UpdateMyNumberDto,
} from '../whatsapp.controller';

function validateBodyInstance(DtoClass: any, payload: any) {
  const instance = plainToInstance(DtoClass, payload);
  return validateSync(instance, { skipMissingProperties: false });
}

describe('RequestOtpDto (validation contract untuk POST /api/whatsapp/request-otp)', () => {
  it('lolos validasi: { phoneNumber: "081234567890" } (format lokal Indonesia)', () => {
    const errors = validateBodyInstance(RequestOtpDto, { phoneNumber: '081234567890' });
    expect(errors).toHaveLength(0);
  });

  it('lolos validasi: { phoneNumber: "+6281234567890" } (format internasional +)', () => {
    const errors = validateBodyInstance(RequestOtpDto, { phoneNumber: '+6281234567890' });
    expect(errors).toHaveLength(0);
  });

  it('lolos validasi: { phoneNumber: "6281234567890" } (format internasional tanpa +)', () => {
    const errors = validateBodyInstance(RequestOtpDto, { phoneNumber: '6281234567890' });
    expect(errors).toHaveLength(0);
  });

  it('lolos validasi: { phoneNumber: "+62 (812) 3456-7890" } (dengan spasi, kurung, dash)', () => {
    const errors = validateBodyInstance(RequestOtpDto, { phoneNumber: '+62 (812) 3456-7890' });
    expect(errors).toHaveLength(0);
  });

  it('TOLAK: phoneNumber kosong string', () => {
    const errors = validateBodyInstance(RequestOtpDto, { phoneNumber: '' });
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((e: any) => /phoneNumber/.test(e.property))).toBe(true);
  });

  it('TOLAK: phoneNumber hilang (body kosong)', () => {
    const errors = validateBodyInstance(RequestOtpDto, {});
    expect(errors.length).toBeGreaterThan(0);
  });

  it('TOLAK: phoneNumber berisi karakter non-numerik/non-simbol-izinkan', () => {
    // Huruf dan simbol liar harus ditolak
    const errors = validateBodyInstance(RequestOtpDto, { phoneNumber: 'abc123' });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('TOLAK: phoneNumber terlalu panjang (> 32 char)', () => {
    const errors = validateBodyInstance(RequestOtpDto, { phoneNumber: '0'.repeat(40) });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('TOLAK: phoneNumber bukan string', () => {
    // TS akan memaksa jadi string tapi runtime bisa kirim number/null/etc.
    // Class-validator @IsString harus reject ini.
    const errors = validateBodyInstance(RequestOtpDto, { phoneNumber: 6281234567890 });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('TOLAK: phoneNumber null', () => {
    const errors = validateBodyInstance(RequestOtpDto, { phoneNumber: null });
    expect(errors.length).toBeGreaterThan(0);
  });
});

describe('VerifyOtpDto (validation contract untuk POST /api/whatsapp/verify-otp)', () => {
  it('lolos validasi: code 6 digit numeric', () => {
    const errors = validateBodyInstance(VerifyOtpDto, { code: '123456' });
    expect(errors).toHaveLength(0);
  });

  it('TOLAK: code 5 digit', () => {
    const errors = validateBodyInstance(VerifyOtpDto, { code: '12345' });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('TOLAK: code berisi huruf', () => {
    const errors = validateBodyInstance(VerifyOtpDto, { code: '12345a' });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('TOLAK: code kosong', () => {
    const errors = validateBodyInstance(VerifyOtpDto, { code: '' });
    expect(errors.length).toBeGreaterThan(0);
  });
});

describe('UpdateMyNumberDto (validation contract untuk PUT /api/whatsapp/number)', () => {
  it('lolos validasi: whatsappNumber "08xxxxxxxxxx"', () => {
    const errors = validateBodyInstance(UpdateMyNumberDto, { whatsappNumber: '081234567890' });
    expect(errors).toHaveLength(0);
  });

  it('TOLAK: whatsappNumber hilang', () => {
    const errors = validateBodyInstance(UpdateMyNumberDto, {});
    expect(errors.length).toBeGreaterThan(0);
  });

  it('TOLAK: whatsappNumber invalid (huruf)', () => {
    const errors = validateBodyInstance(UpdateMyNumberDto, { whatsappNumber: 'abc' });
    expect(errors.length).toBeGreaterThan(0);
  });
});
