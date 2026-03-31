require('dotenv').config();
const bcrypt = require('bcryptjs');
const prisma = require('../src/prisma');

async function main() {
  const email = process.env.SUPERADMIN_EMAIL;
  const username = process.env.SUPERADMIN_USERNAME;
  const password = process.env.SUPERADMIN_PASSWORD;

  if (!email || !username || !password) {
    throw new Error('Defina SUPERADMIN_EMAIL, SUPERADMIN_USERNAME e SUPERADMIN_PASSWORD no .env.');
  }

  const passwordHash = await bcrypt.hash(password, 12);

  await prisma.user.upsert({
    where: { email },
    update: {
      username,
      passwordHash,
      role: 'SUPERADMIN',
      displayName: 'Super Admin',
    },
    create: {
      email,
      username,
      passwordHash,
      role: 'SUPERADMIN',
      displayName: 'Super Admin',
    },
  });

  console.log('Superadmin criado/atualizado com sucesso.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
