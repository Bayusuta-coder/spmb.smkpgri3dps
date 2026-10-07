import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import * as fs from 'fs';
import * as path from 'path';

// Minimalis .env loader — seed jalan via `ts-node prisma/seed.ts` (di luar
// NestJS context), jadi ConfigModule.forRoot() tidak load .env untuk kita.
// Hanya set var kalau belum ada di process.env (export manual menang).
function loadDotenv() {
  const envPath = path.join(__dirname, '..', '..', '.env');
  if (!fs.existsSync(envPath)) return;
  const content = fs.readFileSync(envPath, 'utf-8');
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const match = line.match(/^([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/i);
    if (!match) continue;
    const [, key, rawVal] = match;
    if (process.env[key] !== undefined) continue;
    let val = rawVal.trim();
    // strip surrounding quotes
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    process.env[key] = val;
  }
}
loadDotenv();

const prisma = new PrismaClient();

// Daftar permission dikelompokkan per modul agar mudah ditampilkan di UI
const PERMISSIONS: Array<{ code: string; module: string; action: string; description: string }> = [
  // Modul SPMB
  { code: 'spmb.view',                module: 'spmb',     action: 'view',      description: 'Lihat daftar pendaftar' },
  { code: 'spmb.verify_berkas',       module: 'spmb',     action: 'verify',    description: 'Verifikasi berkas pendaftar (admin)' },
  // `spmb.approve` lama di-keep untuk backward compat dengan client lama —
  // sudah tidak ada endpoint yang consume, tapi ada kemungkinan UI lama masih
  // cek permission ini untuk show tombol. Setelah semua client migrate, bisa
  // di-deprecate penuh.
  { code: 'spmb.approve',             module: 'spmb',     action: 'approve',   description: 'Approve pendaftar (deprecated — pakai spmb.bayar + spmb.ukuran_baju)' },
  { code: 'spmb.reject',              module: 'spmb',     action: 'reject',    description: 'Tolak pendaftar dengan alasan' },
  // Batch C: 2 permission desentralisasi approval
  { code: 'spmb.bayar',               module: 'spmb',     action: 'pay',       description: 'Catat pembayaran pendaftar (Bendahara)' },
  { code: 'spmb.ukuran_baju',         module: 'spmb',     action: 'size',      description: 'Input ukuran baju pendaftar (TU — legacy, lihat spmb.checklist_seragam)' },
  // Batch D: Checklist seragam siswa baru (form Formulir Pengambilan Seragam).
  // - view  : lihat checklist per siswa (admin / TU / superadmin)
  // - manage: submit/update checklist per siswa — TU (primary) + admin fallback.
  //           Endpoint ini sekaligus menulis pendaftar.ukuranBaju sehingga
  //           status kelengkapan baju flip otomatis (lihat SeragamService).
  { code: 'spmb.checklist_seragam.view',   module: 'spmb', action: 'view',    description: 'Lihat checklist seragam siswa (admin/TU/Superadmin)' },
  { code: 'spmb.checklist_seragam.manage', module: 'spmb', action: 'manage',  description: 'Isi/update checklist seragam siswa (TU — primary)' },
  { code: 'spmb.seragam_item.manage',      module: 'spmb', action: 'manage',  description: 'Kelola master item seragam — hanya Superadmin' },
  { code: 'spmb.export',              module: 'spmb',     action: 'export',    description: 'Export data Dapodik' },
  { code: 'spmb.scan_daftar_ulang',   module: 'spmb',     action: 'scan',      description: 'Scan QR pendaftar saat daftar ulang fisik' },
  // CRUD manual oleh admin/superadmin (batch input offline, edit typo, hapus data dummy/salah)
  { code: 'spmb.create',              module: 'spmb',     action: 'create',    description: 'Tambah pendaftar manual (admin input offline)' },
  { code: 'spmb.update',              module: 'spmb',     action: 'update',    description: 'Edit data pendaftar yang sudah ada' },
  { code: 'spmb.delete',              module: 'spmb',     action: 'delete',    description: 'Hapus data pendaftar (hard delete — tidak bisa di-restore)' },

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

  // Modul Export (download Excel / file agregat)
  { code: 'export.manage',            module: 'export',     action: 'manage',  description: 'Export data agregat ke Excel/CSV (mis. daftar ulang multi-sheet)' },

  // Modul WhatsApp — verifikasi nomor + terima laporan/notifikasi
  { code: 'whatsapp.view',            module: 'whatsapp',  action: 'view',     description: 'Lihat status verifikasi WhatsApp sendiri' },
  { code: 'whatsapp.manage',          module: 'whatsapp',  action: 'manage',   description: 'Kelola semua nomor WhatsApp user (admin input untuk user lain)' },

  // Modul Pengaturan (settings laporan harian, non-credential)
  { code: 'settings.view',            module: 'settings',  action: 'view',     description: 'Lihat pengaturan laporan/notifikasi' },
  { code: 'settings.manage',          module: 'settings',  action: 'manage',   description: 'Atur jadwal laporan, toggle channel, format pesan' },
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
    description: 'Approve/reject pendaftar langsung dari list, cetak PDF, lihat statistik',
    isSystem: true,
    permissions: [
      'spmb.view',
      'spmb.create',   // admin bisa tambah pendaftar manual sebagai fallback
      'spmb.update',   // admin bisa edit data pendaftar sebagai fallback
      'spmb.delete',   // admin bisa hapus data pendaftar sebagai fallback
      'spmb.verify_berkas',
      'spmb.approve', // deprecated tapi di-keep untuk fallback admin
      'spmb.bayar', // admin bisa catat pembayaran sebagai fallback
      'spmb.ukuran_baju', // admin bisa input ukuran baju sebagai fallback
      'spmb.checklist_seragam.view', // admin bisa lihat checklist
      'spmb.checklist_seragam.manage', // admin bisa isi/update checklist sebagai fallback (mis. TU cuti)
      'spmb.reject',
      'spmb.export',
      'spmb.scan_daftar_ulang',
      'gelombang.view',
      'jurusan.view',
      'user.view',
      'user.manage',
      'whatsapp.manage', // admin bisa input/update nomor WA user lain
      'statistik.view',
    ],
  },
  {
    // Batch C: role Bendahara — spesialis pembayaran. Hanya bisa catat &
    // re-print struk pembayaran. Tidak bisa tolak pendaftar (permission
    // `spmb.reject` di-exclude). Bisa lihat data pendaftar untuk konteks
    // (mis. cek siapa yang sudah bayar), dan scan QR saat daftar ulang
    // fisik di sekolah.
    name: 'Bendahara',
    description: 'Catat pembayaran pendaftar (CASH/TRANSFER) + scan QR daftar ulang',
    isSystem: true,
    permissions: [
      'spmb.view',
      'spmb.bayar',
      'spmb.scan_daftar_ulang',
      'gelombang.view',
      'jurusan.view',
    ],
  },
  {
    // Batch C: role TU (Tata Usaha) — spesialis input ukuran baju. Hanya
    // bisa input ukuran baju (dropdown XS..XXXL). Tidak bisa catat
    // pembayaran. Bisa lihat data pendaftar untuk konteks dan scan QR saat
    // daftar ulang fisik.
    name: 'TU',
    description: 'Input ukuran baju pendaftar + scan QR daftar ulang',
    isSystem: true,
    permissions: [
      'spmb.view',
      'spmb.ukuran_baju',         // legacy: tetap ada untuk back-compat existing client
      'spmb.checklist_seragam.view',
      'spmb.checklist_seragam.manage', // primary — TU yang input checklist via form
      'spmb.scan_daftar_ulang',
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

/**
 * Seed user untuk role-role tertentu (Bendahara, TU) secara opsional.
 *
 * Hanya dibuat kalau `*_PASSWORD` env var di-set (min 12 char). Kalau tidak
 * di-set, role tetap ada tapi user kosong — admin bisa buat user secara
 * manual via UI setelah seed awal.
 *
 * User existing (yang sudah di-seed sebelumnya) TIDAK di-overwrite password-
 * nya — jadi aman untuk re-run seed setelah superadmin ganti password.
 */
async function seedOptionalUser(opts: {
  emailEnvVar: string;
  defaultEmail: string;
  passwordEnvVar: string;
  roleName: 'Bendahara' | 'TU';
  displayName: string;
}) {
  const password = process.env[opts.passwordEnvVar];
  if (!password || password.length < 12) {
    console.log(
      `  → ${opts.roleName}: skip (set ${opts.passwordEnvVar} untuk seed default user)`,
    );
    return;
  }

  const email = process.env[opts.emailEnvVar] || opts.defaultEmail;
  const hashed = await bcrypt.hash(password, 12);

  const user = await prisma.user.upsert({
    where: { email },
    update: {
      name: opts.displayName,
      isActive: true,
    },
    create: {
      email,
      password: hashed,
      name: opts.displayName,
      isActive: true,
    },
  });

  const role = await prisma.role.findUnique({ where: { name: opts.roleName } });
  if (role) {
    await prisma.userRole.upsert({
      where: { userId_roleId: { userId: user.id, roleId: role.id } },
      update: {},
      create: { userId: user.id, roleId: role.id },
    });
  }

  console.log(`  → ${opts.roleName} user seeded: ${email}`);
}

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

  // Wajib set SEED_ADMIN_PASSWORD lewat env. Tidak ada default hardcoded —
  // sistem ini menangani data siswa, jadi tidak boleh ada password lemah
  // yang bisa bocor lewat git history atau default config.
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (!password || password.length < 12) {
    throw new Error(
      'SEED_ADMIN_PASSWORD wajib diisi (minimal 12 karakter). ' +
        'Set di .env sebelum menjalankan seed. Contoh:\n' +
        '  SEED_ADMIN_PASSWORD=PasswordSuperAman123!\n\n' +
        'Tidak ada fallback default demi keamanan data siswa.',
    );
  }

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

  // 4. Default users untuk role-role SPMB baru (Batch C) — Bendahara & TU.
  // Opsional: dibuat hanya kalau SEED_BENDAHARA_PASSWORD & SEED_TU_PASSWORD
  // di-set di env. Password WAJIB match dengan SEED_ADMIN_PASSWORD style
  // (min 12 char). User ini berguna untuk end-to-end test alur desentralisasi
  // (Bendahara catat pembayaran → TU input ukuran baju → SISWA_AKTIF).
  await seedOptionalUser({
    emailEnvVar: 'SEED_BENDAHARA_EMAIL',
    defaultEmail: 'bendahara@smk-pgri3dps.sch.id',
    passwordEnvVar: 'SEED_BENDAHARA_PASSWORD',
    roleName: 'Bendahara',
    displayName: 'Bendahara',
  });
  await seedOptionalUser({
    emailEnvVar: 'SEED_TU_EMAIL',
    defaultEmail: 'tu@smk-pgri3dps.sch.id',
    passwordEnvVar: 'SEED_TU_PASSWORD',
    roleName: 'TU',
    displayName: 'Tata Usaha',
  });

  // 5. Default jurusan (jika belum ada)
  console.log('→ Upsert default jurusan...');
  for (const j of DEFAULT_JURUSAN) {
    await prisma.jurusan.upsert({
      where: { code: j.code },
      update: { name: j.name },
      create: { ...j, isActive: true },
    });
  }

  // 6. WhatsApp settings default (toggle operasional, BUKAN credential).
  //    Credential (URL/token/phoneId) diset lewat env var, lihat .env.example.
  //    Kalau user update via UI `/pengaturan-laporan`, value di-DB yang
  //    dipakai; env var jadi fallback kalau DB row kosong.
  console.log('→ Upsert default WhatsApp settings...');
  const DEFAULT_WHATSAPP_SETTINGS: Array<{ key: string; value: string; description: string }> = [
    {
      key: 'laporan_harian.aktif',
      value: 'true',
      description: 'Toggle master laporan harian (false = skip total)',
    },
    {
      key: 'laporan_harian.email.aktif',
      value: 'true',
      description: 'Kirim laporan via email ke superadmin (bisa multi)',
    },
    {
      key: 'laporan_harian.email.recipients',
      // Dikosongkan default — kalau kosong, fallback ke env LAPORAN_EMAIL_RECIPIENTS
      // (comma-separated). Kalau dua-duanya kosong, channel email di-skip.
      value: '',
      description: 'Daftar email tujuan (CSV). Kosongkan = pakai env LAPORAN_EMAIL_RECIPIENTS',
    },
    {
      key: 'laporan_harian.whatsapp.aktif',
      value: 'false', // OFF by default — user harus opt-in setelah setup provider
      description: 'Kirim ringkasan + link laporan via WhatsApp ke user terverifikasi',
    },
    {
      key: 'laporan_harian.jam_kirim',
      value: '18:00',
      description: 'Jam kirim harian (HH:MM, 24h). Override env LAPORAN_HARIAN_CRON',
    },
    {
      key: 'laporan_harian.timezone',
      value: 'Asia/Makassar', // WITA, Bali
      description: 'Timezone untuk scheduler. Override env LAPORAN_HARIAN_TIMEZONE',
    },
    {
      key: 'laporan_harian.format_pesan',
      value:
        '📊 *Laporan Harian SPMB*\n\n' +
        '📅 Tanggal: {tanggal}\n' +
        '🆕 Registrasi baru: {regBaru} siswa\n' +
        '🔄 Daftar ulang: {daftarUlang} siswa\n' +
        '💰 Total pembayaran: Rp {totalBayar}\n\n' +
        '📎 Laporan lengkap: {link}',
      description: 'Template pesan WhatsApp. Placeholder: {tanggal} {regBaru} {daftarUlang} {totalBayar} {link}',
    },
    {
      key: 'whatsapp.otp.ttl_seconds',
      value: '300', // 5 menit
      description: 'TTL OTP WhatsApp dalam detik',
    },
    {
      key: 'whatsapp.otp.max_attempts',
      value: '5',
      description: 'Maksimal percobaan verifikasi OTP',
    },
    {
      key: 'whatsapp.otp.resend_cooldown_seconds',
      value: '60', // 1 menit cooldown kirim ulang
      description: 'Jeda minimal antara request OTP berurutan (detik)',
    },
  ];
  for (const s of DEFAULT_WHATSAPP_SETTINGS) {
    await prisma.whatsAppSetting.upsert({
      where: { key: s.key },
      update: { description: s.description },
      create: { key: s.key, value: s.value, description: s.description },
    });
  }

  console.log('✅ Seed selesai.');
  console.log(`   Superadmin login: ${email}`);
  console.log(`   Password: (dari SEED_ADMIN_PASSWORD env var — tidak ditampilkan demi keamanan)`);
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
