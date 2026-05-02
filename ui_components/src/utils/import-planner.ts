import type { Class, Room, Student, Teacher } from '@/store';
import type { ClassImportRow, RoomImportRow, SpreadsheetKind, StudentImportRow, TeacherImportRow } from './center-spreadsheet';

export type ImportMode = 'ADD_ONLY' | 'UPDATE_BY_ID';
export type ImportAction = 'CREATE' | 'UPDATE' | 'SKIP' | 'WARNING' | 'BLOCKED' | 'FAILED';

export interface ImportMessage {
  field?: string;
  message: string;
  currentValue?: string;
  importedValue?: string;
  suggestion?: string;
}

export interface ImportPlanRow<T> {
  rowNumber: number;
  action: ImportAction;
  record: T;
  existingRecord?: unknown;
  messages: ImportMessage[];
  canCommit: boolean;
}

export interface ImportPlan<T> {
  rows: ImportPlanRow<T>[];
  creates: ImportPlanRow<T>[];
  updates: ImportPlanRow<T>[];
  skips: ImportPlanRow<T>[];
  warnings: ImportPlanRow<T>[];
  blocked: ImportPlanRow<T>[];
  failed: ImportPlanRow<T>[];
  commitRows: ImportPlanRow<T>[];
}

interface PlanContext {
  students?: Student[];
  teachers?: Teacher[];
  rooms?: Room[];
  classes?: Class[];
}

type ImportRecord = StudentImportRow | TeacherImportRow | RoomImportRow | ClassImportRow;

const text = (value: unknown) => String(value ?? '').trim();
const makePlan = <T>(rows: ImportPlanRow<T>[]): ImportPlan<T> => ({
  rows,
  creates: rows.filter((row) => row.action === 'CREATE'),
  updates: rows.filter((row) => row.action === 'UPDATE'),
  skips: rows.filter((row) => row.action === 'SKIP'),
  warnings: rows.filter((row) => row.action === 'WARNING'),
  blocked: rows.filter((row) => row.action === 'BLOCKED'),
  failed: rows.filter((row) => row.action === 'FAILED'),
  commitRows: rows.filter((row) => row.canCommit),
});

const duplicateIds = <T extends { id?: string }>(records: T[]) => {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  records.forEach((record) => {
    const id = text(record.id);
    if (!id) return;
    if (seen.has(id)) duplicates.add(id);
    seen.add(id);
  });
  return duplicates;
};

const isSameRecord = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

const planById = <T extends { id?: string }>(
  records: T[],
  existing: Array<T & { id: string }>,
  mode: ImportMode,
  duplicateIdSet: Set<string>
) =>
  records.map<ImportPlanRow<T>>((record, index) => {
    const rowNumber = index + 2;
    const id = text(record.id);
    if (id && duplicateIdSet.has(id)) {
      return {
        rowNumber,
        action: 'BLOCKED',
        record,
        messages: [{ field: 'id', message: 'trung id trong file' }],
        canCommit: false,
      };
    }

    const current = id ? existing.find((item) => item.id === id) : undefined;
    if (!current) {
      return { rowNumber, action: 'CREATE', record, messages: [], canCommit: true };
    }

    if (mode === 'UPDATE_BY_ID') {
      return { rowNumber, action: 'UPDATE', record, existingRecord: current, messages: [], canCommit: true };
    }

    if (isSameRecord({ ...current, id: current.id }, { ...record, id })) {
      return { rowNumber, action: 'SKIP', record, existingRecord: current, messages: [], canCommit: false };
    }

    return {
      rowNumber,
      action: 'BLOCKED',
      record,
      existingRecord: current,
      messages: [{ field: 'id', message: 'id da ton tai, chon che do cap nhat de ghi de' }],
      canCommit: false,
    };
  });

const maxClassSizeForRoom = (roomId: string, classes: Class[]) =>
  classes
    .filter((cls) => cls.roomId === roomId)
    .reduce((max, cls) => Math.max(max, cls.studentIds?.length || 0), 0);

const planRooms = (records: RoomImportRow[], context: PlanContext, mode: ImportMode) => {
  const rows = planById(records, (context.rooms || []) as Array<RoomImportRow & { id: string }>, mode, duplicateIds(records));
  rows.forEach((row) => {
    if (row.action === 'BLOCKED') return;
    const room = row.record;
    const roomId = text(room.id);
    if (!roomId) {
      if (room.capacity <= 0) {
        row.action = 'BLOCKED';
        row.canCommit = false;
        row.messages.push({ field: 'capacity', message: 'capacity phai lon hon 0' });
      }
      return;
    }
    const maxSize = maxClassSizeForRoom(roomId, context.classes || []);
    if (room.capacity < maxSize) {
      row.action = 'BLOCKED';
      row.canCommit = false;
      row.messages.push({
        field: 'capacity',
        message: 'suc chua nho hon si so lop hien tai',
        currentValue: String(maxSize),
        importedValue: String(room.capacity),
      });
    }
  });
  return rows;
};

const classOverlaps = (record: ClassImportRow, existing: Class[]) => {
  const days = record.schedule?.days || [];
  const time = record.schedule?.time || '';
  return existing.some((cls) => {
    if (record.id && cls.id === record.id) return false;
    if (cls.roomId !== record.roomId) return false;
    if (cls.schedule?.time !== time) return false;
    return cls.schedule?.days?.some((day) => days.includes(day));
  });
};

const planClasses = (records: ClassImportRow[], context: PlanContext, mode: ImportMode) => {
  const teachers = context.teachers || [];
  const rooms = context.rooms || [];
  const students = context.students || [];
  const rows = planById(records, (context.classes || []) as Array<ClassImportRow & { id: string }>, mode, duplicateIds(records));

  rows.forEach((row) => {
    if (row.action === 'BLOCKED') return;
    const record = row.record;
    const messages: ImportMessage[] = [];
    if (!teachers.some((teacher) => teacher.id === record.teacherId)) {
      messages.push({ field: 'teacherId', message: 'khong tim thay giao vien' });
    }
    const room = rooms.find((item) => item.id === record.roomId);
    if (!room) {
      messages.push({ field: 'roomId', message: 'khong tim thay phong' });
    }
    const missingStudent = (record.studentIds || []).find((id) => !students.some((student) => student.id === id));
    if (missingStudent) {
      messages.push({ field: 'studentIds', message: `khong tim thay hoc sinh ${missingStudent}` });
    }
    if (room && (record.studentIds || []).length > room.capacity) {
      messages.push({ field: 'studentIds', message: 'si so vuot qua suc chua phong' });
    }
    if (classOverlaps(record, context.classes || [])) {
      messages.push({ field: 'schedule', message: 'trung lich phong' });
    }

    if (messages.length > 0) {
      row.action = 'BLOCKED';
      row.canCommit = false;
      row.messages.push(...messages);
    }
  });

  return rows;
};

export function planImport(
  kind: 'STUDENTS',
  records: StudentImportRow[],
  context: PlanContext,
  mode: ImportMode
): ImportPlan<StudentImportRow>;
export function planImport(
  kind: 'TEACHERS',
  records: TeacherImportRow[],
  context: PlanContext,
  mode: ImportMode
): ImportPlan<TeacherImportRow>;
export function planImport(
  kind: 'ROOMS',
  records: RoomImportRow[],
  context: PlanContext,
  mode: ImportMode
): ImportPlan<RoomImportRow>;
export function planImport(
  kind: 'CLASSES',
  records: ClassImportRow[],
  context: PlanContext,
  mode: ImportMode
): ImportPlan<ClassImportRow>;
export function planImport(kind: SpreadsheetKind, records: ImportRecord[], context: PlanContext = {}, mode: ImportMode = 'ADD_ONLY') {
  if (kind === 'STUDENTS') {
    return makePlan(planById(records as StudentImportRow[], (context.students || []) as Array<StudentImportRow & { id: string }>, mode, duplicateIds(records)));
  }
  if (kind === 'TEACHERS') {
    return makePlan(planById(records as TeacherImportRow[], (context.teachers || []) as Array<TeacherImportRow & { id: string }>, mode, duplicateIds(records)));
  }
  if (kind === 'ROOMS') {
    return makePlan(planRooms(records as RoomImportRow[], context, mode));
  }
  return makePlan(planClasses(records as ClassImportRow[], context, mode));
}

export const getImportPlanSummary = (plan: ImportPlan<unknown>) => ({
  creates: plan.creates.length,
  updates: plan.updates.length,
  skips: plan.skips.length,
  warnings: plan.warnings.length,
  blocked: plan.blocked.length,
  failed: plan.failed.length,
  committable: plan.commitRows.length,
});

export const buildImportErrorRows = <T>(entity: SpreadsheetKind, plan: ImportPlan<T>) =>
  plan.rows
    .filter((row) => row.messages.length > 0 || row.action === 'BLOCKED' || row.action === 'FAILED')
    .flatMap((row) =>
      (row.messages.length > 0 ? row.messages : [{ message: row.action }]).map((message) => ({
        rowNumber: row.rowNumber,
        entity,
        action: row.action,
        status: row.canCommit ? 'CAN_COMMIT' : 'BLOCKED',
        field: message.field || '',
        currentValue: message.currentValue || '',
        importedValue: message.importedValue || '',
        message: message.message,
        suggestion: message.suggestion || '',
      }))
    );
