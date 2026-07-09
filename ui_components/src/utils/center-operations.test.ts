import { describe, expect, it } from 'vitest';
import type { Attendance, Class, Transaction } from '@/store';
import {
  assessProfileDeletion,
  buildBulkAttendancePlan,
  calculateStudentTuitionDue,
  sumPresentSessionUnits,
} from './center-operations';

const classes: Class[] = [
  {
    id: 'C1',
    name: 'Toan 6',
    teacherId: 'T1',
    roomId: 'R1',
    tuitionPerSession: 200000,
    totalSessions: 12,
    studentIds: ['S1', 'S2'],
    teacherShare: 0.8,
    schedule: { days: ['Thu 2'], time: '18:00 - 20:00' },
  },
];

const attendance: Attendance[] = [
  {
    id: 'A1',
    classId: 'C1',
    studentId: 'S1',
    date: '2026-05-04',
    slot: 'EVENING',
    sessionUnits: 1.5,
    status: 'PRESENT',
  },
  {
    id: 'A2',
    classId: 'C1',
    studentId: 'S2',
    date: '2026-05-04',
    slot: 'EVENING',
    sessionUnits: 2,
    status: 'PRESENT',
  },
  {
    id: 'A3',
    classId: 'C1',
    studentId: 'S1',
    date: '2026-05-06',
    slot: 'EVENING',
    sessionUnits: 1,
    status: 'ABSENT',
  },
];

describe('center operations', () => {
  it('sums present session units instead of counting records', () => {
    expect(sumPresentSessionUnits(attendance)).toBe(3.5);
  });

  it('calculates student tuition from present session units', () => {
    expect(calculateStudentTuitionDue('S1', classes, attendance)).toBe(300000);
  });

  it('blocks hard delete when a student has class, attendance, or transaction references', () => {
    const transactions: Transaction[] = [{ id: 'TX1', studentId: 'S1', amount: 100000, date: '2026-05-05', status: 'SUCCESS' }];

    const result = assessProfileDeletion('STUDENT', 'S1', { classes, attendance, transactions });

    expect(result.canHardDelete).toBe(false);
    expect(result.reasons).toContain('Hoc sinh dang nam trong 1 lop');
    expect(result.reasons).toContain('Hoc sinh da co 2 ban ghi diem danh');
    expect(result.reasons).toContain('Hoc sinh da co 1 giao dich hoc phi');
  });

  it('allows hard delete for an unreferenced mistaken teacher profile', () => {
    const result = assessProfileDeletion('TEACHER', 'T2', { classes, attendance, transactions: [] });

    expect(result.canHardDelete).toBe(true);
    expect(result.reasons).toHaveLength(0);
  });

  it('plans bulk present attendance without overwriting absent records by default', () => {
    const plan = buildBulkAttendancePlan({
      classId: 'C1',
      studentIds: ['S1', 'S2'],
      date: '2026-05-06',
      slot: 'EVENING',
      status: 'PRESENT',
      sessionUnits: 1.5,
      existingRecords: attendance,
      allowOverwrite: false,
    });

    expect(plan.creates).toHaveLength(1);
    expect(plan.creates[0].studentId).toBe('S2');
    expect(plan.blocked).toEqual([{ studentId: 'S1', existingStatus: 'ABSENT' }]);
    expect(plan.updates).toHaveLength(0);
  });

  it('plans bulk present attendance with explicit overwrite', () => {
    const plan = buildBulkAttendancePlan({
      classId: 'C1',
      studentIds: ['S1'],
      date: '2026-05-06',
      slot: 'EVENING',
      status: 'PRESENT',
      sessionUnits: 1.5,
      existingRecords: attendance,
      allowOverwrite: true,
    });

    expect(plan.updates).toEqual([{ id: 'A3', studentId: 'S1', status: 'PRESENT', sessionUnits: 1.5 }]);
    expect(plan.blocked).toHaveLength(0);
  });
});
