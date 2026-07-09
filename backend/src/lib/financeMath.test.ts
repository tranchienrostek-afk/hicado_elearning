import assert from 'assert';
import { buildClassCollectionStats, buildStudentPaymentRows, expectedForStudentClass, breakdownForStudentClass, buildBillItemForClass, sumBillItems, resolveTeacherShareRate, resolveAttendanceBonusRate, computeTeacherClassPayout } from './financeMath';

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

assert.strictEqual(
  expectedForStudentClass(
    { ...classItem, tuitionPerSession: 300000 },
    'student-1',
    [{ classId: 'class-toan-1', studentId: 'student-1', status: 'PRESENT' }],
    { customTuitionPerSession: 100000 }
  ),
  100000
);

// --- UTC discount-window boundary (regression for local-timezone setHours bug) ---
// Attendance timestamps carry a time-of-day component; the discount window
// must bucket them by their UTC calendar day, not by local wall-clock day.
{
  const cls = { ...classItem, tuitionPerSession: 200000 };
  const override = { customTuitionPerSession: 100000, discountFrom: '2026-05-01', discountTo: '2026-05-01' };

  const withinWindow = breakdownForStudentClass(
    cls,
    'student-1',
    [{ classId: 'class-toan-1', studentId: 'student-1', status: 'PRESENT', date: '2026-05-01T15:30:00.000Z' }],
    override
  );
  assert.strictEqual(withinWindow.total, 100000, 'attendance inside the UTC discount day should use the override price');
  assert.strictEqual(withinWindow.groups[0].label, 'OVERRIDE');

  const justAfterWindow = breakdownForStudentClass(
    cls,
    'student-1',
    [{ classId: 'class-toan-1', studentId: 'student-1', status: 'PRESENT', date: '2026-05-02T00:00:01.000Z' }],
    override
  );
  assert.strictEqual(justAfterWindow.total, 200000, 'attendance one second into the next UTC day should use the class price');
  assert.strictEqual(justAfterWindow.groups[0].label, 'CLASS_DEFAULT');
}

// --- Rounding: fractional sessionUnits must not leak fractional VND ---
{
  const cls = { ...classItem, tuitionPerSession: 33333 };
  const result = breakdownForStudentClass(cls, 'student-1', [
    { classId: 'class-toan-1', studentId: 'student-1', status: 'PRESENT', sessionUnits: 0.1 },
  ]);
  assert.strictEqual(Number.isInteger(result.total), true);
  assert.strictEqual(result.total, Math.round(33333 * 0.1));
}

// --- buildBillItemForClass / sumBillItems: mixed-price period keeps a breakdown ---
{
  const cls = { ...classItem, tuitionPerSession: 200000 };
  const override = { customTuitionPerSession: 100000, discountFrom: '2026-05-01', discountTo: '2026-05-15' };
  const attendances = [
    { classId: 'class-toan-1', studentId: 'student-1', status: 'PRESENT', date: '2026-05-05' }, // OVERRIDE
    { classId: 'class-toan-1', studentId: 'student-1', status: 'PRESENT', date: '2026-05-20' }, // CLASS_DEFAULT
  ];
  const item = buildBillItemForClass(cls, 'student-1', attendances as any, override);
  assert.strictEqual(item.sessions, 2);
  assert.strictEqual(item.subtotal, 300000); // 100000 (override) + 200000 (class default)
  assert.strictEqual(item.breakdown.length, 2);
  // pricePerSession alone (the first group's rate) intentionally does not reconcile
  // with subtotal here — callers must render item.breakdown for mixed-price periods.
  assert.notStrictEqual(item.pricePerSession * item.sessions, item.subtotal);

  assert.strictEqual(sumBillItems([item, { ...item, subtotal: 50000 } as any]), 350000);
}

// --- buildClassCollectionStats: an untagged (classId: null) transaction must not be
// double-counted across every class the student is enrolled in ---
{
  const classA = {
    id: 'A', name: 'A', tuitionPerSession: 100000, totalSessions: 4,
    students: [{ student: { id: 'stu', name: 'Stu', studentCode: null, tuitionStatus: 'PENDING' } }],
  };
  const classB = {
    id: 'B', name: 'B', tuitionPerSession: 150000, totalSessions: 4,
    students: [{ student: { id: 'stu', name: 'Stu', studentCode: null, tuitionStatus: 'PENDING' } }],
  };
  const atts = [
    { classId: 'A', studentId: 'stu', status: 'PRESENT' },
    { classId: 'A', studentId: 'stu', status: 'PRESENT' },
    { classId: 'B', studentId: 'stu', status: 'PRESENT' },
  ];
  const untaggedTx = [{ id: 'tx', studentId: 'stu', classId: null, amount: 100000 }];

  const stats = buildClassCollectionStats([classA, classB], untaggedTx as any, atts as any);
  const totalCollected = stats.reduce((sum, c) => sum + c.collected, 0);
  assert.strictEqual(totalCollected, 100000, 'untagged transaction must be counted once, not once per class');
}

// --- resolveTeacherShareRate: class override beats teacher default beats 0.8 ---
{
  assert.strictEqual(resolveTeacherShareRate(0.7, 0.6), 0.7, 'class-level override takes precedence');
  assert.strictEqual(resolveTeacherShareRate(null, 0.6), 0.6, 'falls back to teacher default when no override');
  assert.strictEqual(resolveTeacherShareRate(null, null), 0.8, 'falls back to 0.8 when neither is set');
  assert.strictEqual(resolveTeacherShareRate(0, 0.6), 0, 'an explicit 0% override must not be treated as unset');
}

// --- resolveAttendanceBonusRate: tiered thresholds ---
{
  assert.strictEqual(resolveAttendanceBonusRate(0.96), 0.05);
  assert.strictEqual(resolveAttendanceBonusRate(0.95), 0.05);
  assert.strictEqual(resolveAttendanceBonusRate(0.90), 0.03);
  assert.strictEqual(resolveAttendanceBonusRate(0.85), 0.03);
  assert.strictEqual(resolveAttendanceBonusRate(0.50), 0);
}

// --- computeTeacherClassPayout: PERCENTAGE vs HOURLY, with bonus applied ---
{
  const percentagePayout = computeTeacherClassPayout({
    salaryType: 'PERCENTAGE',
    sessionCount: 10,
    totalTuition: 2000000,
    shareRate: 0.8,
    attendanceRate: 0.96,
  });
  assert.strictEqual(percentagePayout.baseSalary, 1600000);
  assert.strictEqual(percentagePayout.bonusRate, 0.05);
  assert.strictEqual(percentagePayout.bonus, 80000);
  assert.strictEqual(percentagePayout.total, 1680000);

  const hourlyPayout = computeTeacherClassPayout({
    salaryType: 'HOURLY',
    hourlyRate: 150000,
    sessionCount: 8,
    totalTuition: 999999, // irrelevant for HOURLY
    shareRate: 0.8, // irrelevant for HOURLY
    attendanceRate: 0.5,
  });
  assert.strictEqual(hourlyPayout.baseSalary, 1200000);
  assert.strictEqual(hourlyPayout.bonus, 0);
  assert.strictEqual(hourlyPayout.total, 1200000);
}

console.log('financeMath tests passed');
