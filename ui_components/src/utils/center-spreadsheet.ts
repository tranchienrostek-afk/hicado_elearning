import type { Class, Room, Student, Teacher } from '@/store';
import { downloadXlsxWorkbook, readXlsxWorkbook, type WorkbookRow } from './excel-workbook';

export type SpreadsheetKind = 'STUDENTS' | 'TEACHERS' | 'CLASSES' | 'ROOMS';

export interface ImportResult<T> {
  validRows: T[];
  errors: string[];
}

export interface MappingContext {
  students?: Student[];
  teachers?: Teacher[];
  rooms?: Room[];
  classes?: Class[];
}

export type StudentImportRow = Partial<Student> & Pick<Student, 'name' | 'birthYear'>;
export type TeacherImportRow = Partial<Teacher> & Pick<Teacher, 'name' | 'phone' | 'bankAccount' | 'bankName'>;
export type RoomImportRow = Partial<Room> & Pick<Room, 'name' | 'center' | 'capacity'>;
export type ClassImportRow = Partial<Class> & Pick<Class, 'name' | 'teacherId' | 'tuitionPerSession' | 'totalSessions'>;

const fileDate = () => new Date().toISOString().slice(0, 10);
const text = (value: unknown) => String(value ?? '').trim();
const numberValue = (value: unknown, fallback = 0) => {
  const parsed = Number(text(value).replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : fallback;
};
const listValue = (value: unknown) =>
  text(value)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
const normalize = (value: unknown) => text(value).toLowerCase();

export const getCenterWorkbookFileName = (kind: SpreadsheetKind) => {
  const prefix: Record<SpreadsheetKind, string> = {
    STUDENTS: 'Danh_Sach_Hoc_Sinh',
    TEACHERS: 'Danh_Sach_Giao_Vien',
    CLASSES: 'Danh_Sach_Lop_Hoc',
    ROOMS: 'Danh_Sach_Phong_Hoc',
  };
  return `${prefix[kind]}_${fileDate()}.xlsx`;
};

const studentTemplate = {
  id: '',
  name: 'Nguyen Van A',
  birthYear: 2012,
  address: 'Ha Noi',
  schoolName: 'THCS Mau',
  schoolClass: '7A1',
  parentPhone: '0901234567',
  studentPhone: '0912345678',
  cccd: '',
  tuitionStatus: 'PENDING',
};

const teacherTemplate = {
  id: '',
  name: 'Le Van C',
  phone: '0987654321',
  specialization: 'Math',
  bankAccount: '123456789',
  bankName: 'VCB',
  salaryRate: 0.8,
  workplace: 'Hicado Center',
  cccd: '',
  notes: '',
};

const roomTemplate = {
  id: '',
  name: 'Phong 101',
  center: 'Hicado',
  capacity: 30,
  notes: 'Co may chieu',
};

const classTemplate = (context: MappingContext) => {
  const teacher = context.teachers?.[0];
  const room = context.rooms?.[0];
  const sampleStudents = context.students?.slice(0, 2) || [];
  return {
    id: '',
    name: 'Toan 6A',
    teacherName: teacher?.name || '',
    teacherId: teacher?.id || '',
    roomName: room?.name || '',
    roomCenter: room?.center || '',
    roomId: room?.id || '',
    tuitionPerSession: 200000,
    totalSessions: 12,
    teacherShare: 80,
    scheduleDays: 'Thu 2, Thu 4',
    scheduleTime: '18:00 - 20:00',
    studentNames: sampleStudents.map((item) => item.name).join(', '),
    studentIds: sampleStudents.map((item) => item.id).join(', '),
  };
};

const buildStudentRows = (rows: Partial<Student>[]) =>
  rows.map((row) => ({
    id: row.id || '',
    name: row.name || '',
    birthYear: row.birthYear || '',
    address: row.address || '',
    schoolName: row.schoolName || '',
    schoolClass: row.schoolClass || '',
    parentPhone: row.parentPhone || '',
    studentPhone: row.studentPhone || '',
    cccd: row.cccd || '',
    tuitionStatus: row.tuitionStatus || 'PENDING',
  }));

const buildTeacherRows = (rows: Partial<Teacher>[]) =>
  rows.map((row) => ({
    id: row.id || '',
    name: row.name || '',
    phone: row.phone || '',
    specialization: row.specialization || '',
    bankAccount: row.bankAccount || '',
    bankName: row.bankName || '',
    salaryRate: row.salaryRate ?? '',
    workplace: row.workplace || '',
    cccd: row.cccd || '',
    notes: row.notes || '',
  }));

const buildRoomRows = (rows: Partial<Room>[]) =>
  rows.map((row) => ({
    id: row.id || '',
    name: row.name || '',
    center: row.center || 'Hicado',
    capacity: row.capacity || '',
    notes: row.notes || '',
  }));

const buildClassRows = (rows: Partial<Class>[], context: MappingContext) =>
  rows.map((row) => {
    const teacher = context.teachers?.find((item) => item.id === row.teacherId);
    const room = context.rooms?.find((item) => item.id === row.roomId);
    const classStudents = context.students?.filter((item) => row.studentIds?.includes(item.id)) || [];
    return {
      id: row.id || '',
      name: row.name || '',
      teacherName: teacher?.name || '',
      teacherId: row.teacherId || '',
      roomName: room?.name || '',
      roomCenter: room?.center || '',
      roomId: row.roomId || '',
      tuitionPerSession: row.tuitionPerSession || '',
      totalSessions: row.totalSessions || '',
      teacherShare: row.teacherShare != null && row.teacherShare <= 1 ? row.teacherShare * 100 : row.teacherShare ?? '',
      scheduleDays: row.schedule?.days?.join(', ') || '',
      scheduleTime: row.schedule?.time || '',
      studentNames: classStudents.map((item) => item.name).join(', '),
      studentIds: row.studentIds?.join(', ') || '',
    };
  });

export const buildCenterExportRows = (
  kind: SpreadsheetKind,
  rows: Array<Partial<Student> | Partial<Teacher> | Partial<Class> | Partial<Room>>,
  context: MappingContext = {}
) => {
  if (rows.length === 0) {
    if (kind === 'STUDENTS') return [studentTemplate];
    if (kind === 'TEACHERS') return [teacherTemplate];
    if (kind === 'ROOMS') return [roomTemplate];
    return [classTemplate(context)];
  }
  if (kind === 'STUDENTS') return buildStudentRows(rows as Partial<Student>[]);
  if (kind === 'TEACHERS') return buildTeacherRows(rows as Partial<Teacher>[]);
  if (kind === 'ROOMS') return buildRoomRows(rows as Partial<Room>[]);
  return buildClassRows(rows as Partial<Class>[], context);
};

const normalizeTuitionStatus = (value: unknown): Student['tuitionStatus'] =>
  ['PAID', 'PENDING', 'DEBT'].includes(text(value)) ? (text(value) as Student['tuitionStatus']) : 'PENDING';

const normalizeSalaryRate = (value: unknown) => {
  const parsed = numberValue(value, 0.8);
  return parsed > 1 ? parsed / 100 : parsed;
};

const resolveTeacherId = (row: WorkbookRow, teachers: Teacher[], errors: string[], rowNumber: number) => {
  const teacherId = text(row.teacherId);
  if (teacherId) return teacherId;
  const matches = teachers.filter((teacher) => normalize(teacher.name) === normalize(row.teacherName));
  if (matches.length === 1) return matches[0].id;
  errors.push(`Dong ${rowNumber}: khong tim thay giao vien`);
  return '';
};

const resolveRoomId = (row: WorkbookRow, rooms: Room[], errors: string[], rowNumber: number) => {
  const roomId = text(row.roomId);
  if (roomId) return roomId;
  const matches = rooms.filter(
    (room) =>
      normalize(room.name) === normalize(row.roomName) &&
      (!text(row.roomCenter) || normalize(room.center) === normalize(row.roomCenter))
  );
  if (matches.length === 1) return matches[0].id;
  errors.push(`Dong ${rowNumber}: khong tim thay phong`);
  return '';
};

const resolveStudentIds = (row: WorkbookRow, students: Student[], errors: string[], rowNumber: number) => {
  const ids = listValue(row.studentIds);
  if (ids.length > 0) return ids;
  const names = listValue(row.studentNames);
  const resolved: string[] = [];
  names.forEach((name) => {
    const matches = students.filter((student) => normalize(student.name) === normalize(name));
    if (matches.length === 1) resolved.push(matches[0].id);
    else errors.push(`Dong ${rowNumber}: khong tim thay hoc sinh ${name}`);
  });
  return resolved;
};

const normalizeStudentRows = (rows: WorkbookRow[]): ImportResult<StudentImportRow> => {
  const validRows: StudentImportRow[] = [];
  const errors: string[] = [];
  rows.forEach((row, index) => {
    const rowNumber = index + 2;
    if (!text(row.name)) errors.push(`Dong ${rowNumber}: thieu name`);
    if (!text(row.birthYear)) errors.push(`Dong ${rowNumber}: thieu birthYear`);
    if (!text(row.name) || !text(row.birthYear)) return;
    validRows.push({
      id: text(row.id) || undefined,
      name: text(row.name),
      birthYear: numberValue(row.birthYear),
      address: text(row.address),
      schoolName: text(row.schoolName),
      schoolClass: text(row.schoolClass),
      parentPhone: text(row.parentPhone),
      studentPhone: text(row.studentPhone),
      cccd: text(row.cccd),
      tuitionStatus: normalizeTuitionStatus(row.tuitionStatus),
    });
  });
  return { validRows, errors };
};

const normalizeTeacherRows = (rows: WorkbookRow[]): ImportResult<TeacherImportRow> => {
  const validRows: TeacherImportRow[] = [];
  const errors: string[] = [];
  rows.forEach((row, index) => {
    const rowNumber = index + 2;
    const missing = ['name', 'phone', 'bankAccount', 'bankName'].filter((field) => !text(row[field]));
    missing.forEach((field) => errors.push(`Dong ${rowNumber}: thieu ${field}`));
    if (missing.length > 0) return;
    validRows.push({
      id: text(row.id) || undefined,
      name: text(row.name),
      phone: text(row.phone),
      specialization: text(row.specialization),
      bankAccount: text(row.bankAccount),
      bankName: text(row.bankName),
      salaryRate: normalizeSalaryRate(row.salaryRate),
      workplace: text(row.workplace),
      cccd: text(row.cccd),
      notes: text(row.notes),
    });
  });
  return { validRows, errors };
};

const normalizeRoomRows = (rows: WorkbookRow[]): ImportResult<RoomImportRow> => {
  const validRows: RoomImportRow[] = [];
  const errors: string[] = [];
  rows.forEach((row, index) => {
    const rowNumber = index + 2;
    const rawCenter = text(row.center);
    const capacity = numberValue(row.capacity);
    let blocked = false;
    if (!text(row.name)) {
      errors.push(`Dong ${rowNumber}: thieu name`);
      blocked = true;
    }
    if (!['Hicado', 'Van Xuan', 'Vạn Xuân'].includes(rawCenter)) {
      errors.push(`Dong ${rowNumber}: center phai la Hicado hoac Van Xuan`);
      blocked = true;
    }
    if (capacity <= 0) {
      errors.push(`Dong ${rowNumber}: capacity phai lon hon 0`);
      blocked = true;
    }
    if (blocked) return;
    validRows.push({
      id: text(row.id) || undefined,
      name: text(row.name),
      center: rawCenter === 'Van Xuan' ? 'Vạn Xuân' : (rawCenter as Room['center']),
      capacity,
      notes: text(row.notes),
    });
  });
  return { validRows, errors };
};

const normalizeClassRows = (rows: WorkbookRow[], context: MappingContext): ImportResult<ClassImportRow> => {
  const validRows: ClassImportRow[] = [];
  const errors: string[] = [];
  const teachers = context.teachers || [];
  const rooms = context.rooms || [];
  const students = context.students || [];
  rows.forEach((row, index) => {
    const rowNumber = index + 2;
    const rowErrors: string[] = [];
    if (!text(row.name)) rowErrors.push(`Dong ${rowNumber}: thieu name`);
    const teacherId = resolveTeacherId(row, teachers, rowErrors, rowNumber);
    const roomId = resolveRoomId(row, rooms, rowErrors, rowNumber);
    if (!text(row.tuitionPerSession)) rowErrors.push(`Dong ${rowNumber}: thieu tuitionPerSession`);
    if (!text(row.totalSessions)) rowErrors.push(`Dong ${rowNumber}: thieu totalSessions`);
    if (!text(row.scheduleDays)) rowErrors.push(`Dong ${rowNumber}: thieu scheduleDays`);
    if (!text(row.scheduleTime)) rowErrors.push(`Dong ${rowNumber}: thieu scheduleTime`);
    const studentIds = resolveStudentIds(row, students, rowErrors, rowNumber);
    errors.push(...rowErrors);
    if (rowErrors.length > 0) return;
    validRows.push({
      id: text(row.id) || undefined,
      name: text(row.name),
      teacherId,
      roomId,
      tuitionPerSession: numberValue(row.tuitionPerSession),
      totalSessions: numberValue(row.totalSessions),
      teacherShare: numberValue(row.teacherShare, 80),
      schedule: { days: listValue(row.scheduleDays), time: text(row.scheduleTime) },
      studentIds,
    });
  });
  return { validRows, errors };
};

export function normalizeCenterImportRows(
  kind: 'STUDENTS',
  rows: WorkbookRow[],
  context?: MappingContext
): ImportResult<StudentImportRow>;
export function normalizeCenterImportRows(
  kind: 'TEACHERS',
  rows: WorkbookRow[],
  context?: MappingContext
): ImportResult<TeacherImportRow>;
export function normalizeCenterImportRows(
  kind: 'ROOMS',
  rows: WorkbookRow[],
  context?: MappingContext
): ImportResult<RoomImportRow>;
export function normalizeCenterImportRows(
  kind: 'CLASSES',
  rows: WorkbookRow[],
  context?: MappingContext
): ImportResult<ClassImportRow>;
export function normalizeCenterImportRows(kind: SpreadsheetKind, rows: WorkbookRow[], context: MappingContext = {}) {
  if (kind === 'STUDENTS') return normalizeStudentRows(rows);
  if (kind === 'TEACHERS') return normalizeTeacherRows(rows);
  if (kind === 'ROOMS') return normalizeRoomRows(rows);
  return normalizeClassRows(rows, context);
}

export const exportCenterWorkbook = (
  kind: SpreadsheetKind,
  rows: Array<Partial<Student> | Partial<Teacher> | Partial<Class> | Partial<Room>>,
  context: MappingContext = {}
) => {
  downloadXlsxWorkbook({
    fileName: getCenterWorkbookFileName(kind),
    sheetName: kind,
    rows: buildCenterExportRows(kind, rows, context),
  });
};

export const readCenterWorkbookRows = readXlsxWorkbook;
