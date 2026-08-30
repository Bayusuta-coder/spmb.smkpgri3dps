// ⚠️ SCRIPT CLEANUP — Hapus data dummy testing export ⚠️
//
// Menghapus SEMUA data Pendaftar yang prefix registrationNumber-nya "TEST-".
// Aman dijalankan berulang. Aman untuk produksi (tidak akan menghapus data
// yang registrationNumber-nya bukan prefix "TEST-").
//
// Jalankan:  npm run seed:cleanup-export-test
//
// Equivalent psql:
//   DELETE FROM pendaftar_spmb WHERE "registrationNumber" LIKE 'TEST-%';

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🧹 Cleanup test data (registrationNumber prefix: "TEST-")...');

  // Count dulu
  const count = await prisma.pendaftar.count({
    where: { registrationNumber: { startsWith: 'TEST-' } },
  });

  if (count === 0) {
    console.log('   ℹ️  Tidak ada data TEST-* ditemukan. Tidak ada yang dihapus.');
    return;
  }

  console.log(`   → Ditemukan ${count} data TEST-*`);
  console.log('   → Menghapus...');

  const result = await prisma.pendaftar.deleteMany({
    where: { registrationNumber: { startsWith: 'TEST-' } },
  });

  console.log(`\n✅ Cleanup selesai! ${result.count} data dihapus.`);

  // Verifikasi
  const after = await prisma.pendaftar.count({
    where: { registrationNumber: { startsWith: 'TEST-' } },
  });
  console.log(`   → Sisa data TEST-* setelah cleanup: ${after}`);
}

main()
  .catch((e) => {
    console.error('Fatal error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
