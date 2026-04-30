import prisma from './lib/prisma';
import axios from 'axios';

async function verify() {
  console.log('--- START VERIFICATION ---');

  // 1. Create Test Class
  const testClass = await prisma.class.upsert({
    where: { classCode: 'TOAN' },
    update: {},
    create: {
      name: 'Toán học 12',
      classCode: 'TOAN',
      tuitionPerSession: 100000,
      totalSessions: 10,
      teacher: {
        create: {
          name: 'Thầy Giáo Ba',
          phone: '0987654321',
          bankAccount: '123456789',
          bankName: 'Vietcombank',
          salaryRate: 0.8
        }
      }
    }
  });
  console.log('Test Class created/found:', testClass.id);

  // 2. Create Test Student
  const testStudent = await prisma.student.upsert({
    where: { studentCode: 'HS001' },
    update: { tuitionStatus: 'PENDING' },
    create: {
      name: 'Nguyễn Văn A',
      studentCode: 'HS001',
      birthYear: 2008,
      address: 'Hà Nội',
      tuitionStatus: 'PENDING'
    }
  });
  console.log('Test Student created/found:', testStudent.id);

  // 3. Mock SePay Webhook Payload
  const payload = {
    id: 999999,
    gateway: 'Vietcombank',
    transactionDate: new Date().toISOString(),
    accountNumber: '0123456789',
    code: 'HS001 TOAN',
    content: 'HS001 TOAN CHUYEN KHOAN HOC PHI',
    transferType: 'in',
    transferAmount: 1000000,
    referenceCode: 'MOCK123456'
  };

  try {
    console.log('Sending mock webhook request...');
    const response = await axios.post('http://localhost:5000/api/webhook/sepay', payload, {
      headers: {
        'Authorization': 'Apikey sepay_test_key_123'
      }
    });

    console.log('Response:', response.data);

    // 4. Verify DB changes
    const updatedStudent = await prisma.student.findUnique({
      where: { id: testStudent.id }
    });
    console.log('Updated tuitionStatus:', updatedStudent?.tuitionStatus);

    const enrollment = await prisma.classStudent.findUnique({
      where: {
        classId_studentId: {
          classId: testClass.id,
          studentId: testStudent.id
        }
      }
    });
    console.log('Is enrolled in class?', !!enrollment);

    if (updatedStudent?.tuitionStatus === 'PAID' && enrollment) {
      console.log('--- VERIFICATION SUCCESSFUL ---');
    } else {
      console.log('--- VERIFICATION FAILED ---');
    }

  } catch (error: any) {
    console.error('Error during verification:', error.response?.data || error.message);
  } finally {
    process.exit();
  }
}

verify();
