/**
 * Reset data pendaftar untuk testing bersih.
 *
 * Menghapus:
 *   - Semua row di pendaftar_spmb (300+ dummy)
 *   - Semua row di audit_logs
 *   - Semua row di email_logs
 *
 * TIDAK menghapus master data:
 *   - users, roles, permissions (User/Role/Permission/UserRole/RolePermission)
 *   - tahun_ajaran
 *   - gelombang, kuota_gelombang
 *   - jurusan
 *   - settings (harga_daftar_ulang tetap)
 *   - berita, pengumuman
 *   - whatsapp_otp, whatsapp_settings
 *
 * Run: node scripts/reset_clean.js
 */
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

(async () => {
  try {
    // Count dulu (untuk log)
    const before = await p.$queryRawUnsafe(`
      SELECT
        (SELECT COUNT(*)::int FROM pendaftar_spmb) AS pendaftar,
        (SELECT COUNT(*)::int FROM audit_logs) AS audit,
        (SELECT COUNT(*)::int FROM email_logs) AS email
    `);
    console.log('BEFORE:', JSON.stringify(before[0]));

    // Truncate trx tables. RESTART IDENTITY supaya sequence pendaftar balik ke 1
    // (kalau ada sequence — biasanya tidak, tapi aman).
    await p.$executeRawUnsafe('TRUNCATE TABLE pendaftar_spmb, audit_logs, email_logs RESTART IDENTITY CASCADE');

    // Verify
    const after = await p.$queryRawUnsafe(`
      SELECT
        (SELECT COUNT(*)::int FROM pendaftar_spmb) AS pendaftar,
        (SELECT COUNT(*)::int FROM audit_logs) AS audit,
        (SELECT COUNT(*)::int FROM email_logs) AS email
    `);
    console.log('AFTER: ', JSON.stringify(after[0]));

    // Verify master data masih ada
    const master = await p.$queryRawUnsafe(`
      SELECT
        (SELECT COUNT(*)::int FROM users) AS users,
        (SELECT COUNT(*)::int FROM tahun_ajaran) AS tahun_ajaran,
        (SELECT COUNT(*)::int FROM gelombang) AS gelombang,
        (SELECT COUNT(*)::int FROM jurusan) AS jurusan,
        (SELECT COUNT(*)::int FROM settings) AS settings,
        (SELECT value::int FROM settings WHERE key='harga_daftar_ulang') AS harga_daftar_ulang
    `);
    console.log('MASTER:', JSON.stringify(master[0]));

    console.log('✅ Reset selesai. Sistem siap untuk testing bersih.');
  } catch (err) {
    console.error('❌ Gagal reset:', err.message);
    process.exitCode = 1;
  } finally {
    await p.$disconnect();
  }
})();
