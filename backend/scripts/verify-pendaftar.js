const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

(async () => {
  const total = await p.pendaftar.count();
  const testData = await p.pendaftar.count({
    where: { registrationNumber: { startsWith: 'TEST-' } },
  });
  const realData = await p.pendaftar.count({
    where: { registrationNumber: { not: { startsWith: 'TEST-' } } },
  });

  console.log('Total pendaftar:', total);
  console.log('  TEST-* (dummy):', testData);
  console.log('  Real (non-test):', realData);

  console.log('\nSample 3 data TEST-* terbaru:');
  const samples = await p.pendaftar.findMany({
    where: { registrationNumber: { startsWith: 'TEST-' } },
    take: 3,
    orderBy: { createdAt: 'desc' },
    select: {
      registrationNumber: true,
      namaLengkap: true,
      jenisKelamin: true,
      sekolahAsal: true,
      agama: true,
      status: true,
      createdAt: true,
    },
  });
  samples.forEach((s) => {
    console.log(
      ` - ${s.registrationNumber} | ${s.namaLengkap} | ${s.jenisKelamin} | ${s.agama} | ${s.sekolahAsal} | ${s.status}`,
    );
  });
})()
  .catch((e) => {
    console.error('Error:', e.message);
    process.exit(1);
  })
  .finally(() => p.$disconnect());
