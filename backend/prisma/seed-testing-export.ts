// ⚠️ SCRIPT TESTING — JANGAN DIJALANKAN DI DATABASE PRODUKSI ⚠️
//
// Script ini generate 300 data dummy siswa_aktif untuk testing fitur
// export Excel multi-sheet. Script terpisah dari seed RBAC/role default.
//
// PENANDA DATA DUMMY:
//   - Prefix registrationNumber: "TEST-REG-YYYYMMDD-XXX"
//   - Prefix namaLengkap:        "[TEST] ..."
//
// CARA HAPUS SETELAH TESTING:
//   1. Via npm script:  npm run seed:cleanup-export-test
//   2. Manual di psql:  DELETE FROM pendaftar_spmb WHERE "registrationNumber" LIKE 'TEST-%';
//   3. Manual via prisma:
//        npx ts-node -e "const{PrismaClient}=require('@prisma/client');const p=new PrismaClient();p.pendaftar.deleteMany({where:{registrationNumber:{startsWith:'TEST-'}}}).then(r=>console.log('deleted',r.count)).finally(()=>p.\$disconnect())"
//
// Jalankan:  npm run seed:testing

import { PrismaClient, Agama, JenisKelamin, StatusPendaftar } from '@prisma/client';

const prisma = new PrismaClient();

// =========================================================================
// KONFIGURASI DISTRIBUSI
// =========================================================================

const TARGET_TOTAL = 300;

// Daftar 18 sekolah SMP area Denpasar + sekitarnya.
// Weight lebih besar → lebih banyak siswa dari sekolah tsb.
// "Big schools" sengaja dibuat berat tinggi supaya bisa nge-test
// constraint maxPerKelas di sheet Konversi Kelas (warning section).
const SCHOOLS: Array<{ value: string; weight: number }> = [
  // Big schools (banyak siswa — sengaja untuk trigger warning)
  { value: 'SMP Negeri 1 Denpasar', weight: 38 },
  { value: 'SMP Negeri 3 Denpasar', weight: 32 },
  { value: 'SMP PGRI 2 Denpasar',   weight: 28 },

  // Medium schools
  { value: 'SMP Negeri 4 Denpasar',          weight: 16 },
  { value: 'SMP Negeri 5 Denpasar',          weight: 15 },
  { value: 'SMP Negeri 6 Denpasar',          weight: 14 },
  { value: 'SMP Negeri 8 Denpasar',          weight: 13 },
  { value: 'SMP Negeri 11 Denpasar',         weight: 12 },
  { value: 'SMP Negeri 13 Denpasar',         weight: 12 },
  { value: 'SMP Saraswati 1 Denpasar',       weight: 12 },
  { value: 'SMP Dwijendra Denpasar',         weight: 11 },

  // Small schools (jarang, untuk variasi)
  { value: 'SMP Negeri 2 Denpasar',          weight: 6 },
  { value: 'SMP Negeri 7 Denpasar',          weight: 5 },
  { value: 'SMP Negeri 9 Denpasar',          weight: 5 },
  { value: 'SMP Negeri 14 Denpasar',         weight: 4 },
  { value: 'SMP Widya Paramita',             weight: 4 },
  { value: 'SMP Kristen 1 Denpasar',         weight: 4 },
  { value: 'SMP Katolik Santo Yoseph',       weight: 4 },
  { value: 'SMP Budhi Wacana Denpasar',      weight: 4 },
];

// Distribusi agama — konteks Bali, Hindu dominan.
const AGAMA_DIST: Array<{ value: Agama; weight: number }> = [
  { value: 'HINDU',      weight: 58 },
  { value: 'ISLAM',      weight: 22 },
  { value: 'KRISTEN',    weight: 9  },
  { value: 'KATOLIK',    weight: 7  },
  { value: 'BUDDHA',     weight: 3  },
  { value: 'KHONGHUCU',  weight: 1  },
];

// Nama depan Bali + Indonesia (campuran, untuk variasi).
const NAMA_DEPAN_LAKI = [
  'I Putu', 'I Made', 'I Kadek', 'I Ketut', 'I Gusti', 'I Wayan',
  'Ni Kadek', // (jarang untuk L, tapi ada)
  'Agus', 'Made', 'Ketut', 'Putu', 'Gede', 'Kadek', 'Wayan',
  'Adi', 'Yoga', 'Bayu', 'Eka', 'Dharma', 'Wira', 'Surya',
  'Andi', 'Budi', 'Candra', 'Dedi', 'Fajar', 'Hendra',
];

const NAMA_DEPAN_PEREMPUAN = [
  'Ni Putu', 'Ni Made', 'Ni Kadek', 'Ni Ketut', 'Ni Gusti', 'Ni Wayan',
  'Luh', 'Kadek', 'Made', 'Wayan', 'Ketut',
  'Dewi', 'Sri', 'Putri', 'Indah', 'Citra', 'Kasih',
  'Yanti', 'Lestari', 'Mawar', 'Melati', 'Sari', 'Wulan',
];

const NAMA_BELAKANG = [
  'Wijaya', 'Kusuma', 'Pratama', 'Dewi', 'Sari', 'Putri',
  'Surya', 'Wirawan', 'Artha', 'Merta', 'Adnyana', 'Mahendra',
  'Permadi', 'Yuliana', 'Handayani', 'Lestari', 'Sukma',
  'Putra', 'Putri', 'Wibawa', 'Candra', 'Karina', 'Pertiwi',
];

const NAMA_IBU = [
  'Ni Ketut Sukreni', 'Ni Wayan Sumartini', 'Ni Made Sariasih',
  'Ni Kadek Sumarni', 'Ni Putu Sugiarti', 'Ni Luh Eka Wati',
  'Nyoman Rai', 'Ketut Sari', 'Luh Putu Sukma',
  'Siti Aminah', 'Siti Khadijah', 'Nur Hidayah', 'Fatimah',
  'Maria Yuliana', 'Yuliana Wati', 'Dewi Lestari',
];

// Alamat dummy (Denpasar-area umum).
const ALAMAT_PREFIX = [
  'Jl. Gatot Subroto',
  'Jl. Sudirman',
  'Jl. Diponegoro',
  'Jl. Veteran',
  'Jl. Imam Bonjol',
  'Jl. Hayam Wuruk',
  'Jl. Bypass Ngurah Rai',
  'Jl. Tukad Yeh Aya',
  'Jl. Tukad Badung',
  'Jl. Gunung Agung',
  'Jl. Gunung Rinjani',
  'Jl. Tukad Barito',
  'Jl. Tukad Musi',
  'Jl. Tukad Citarum',
  'Jl. Tukad Bengawan',
  'Jl. Tukad Brantas',
];
const KELURAHAN = [
  'Tonja', 'Ubung', 'Peguyangan', 'Denpasar Utara',
  'Sanur', 'Renon', 'Sesetan', 'Sidakarya',
  'Kesiman', 'Penatih', 'Sumerta', 'Padangsambian',
];

// =========================================================================
// HELPERS
// =========================================================================

function pickWeighted<T>(items: Array<{ value: T; weight: number }>): T {
  const total = items.reduce((s, x) => s + x.weight, 0);
  let r = Math.random() * total;
  for (const item of items) {
    if ((r -= item.weight) <= 0) return item.value;
  }
  return items[items.length - 1].value;
}

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomPhone(): string {
  // Format Indonesia: 08xx-xxxx-xxxx (12 digit setelah prefix)
  const a = randInt(812, 899);
  const b = String(randInt(1000, 9999));
  const c = String(randInt(1000, 9999));
  return `08${a.toString().slice(1)}-${b}-${c}`;
}

function randomNisn(existing: Set<string>): string {
  // 10 digit angka, dijamin unique dalam batch ini
  for (let attempt = 0; attempt < 50; attempt++) {
    const n = String(randInt(1_000_000_000, 9_999_999_999));
    if (!existing.has(n)) {
      existing.add(n);
      return n;
    }
  }
  throw new Error('Gagal generate NISN unik setelah 50 percobaan');
}

function randomDate(daysBack: number): Date {
  // Random date dalam N hari terakhir
  const now = Date.now();
  const offset = randInt(0, daysBack * 24 * 60 * 60 * 1000);
  return new Date(now - offset);
}

function randomTanggalLahir(): Date {
  // Siswa SMP baru → usia ~12-16 tahun → lahir 12-16 tahun lalu
  const now = new Date();
  const year = now.getFullYear() - randInt(13, 16);
  const month = randInt(1, 12);
  const day = randInt(1, 28);
  return new Date(year, month - 1, day);
}

function randomAlamat(): string {
  const jalan = ALAMAT_PREFIX[randInt(0, ALAMAT_PREFIX.length - 1)];
  const no = randInt(1, 200);
  const kel = KELURAHAN[randInt(0, KELURAHAN.length - 1)];
  return `Jl. ${jalan} No. ${no}, ${kel}, Denpasar`;
}

// =========================================================================
// MAIN
// =========================================================================

async function main() {
  console.log('🌱 Seed testing export — generate 300 siswa_aktif dummy...');

  // 1. Ambil jurusan aktif dari DB
  const jurusans = await prisma.jurusan.findMany({
    where: { isActive: true, deletedAt: null },
  });
  if (jurusans.length === 0) {
    throw new Error('Tidak ada jurusan aktif di DB. Jalankan seed default dulu.');
  }
  console.log(`   → ${jurusans.length} jurusan aktif: ${jurusans.map((j) => j.code).join(', ')}`);

  // 2. Ambil gelombang aktif
  const gelombang = await prisma.gelombang.findFirst({ where: { isActive: true } });
  if (!gelombang) {
    throw new Error('Tidak ada gelombang aktif di DB. Jalankan seed default dulu.');
  }
  console.log(`   → Gelombang aktif: ${gelombang.name}`);

  // 3. Ambil 1 user admin utk foreign key approvedById
  const admin = await prisma.user.findFirst({ where: { isActive: true } });
  if (!admin) {
    throw new Error('Tidak ada user aktif di DB. Jalankan seed default dulu.');
  }
  console.log(`   → Approved by: ${admin.name} (${admin.email})`);

  // 4. Cek data TEST-* existing agar tidak duplikat
  const existingCount = await prisma.pendaftar.count({
    where: { registrationNumber: { startsWith: 'TEST-' } },
  });
  if (existingCount > 0) {
    console.log(`   ⚠ Ditemukan ${existingCount} data TEST-* existing. Akan ditimpa/di-skip.`);
    console.log(`     Jalankan dulu: npm run seed:cleanup-export-test`);
  }

  // 5. Generate N dummy records per jurusan (weighted: tiap jurusan 30-80 siswa)
  const distribusiJurusan: Array<{ id: string; code: string; target: number }> = jurusans.map((j) => ({
    id: j.id,
    code: j.code,
    target: 0,
  }));
  let remaining = TARGET_TOTAL;
  // Distribusi acak per jurusan: ambil random increment, capped ke remaining
  let safetyCounter = 0;
  while (remaining > 0 && safetyCounter < 10000) {
    safetyCounter++;
    const idx = randInt(0, distribusiJurusan.length - 1);
    const maxAdd = Math.min(15, remaining);
    const minAdd = Math.min(5, maxAdd);
    if (maxAdd < minAdd) break;
    const add = randInt(minAdd, maxAdd);
    if (distribusiJurusan[idx].target + add > 90) continue;
    distribusiJurusan[idx].target += add;
    remaining -= add;
  }
  // Sisa yang masih > 0 tambahkan random ke jurusan random
  while (remaining > 0) {
    const idx = randInt(0, distribusiJurusan.length - 1);
    distribusiJurusan[idx].target += 1;
    remaining -= 1;
    if (safetyCounter++ > 20000) break;
  }
  if (remaining > 0) {
    console.warn(`   ⚠ Tidak bisa distribusi ${remaining} siswa, mengabaikan.`);
  }

  const nisnUsed = new Set<string>();
  const records: any[] = [];

  for (const jur of distribusiJurusan) {
    for (let i = 0; i < jur.target; i++) {
      const isLaki = Math.random() < 0.5;
      const gender: JenisKelamin = isLaki ? 'L' : 'P';
      const namaDepan = isLaki
        ? NAMA_DEPAN_LAKI[randInt(0, NAMA_DEPAN_LAKI.length - 1)]
        : NAMA_DEPAN_PEREMPUAN[randInt(0, NAMA_DEPAN_PEREMPUAN.length - 1)];
      const namaBelakang = NAMA_BELAKANG[randInt(0, NAMA_BELAKANG.length - 1)];
      const namaLengkap = `[TEST] ${namaDepan} ${namaBelakang}`;

      const tempatLahirOptions = ['Denpasar', 'Singaraja', 'Tabanan', 'Gianyar', 'Klungkung', 'Karangasem'];
      const tempatLahir = tempatLahirOptions[randInt(0, tempatLahirOptions.length - 1)];
      const tanggalLahir = randomTanggalLahir();

      const sekolahAsal = pickWeighted(SCHOOLS);
      const agama = pickWeighted(AGAMA_DIST);

      const createdAt = randomDate(21); // 3 minggu terakhir
      const approvedAt = new Date(createdAt.getTime() + randInt(1, 5) * 24 * 60 * 60 * 1000);

      // Registration number: TEST-REG-YYYYMMDD-XXX (XXX acak, dijamin unique)
      const yy = createdAt.getFullYear();
      const mm = String(createdAt.getMonth() + 1).padStart(2, '0');
      const dd = String(createdAt.getDate()).padStart(2, '0');
      const dateStr = `${yy}${mm}${dd}`;
      const seq = String(randInt(1, 999)).padStart(3, '0');
      const registrationNumber = `TEST-REG-${dateStr}-${seq}`;

      records.push({
        registrationNumber,
        namaLengkap,
        jenisKelamin: gender,
        tempatLahir,
        tanggalLahir,
        nisn: randomNisn(nisnUsed),
        sekolahAsal,
        alamat: randomAlamat(),
        noTelp: randomPhone(),
        email: `${registrationNumber.toLowerCase().replace(/[^a-z0-9]/g, '')}@test.local`,
        jumlahNilaiUn: new (require('@prisma/client').Prisma.Decimal)(randInt(70, 95) + Math.random()),
        prestasi: Math.random() < 0.2 ? 'Juara lomba tingkat kabupaten' : null,
        namaIbu: NAMA_IBU[randInt(0, NAMA_IBU.length - 1)],
        noTelpOrtu: randomPhone(),
        agama,
        jurusanId: jur.id,
        gelombangId: gelombang.id,
        status: 'SISWA_AKTIF' as StatusPendaftar,
        approvedById: admin.id,
        approvedAt,
        createdAt,
        updatedAt: approvedAt,
        // PDF tidak di-generate (testing export excel tidak butuh PDF)
        pdfPath: null,
        pdfSignature: null,
      });
    }
  }

  console.log(`   → Generated ${records.length} records, inserting...`);

  // 6. Insert batched (Prisma createMany skip duplikat registrationNumber)
  let inserted = 0;
  let skipped = 0;
  const BATCH = 50;
  for (let i = 0; i < records.length; i += BATCH) {
    const batch = records.slice(i, i + BATCH);
    try {
      const result = await prisma.pendaftar.createMany({
        data: batch,
        skipDuplicates: true,
      });
      inserted += result.count;
      skipped += batch.length - result.count;
    } catch (e: any) {
      console.error(`   ✗ Batch ${i / BATCH + 1} gagal:`, e.message);
    }
  }

  console.log(`\n✅ Seed selesai!`);
  console.log(`   Inserted: ${inserted}`);
  console.log(`   Skipped (duplikat registrationNumber): ${skipped}`);

  // 7. Summary distribusi
  console.log('\n📊 Distribusi per Jurusan:');
  const groupedJurusan = await prisma.pendaftar.groupBy({
    by: ['jurusanId'],
    where: { registrationNumber: { startsWith: 'TEST-' } },
    _count: { _all: true },
  });
  for (const j of jurusans) {
    const c = groupedJurusan.find((g) => g.jurusanId === j.id)?._count._all ?? 0;
    console.log(`   - ${j.code} (${j.name}): ${c} siswa`);
  }

  const sekolahUnik = await prisma.pendaftar.findMany({
    where: { registrationNumber: { startsWith: 'TEST-' } },
    select: { sekolahAsal: true },
    distinct: ['sekolahAsal'],
  });
  console.log(`\n🏫 Sekolah asal unik: ${sekolahUnik.length}`);

  console.log('\n📌 Agama distribution (TEST data only):');
  const groupedAgama = await prisma.pendaftar.groupBy({
    by: ['agama'],
    where: { registrationNumber: { startsWith: 'TEST-' } },
    _count: { _all: true },
  });
  groupedAgama
    .sort((a, b) => b._count._all - a._count._all)
    .forEach((g) => {
      console.log(`   - ${g.agama ?? '(null)'}: ${g._count._all}`);
    });

  console.log('\n🎯 Sekarang bisa dicoba export Excel dari menu Pendaftar!');
  console.log('   Jalankan: npm run seed:cleanup-export-test untuk hapus semua data TEST-*');
}

main()
  .catch((e) => {
    console.error('Fatal error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });