import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

// Daftar permission dikelompokkan per modul agar mudah ditampilkan di UI
const PERMISSIONS: Array<{ code: string; module: string; action: string; description: string }> = [
  // Modul SPMB
  { code: 'spmb.view',                module: 'spmb',     action: 'view',      description: 'Lihat daftar pendaftar' },
  { code: 'spmb.verify_berkas',       module: 'spmb',     action: 'verify',    description: 'Verifikasi berkas pendaftar (admin)' },
  { code: 'spmb.approve',             module: 'spmb',     action: 'approve',   description: 'Approve final daftar ulang (admin)' },
  { code: 'spmb.reject',              module: 'spmb',     action: 'reject',    description: 'Tolak pendaftar' },
  { code: 'spmb.export',              module: 'spmb',     action: 'export',    description: 'Export data Dapodik' },
  { code: 'spmb.scan_daftar_ulang',   module: 'spmb',     action: 'scan',      description: 'Scan QR pendaftar saat daftar ulang fisik' },

  // Modul Pembayaran
  { code: 'payment.view',             module: 'payment',  action: 'view',      description: 'Lihat data pembayaran' },
  { code: 'payment.verify',           module: 'payment',  action: 'verify',    description: 'Verifikasi kecocokan transfer (TU)' },

  // Modul Gelombang
  { code: 'gelombang.view',           module: 'gelombang', action: 'view',     description: 'Lihat daftar gelombang' },
  { code: 'gelombang.manage',         module: 'gelombang', action: 'manage',   description: 'Buat/edit/nonaktifkan gelombang' },

  // Modul Jurusan
  { code: 'jurusan.view',             module: 'jurusan',  action: 'view',      description: 'Lihat daftar jurusan' },
  { code: 'jurusan.manage',           module: 'jurusan',  action: 'manage',    description: 'Kelola master jurusan' },

  // Modul User
  { code: 'user.view',                module: 'user',     action: 'view',      description: 'Lihat daftar user' },
  { code: 'user.manage',              module: 'user',     action: 'manage',    description: 'Buat/edit/nonaktifkan user' },

  // Modul Role & Permission
  { code: 'role.view',                module: 'role',     action: 'view',      description: 'Lihat daftar role & permission' },
  { code: 'role.manage',              module: 'role',     action: 'manage',    description: 'Buat/edit role & atur permission' },

  // Modul Statistik
  { code: 'statistik.view',           module: 'statistik', action: 'view',     description: 'Lihat dashboard statistik' },

  // Modul Audit Log
  { code: 'audit.view',               module: 'audit',    action: 'view',      description: 'Lihat audit log' },

  // Modul Berita (konten editorial — artikel/info sekolah)
  { code: 'berita.view',              module: 'berita',     action: 'view',    description: 'Lihat daftar berita' },
  { code: 'berita.manage',            module: 'berita',     action: 'manage',  description: 'Kelola berita (tulis, edit, publish, hapus)' },

  // Modul Pengumuman (banner popup pendek)
  { code: 'pengumuman.view',          module: 'pengumuman', action: 'view',    description: 'Lihat daftar pengumuman' },
  { code: 'pengumuman.manage',        module: 'pengumuman', action: 'manage',  description: 'Kelola pengumuman (tambah, edit, aktif/nonaktif, hapus)' },
];

// Default role dengan permission yang sudah ditentukan.
// isSystem=true menandakan role ini tidak boleh dihapus sembarangan.
const ROLES: Array<{
  name: string;
  description: string;
  isSystem: boolean;
  permissions: string[];
}> = [
  {
    name: 'Superadmin',
    description: 'Akses penuh ke seluruh sistem',
    isSystem: true,
    permissions: PERMISSIONS.map((p) => p.code), // semua permission
  },
  {
    name: 'Admin',
    description: 'Verifikasi berkas, approve final, lihat statistik',
    isSystem: true,
    permissions: [
      'spmb.view',
      'spmb.verify_berkas',
      'spmb.approve',
      'spmb.reject',
      'spmb.export',
      'spmb.scan_daftar_ulang',
      'payment.view',
      'gelombang.view',
      'jurusan.view',
      'user.view',
      'statistik.view',
    ],
  },
  {
    name: 'TU',
    description: 'Verifikasi kecocokan transfer pembayaran',
    isSystem: true,
    permissions: [
      'spmb.view',
      'spmb.scan_daftar_ulang',
      'payment.view',
      'payment.verify',
      'gelombang.view',
      'jurusan.view',
    ],
  },
];

// Jurusan default SMK PGRI 3 Denpasar (bisa diedit lewat UI nanti oleh superadmin)
const DEFAULT_JURUSAN = [
  { code: 'TKJ', name: 'Teknik Komputer dan Jaringan' },
  { code: 'MM',  name: 'Multimedia' },
  { code: 'AKL', name: 'Akuntansi dan Keuangan Lembaga' },
  { code: 'OTKP', name: 'Otomatisasi dan Tata Kelola Perkantoran' },
  { code: 'BDP', name: 'Bisnis Daring dan Pemasaran' },
];

async function main() {
  console.log('🌱 Memulai seed database...');

  // 1. Permissions (upsert)
  console.log('→ Upsert permissions...');
  for (const perm of PERMISSIONS) {
    await prisma.permission.upsert({
      where: { code: perm.code },
      update: {
        module: perm.module,
        action: perm.action,
        description: perm.description,
      },
      create: perm,
    });
  }

  // 2. Roles + role_permissions (upsert)
  console.log('→ Upsert roles & role_permissions...');
  for (const role of ROLES) {
    const existing = await prisma.role.findUnique({ where: { name: role.name } });
    const roleRecord = existing
      ? await prisma.role.update({
          where: { id: existing.id },
          data: { description: role.description, isSystem: role.isSystem },
        })
      : await prisma.role.create({
          data: {
            name: role.name,
            description: role.description,
            isSystem: role.isSystem,
          },
        });

    // sync role_permissions: hapus lama, pasang ulang sesuai daftar
    await prisma.rolePermission.deleteMany({ where: { roleId: roleRecord.id } });
    for (const code of role.permissions) {
      const perm = await prisma.permission.findUnique({ where: { code } });
      if (!perm) continue;
      await prisma.rolePermission.create({
        data: { roleId: roleRecord.id, permissionId: perm.id },
      });
    }
  }

  // 3. Superadmin user (idempotent)
  console.log('→ Upsert superadmin user...');
  const email = process.env.SEED_ADMIN_EMAIL || 'superadmin@smk-pgri3dps.sch.id';
  const password = process.env.SEED_ADMIN_PASSWORD || 'change-this-password';
  const hashed = await bcrypt.hash(password, 12);

  const superadmin = await prisma.user.upsert({
    where: { email },
    update: {
      name: 'Superadmin',
      isActive: true,
      // tidak overwrite password jika user sudah ada & password sudah diganti
    },
    create: {
      email,
      password: hashed,
      name: 'Superadmin',
      isActive: true,
    },
  });

  // pastikan role Superadmin terpasang ke user
  const superadminRole = await prisma.role.findUnique({ where: { name: 'Superadmin' } });
  if (superadminRole) {
    await prisma.userRole.upsert({
      where: { userId_roleId: { userId: superadmin.id, roleId: superadminRole.id } },
      update: {},
      create: { userId: superadmin.id, roleId: superadminRole.id },
    });
  }

  // 4. Default jurusan (jika belum ada)
  console.log('→ Upsert default jurusan...');
  for (const j of DEFAULT_JURUSAN) {
    await prisma.jurusan.upsert({
      where: { code: j.code },
      update: { name: j.name },
      create: { ...j, isActive: true },
    });
  }

  console.log('✅ Seed selesai.');
  console.log(`   Superadmin login: ${email}`);
  console.log(`   Password: ${password === 'change-this-password' ? '(default dari SEED_ADMIN_PASSWORD)' : '(custom)'}`);
  console.log(`   ⚠️  Segera ganti password setelah login pertama!`);
}

main()
  .catch((e) => {
    console.error('❌ Seed gagal:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
