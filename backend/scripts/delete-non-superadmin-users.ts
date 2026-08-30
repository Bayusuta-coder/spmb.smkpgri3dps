/**
 * One-time cleanup — Hapus semua user KECUALI yang punya role "Superadmin".
 *
 * PENTING: Ini destruktif & tidak bisa di-undo. BACKUP database dulu sebelum
 * menjalankan script ini:
 *   docker exec spmb_db pg_dump -U spmb -d spmb --clean --if-exists --no-owner \
 *     > backups/spmb-backup-before-user-cleanup-$(date +%Y%m%d-%H%M%S).sql
 *
 * Yang DIHAPUS:
 *   - User dengan role apapun SELAIN "Superadmin"
 *   - user_roles (junction table) auto-cascade via Prisma
 *
 * Yang TETAP AMAN (analisa cascade di schema.prisma):
 *   - AuditLog.userId (SetNull) → userId jadi NULL, baris log tetap ada
 *   - Pendaftar.{verifiedById, approvedById, dibayarOlehUserId, ...} (Restrict,
 *     nullable) → 0 rows reference saat ini (verified via _count), jadi tidak
 *     block delete. Kalau ada row reference, akan gagal dengan FK violation.
 *   - Berita.createdBy (Restrict) → 0 rows reference
 *   - Pengumuman.createdBy (Restrict) → 0 rows reference
 *
 * Cara pakai:
 *   cd backend && echo "HAPUS SEMUA USER NON-SUPERADMIN" | npx ts-node scripts/delete-non-superadmin-users.ts
 */
import { PrismaClient } from '@prisma/client';
import * as readline from 'readline';

const CONFIRM_PHRASE = 'HAPUS SEMUA USER NON-SUPERADMIN';

async function askConfirmation(): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => {
    rl.question(
      `\n⚠️  Hapus semua user non-Superadmin — Ketik persis "${CONFIRM_PHRASE}" untuk lanjut: `,
      (answer) => {
        rl.close();
        resolve(answer.trim() === CONFIRM_PHRASE);
      },
    );
  });
}

async function main() {
  const prisma = new PrismaClient();

  console.log('=== Hapus User Non-Superadmin ===\n');

  // Cari role Superadmin
  const superadminRole = await prisma.role.findFirst({ where: { name: 'Superadmin' } });
  if (!superadminRole) {
    console.error('❌ Role "Superadmin" tidak ditemukan di database. Abort.');
    await prisma.$disconnect();
    process.exit(1);
  }
  console.log(`Role Superadmin ID: ${superadminRole.id}\n`);

  // Cari semua user dengan relasi roles
  const allUsers = await prisma.user.findMany({
    include: { roles: { include: { role: true } } },
    orderBy: { email: 'asc' },
  });

  // Filter: user yang TIDAK punya role Superadmin
  const toDelete = allUsers.filter((u) => !u.roles.some((ur) => ur.role.name === 'Superadmin'));
  const toKeep = allUsers.filter((u) => u.roles.some((ur) => ur.role.name === 'Superadmin'));

  console.log(`Total user: ${allUsers.length}`);
  console.log(`Akan DIHAPUS (${toDelete.length}):`);
  toDelete.forEach((u) => {
    const roleNames = u.roles.map((ur) => ur.role.name).join(', ');
    console.log(`  - ${u.email}  (${u.name})  [roles: ${roleNames}]`);
  });
  console.log(`\nAkan TETAP (${toKeep.length}):`);
  toKeep.forEach((u) => {
    const roleNames = u.roles.map((ur) => ur.role.name).join(', ');
    console.log(`  - ${u.email}  (${u.name})  [roles: ${roleNames}]`);
  });

  // Pre-check FK dependents
  console.log('\n=== Pre-check FK dependents (untuk user yang akan dihapus) ===');
  for (const u of toDelete) {
    const counts = await prisma.pendaftar.count({ where: { OR: [
      { verifiedById: u.id },
      { approvedById: u.id },
      { dibayarOlehUserId: u.id },
      { ukuranBajuDisetOlehUserId: u.id },
      { daftarUlangConfirmedByUserId: u.id },
      { userId: u.id },
    ]}});
    const berita = await prisma.berita.count({ where: { createdByUserId: u.id } });
    const pengumuman = await prisma.pengumuman.count({ where: { createdByUserId: u.id } });
    const auditLogs = await prisma.auditLog.count({ where: { userId: u.id } });
    console.log(`  ${u.email}:`);
    console.log(`    pendaftar as verifiedBy/approvedBy/dibayarOleh/ukuranBajuDisetOleh: ${counts}`);
    console.log(`    berita: ${berita}  pengumuman: ${pengumuman}  auditLog: ${auditLogs}`);
  }

  if (toDelete.length === 0) {
    console.log('\n✅ Tidak ada user yang perlu dihapus.');
    await prisma.$disconnect();
    return;
  }

  const confirmed = await askConfirmation();
  if (!confirmed) {
    console.log('\n❌ Dibatalkan. Tidak ada data yang berubah.');
    await prisma.$disconnect();
    return;
  }

  console.log('\n⏳ Menghapus...');
  for (const u of toDelete) {
    try {
      // Hard delete — user_roles (junction) akan auto-cascade via Prisma schema.
      // AuditLog.userId akan di-SetNull.
      await prisma.user.delete({ where: { id: u.id } });
      console.log(`  ✓ Dihapus: ${u.email}`);
    } catch (e: any) {
      console.error(`  ✗ Gagal hapus ${u.email}: ${e.message}`);
    }
  }

  // Verifikasi
  const after = await prisma.user.findMany({
    include: { roles: { include: { role: true } } },
  });
  console.log(`\n=== Setelah cleanup ===`);
  after.forEach((u) => {
    const roleNames = u.roles.map((ur) => ur.role.name).join(', ');
    console.log(`  - ${u.email}  (${u.name})  [roles: ${roleNames}]  isActive: ${u.isActive}`);
  });
  console.log(`\nTotal user tersisa: ${after.length}`);

  await prisma.$disconnect();
  console.log('\n✅ Cleanup selesai.');
}

main().catch(async (e) => {
  console.error('❌ Error:', e);
  process.exit(1);
});
