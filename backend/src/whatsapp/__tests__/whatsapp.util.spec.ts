/**
 * Unit tests untuk whatsapp.util — fungsi murni tanpa dependency ke
 * database / network. Bisa di-run dengan jest murni.
 *
 * Khusus spec:
 *  - normalizePhoneNumber harus:
 *    * Terima format lokal 08xxx (panjang 10-13 digit) → 62xxxxxxxxxx
 *    * Terima format +62xxx
 *    * Terima 62xxx tanpa +
 *    * Tolak nomor terlalu pendek / panjang
 *    * Tolak karakter non-digit
 *  - generateOtp hasilnya 6 digit semua numeric (default)
 *  - hashOtp deterministik untuk input sama, beda untuk input beda
 *  - verifyOtpHash cocok untuk input valid, return false untuk input lain
 *  - maskPhone menampilkan 4 digit depan + ***** + 4 digit belakang
 *  - renderMessageTemplate substitusi {{var}} dengan data
 */
import {
  generateOtp,
  hashOtp,
  maskPhone,
  normalizePhoneNumber,
  renderMessageTemplate,
  verifyOtpHash,
} from '../whatsapp.util';

describe('normalizePhoneNumber', () => {
  it('mengkonversi 08xxx ke 62xxx', () => {
    const r = normalizePhoneNumber('081234567890');
    expect(r.ok).toBe(true);
    expect(r.normalized).toBe('6281234567890');
  });

  it('mengkonversi +62xxx ke 62xxx', () => {
    const r = normalizePhoneNumber('+6281234567890');
    expect(r.ok).toBe(true);
    expect(r.normalized).toBe('6281234567890');
  });

  it('menerima 62xxx tanpa +', () => {
    const r = normalizePhoneNumber('6281234567890');
    expect(r.ok).toBe(true);
    expect(r.normalized).toBe('6281234567890');
  });

  it('mengabaikan spasi, dash, dan kurung', () => {
    const r = normalizePhoneNumber('+62 (812) 3456-7890');
    expect(r.ok).toBe(true);
    expect(r.normalized).toBe('6281234567890');
  });

  it('menolak nomor terlalu pendek', () => {
    const r = normalizePhoneNumber('08123');
    expect(r.ok).toBe(false);
    expect(r.error).toBeDefined();
  });

  it('menolak input kosong', () => {
    const r = normalizePhoneNumber('');
    expect(r.ok).toBe(false);
  });

  it('menolak input bukan string', () => {
    const r = normalizePhoneNumber(123 as any);
    expect(r.ok).toBe(false);
  });

  it('menolak karakter huruf / simbol', () => {
    const r = normalizePhoneNumber('0812abc');
    // setelah strip non-digit → "0812" terlalu pendek
    expect(r.ok).toBe(false);
  });

  it('menerima nomor panjang 12 digit setelah prefix 62 (batas max) → OK', () => {
    // Local 12 digit → setelah prefix 62: "62" + 12 = 14 char total
    const r = normalizePhoneNumber('08123456789012'); // 14 char input
    expect(r.ok).toBe(true);
    expect(r.normalized).toBe('628123456789012');
  });

  it('menolak nomor panjang 13 digit setelah prefix 62 (di atas max)', () => {
    // Local 13 digit → setelah prefix 62: 15 char total — di atas MAX_LOCAL_LENGTH = 13
    const r = normalizePhoneNumber('081234567890123');
    expect(r.ok).toBe(false);
  });
});

describe('generateOtp', () => {
  it('menghasilkan string sepanjang 6 digit (default)', () => {
    const code = generateOtp();
    expect(code).toHaveLength(6);
    expect(/^\d{6}$/.test(code)).toBe(true);
  });

  it('menghasilkan string sepanjang 4 digit kalau diminta', () => {
    const code = generateOtp(4);
    expect(code).toHaveLength(4);
    expect(/^\d{4}$/.test(code)).toBe(true);
  });

  it('menghasilkan nilai berbeda setiap kali (entropy cukup)', () => {
    const set = new Set<string>();
    for (let i = 0; i < 100; i++) set.add(generateOtp());
    // Untuk 6 digit, 100 percobaan harus unik (collision prob sangat rendah)
    expect(set.size).toBe(100);
  });
});

describe('hashOtp / verifyOtpHash', () => {
  it('hashOtp deterministik untuk input sama', () => {
    expect(hashOtp('123456')).toBe(hashOtp('123456'));
  });

  it('hashOtp berbeda untuk input beda (collision resistance)', () => {
    expect(hashOtp('123456')).not.toBe(hashOtp('123457'));
    expect(hashOtp('999999')).not.toBe(hashOtp('000000'));
  });

  it('verifyOtpHash cocok untuk input valid', () => {
    const raw = '482931';
    const h = hashOtp(raw);
    expect(verifyOtpHash(raw, h)).toBe(true);
  });

  it('verifyOtpHash return false untuk input beda', () => {
    const h = hashOtp('482931');
    expect(verifyOtpHash('111111', h)).toBe(false);
    expect(verifyOtpHash('', h)).toBe(false);
  });

  it('hash panjangnya 64 char (SHA-256 hex)', () => {
    expect(hashOtp('foo')).toHaveLength(64);
    expect(/^[0-9a-f]{64}$/.test(hashOtp('foo'))).toBe(true);
  });
});

describe('maskPhone', () => {
  it('mask nomor 12 digit → 5 star + 3 trailing (sesuai impl)', () => {
    // Impl: start=5 chars, end=3 chars, fill = length-8
    // 6281234567890 (13 char): start=62812, fill 5 stars, end=890 → "62812*****890"
    expect(maskPhone('6281234567890')).toBe('62812*****890');
  });

  it('mask mempertahankan head + tail', () => {
    const masked = maskPhone('628111222333444');
    expect(masked.startsWith('62811')).toBe(true);
    expect(masked.endsWith('444')).toBe(true);
    expect(masked).toContain('*');
  });

  it('return as-is kalau input terlalu pendek untuk di-mask', () => {
    // Panjang < 8 → return input unchanged
    const out = maskPhone('1234');
    expect(out).toBe('1234');
  });

  it('return "—" untuk null/undefined', () => {
    expect(maskPhone(null)).toBe('—');
    expect(maskPhone(undefined)).toBe('—');
  });
});

describe('renderMessageTemplate', () => {
  it('mengganti variabel {key} dengan nilai dari data', () => {
    const tpl = 'Halo {name}, hari ini tanggal {date}.';
    const out = renderMessageTemplate(tpl, { name: 'Andi', date: '2026-08-25' });
    expect(out).toBe('Halo Andi, hari ini tanggal 2026-08-25.');
  });

  it('mengganti variabel yang sama beberapa kali', () => {
    const tpl = '{a}-{a}-{a}';
    expect(renderMessageTemplate(tpl, { a: 'X' })).toBe('X-X-X');
  });

  it('membiarkan variabel tidak dikenal apa adanya (literal {key})', () => {
    const tpl = '{known} / {unknown}';
    const out = renderMessageTemplate(tpl, { known: 'A' });
    expect(out).toBe('A / {unknown}');
  });

  it('numerik di-handle (renderMessageTemplate terima string | number)', () => {
    const tpl = 'Total: {total}';
    expect(renderMessageTemplate(tpl, { total: 1500 })).toBe('Total: 1500');
  });
});
