/**
 * Test koneksi SMTP — verifikasi credential tanpa harus kirim email beneran.
 *
 * Cara pakai:
 *   1. Isi SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM di backend/.env
 *   2. cd backend && npx ts-node scripts/test-smtp.ts
 *
 * Untuk Gmail SMTP, contoh .env:
 *   SMTP_HOST=smtp.gmail.com
 *   SMTP_PORT=465
 *   SMTP_USER=smkpgri3dpsjaya@gmail.com
 *   SMTP_PASS=<App Password 16 char dari myaccount.google.com/apppasswords>
 *   SMTP_FROM="SMK PGRI 3 Denpasar <smkpgri3dpsjaya@gmail.com>"
 *
 * Untuk Hostinger:
 *   SMTP_HOST=smtp.hostinger.com
 *   SMTP_PORT=465
 *   SMTP_USER=noreply@smk-pgri3dps.sch.id
 *   SMTP_PASS=<password email cPanel>
 *   SMTP_FROM="SPMB SMK PGRI 3 Denpasar <noreply@smk-pgri3dps.sch.id>"
 *
 * Output:
 *   ✓ SMTP OK — handshake + auth berhasil
 *   ✗ SMTP FAIL — error message dari server
 */
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { EmailService } from '../src/email/email.service';

async function main() {
  console.log('\n=== Test SMTP Connection ===\n');

  const host = process.env.SMTP_HOST;
  const port = process.env.SMTP_PORT;
  const user = process.env.SMTP_USER;

  if (!host || !user) {
    console.error('❌ SMTP belum dikonfigurasi.');
    console.error('   Isi SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS di .env dulu.\n');
    console.error('   Contoh untuk Gmail SMTP:');
    console.error('     SMTP_HOST=smtp.gmail.com');
    console.error('     SMTP_PORT=465');
    console.error('     SMTP_USER=smkpgri3dpsjaya@gmail.com');
    console.error('     SMTP_PASS=<App Password 16 char>\n');
    process.exit(1);
  }

  console.log(`   Host: ${host}`);
  console.log(`   Port: ${port || '(default 587)'}`);
  console.log(`   User: ${user}`);
  console.log(`   From: ${process.env.SMTP_FROM || '(default no-reply@smk-pgri3dps.sch.id)'}\n`);

  // Boot Nest app untuk ambil EmailService (pakai ConfigService yang
  // udah baca .env). AppModule include EmailService yang otomatis init
  // transporter di constructor.
  console.log('⏳ Booting Nest app...\n');
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });
  const email = app.get(EmailService);

  console.log('⏳ Verifying SMTP connection (handshake + auth)...\n');
  const result = await email.verifyConnection();

  if (result.ok) {
    console.log('✅ SMTP OK — handshake + authentication berhasil.\n');
    console.log('Sekarang coba alur lupa password dari frontend — email harus masuk ke inbox user.\n');
  } else {
    console.log('❌ SMTP FAIL — konfigurasi tidak bisa konek ke server SMTP.\n');
    console.log('   Error:', result.error);
    console.log('\nTroubleshooting umum:');
    console.log('   - Gmail SMTP:');
    console.log('     * Wajib pakai App Password 16 char (bukan password Gmail biasa)');
    console.log('     * 2-Step Verification harus aktif di akun Google');
    console.log('     * Buka https://myaccount.google.com/apppasswords untuk generate');
    console.log('     * Cek juga: "Less secure app access" sudah OFF (App Password menggantikannya)');
    console.log('   - Hostinger:');
    console.log('     * Pastikan akun email sudah dibuat di cPanel > Email Accounts');
    console.log('     * Port 465 (SSL) lebih reliable dari 587');
    console.log('     * Cek firewall tidak block outgoing ke port SMTP');
    console.log('   - Firewall/network:');
    console.log('     * ISP/kantor kadang block port 25/465/587 — coba pakai VPN');
    console.log('     * Pastikan .env PORT benar (angka, bukan string dengan spasi)');
    console.log('');
  }

  await app.close();
  process.exit(result.ok ? 0 : 1);
}

main().catch((e) => {
  console.error('❌ Error:', e.message);
  process.exit(1);
});