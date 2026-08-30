// Quick script to reset superadmin password.
// Run via: cd backend && npx ts-node scripts/check-users.ts
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  const email = process.argv[2] || 'superadmin@smk-pgri3dps.sch.id';
  const newPassword = process.argv[3] || 'Admin123!SuperAdmin';

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    console.error(`User ${email} not found`);
    return;
  }
  console.log('Current user:', { email: user.email, name: user.name, isActive: user.isActive });

  const hashed = await bcrypt.hash(newPassword, 12);
  await prisma.user.update({
    where: { email },
    data: { password: hashed },
  });
  console.log(`Password reset for ${email} to "${newPassword}"`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());