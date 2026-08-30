/**
 * Integration test: replay EXACTLY apa yang dilakukan global ValidationPipe
 * (di main.ts) terhadap payload frontend `{ phoneNumber: '081234567890' }`,
 * untuk memastikan error 400 "property phoneNumber should not exist" tidak
 * muncul lagi.
 *
 * ValidationPipe options (mirror main.ts):
 *   - whitelist: true
 *   - forbidNonWhitelisted: true
 *   - transform: true
 *   - transformOptions: { enableImplicitConversion: true }
 */
import { ValidationPipe } from '@nestjs/common';
import { RequestOtpDto, UpdateMyNumberDto, VerifyOtpDto } from '../whatsapp.controller';

function makePipe() {
  return new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    transformOptions: { enableImplicitConversion: true },
  });
}

describe('ValidationPipe integration (mirror main.ts config)', () => {
  it('ACCEPT { phoneNumber: "081234567890" } → tidak lagi 400 "property phoneNumber should not exist"', async () => {
    const pipe = makePipe();
    // Argumentasi shape: pipe.transform(body, { type: 'body', metatype: RequestOtpDto })
    const body: any = { phoneNumber: '081234567890' };
    const result = await pipe.transform(body, {
      type: 'body',
      metatype: RequestOtpDto,
    });
    expect(result).toBeInstanceOf(RequestOtpDto);
    expect(result.phoneNumber).toBe('081234567890');
  });

  it('ACCEPT { phoneNumber: "+6281234567890" }', async () => {
    const pipe = makePipe();
    const result: any = await pipe.transform(
      { phoneNumber: '+6281234567890' },
      { type: 'body', metatype: RequestOtpDto },
    );
    expect(result.phoneNumber).toBe('+6281234567890');
  });

  it('ACCEPT { phoneNumber: "6281234567890" }', async () => {
    const pipe = makePipe();
    const result: any = await pipe.transform(
      { phoneNumber: '6281234567890' },
      { type: 'body', metatype: RequestOtpDto },
    );
    expect(result.phoneNumber).toBe('6281234567890');
  });

  it('ACCEPT { whatsappNumber: "08123..." } untuk /number endpoint', async () => {
    const pipe = makePipe();
    const result: any = await pipe.transform(
      { whatsappNumber: '081234567890' },
      { type: 'body', metatype: UpdateMyNumberDto },
    );
    expect(result.whatsappNumber).toBe('081234567890');
  });

  it('ACCEPT { code: "123456" } untuk /verify-otp endpoint', async () => {
    const pipe = makePipe();
    const result: any = await pipe.transform(
      { code: '123456' },
      { type: 'body', metatype: VerifyOtpDto },
    );
    expect(result.code).toBe('123456');
  });

  it('TOLAK body kosong: {} → 400 BadRequestException (phoneNumber required)', async () => {
    const pipe = makePipe();
    await expect(
      pipe.transform({}, { type: 'body', metatype: RequestOtpDto }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('TOLAK extra property "no_wa" bersama "phoneNumber" → 400 (forbidNonWhitelisted)', async () => {
    const pipe = makePipe();
    // Legacy client yang kirim `no_wa` harus di-reject, bukan di-silent-strip.
    await expect(
      pipe.transform(
        { phoneNumber: '081234567890', no_wa: '081234567890' },
        { type: 'body', metatype: RequestOtpDto },
      ),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('TOLAK property extra "phone" (legacy name) → 400', async () => {
    // Frontend version lama yang pakai `phone` akan di-reject supaya FE dev tahu.
    const pipe = makePipe();
    await expect(
      pipe.transform(
        { phone: '081234567890' },
        { type: 'body', metatype: RequestOtpDto },
      ),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('TOLAK phoneNumber invalid (huruf) → 400', async () => {
    const pipe = makePipe();
    await expect(
      pipe.transform(
        { phoneNumber: 'abc123' },
        { type: 'body', metatype: RequestOtpDto },
      ),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('TOLAK phoneNumber null → 400', async () => {
    const pipe = makePipe();
    await expect(
      pipe.transform(
        { phoneNumber: null },
        { type: 'body', metatype: RequestOtpDto },
      ),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('TOLAK code < 6 digit → 400', async () => {
    const pipe = makePipe();
    await expect(
      pipe.transform(
        { code: '123' },
        { type: 'body', metatype: VerifyOtpDto },
      ),
    ).rejects.toMatchObject({ status: 400 });
  });
});
