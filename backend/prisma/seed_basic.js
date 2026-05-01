'use strict';
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding basic data...');
  const hash123 = await bcrypt.hash('123', 10);

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

  const student = await prisma.student.upsert({
    where: { studentCode: 'HS001' },
    update: {},
    create: {
      id: 'student-1',
      name: 'Nguyễn Văn A',
      studentCode: 'HS001',
      birthYear: 2008,
      address: 'Hà Nội',
      tuitionStatus: 'PENDING'
    }
  });

  await prisma.classStudent.upsert({
    where: { classId_studentId: { classId: cls.id, studentId: student.id } },
    update: {},
    create: { classId: cls.id, studentId: student.id }
  });

  await prisma.user.upsert({
    where: { username: 'admin' },
    update: { password: hash123 },
    create: { username: 'admin', password: hash123, role: 'ADMIN', name: 'Hicado Admin' }
  });

  await prisma.user.upsert({
    where: { username: 'ketoan' },
    update: { password: hash123 },
    create: { username: 'ketoan', password: hash123, role: 'MANAGER', name: 'Kế toán Hicado' }
  });

  await prisma.user.upsert({
    where: { username: 'manager' },
    update: { password: hash123 },
    create: { username: 'manager', password: hash123, role: 'MANAGER', name: 'Quản lý Hicado' }
  });

  await prisma.user.upsert({
    where: { username: 'thaychien' },
    update: { password: hash123 },
    create: { username: 'thaychien', password: hash123, role: 'TEACHER', name: 'Trần Chiến', teacherId: teacher.id }
  });

  await prisma.user.upsert({
    where: { username: 'student' },
    update: { password: hash123 },
    create: { username: 'student', password: hash123, role: 'STUDENT', name: 'Nguyễn Văn A', studentId: student.id }
  });

  console.log('✅ Seed completed — all accounts password: 123');
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
