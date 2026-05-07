import { attendanceSameDay } from './attendance-date';
import type { Attendance, Class, Teacher, Transaction } from '@/store';

type AttendanceStatus = Attendance['status'];
type AttendanceSlot = Attendance['slot'];

export const normalizeShareRate = (rate?: number) => {
  if (!rate) return 0;
  return rate > 1 ? rate / 100 : rate;
};

export const sumPresentSessionUnits = (records: Attendance[]) =>
  Number(
    records
      .filter((item) => item.status === 'PRESENT')
      .reduce((sum, item) => sum + (item.sessionUnits || 1), 0)
      .toFixed(2)
  );

export const calculateStudentTuitionDue = (
  studentId: string,
  classes: Class[],
  attendance: Attendance[],
  month?: string
) =>
  classes.reduce((total, cls) => {
    if (!cls.studentIds.includes(studentId)) return total;
    const records = attendance.filter(
      (item) =>
        item.classId === cls.id &&
        item.studentId === studentId &&
        item.status === 'PRESENT' &&
        (!month || item.date.startsWith(month))
    );
    return total + sumPresentSessionUnits(records) * cls.tuitionPerSession;
  }, 0);

export const calculateTeacherSalaryByUnits = (
  teacherId: string,
  classes: Class[],
  attendance: Attendance[],
  teachers: Teacher[],
  month?: string
) => {
  const teacher = teachers.find((item) => item.id === teacherId);
  if (!teacher) return 0;

  return classes
    .filter((cls) => cls.teacherId === teacherId)
    .reduce((total, cls) => {
      const shareRate = normalizeShareRate(cls.teacherShare ?? teacher.salaryRate);
      const records = attendance.filter(
        (item) =>
          item.classId === cls.id &&
          item.status === 'PRESENT' &&
          (!month || item.date.startsWith(month))
      );
      return total + sumPresentSessionUnits(records) * cls.tuitionPerSession * shareRate;
    }, 0);
};

export const assessProfileDeletion = (
  kind: 'STUDENT' | 'TEACHER',
  id: string,
  context: { classes: Class[]; attendance: Attendance[]; transactions: Transaction[] }
) => {
  const classRefs =
    kind === 'STUDENT'
      ? context.classes.filter((cls) => cls.studentIds.includes(id)).length
      : context.classes.filter((cls) => cls.teacherId === id).length;
  const attendanceRefs =
    kind === 'STUDENT'
      ? context.attendance.filter((item) => item.studentId === id).length
      : context.attendance.filter((item) => context.classes.some((cls) => cls.id === item.classId && cls.teacherId === id)).length;
  const transactionRefs =
    kind === 'STUDENT' ? context.transactions.filter((item) => item.studentId === id).length : 0;

  const reasons: string[] = [];
  if (classRefs > 0) {
    reasons.push(
      kind === 'STUDENT'
        ? `Hoc sinh dang nam trong ${classRefs} lop`
        : `Giao vien dang phu trach ${classRefs} lop`
    );
  }
  if (attendanceRefs > 0) {
    reasons.push(
      kind === 'STUDENT'
        ? `Hoc sinh da co ${attendanceRefs} ban ghi diem danh`
        : `Giao vien co ${attendanceRefs} ban ghi diem danh lien quan`
    );
  }
  if (transactionRefs > 0) {
    reasons.push(`Hoc sinh da co ${transactionRefs} giao dich hoc phi`);
  }

  return { canHardDelete: reasons.length === 0, reasons };
};

export interface BulkAttendancePlanInput {
  classId: string;
  studentIds: string[];
  date: string;
  slot: AttendanceSlot;
  status: AttendanceStatus;
  sessionUnits: number;
  existingRecords: Attendance[];
  allowOverwrite: boolean;
}

export const buildBulkAttendancePlan = ({
  classId,
  studentIds,
  date,
  slot,
  status,
  sessionUnits,
  existingRecords,
  allowOverwrite,
}: BulkAttendancePlanInput) => {
  const creates: Array<{ studentId: string; status: AttendanceStatus; sessionUnits: number }> = [];
  const updates: Array<{ id: string; studentId: string; status: AttendanceStatus; sessionUnits: number }> = [];
  const unchanged: Array<{ studentId: string; status: AttendanceStatus }> = [];
  const blocked: Array<{ studentId: string; existingStatus: AttendanceStatus }> = [];

  studentIds.forEach((studentId) => {
    const existing = existingRecords.find(
      (item) =>
        item.classId === classId &&
        item.studentId === studentId &&
        attendanceSameDay(item.date, date) &&
        (item.slot || 'MORNING') === slot
    );

    if (!existing) {
      creates.push({ studentId, status, sessionUnits });
      return;
    }

    if (existing.status === status && (existing.sessionUnits || 1) === sessionUnits) {
      unchanged.push({ studentId, status });
      return;
    }

    if (!allowOverwrite && existing.status !== status) {
      blocked.push({ studentId, existingStatus: existing.status });
      return;
    }

    updates.push({ id: existing.id, studentId, status, sessionUnits });
  });

  return { creates, updates, unchanged, blocked };
};
