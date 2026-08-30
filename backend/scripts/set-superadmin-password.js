const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');

const p = new PrismaClient();

(async () => {
  const password = process.argv[2];
  if (!password || password.length < 6) {
    console.error('Usage: node set-superadmin-password.js <password-min-6-char>');
    process.exit(1);
  }
  const hash = await bcrypt.hash(password, 12);
  const r = await p.user.update({
    where: { email: 'superadmin@smk-pgri3dps.sch.id' },
    data: {
      password: hash,
      resetTokenHash: null,
      resetTokenExpires: null,
    },
  });
  console.log('✅ Password updated for:', r.email);
  console.log('   Name:', r.name);
  console.log('   isActive:', r.isActive);
  console.log('   Token sisa di-clear supaya tidak konflik dengan reset UI');
})()
  .catch((e) => {
    console.error('❌ Error:', e.message);
    process.exit(1);
  })
  .finally(() => p.$disconnect());
