import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding basic data...');
  const hashedPassword = await bcrypt.hash('password', 10);

  // 1. Create Teacher
  const teacher = await prisma.teacher.upsert({
    where: { id: 'teacher-1' },
    update: {},
    create: {
      id: 'teacher-1',
      name: 'Master Yoda',
      phone: '0909000999',
      bankAccount: '123456789',
      bankName: 'Vietcombank',
      salaryRate: 0.8
    }
  });

  // 2. Create Class
  const cls = await prisma.class.upsert({
    where: { classCode: 'TOAN' },
    update: {},
    create: {
      id: 'class-toan-1',
      name: 'Toan hoc 12 - Nang cao',
      classCode: 'TOAN',
      tuitionPerSession: 150000,
      totalSessions: 10,
      teacherId: teacher.id
    }
  });

  // 3. Create Student
  const student = await prisma.student.upsert({
    where: { studentCode: 'HS001' },
    update: {},
    create: {
      id: 'student-1',
      name: 'Nguyen Van A',
      studentCode: 'HS001',
      birthYear: 2008,
      address: 'Ha Noi',
      tuitionStatus: 'PENDING'
    }
  });

  // 4. Enroll Student in Class
  await prisma.classStudent.upsert({
    where: { classId_studentId: { classId: cls.id, studentId: student.id } },
    update: {},
    create: { classId: cls.id, studentId: student.id }
  });

  // 5. Create Users
  // Admin
  await prisma.user.upsert({
    where: { username: 'admin' },
    update: { password: hashedPassword },
    create: {
      username: 'admin',
      password: hashedPassword,
      role: 'ADMIN',
      name: 'Administrator'
    }
  });

  // Student Account
  await prisma.user.upsert({
    where: { username: 'student' },
    update: { password: hashedPassword },
    create: {
      username: 'student',
      password: hashedPassword,
      role: 'STUDENT',
      name: 'Nguyen Van A',
      studentId: student.id
    }
  });

  // Teacher Account
  await prisma.user.upsert({
    where: { username: 'teacher' },
    update: { password: hashedPassword },
    create: {
      username: 'teacher',
      password: hashedPassword,
      role: 'TEACHER',
      name: 'Master Yoda',
      teacherId: teacher.id
    }
  });

  console.log('Seed completed successfully!');
  console.log('Admin account: admin / password');
  console.log('Teacher account: teacher / password');
  console.log('Student account: student / password');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
