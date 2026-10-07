const bcrypt = require('bcrypt');
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
(async () => {
  const newPw = 'BendaharaTest2026!';
  const hashed = await bcrypt.hash(newPw, 12);
  const sa = await p.user.update({
    where: { email: 'superadmin@smk-pgri3dps.sch.id' },
    data: { password: hashed },
  });
  console.log('Superadmin password reset:', sa.email);
  console.log('New password:', newPw);
  await p.$disconnect();
})();
