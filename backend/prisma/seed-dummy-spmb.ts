// ⚠️ SCRIPT DUMMY DATA — Generate 300 data siswa pendaftar SPMB ⚠️
//
// Tujuan: seed data dummy untuk demo / testing UI / latihan export.
// BUKAN untuk production. Aman di-restart berkali-kali (idempotent untuk
// prefix registrationNumber yang sama).
//
// PENANDA DATA DUMMY:
//   - Prefix registrationNumber: "DUMMY-REG-YYYYMMDD-XXX"
//   - Prefix namaLengkap:        "[DUMMY] ..."
//   - NISN selalu NULL supaya tidak ganggu constraint unique-per-gelombang
//     bila dijalankan ulang tanpa cleanup.
//
// DISTRIBUSI:
//   - 300 siswa
//   - 6 agama (Hindu dominan — konteks Bali)
//   - 18 sekolah, dengan 3 sekolah "big" yang bobotnya paling tinggi
//     (SMP Negeri 1 Denpasar, SMP Negeri 3 Denpasar, SMP PGRI 2 Denpasar)
//   - Distribusi acak ke semua jurusan aktif
//
// CARA HAPUS SETELAH TESTING:
//   1. npm run seed:cleanup-dummy
//   2. Manual di psql: DELETE FROM pendaftar_spmb WHERE "registrationNumber" LIKE 'DUMMY-%';
//
// Jalankan:  npm run seed:dummy

import { PrismaClient, Agama, JenisKelamin, StatusPendaftar } from '@prisma/client';

const prisma = new PrismaClient();

// =========================================================================
// KONFIGURASI
// =========================================================================

const TARGET_TOTAL = 300;

// Daftar 18 sekolah SMP area Denpasar + sekitarnya.
// Weight lebih besar → lebih banyak siswa dari sekolah tsb.
// "3 sekolah yang sama" yang dimaksud user di-handle oleh 3 baris teratas
// dengan bobot tertinggi. Total bobot 3 big school = 98 (~33% dari total).
const SCHOOLS: Array<{ value: string; weight: number }> = [
  // ===== 3 SEKOLAH BESAR (dominan) — yang dimaksud user =====
  { value: 'SMP Negeri 1 Denpasar', weight: 38 },
  { value: 'SMP Negeri 3 Denpasar', weight: 32 },
  { value: 'SMP PGRI 2 Denpasar',   weight: 28 },

  // ===== Sekolah menengah =====
  { value: 'SMP Negeri 4 Denpasar',     weight: 16 },
  { value: 'SMP Negeri 5 Denpasar',     weight: 15 },
  { value: 'SMP Negeri 6 Denpasar',     weight: 14 },
  { value: 'SMP Negeri 8 Denpasar',     weight: 13 },
  { value: 'SMP Negeri 11 Denpasar',    weight: 12 },
  { value: 'SMP Negeri 13 Denpasar',    weight: 12 },
  { value: 'SMP Saraswati 1 Denpasar',  weight: 12 },
  { value: 'SMP Dwijendra Denpasar',    weight: 11 },

  // ===== Sekolah kecil (variasi) =====
  { value: 'SMP Negeri 2 Denpasar',     weight: 6 },
  { value: 'SMP Negeri 7 Denpasar',     weight: 5 },
  { value: 'SMP Negeri 9 Denpasar',     weight: 5 },
  { value: 'SMP Negeri 14 Denpasar',    weight: 4 },
  { value: 'SMP Widya Paramita',        weight: 4 },
  { value: 'SMP Kristen 1 Denpasar',    weight: 4 },
  { value: 'SMP Katolik Santo Yoseph',  weight: 4 },
  { value: 'SMP Budhi Wacana Denpasar', weight: 4 },
];

// Distribusi agama — konteks Bali, Hindu dominan.
// Semua 6 agama di-enum di-cover.
const AGAMA_DIST: Array<{ value: Agama; weight: number }> = [
  { value: 'HINDU',     weight: 58 },
  { value: 'ISLAM',     weight: 22 },
  { value: 'KRISTEN',   weight: 9  },
  { value: 'KATOLIK',   weight: 7  },
  { value: 'BUDDHA',    weight: 3  },
  { value: 'KHONGHUCU', weight: 1  },
];

// Nama depan Bali + Indonesia (campuran untuk variasi).
const NAMA_DEPAN_LAKI = [
  'I Putu', 'I Made', 'I Kadek', 'I Ketut', 'I Gusti', 'I Wayan',
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
  'Putra', 'Wibawa', 'Candra', 'Karina', 'Pertiwi',
];

const NAMA_IBU = [
  'Ni Ketut Sukreni', 'Ni Wayan Sumartini', 'Ni Made Sariasih',
  'Ni Kadek Sumarni', 'Ni Putu Sugiarti', 'Ni Luh Eka Wati',
  'Nyoman Rai', 'Ketut Sari', 'Luh Putu Sukma',
  'Siti Aminah', 'Siti Khadijah', 'Nur Hidayah', 'Fatimah',
  'Maria Yuliana', 'Yuliana Wati', 'Dewi Lestari',
];

// Alamat dummy (Denpasar-area umum).
const ALAMAT_JALAN = [
  'Gatot Subroto', 'Sudirman', 'Diponegoro', 'Veteran',
  'Imam Bonjol', 'Hayam Wuruk', 'Bypass Ngurah Rai',
  'Tukad Yeh Aya', 'Tukad Badung', 'Gunung Agung', 'Gunung Rinjani',
  'Tukad Barito', 'Tukad Musi', 'Tukad Citarum',
  'Tukad Bengawan', 'Tukad Brantas',
];
const KELURAHAN = [
  'Tonja', 'Ubung', 'Peguyangan', 'Denpasar Utara',
  'Sanur', 'Renon', 'Sesetan', 'Sidakarya',
  'Kesiman', 'Penatih', 'Sumerta', 'Padangsambian',
];
const TEMPAT_LAHIR = ['Denpasar', 'Singaraja', 'Tabanan', 'Gianyar', 'Klungkung', 'Karangasem'];

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
  // Format Indonesia: 08xx-xxxx-xxxx
  const a = randInt(812, 899);
  const b = String(randInt(1000, 9999));
  const c = String(randInt(1000, 9999));
  return `08${a.toString().slice(1)}-${b}-${c}`;
}

function randomTanggalLahir(): Date {
  // Siswa SMP baru → usia ~13-16 tahun
  const now = new Date();
  const year = now.getFullYear() - randInt(13, 16);
  const month = randInt(1, 12);
  const day = randInt(1, 28);
  return new Date(year, month - 1, day);
}

function randomAlamat(): string {
  const jalan = ALAMAT_JALAN[randInt(0, ALAMAT_JALAN.length - 1)];
  const no = randInt(1, 200);
  const kel = KELURAHAN[randInt(0, KELURAHAN.length - 1)];
  return `Jl. ${jalan} No. ${no}, ${kel}, Denpasar`;
}

function randomCreatedAt(): Date {
  // Random date dalam 30 hari terakhir
  const now = Date.now();
  const offset = randInt(0, 30 * 24 * 60 * 60 * 1000);
  return new Date(now - offset);
}

// =========================================================================
// MAIN
// =========================================================================

async function main() {
  console.log('🌱 Seed dummy SPMB — generate 300 siswa dummy...');
  console.log('   Penanda: registrationNumber prefix "DUMMY-" + namaLengkap prefix "[DUMMY]"');

  // 1. Ambil jurusan aktif dari DB
  const jurusans = await prisma.jurusan.findMany({
    where: { isActive: true, deletedAt: null },
  });
  if (jurusans.length === 0) {
    throw new Error(
      'Tidak ada jurusan aktif di DB. Jalankan `npm run seed` dulu untuk seed default.',
    );
  }
  console.log(`   → ${jurusans.length} jurusan aktif: ${jurusans.map((j) => j.code).join(', ')}`);

  // 2. Ambil gelombang aktif
  const gelombang = await prisma.gelombang.findFirst({ where: { isActive: true } });
  if (!gelombang) {
    throw new Error(
      'Tidak ada gelombang aktif di DB. Buat gelombang aktif dulu (via UI atau seed custom).',
    );
  }
  console.log(`   → Gelombang aktif: ${gelombang.name}`);

  // 3. Ambil 1 user admin untuk foreign key approvedById
  const admin = await prisma.user.findFirst({ where: { isActive: true } });
  if (!admin) {
    throw new Error('Tidak ada user aktif di DB. Jalankan `npm run seed` dulu.');
  }
  console.log(`   → Approved by: ${admin.name} (${admin.email})`);

  // 4. Hapus data DUMMY-* lama (idempotent — supaya kalau di-run ulang, data
  //    fresh dan tidak numpuk. Bisa di-comment kalau mau keep existing.)
  const existingCount = await prisma.pendaftar.count({
    where: { registrationNumber: { startsWith: 'DUMMY-' } },
  });
  if (existingCount > 0) {
    console.log(`   → Hapus ${existingCount} data DUMMY-* lama dulu (re-run friendly)...`);
    await prisma.pendaftar.deleteMany({
      where: { registrationNumber: { startsWith: 'DUMMY-' } },
    });
  }

  // 5. Distribusi siswa per jurusan (acak, total = 300)
  const distribusiJurusan: Array<{ id: string; code: string; target: number }> = jurusans.map(
    (j) => ({
      id: j.id,
      code: j.code,
      target: 0,
    }),
  );

  let remaining = TARGET_TOTAL;
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
  while (remaining > 0) {
    const idx = randInt(0, distribusiJurusan.length - 1);
    distribusiJurusan[idx].target += 1;
    remaining -= 1;
    if (safetyCounter++ > 20000) break;
  }
  if (remaining > 0) {
    console.warn(`   ⚠ Tidak bisa distribusi ${remaining} siswa, mengabaikan.`);
  }

  // 6. Generate records
  const records: any[] = [];

  for (const jur of distribusiJurusan) {
    for (let i = 0; i < jur.target; i++) {
      const isLaki = Math.random() < 0.5;
      const gender: JenisKelamin = isLaki ? 'L' : 'P';
      const namaDepan = isLaki
        ? NAMA_DEPAN_LAKI[randInt(0, NAMA_DEPAN_LAKI.length - 1)]
        : NAMA_DEPAN_PEREMPUAN[randInt(0, NAMA_DEPAN_PEREMPUAN.length - 1)];
      const namaBelakang = NAMA_BELAKANG[randInt(0, NAMA_BELAKANG.length - 1)];
      const namaLengkap = `[DUMMY] ${namaDepan} ${namaBelakang}`;

      const tempatLahir = TEMPAT_LAHIR[randInt(0, TEMPAT_LAHIR.length - 1)];
      const tanggalLahir = randomTanggalLahir();

      const sekolahAsal = pickWeighted(SCHOOLS);
      const agama = pickWeighted(AGAMA_DIST);

      const createdAt = randomCreatedAt();
      const approvedAt = new Date(createdAt.getTime() + randInt(1, 5) * 24 * 60 * 60 * 1000);

      // Registration number: DUMMY-REG-YYYYMMDD-XXX (XXX acak, dijamin unique
      // // dalam batch karena randInt(1, 9999) + collision check)
      const yy = createdAt.getFullYear();
      const mm = String(createdAt.getMonth() + 1).padStart(2, '0');
      const dd = String(createdAt.getDate()).padStart(2, '0');
      const dateStr = `${yy}${mm}${dd}`;
      const seq = String(randInt(1, 9999)).padStart(4, '0');
      const registrationNumber = `DUMMY-REG-${dateStr}-${seq}`;

      records.push({
        registrationNumber,
        namaLengkap,
        jenisKelamin: gender,
        tempatLahir,
        tanggalLahir,
        nisn: null, // kosongkan untuk hindari conflict unique-per-gelombang
        sekolahAsal,
        alamat: randomAlamat(),
        noTelp: randomPhone(),
        email: `${registrationNumber.toLowerCase().replace(/[^a-z0-9]/g, '')}@dummy.local`,
        jumlahNilaiUn: new (require('@prisma/client').Prisma.Decimal)(
          (randInt(70, 95) + Math.random()).toFixed(2),
        ),
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
        // Untuk SISWA_AKTIF, idealnya statusPembayaran=LUNAS & ukuranBaju terisi,
        // tapi field status di atas adalah ENUM statis — biarkan default.
        // Computed status akan di-recalculate saat read.
        pdfPath: null,
        pdfSignature: null,
      });
    }
  }

  console.log(`   → Generated ${records.length} records, inserting...`);

  // 7. Insert batched
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

  // 8. Summary distribusi
  console.log('\n📊 Distribusi per Jurusan:');
  const groupedJurusan = await prisma.pendaftar.groupBy({
    by: ['jurusanId'],
    where: { registrationNumber: { startsWith: 'DUMMY-' } },
    _count: { _all: true },
  });
  for (const j of jurusans) {
    const c = groupedJurusan.find((g) => g.jurusanId === j.id)?._count._all ?? 0;
    console.log(`   - ${j.code} (${j.name}): ${c} siswa`);
  }

  console.log('\n📌 Distribusi Agama:');
  const groupedAgama = await prisma.pendaftar.groupBy({
    by: ['agama'],
    where: { registrationNumber: { startsWith: 'DUMMY-' } },
    _count: { _all: true },
  });
  groupedAgama
    .sort((a, b) => b._count._all - a._count._all)
    .forEach((g) => {
      console.log(`   - ${g.agama ?? '(null)'}: ${g._count._all}`);
    });

  console.log('\n🏫 Distribusi per Sekolah (top 10):');
  const groupedSekolah = await prisma.pendaftar.groupBy({
    by: ['sekolahAsal'],
    where: { registrationNumber: { startsWith: 'DUMMY-' } },
    _count: { _all: true },
  });
  groupedSekolah
    .sort((a, b) => b._count._all - a._count._all)
    .slice(0, 10)
    .forEach((g) => {
      const marker =
        ['SMP Negeri 1 Denpasar', 'SMP Negeri 3 Denpasar', 'SMP PGRI 2 Denpasar'].includes(
          g.sekolahAsal,
        )
          ? ' ⭐ (big school)'
          : '';
      console.log(`   - ${g.sekolahAsal}: ${g._count._all}${marker}`);
    });

  const sekolahUnik = await prisma.pendaftar.findMany({
    where: { registrationNumber: { startsWith: 'DUMMY-' } },
    select: { sekolahAsal: true },
    distinct: ['sekolahAsal'],
  });
  console.log(`\n   Total sekolah asal unik: ${sekolahUnik.length}`);

  console.log('\n🧹 Untuk hapus semua data dummy:');
  console.log('   npm run seed:cleanup-dummy');
}

main()
  .catch((e) => {
    console.error('Fatal error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });