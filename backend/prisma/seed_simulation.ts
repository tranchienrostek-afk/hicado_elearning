import { PrismaClient, Role, Gender, TuitionStatus, AttendanceStatus, TransactionStatus } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const SURNAMES = ['Nguyễn', 'Trần', 'Lê', 'Phạm', 'Hoàng', 'Phan', 'Vũ', 'Đặng', 'Bùi', 'Đỗ'];
const MIDDLE_NAMES = ['Văn', 'Thị', 'Minh', 'Hoàng', 'Anh', 'Ngọc', 'Đức', 'Tuấn', 'Hồng', 'Thành'];
const LAST_NAMES = ['Anh', 'Bình', 'Chi', 'Dương', 'Em', 'Giang', 'Hùng', 'Kiên', 'Lâm', 'Nam', 'Oanh', 'Phương', 'Quân', 'Sơn', 'Tú', 'Vinh', 'Xuân', 'Yến'];

const randomItem = (arr: any[]) => arr[Math.floor(Math.random() * arr.length)];
const randomName = () => `${randomItem(SURNAMES)} ${randomItem(MIDDLE_NAMES)} ${randomItem(LAST_NAMES)}`;
const randomPhone = () => `0${Math.floor(Math.random() * 900000000 + 100000000)}`;
const randomInt = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1) + min);

async function main() {
  console.log('🚀 Starting Large-scale Simulation Seeding...');

  // 1. Cleanup
  console.log('🧹 Cleaning up old data...');
  try {
    await prisma.attendance.deleteMany();
    await prisma.transaction.deleteMany();
    await prisma.classStudent.deleteMany();
    await prisma.class.deleteMany();
    await prisma.room.deleteMany();
    await prisma.user.deleteMany();
    await prisma.teacher.deleteMany();
    await prisma.student.deleteMany();
  } catch (err) {
    console.log('Cleanup warning (might be empty):', err);
  }

  const hashedPassword = await bcrypt.hash('123', 10);

  // 2. Create Staff Accounts
  console.log('👥 Creating staff accounts...');
  await prisma.user.createMany({
    data: [
      { username: 'admin', password: hashedPassword, role: Role.ADMIN, name: 'Hicado Admin' },
      { username: 'ketoan', password: hashedPassword, role: Role.MANAGER, name: 'Hicado Kế Toán' },
      { username: 'manager', password: hashedPassword, role: Role.MANAGER, name: 'Hicado Manager' },
    ]
  });

  // 3. Create Rooms
  console.log('🏢 Creating rooms...');
  const rooms = await Promise.all([
    prisma.room.create({ data: { name: 'P.101', center: 'Hicado', capacity: 20 } }),
    prisma.room.create({ data: { name: 'P.102', center: 'Hicado', capacity: 15 } }),
    prisma.room.create({ data: { name: 'P.201', center: 'Hicado', capacity: 30 } }),
    prisma.room.create({ data: { name: 'Vạn Xuân A', center: 'Vạn Xuân', capacity: 25 } }),
    prisma.room.create({ data: { name: 'Vạn Xuân B', center: 'Vạn Xuân', capacity: 10 } }),
  ]);

  // 4. Create Teachers (50)
  console.log('🎓 Creating 50 teachers...');
  const teachers = [];
  for (let i = 1; i <= 50; i++) {
    const name = randomName();
    const teacher = await prisma.teacher.create({
      data: {
        name,
        phone: randomPhone(),
        bankAccount: `${randomInt(1000000000, 9999999999)}`,
        bankName: randomItem(['Vietcombank', 'Techcombank', 'Agribank', 'MB Bank', 'TPBank']),
        salaryRate: randomItem([0.3, 0.4, 0.5, 0.6, 0.8]),
        specialization: randomItem(['Math', 'English', 'Science', 'Art', 'Music']),
        workplace: 'Hicado Center',
        user: {
          create: {
            username: `gv${i}`,
            password: hashedPassword,
            role: Role.TEACHER,
            name
          }
        }
      }
    });
    teachers.push(teacher);
  }

  // 5. Create Students (500)
  console.log('👤 Creating 500 students...');
  const students = [];
  for (let i = 1; i <= 500; i++) {
    const name = randomName();
    const student = await prisma.student.create({
      data: {
        name,
        birthYear: randomInt(2005, 2018),
        address: `${randomInt(1, 999)} Nguyễn Trãi, Hà Nội`,
        schoolName: randomItem(['THPT Chuyên Hà Nội-Amsterdam', 'THPT Kim Liên', 'THCS Trưng Vương']),
        schoolClass: `${randomInt(1, 12)}${randomItem(['A', 'B', 'C', 'D'])}`,
        tuitionStatus: randomItem([TuitionStatus.PAID, TuitionStatus.PENDING, TuitionStatus.DEBT]),
        studentCode: `HS${String(i).padStart(4, '0')}`,
      }
    });
    students.push(student);
  }

  // 6. Create Classes (100)
  console.log('📚 Creating 100 classes...');
  const classes = [];
  for (let i = 1; i <= 100; i++) {
    const teacher = randomItem(teachers);
    const room = randomItem(rooms);
    const cls = await prisma.class.create({
      data: {
        name: `Lớp ${randomItem(['Toán', 'Lý', 'Hóa', 'Anh'])} ${randomInt(1, 12)} - ${i}`,
        tuitionPerSession: randomItem([150000, 200000, 250000, 300000, 500000]),
        totalSessions: randomInt(12, 48),
        scheduleDays: [randomItem(['Thứ 2', 'Thứ 3', 'Thứ 4']), randomItem(['Thứ 5', 'Thứ 6', 'Thứ 7'])],
        scheduleTime: `${randomInt(17, 19)}:00 - ${randomInt(20, 21)}:00`,
        teacherId: teacher.id,
        roomId: room.id,
        classCode: `C${String(i).padStart(3, '0')}`,
      }
    });
    classes.push(cls);

    // Assign 5-15 random students to each class
    const classSize = randomInt(5, 15);
    const shuffledStudents = [...students].sort(() => 0.5 - Math.random());
    const classStudents = shuffledStudents.slice(0, classSize);

    for (const student of classStudents) {
      await prisma.classStudent.create({
        data: {
          classId: cls.id,
          studentId: student.id
        }
      });
    }
  }

  // 7. Create Attendance (Last 2 months)
  console.log('📅 Creating attendance records...');
  const today = new Date();
  
  for (const cls of classes) {
    const classStudents = await prisma.classStudent.findMany({ where: { classId: cls.id } });
    const attendanceData = [];
    
    for (let s = 1; s <= 4; s++) { // Reduced to 4 sessions to speed up seeding
      const date = new Date(today);
      date.setDate(today.getDate() - (s * 7)); 
      date.setHours(0, 0, 0, 0);

      for (const cs of classStudents) {
        attendanceData.push({
          date,
          status: randomItem([AttendanceStatus.PRESENT, AttendanceStatus.PRESENT, AttendanceStatus.PRESENT, AttendanceStatus.ABSENT, AttendanceStatus.LEAVE_REQUEST]),
          classId: cls.id,
          studentId: cs.studentId,
          markedByRole: 'ADMIN',
          markedByName: 'System Bot'
        });
      }
    }
    await prisma.attendance.createMany({ data: attendanceData, skipDuplicates: true });
  }

  // 8. Create Transactions (500)
  console.log('💰 Creating transactions...');
  const transactionData = [];
  for (let i = 0; i < 500; i++) {
    const student = randomItem(students);
    transactionData.push({
      amount: randomItem([500000, 1000000, 2000000, 3000000]),
      date: new Date(today.getTime() - Math.random() * 30 * 24 * 60 * 60 * 1000),
      status: TransactionStatus.SUCCESS,
      studentId: student.id,
      content: `Học phí HS: ${student.name}`,
      gateway: 'Vietcombank',
      referenceCode: `REF${randomInt(100000, 999999)}`
    });

    if (transactionData.length > 100) {
      await prisma.transaction.createMany({ data: [...transactionData] });
      transactionData.length = 0;
    }
  }
  if (transactionData.length > 0) {
    await prisma.transaction.createMany({ data: transactionData });
  }

  console.log('✅ Simulation Seeding Completed!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
