/**
 * One-time reset script — HAPUS data Pendaftar + Audit Log + PDF files.
 *
 * JANGAN dijalankan di production. Script ini destructive & tidak bisa di-undo.
 *
 * Yang DIHAPUS:
 *   1. Semua baris Pendaftar (cascade bersih-bersih relasi one-to-one di
 *      dalam tabel itu sendiri seperti ukuran baju, payment, daftar ulang).
 *   2. Semua baris AuditLog (riwayat aksi user/resetter juga hilang).
 *   3. Semua file di folder uploads/spmb/ (REG-*.pdf).
 *
 * Yang TETAP AMAN (tidak disentuh):
 *   - Users (superadmin, bendahara, tu tetap bisa login)
 *   - Gelombang + KuotaGelombang (master data gelombang tidak hilang, quota.used
 *     otomatis jadi 0 karena di-compute ulang dari Pendaftar.count() di query)
 *   - Jurusan, Settings, Berita, Pengumuman, Roles, Permissions
 *
 * Cara pakai:
 *   cd backend && npx ts-node scripts/reset-pendaftar.ts
 *
 * Untuk proteksi typo, script ini minta konfirmasi interaktif: ketik
 * "HAPUS SEMUA PENDAFTAR" (huruf besar semua) untuk lanjut.
 */
import { PrismaClient } from '@prisma/client';
import { promises as fs } from 'fs';
import * as path from 'path';
import * as readline from 'readline';

const CONFIRM_PHRASE = 'HAPUS SEMUA PENDAFTAR';

async function askConfirmation(): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => {
    rl.question(
      `\n⚠️  RESET DESTRUCTIVE — Ketik persis "${CONFIRM_PHRASE}" untuk lanjut, atau tekan Enter untuk batal: `,
      (answer) => {
        rl.close();
        resolve(answer.trim() === CONFIRM_PHRASE);
      },
    );
  });
}

async function main() {
  const prisma = new PrismaClient();

  console.log('=== Reset Data Pendaftar + Audit Log + PDF ===\n');

  // 1. Hitung dulu supaya user tahu apa yang akan dihapus
  const pendaftarCount = await prisma.pendaftar.count();
  const auditCount = await prisma.auditLog.count();
  console.log(`Pendaftar saat ini  : ${pendaftarCount}`);
  console.log(`AuditLog saat ini   : ${auditCount}`);

  // Hitung file PDF di uploads/spmb/
  const uploadsDir = path.resolve(process.cwd(), 'uploads/spmb');
  let pdfFiles: string[] = [];
  try {
    pdfFiles = await fs.readdir(uploadsDir);
    pdfFiles = pdfFiles.filter((f) => f.toLowerCase().endsWith('.pdf'));
  } catch (e) {
    console.log(`\nFolder uploads/spmb/ tidak ditemukan di ${uploadsDir} (skip PDF cleanup)`);
  }
  console.log(`PDF di uploads/spmb/: ${pdfFiles.length}\n`);

  // 2. Konfirmasi interaktif
  const confirmed = await askConfirmation();
  if (!confirmed) {
    console.log('❌ Dibatalkan. Tidak ada data yang berubah.');
    await prisma.$disconnect();
    return;
  }

  // 3. Eksekusi reset
  console.log('\n⏳ Menghapus data...');

  // Hapus Pendaftar dulu (audit log akan kehilangan referensi entityId
  // tapi karena kita hapus audit log juga, no issue).
  const deletedPendaftar = await prisma.pendaftar.deleteMany({});
  console.log(`  ✓ Pendaftar dihapus: ${deletedPendaftar.count}`);

  // Hapus AuditLog
  const deletedAudit = await prisma.auditLog.deleteMany({});
  console.log(`  ✓ AuditLog dihapus: ${deletedAudit.count}`);

  // Hapus file PDF
  let pdfDeletedCount = 0;
  for (const file of pdfFiles) {
    try {
      await fs.unlink(path.join(uploadsDir, file));
      pdfDeletedCount++;
    } catch (e: any) {
      console.warn(`  ! Gagal hapus ${file}: ${e.message}`);
    }
  }
  console.log(`  ✓ PDF dihapus: ${pdfDeletedCount}`);

  // 4. Verifikasi
  const afterPendaftar = await prisma.pendaftar.count();
  const afterAudit = await prisma.auditLog.count();
  console.log(`\n=== Setelah reset ===`);
  console.log(`Pendaftar sisa : ${afterPendaftar}`);
  console.log(`AuditLog sisa  : ${afterAudit}`);

  // Verify master data masih ada
  const users = await prisma.user.count();
  const gelombang = await prisma.gelombang.count();
  const jurusan = await prisma.jurusan.count();
  console.log(`\n=== Master data (tetap aman) ===`);
  console.log(`Users     : ${users}`);
  console.log(`Gelombang : ${gelombang}`);
  console.log(`Jurusan   : ${jurusan}`);

  await prisma.$disconnect();
  console.log('\n✅ Reset selesai. Sistem siap untuk pendaftaran baru.');
}

main().catch(async (e) => {
  console.error('❌ Error:', e);
  process.exit(1);
});
