/**
 * Manual regression test for PembayaranService.listForTu.
 *
 * Bug yang dijaga: pendaftar berstatus MENUNGGU_VERIFIKASI_PEMBAYARAN
 * yang tidak punya record pembayaran (mis. ter-set langsung oleh seed
 * tanpa melalui PembayaranService.submit) HARUS tetap muncul di list
 * dengan kind='ORPHAN' agar TU bisa menindaklanjuti.
 *
 * Cara menjalankan:
 *   cd backend
 *   npx ts-node prisma/test-pembayaran-list.ts
 *
 * Expectation: exit code 0 (semua assertion passed). Print PASS/FAIL
 * per kasus.
 */

import { PrismaClient } from '@prisma/client';
import { execSync } from 'child_process';

const prisma = new PrismaClient();

let passed = 0;
let failed = 0;

function assert(name: string, cond: boolean, extra?: string) {
  if (cond) {
    console.log(`  ✅ ${name}`);
    passed++;
  } else {
    console.log(`  ❌ ${name}${extra ? ` — ${extra}` : ''}`);
    failed++;
  }
}

/**
 * Panggil listForTu lewat titik masuk yang sama dengan controller.
 * Kita build service-nya secara inline karena tujuannya adalah regresi
 * query, bukan mock-everything. EmailService di-stub karena tidak
 * mengirim apapun dari listForTu.
 */
async function callListForTu() {
  // Dynamic import agar kita bisa reference kode sumber yang sudah
  // di-compile bertahap oleh ts-node.
  const { PembayaranService } = require('../src/pembayaran/pembayaran.service');
  const { EmailService } = require('../src/email/email.service');
  const svc = new PembayaranService(prisma, {
    notifyAdminPaymentVerified: async () => undefined,
  } as any);
  return svc.listForTu({ page: 1, pageSize: 100 });
}

async function seedOrphan(regNumber: string, namaLengkap: string) {
  // Pakai gelombang & jurusan pertama yang ada
  const g = await prisma.gelombang.findFirst({ where: { isActive: true } });
  const j = await prisma.jurusan.findFirst();
  if (!g || !j) throw new Error('Butuh minimal 1 gelombang aktif & 1jurusan');

  return prisma.pendaftar.upsert({
    where: { registrationNumber: regNumber },
    update: {
      status: 'MENUNGGU_VERIFIKASI_PEMBAYARAN',
    },
    create: {
      registrationNumber: regNumber,
      namaLengkap,
      nisn: Math.floor(Math.random() * 1e10).toString().padStart(10, '0'),
      tempatLahir: 'Denpasar',
      tanggalLahir: new Date('2008-01-01'),
      jenisKelamin: 'L',
      alamat: 'Jl. Test',
      noTelp: '081234567890',
      email: `${regNumber.toLowerCase()}@test.com`,
      sekolahAsal: 'SMP Test',
      jumlahNilaiUn: 80.0,
      namaIbu: 'Ibu',
      noTelpOrtu: '081234567891',
      status: 'MENUNGGU_VERIFIKASI_PEMBAYARAN',
      gelombangId: g.id,
      jurusanId: j.id,
    },
  });
}

async function cleanup(regNumber: string) {
  await prisma.pendaftar.deleteMany({ where: { registrationNumber: regNumber } });
}

async function run() {
  console.log('\n🧪  REGRESSION: PembayaranService.listForTu internal join\n');

  const REG_A = 'TEST-ORPHAN-A';
  const REG_B = 'TEST-ORPHAN-B';

  // Bersihkan state sebelumnya (idempotent)
  await cleanup(REG_A);
  await cleanup(REG_B);

  // Seed dua orphan (status verifikasi tapi tanpa record pembayaran)
  console.log('• Seeding 2 orphan pendaftar...');
  await seedOrphan(REG_A, 'Test Orphan A');
  await seedOrphan(REG_B, 'Test Orphan B');

  try {
    const result = await callListForTu();

    // Cari entri dari 2 reg number ini di response
    const foundA = result.items.find((i: any) => i.pendaftar.registrationNumber === REG_A);
    const foundB = result.items.find((i: any) => i.pendaftar.registrationNumber === REG_B);

    console.log(`\n  Response: total=${result.total}, items=${result.items.length}`);

    assert('REG_A muncul di list', !!foundA);
    assert('REG_B muncul di list', !!foundB);

    assert('REG_A ditandai ORPHAN', foundA?.kind === 'ORPHAN',
      `kind yang ditemukan: ${foundA?.kind}`);
    assert('REG_B ditandai ORPHAN', foundB?.kind === 'ORPHAN',
      `kind yang ditemukan: ${foundB?.kind}`);

    assert('ORPHAN punya warning message',
      typeof foundA?.warning === 'string' && foundA.warning.length > 0,
      `warning: ${foundA?.warning?.slice(0, 60)}`);

    assert('ORPHAN tidak punya id pembayaran (prefix "pendaftar:")',
      String(foundA?.id ?? '').startsWith('pendaftar:'),
      `id: ${foundA?.id}`);

    assert('ORPHAN nominal = "0"', foundA?.nominal === '0',
      `nominal: ${foundA?.nominal}`);

    assert('ORPHAN tanggalTransfer = null', foundA?.tanggalTransfer === null);

    // Verifikasi data pembayaran yang VALID (existing) juga tetap ada
    console.log('\n• Cek data pembayaran valid (non-orphan) tetap muncul...');
    const proper = result.items.find((i: any) => i.kind === 'PAYMENT');
    if (proper) {
      console.log(`  ℹ️  Contoh pembayaran valid: ${proper.pendaftar.registrationNumber} (${proper.status})`);
      assert('PAYMENT punya nominal valid', Number(proper.nominal) > 0);
    } else {
      console.log('  ⚠️  Tidak ada pembayaran valid (mungkin DB kosong). Skip assertion ini.');
    }

    // Sekarang test: setelah dibuat record pembayaran, entri orphan harus hilang
    console.log('\n• Test konsistensi: setelah record pembayaran dibuat, entri tidak lagi ORPHAN...');
    const pendaftarA = await prisma.pendaftar.findUnique({
      where: { registrationNumber: REG_A },
    });
    if (!pendaftarA) throw new Error('Seeding hilang');

    await prisma.pembayaran.upsert({
      where: { pendaftarId: pendaftarA.id },
      update: {},
      create: {
        pendaftarId: pendaftarA.id,
        nominal: 150000,
        tanggalTransfer: new Date(),
        namaPengirim: 'Test Sender',
      },
    });

    const result2 = await callListForTu();
    const againA = result2.items.find((i: any) => i.pendaftar.registrationNumber === REG_A);
    assert('Setelah record pembayaran dibuat, REG_A bukan ORPHAN',
      againA?.kind === 'PAYMENT',
      `kind: ${againA?.kind}`);

    // Bersihkan record pembayaran agar test berikutnya bisa recreate
    await prisma.pembayaran.deleteMany({ where: { pendaftarId: pendaftarA.id } });
  } finally {
    // Cleanup data test
    await cleanup(REG_A);
    await cleanup(REG_B);
    await prisma.$disconnect();
  }

  console.log(`\n${failed === 0 ? '🎉' : '💥'}  Hasil: ${passed} passed, ${failed} failed\n`);
  process.exit(failed === 0 ? 0 : 1);
}

run().catch((e) => {
  console.error('Test crash:', e);
  process.exit(2);
});
