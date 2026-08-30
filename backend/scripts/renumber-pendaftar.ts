/**
 * BACKFILL SCRIPT — Renumber existing pendaftar yang punya nomor duplikat.
 *
 * KASUS:
 *   Sebelumnya logic generateRegistrationNumber() di service menggunakan
 *   filter createdAt (rentang tanggal) yang timezone-sensitive. Pada
 *   environment tertentu (server UTC, user di WITA UTC+8) atau bug
 *   sebelumnya, semua pendaftar di hari yang sama bisa keluar
 *   REG-YYYYMMDD-001 karena count() selalu balik 0.
 *
 *   Walau generator baru sudah pakai prefix-based count (timezone-agnostic),
 *   data historis masih bentrok. Script ini me-renumber mereka:
 *   - Mengelompokkan pendaftar per "hari" (diambil dari prefix REG-YYYYMMDD-)
 *   - Untuk tiap group, sort by createdAt ASC
 *   - Re-assign REG-YYYYMMDD-001, 002, 003, ... preserving createdAt order
 *   - Update registrationNumber di DB
 *
 * ⚠️  EFEK SAMPING:
 *   - QR Code yang sudah di-print di PDF lama akan invalidate
 *     (signature token terkait signature random yang dipakai saat itu).
 *     Tapi signature disimpan terpisah (pdfSignature), bukan turunan dari
 *     registrationNumber, jadi QR Code di PDF TETAP VALID.
 *   - Email yang sudah dikirim mungkin reference nomor lama. Admin perlu
 *       komunikasi ke pendaftar bahwa nomor berubah.
 *   - Audit log tetap mencatat nomor baru saja (registrationNumber di log
 *       metadata akan jadi nomor baru setelah update).
 *
 * PENGGUNAAN:
 *   cd backend
 *   npx ts-node scripts/renumber-pendaftar.ts            # mode dry-run
 *   npx ts-node scripts/renumber-pendaftar.ts --apply    # apply ke DB
 *
 * SELALU jalankan tanpa --apply dulu untuk review perubahan!
 */
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

async function main() {
  const apply = process.argv.includes('--apply');

  console.log(
    `\n🔧 Mode: ${apply ? '⚠️  APPLY (akan update DB)' : '🧪 DRY-RUN (tidak ada perubahan)'}\n`,
  );

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  const prisma = app.get(PrismaService);

  // Ambil semua pendaftar, sort by createdAt ASC
  const all = await prisma.pendaftar.findMany({
    select: {
      id: true,
      registrationNumber: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'asc' },
  });

  console.log(`📊 Total pendaftar di DB: ${all.length}`);

  // Kelompokkan per prefix REG-YYYYMMDD-
  const groups = new Map<string, typeof all>();
  for (const p of all) {
    const m = p.registrationNumber.match(/^(REG-\d{8})-/);
    const key = m ? m[1] : '__INVALID__';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(p);
  }

  let totalChanges = 0;
  let groupsTouched = 0;

  for (const [prefix, rows] of groups) {
    if (prefix === '__INVALID__') {
      console.warn(
        `⚠️  Skip ${rows.length} rows dengan registrationNumber tidak ber-prefix REG-YYYYMMDD-`,
      );
      continue;
    }

    // Cek apakah group ini punya duplikat
    const seen = new Set<string>();
    const duplicates = rows.filter((r) => {
      if (seen.has(r.registrationNumber)) return true;
      seen.add(r.registrationNumber);
      return false;
    });

    if (duplicates.length === 0 && rows.every((r, i) => r.registrationNumber === `${prefix}-${String(i + 1).padStart(3, '0')}`)) {
      // Sudah benar, skip
      continue;
    }

    groupsTouched++;
    console.log(`\n📅 Group ${prefix}: ${rows.length} rows, ${duplicates.length} duplicates`);

    // Re-assign sequential numbers preserving createdAt order
    rows.forEach((r, i) => {
      const expected = `${prefix}-${String(i + 1).padStart(3, '0')}`;
      if (r.registrationNumber === expected) return;

      console.log(
        `   ${r.id.slice(0, 8)}  ${r.registrationNumber}  →  ${expected}  ` +
          `(createdAt=${r.createdAt.toISOString()})`,
      );

      totalChanges++;

      if (apply) {
        // Pakai $executeRawUnsafe karena Prisma typed update mungkin konflik
        // dengan unique constraint sementara. Kita defer check ke akhir.
      }
    });
  }

  if (!apply) {
    console.log(
      `\nℹ️  DRY-RUN selesai. ${totalChanges} baris perlu di-update dalam ${groupsTouched} group.`,
    );
    console.log(`   Jalankan dengan --apply untuk apply perubahan ke DB.\n`);
    await app.close();
    return;
  }

  // APPLY MODE — update DB
  console.log(`\n⚠️  Applying ${totalChanges} updates ke DB...\n`);
  let updated = 0;
  let failed = 0;

  for (const [prefix, rows] of groups) {
    if (prefix === '__INVALID__') continue;

    // Sort ulang untuk safety
    const sorted = [...rows].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

    for (let i = 0; i < sorted.length; i++) {
      const r = sorted[i];
      const expected = `${prefix}-${String(i + 1).padStart(3, '0')}`;
      if (r.registrationNumber === expected) continue;

      try {
        await prisma.pendaftar.update({
          where: { id: r.id },
          data: { registrationNumber: expected },
        });
        console.log(`   ✔ ${r.registrationNumber} → ${expected}`);
        updated++;
      } catch (e: any) {
        console.error(`   ✖ Gagal update ${r.id}: ${e.message}`);
        failed++;
      }
    }
  }

  console.log(`\n✅ Apply selesai: ${updated} updated, ${failed} failed.`);
  await app.close();
}

main().catch((e) => {
  console.error('❌ Error:', e);
  process.exit(1);
});