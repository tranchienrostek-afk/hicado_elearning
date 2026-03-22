import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const dataPath = path.join(__dirname, '../../data_real.json');
  const data = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));

  console.log('Seeding Rooms...');
  for (const room of data.center.rooms) {
    await prisma.room.upsert({
      where: { id: room.id },
      update: {},
      create: {
        id: room.id,
        name: room.name,
        center: room.center,
        capacity: room.capacity,
        notes: room.notes,
      },
    });
  }

  console.log('Seeding Teachers...');
  for (const teacher of data.center.teachers) {
    await prisma.teacher.upsert({
      where: { id: teacher.id },
      update: {},
      create: {
        id: teacher.id,
        name: teacher.name,
        specialization: teacher.specialization,
        workplace: teacher.workplace,
        dob: teacher.dob ? new Date(teacher.dob) : null,
        gender: (teacher.gender === 'Nữ' ? 'Nu' : teacher.gender === 'Khác' ? 'Khac' : 'Nam') as any,
        cccd: teacher.cccd,
        phone: teacher.phone,
        bankAccount: teacher.bankAccount,
        bankName: teacher.bankName,
        salaryRate: teacher.salaryRate,
        notes: teacher.notes,
      },
    });
  }

  console.log('Seeding Students...');
  for (const student of data.center.students) {
    await prisma.student.upsert({
      where: { id: student.id },
      update: {},
      create: {
        id: student.id,
        name: student.name,
        birthYear: student.birthYear,
        address: student.address,
        schoolName: student.schoolName,
        schoolClass: student.schoolClass,
        cccd: student.cccd,
        tuitionStatus: student.tuitionStatus,
      },
    });
  }

  console.log('Seeding Users...');
  for (const account of data.auth.accounts) {
    const hashedPassword = await bcrypt.hash(account.password, 10);
    await prisma.user.upsert({
      where: { username: account.username },
      update: {},
      create: {
        id: account.id,
        username: account.username,
        password: hashedPassword,
        role: account.role,
        name: account.name,
        teacherId: account.teacherId,
        studentId: account.studentId,
      },
    });
  }

  console.log('Seeding Classes...');
  for (const cls of data.center.classes) {
    await prisma.class.upsert({
      where: { id: cls.id },
      update: {},
      create: {
        id: cls.id,
        name: cls.name,
        tuitionPerSession: cls.tuitionPerSession,
        totalSessions: cls.totalSessions,
        teacherShare: cls.teacherShare,
        scheduleDays: cls.schedule.days,
        scheduleTime: cls.schedule.time,
        roomId: cls.roomId,
        teacherId: cls.teacherId,
        students: {
          create: cls.studentIds.map((sId: string) => ({
            student: { connect: { id: sId } }
          }))
        }
      },
    });
  }

  console.log('Seeding Attendance...');
  // Use chunking for large attendance sets
  const BATCH_SIZE = 100;
  for (let i = 0; i < data.center.attendance.length; i += BATCH_SIZE) {
    const batch = data.center.attendance.slice(i, i + BATCH_SIZE);
    await Promise.all(batch.map((record: any) => 
      prisma.attendance.create({
        data: {
          id: record.id,
          date: new Date(record.date),
          status: record.status,
          note: record.note,
          markedByUserId: record.markedByUserId,
          markedByName: record.markedByName,
          markedByRole: record.markedByRole,
          markedAt: record.markedAt ? new Date(record.markedAt) : new Date(),
          classId: record.classId,
          studentId: record.studentId,
        }
      })
    ));
    console.log(`Seeded ${i + batch.length} attendance records...`);
  }

  console.log('Seeding Transactions...');
  for (const tx of data.center.transactions) {
    await prisma.transaction.create({
      data: {
        id: tx.id,
        amount: tx.amount,
        date: new Date(tx.date),
        status: tx.status,
        studentId: tx.studentId,
      }
    });
  }

  console.log('Seed completed successfully!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
