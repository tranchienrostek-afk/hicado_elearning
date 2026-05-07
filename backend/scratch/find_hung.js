const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const teacher = await prisma.teacher.findFirst({
    where: { name: { contains: 'Hùng' } },
    include: { user: true }
  });
  console.log(JSON.stringify(teacher, null, 2));
}

main()
  .catch(e => console.error(e))
  .finally(async () => await prisma.$disconnect());
