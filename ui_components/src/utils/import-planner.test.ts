import { describe, expect, it } from 'vitest';
import { planImport } from './import-planner';
import type { Class, Room, Student, Teacher } from '@/store';

const students: Student[] = [
  { id: 'S1', name: 'An', birthYear: 2012, address: '', tuitionStatus: 'PENDING' },
];
const teachers: Teacher[] = [
  { id: 'T1', name: 'Co Lan', phone: '0900000000', bankAccount: '1', bankName: 'VCB', salaryRate: 0.8 },
];
const rooms: Room[] = [
  { id: 'R1', name: 'Phong 101', center: 'Hicado', capacity: 1 },
];
const classes: Class[] = [
  {
    id: 'C1',
    name: 'Toan 6A',
    teacherId: 'T1',
    roomId: 'R1',
    tuitionPerSession: 200000,
    totalSessions: 12,
    teacherShare: 0.8,
    schedule: { days: ['Thu 2'], time: '18:00 - 20:00' },
    studentIds: ['S1'],
  },
];

describe('import planner', () => {
  it('blocks duplicate student ids in one file', () => {
    const plan = planImport('STUDENTS', [
      { id: 'S2', name: 'Binh', birthYear: 2011, address: '', tuitionStatus: 'PENDING' },
      { id: 'S2', name: 'Binh 2', birthYear: 2011, address: '', tuitionStatus: 'PENDING' },
    ], { students }, 'ADD_ONLY');

    expect(plan.blocked).toHaveLength(2);
    expect(plan.blocked[0].messages[0].message).toContain('trung id trong file');
  });

  it('blocks reducing room capacity below assigned class size', () => {
    const plan = planImport('ROOMS', [
      { id: 'R1', name: 'Phong 101', center: 'Hicado', capacity: 0 },
    ], { rooms, classes }, 'UPDATE_BY_ID');

    expect(plan.blocked[0].messages[0].message).toContain('suc chua nho hon si so');
  });

  it('blocks class schedule overlap in the same room', () => {
    const plan = planImport('CLASSES', [
      {
        name: 'Ly 6A',
        teacherId: 'T1',
        roomId: 'R1',
        tuitionPerSession: 200000,
        totalSessions: 12,
        teacherShare: 80,
        schedule: { days: ['Thu 2'], time: '18:00 - 20:00' },
        studentIds: ['S1'],
      },
    ], { teachers, rooms, students, classes }, 'ADD_ONLY');

    expect(plan.blocked[0].messages[0].message).toContain('trung lich phong');
  });

  it('keeps valid rows committable when another row is blocked', () => {
    const plan = planImport('ROOMS', [
      { name: 'Phong 102', center: 'Hicado', capacity: 30 },
      { name: 'Phong Bad', center: 'Hicado', capacity: 0 },
    ], { rooms, classes }, 'ADD_ONLY');

    expect(plan.creates).toHaveLength(1);
    expect(plan.blocked).toHaveLength(1);
    expect(plan.commitRows).toHaveLength(1);
  });
});
