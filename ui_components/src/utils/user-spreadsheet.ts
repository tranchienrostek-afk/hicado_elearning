import type { Student, Teacher } from '@/store';
import {
  buildCenterExportRows,
  exportCenterWorkbook,
  normalizeCenterImportRows,
  readCenterWorkbookRows,
  type SpreadsheetKind,
} from './center-spreadsheet';

export type ProfileSpreadsheetKind = Extract<SpreadsheetKind, 'STUDENTS' | 'TEACHERS'>;

export const getProfileTemplateRows = (kind: ProfileSpreadsheetKind) =>
  buildCenterExportRows(kind, []);

export function buildProfileExportRows(kind: 'STUDENTS', rows: Partial<Student>[]): ReturnType<typeof buildCenterExportRows>;
export function buildProfileExportRows(kind: 'TEACHERS', rows: Partial<Teacher>[]): ReturnType<typeof buildCenterExportRows>;
export function buildProfileExportRows(
  kind: ProfileSpreadsheetKind,
  rows: Array<Partial<Student> | Partial<Teacher>>
) {
  return buildCenterExportRows(kind, rows);
}

export function normalizeProfileImportRows(kind: ProfileSpreadsheetKind, rows: Record<string, unknown>[]) {
  return kind === 'STUDENTS'
    ? normalizeCenterImportRows('STUDENTS', rows as never)
    : normalizeCenterImportRows('TEACHERS', rows as never);
}

export const exportProfileWorkbook = (
  kind: ProfileSpreadsheetKind,
  rows: Array<Partial<Student> | Partial<Teacher>>
) => exportCenterWorkbook(kind, rows);

export const readSpreadsheetRows = readCenterWorkbookRows;
