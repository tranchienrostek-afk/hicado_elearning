import assert from 'assert';
import { buildClassCollectionStats, buildStudentPaymentRows } from './financeMath';

const classItem = {
  id: 'class-toan-1',
  name: 'Toan 8',
  tuitionPerSession: 200000,
  totalSessions: 8,
  students: [
    { student: { id: 'S1777711126499', name: 'Le Quoc Tien', studentCode: null, tuitionStatus: 'PAID' } },
    { student: { id: 'student-1', name: 'Ngoc', studentCode: 'HS001', tuitionStatus: 'PENDING' } },
    { student: { id: 'S1777712808642', name: 'Tran Minh Khanh', studentCode: null, tuitionStatus: 'DEBT' } },
  ],
};

const transactions = [
  { id: 'tx-1', studentId: 'S1777711126499', classId: 'class-toan-1', amount: 5000 },
  { id: 'tx-2', studentId: 'S1777711126499', classId: 'class-toan-1', amount: 2000 },
  { id: 'tx-3', studentId: 'S1777711126499', classId: 'class-toan-1', amount: 2000 },
];

const attendances = [
  { classId: 'class-toan-1', studentId: 'S1777711126499', status: 'PRESENT' },
  { classId: 'class-toan-1', studentId: 'S1777711126499', status: 'PRESENT' },
  { classId: 'class-toan-1', studentId: 'student-1', status: 'PRESENT' },
  { classId: 'class-toan-1', studentId: 'student-1', status: 'ABSENT' },
  { classId: 'class-toan-1', studentId: 'S1777712808642', status: 'PRESENT' },
  { classId: 'class-toan-1', studentId: 'S1777712808642', status: 'PRESENT' },
  { classId: 'class-toan-1', studentId: 'S1777712808642', status: 'PRESENT' },
];

assert.deepStrictEqual(buildClassCollectionStats([classItem], transactions), [
  {
    classId: 'class-toan-1',
    className: 'Toan 8',
    expected: 4800000,
    collected: 9000,
    gap: 4791000,
    rate: 0.2,
    studentCount: 3,
    paidCount: 0,
    partialCount: 1,
  },
]);

assert.deepStrictEqual(buildClassCollectionStats([classItem], transactions, attendances), [
  {
    classId: 'class-toan-1',
    className: 'Toan 8',
    expected: 1200000,
    collected: 9000,
    gap: 1191000,
    rate: 0.8,
    studentCount: 3,
    paidCount: 0,
    partialCount: 1,
  },
]);

assert.deepStrictEqual(
  buildStudentPaymentRows([classItem], transactions, attendances).map(row => ({
    id: row.id,
    totalDebt: row.totalDebt,
    paymentStatus: row.paymentStatus,
  })),
  [
    { id: 'S1777711126499', totalDebt: 391000, paymentStatus: 'PAID_PARTIAL' },
    { id: 'student-1', totalDebt: 200000, paymentStatus: 'NOT_PAID' },
    { id: 'S1777712808642', totalDebt: 600000, paymentStatus: 'NOT_PAID' },
  ]
);

console.log('financeMath tests passed');
