// ⚠️ SCRIPT CLEANUP — Hapus data dummy SPMB ⚠️
//
// Menghapus SEMUA data Pendaftar yang prefix registrationNumber-nya "DUMMY-".
// Aman dijalankan berulang. Aman untuk produksi (tidak akan menghapus data
// yang registrationNumber-nya bukan prefix "DUMMY-").
//
// Jalankan:  npm run seed:cleanup-dummy
//
// Equivalent psql:
//   DELETE FROM pendaftar_spmb WHERE "registrationNumber" LIKE 'DUMMY-%';

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🧹 Cleanup dummy data (registrationNumber prefix: "DUMMY-")...');

  const count = await prisma.pendaftar.count({
    where: { registrationNumber: { startsWith: 'DUMMY-' } },
  });

  if (count === 0) {
    console.log('   ℹ️  Tidak ada data DUMMY-* ditemukan. Tidak ada yang dihapus.');
    return;
  }

  console.log(`   → Ditemukan ${count} data DUMMY-*`);
  console.log('   → Menghapus...');

  const result = await prisma.pendaftar.deleteMany({
    where: { registrationNumber: { startsWith: 'DUMMY-' } },
  });

  console.log(`\n✅ Cleanup selesai! ${result.count} data dihapus.`);

  const after = await prisma.pendaftar.count({
    where: { registrationNumber: { startsWith: 'DUMMY-' } },
  });
  console.log(`   → Sisa data DUMMY-* setelah cleanup: ${after}`);
}

main()
  .catch((e) => {
    console.error('Fatal error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });