const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
(async () => {
  const rows = await p.$queryRawUnsafe(`
    SELECT u.id, u.email, u.name, u.password,
           string_agg(r.name, ', ' ORDER BY r.name) AS roles
    FROM users u
    LEFT JOIN user_roles ur ON ur."userId" = u.id
    LEFT JOIN roles r ON r.id = ur."roleId"
    GROUP BY u.id, u.email, u.name, u.password
    ORDER BY u.email
  `);
  for (const u of rows) {
    console.log((u.roles || '').padEnd(45), '|', u.email.padEnd(35), '|', u.name, '|', u.password.slice(0, 30));
  }
  await p.$disconnect();
})();
