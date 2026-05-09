
import { PrismaClient } from '@prisma/client';
import { normalizePhone, normalizeVietnameseName } from './src/lib/studentIdentity';

const prisma = new PrismaClient();

async function backfill() {
  console.log('Starting backfill of student normalization fields...');
  const students = await prisma.student.findMany({
    where: {
      OR: [
        { nameNorm: null },
        { phoneNorm: null },
        { parentPhoneNorm: null }
      ]
    }
  });

  console.log(`Found ${students.length} students to update.`);

  for (const s of students) {
    const nameNorm = normalizeVietnameseName(s.name);
    const phoneNorm = normalizePhone(s.studentPhone);
    const parentPhoneNorm = normalizePhone(s.parentPhone);

    await prisma.student.update({
      where: { id: s.id },
      data: {
        nameNorm,
        phoneNorm,
        parentPhoneNorm
      }
    });
  }

  console.log('Backfill completed.');
}

backfill()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
