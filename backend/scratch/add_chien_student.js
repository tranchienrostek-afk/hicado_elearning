const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: 'postgresql://postgres:password@localhost:5433/elearning?schema=public'
    }
  }
});

async function main() {
  console.log('--- Adding Student "Chiến" to Docker DB ---');
  
  // 1. Ensure teacher exists (referencing seed_basic.js pattern)
  const teacher = await prisma.teacher.upsert({
    where: { id: 'teacher-chien' },
    update: {},
    create: {
      id: 'teacher-chien',
      name: 'Trần Chiến',
      phone: '0965389247',
      bankAccount: '123456789',
      bankName: 'Vietcombank',
      salaryRate: 0.8
    }
  });
  console.log('Teacher ensured:', teacher.name);

  // 2. Ensure class exists
  const cls = await prisma.class.upsert({
    where: { classCode: 'TOAN' },
    update: {},
    create: {
      id: 'class-toan-1',
      name: 'Toán học 12 - Nâng cao',
      classCode: 'TOAN',
      tuitionPerSession: 150000,
      totalSessions: 10,
      teacherId: teacher.id
    }
  });
  console.log('Class ensured:', cls.name);

  // 3. Add student "Chiến"
  const student = await prisma.student.upsert({
    where: { studentCode: 'HS-CHIEN' },
    update: {
      parentPhone: '0965389247',
      name: 'Chiến Test ZNS'
    },
    create: {
      name: 'Chiến Test ZNS',
      studentCode: 'HS-CHIEN',
      birthYear: 2008,
      address: 'Hà Nội',
      parentPhone: '0965389247',
      tuitionStatus: 'PENDING'
    }
  });
  console.log('Student ensured:', student.name, 'Phone:', student.parentPhone);

  // 4. Enroll student in class
  await prisma.classStudent.upsert({
    where: { classId_studentId: { classId: cls.id, studentId: student.id } },
    update: {},
    create: { classId: cls.id, studentId: student.id }
  });
  console.log('Enrollment ensured.');

  console.log('--- Done ---');
}

main()
  .catch(e => console.error(e))
  .finally(() => prisma.$disconnect());
