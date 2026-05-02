import { describe, expect, it } from 'vitest';
import {
  buildCenterExportRows,
  getCenterWorkbookFileName,
  normalizeCenterImportRows,
} from './center-spreadsheet';

describe('center spreadsheet mapping', () => {
  it('exports users with an xlsx filename', () => {
    expect(getCenterWorkbookFileName('STUDENTS')).toMatch(/^Danh_Sach_Hoc_Sinh_\d{4}-\d{2}-\d{2}\.xlsx$/);
  });

  it('builds templates for empty class and room lists', () => {
    expect(buildCenterExportRows('CLASSES', [], { teachers: [], rooms: [], students: [] })[0]).toMatchObject({
      name: 'Toan 6A',
      tuitionPerSession: 200000,
      scheduleDays: 'Thu 2, Thu 4',
    });
    expect(buildCenterExportRows('ROOMS', [], { classes: [] })[0]).toMatchObject({
      name: 'Phong 101',
      center: 'Hicado',
      capacity: 30,
    });
  });

  it('normalizes classes by resolving teacher, room, and students from names', () => {
    const result = normalizeCenterImportRows('CLASSES', [
      {
        name: 'Toan 6A',
        teacherName: 'Co Lan',
        roomName: 'Phong 101',
        roomCenter: 'Hicado',
        tuitionPerSession: '200000',
        totalSessions: '12',
        teacherShare: '80',
        scheduleDays: 'Thu 2, Thu 4',
        scheduleTime: '18:00 - 20:00',
        studentNames: 'An, Binh',
      },
    ], {
      teachers: [{ id: 'T1', name: 'Co Lan', phone: '0900000000', bankAccount: '1', bankName: 'VCB', salaryRate: 0.8 }],
      rooms: [{ id: 'R1', name: 'Phong 101', center: 'Hicado', capacity: 30 }],
      students: [
        { id: 'S1', name: 'An', birthYear: 2012, address: '', tuitionStatus: 'PENDING' },
        { id: 'S2', name: 'Binh', birthYear: 2012, address: '', tuitionStatus: 'PENDING' },
      ],
    });

    expect(result.validRows).toEqual([
      {
        name: 'Toan 6A',
        teacherId: 'T1',
        roomId: 'R1',
        tuitionPerSession: 200000,
        totalSessions: 12,
        teacherShare: 80,
        schedule: { days: ['Thu 2', 'Thu 4'], time: '18:00 - 20:00' },
        studentIds: ['S1', 'S2'],
      },
    ]);
    expect(result.errors).toEqual([]);
  });

  it('rejects rooms with invalid center and capacity', () => {
    const result = normalizeCenterImportRows('ROOMS', [
      { name: 'Phong X', center: 'Sai Gon', capacity: '0' },
    ], { classes: [] });

    expect(result.validRows).toEqual([]);
    expect(result.errors).toEqual([
      'Dong 2: center phai la Hicado hoac Van Xuan',
      'Dong 2: capacity phai lon hon 0',
    ]);
  });
});
