/**
 * Generate 2 sample PDF bukti pendaftaran (Tahap 1 + Tahap 2) untuk inspeksi
 * visual — tanpa DB, tanpa server jalan. Useful saat Mendesain layout.
 *
 * Tahap 1 = "Menunggu Daftar Ulang" (PDF setelah submit form)
 * Tahap 2 = "Siswa Aktif"             (PDF setelah admin approve)
 *
 * Usage:
 *   cd backend
 *   npx ts-node scripts/test-pdf-tahap.ts
 *
 * Output:
 *   backend/uploads/spmb/SAMPLE-TAHAP1-Menunggu.pdf
 *   backend/uploads/spmb/SAMPLE-TAHAP2-Aktif.pdf
 */
import 'reflect-metadata';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { PdfService } from '../src/pdf/pdf.service';
import { PdfModule } from '../src/pdf/pdf.module';
import * as path from 'path';

/**
 * Module ringan yang hanya inject PdfService + ConfigService. Dipakai supaya
 * script ini jalan TANPA harus start Postgres (AppModule include PrismaModule
 * yang akan timeout kalau DB down).
 */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '../.env', '../../.env'],
    }),
    PdfModule,
  ],
})
class TestPdfAppModule {}

async function main() {
  const app = await NestFactory.createApplicationContext(TestPdfAppModule, {
    logger: ['error', 'warn'],
  });
  const pdf = app.get(PdfService);

  const dummyJurusan = { code: 'TKJ', name: 'Teknik Komputer & Jaringan' };
  const dummyGelombang = {
    name: 'Gelombang 1 — Tahun Ajaran 2026/2027',
    tanggalDaftarUlang: new Date('2026-07-01'),
    jamDaftarUlang: '08.00 – 12.00',
  };
  const dummyPendaftar = {
    registrationNumber: 'SAMPLE-TAHAP1',
    namaLengkap: 'Ni Putu Ayu Lestari',
    jenisKelamin: 'P' as const,
    tempatLahir: 'Denpasar',
    tanggalLahir: new Date('2010-05-12'),
    nisn: '0123456789',
    // Nilai UN — sengaja dikosongkan (null) untuk verifikasi rendering "-"
    // di PDF (sama persis dengan NISN kosong). Backend sekarang menyimpan
    // nilai ini sebagai Decimal? nullable.
    jumlahNilaiUn: null as number | null,
    sekolahAsal: 'SMP Negeri 1 Denpasar',
    // Alamat sengaja dibuat panjang untuk verifikasi dynamic row height —
// harusnya wrap ke 2 baris dan TIDAK menabrak baris No. Telp/HP di bawahnya.
    alamat: 'Jl. Gatot Subroto IV No. 12, Lingkungan Banjarsari, Kelurahan Sumerta Kelod, Kecamatan Denpasar Timur, Kota Denpasar, Bali 80235',
    noTelp: '081234567890',
    namaIbu: 'Ni Ketut Sari',
    noTelpOrtu: '081987654321',
    jurusan: dummyJurusan,
    gelombang: dummyGelombang,
    approvedAt: new Date(),
    approvedBy: undefined,
  };

  console.log('\n=== Generating Tahap 1 PDF (Menunggu Daftar Ulang) ===');
  const tahap1 = await pdf.generateBuktiPendaftaranUlang({
    ...dummyPendaftar,
    mode: 'MENUNGGU',
    registrationNumber: 'SAMPLE-TAHAP1',
  });
  console.log('  ✔ Saved:', path.join(pdf.getAbsolutePath(tahap1.relativePath)));

  console.log('\n=== Generating Tahap 2 PDF (Siswa Aktif) ===');
  const tahap2 = await pdf.generateBuktiPendaftaranUlang({
    ...dummyPendaftar,
    mode: 'AKTIF',
    registrationNumber: 'SAMPLE-TAHAP2',
    ukuranBaju: 'M',
    nominalPembayaran: 350000,
    approvedAt: new Date('2026-08-15'),
    approvedBy: {
      name: 'I Wayan Budiarta, S.Pd.',
      email: 'panitia@smk-pgri3dps.sch.id',
    },
  });
  console.log('  ✔ Saved:', path.join(pdf.getAbsolutePath(tahap2.relativePath)));

  await app.close();
  console.log('\n✅ Sample PDFs generated. Buka file di uploads/spmb/ untuk inspect visual.');
}

main().catch((e) => {
  console.error('❌ Gagal:', e);
  process.exit(1);
});