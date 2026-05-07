import { PrismaClient, Role } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const users = await prisma.user.findMany({
    select: { username: true, role: true, name: true }
  });
  console.log('Existing users:', JSON.stringify(users, null, 2));

  const username = 'admin';
  const password = 'password123';

  const hashedPassword = await bcrypt.hash(password, 10);

  const newUser = await prisma.user.upsert({
    where: { username },
    update: {
      password: hashedPassword,
    },
    create: {
      username,
      password: hashedPassword,
      role: Role.MANAGER,
      name: 'Kế Toán 2',
    },
  });

  console.log('Account created/updated:');
  console.log('Username:', newUser.username);
  console.log('Password:', 'password123');
  console.log('Role:', newUser.role);
}

main()
  .catch((e) => console.error(e))
  .finally(async () => await prisma.$disconnect());
