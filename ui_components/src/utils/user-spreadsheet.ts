import type { Student, Teacher } from '@/store';

export type ProfileSpreadsheetKind = 'STUDENTS' | 'TEACHERS';

type SpreadsheetRow = Record<string, unknown>;

export interface ImportResult<T> {
  validRows: T[];
  errors: string[];
}

export type StudentImportRow = Pick<
  Student,
  | 'name'
  | 'birthYear'
  | 'address'
  | 'schoolName'
  | 'schoolClass'
  | 'cccd'
  | 'tuitionStatus'
  | 'parentPhone'
  | 'studentPhone'
>;

export type TeacherImportRow = Pick<
  Teacher,
  | 'name'
  | 'phone'
  | 'specialization'
  | 'bankAccount'
  | 'bankName'
  | 'salaryRate'
  | 'workplace'
  | 'cccd'
  | 'notes'
>;

const studentTemplate: StudentImportRow = {
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

const teacherTemplate: TeacherImportRow = {
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

const fileDate = () => new Date().toISOString().slice(0, 10);

const escapeHtml = (value: unknown) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const downloadTextFile = (content: string, fileName: string, type: string) => {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

const rowsToExcelHtml = (rows: SpreadsheetRow[]) => {
  const headers = Object.keys(rows[0] || {});
  const head = headers.map((header) => `<th>${escapeHtml(header)}</th>`).join('');
  const body = rows
    .map((row) => `<tr>${headers.map((header) => `<td>${escapeHtml(row[header])}</td>`).join('')}</tr>`)
    .join('');

  return `<!doctype html><html><head><meta charset="utf-8" /></head><body><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></body></html>`;
};

const parseCsvLine = (line: string) => {
  const values: string[] = [];
  let current = '';
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];
    if (char === '"' && quoted && next === '"') {
      current += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === ',' && !quoted) {
      values.push(current);
      current = '';
    } else {
      current += char;
    }
  }

  values.push(current);
  return values.map((value) => value.trim());
};

const parseCsvRows = (content: string): SpreadsheetRow[] => {
  const lines = content.replace(/^\uFEFF/, '').split(/\r?\n/).filter((line) => line.trim() !== '');
  const headers = parseCsvLine(lines[0] || '');
  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    return headers.reduce<SpreadsheetRow>((row, header, index) => {
      row[header] = values[index] ?? '';
      return row;
    }, {});
  });
};

const parseHtmlTableRows = (content: string): SpreadsheetRow[] => {
  const parser = new DOMParser();
  const doc = parser.parseFromString(content, 'text/html');
  const tableRows = Array.from(doc.querySelectorAll('table tr'));
  const headers = Array.from(tableRows[0]?.querySelectorAll('th,td') || []).map((cell) => cell.textContent?.trim() || '');

  return tableRows.slice(1).map((tableRow) => {
    const cells = Array.from(tableRow.querySelectorAll('td,th'));
    return headers.reduce<SpreadsheetRow>((row, header, index) => {
      row[header] = cells[index]?.textContent?.trim() || '';
      return row;
    }, {});
  });
};

export const getProfileTemplateRows = (kind: ProfileSpreadsheetKind) =>
  kind === 'STUDENTS' ? [studentTemplate] : [teacherTemplate];

const textValue = (value: unknown) => String(value ?? '').trim();

const numberValue = (value: unknown, fallback: number) => {
  const parsed = Number(String(value ?? '').trim().replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : fallback;
};

const normalizeSalaryRate = (value: unknown) => {
  const parsed = numberValue(value, teacherTemplate.salaryRate);
  return parsed > 1 ? parsed / 100 : parsed;
};

const isBlankRow = (row: SpreadsheetRow) =>
  Object.values(row).every((value) => textValue(value) === '');

const missingFields = (row: SpreadsheetRow, fields: string[]) =>
  fields.filter((field) => textValue(row[field]) === '');

const normalizeStudentRow = (row: SpreadsheetRow): StudentImportRow => ({
  name: textValue(row.name),
  birthYear: numberValue(row.birthYear, new Date().getFullYear()),
  address: textValue(row.address),
  schoolName: textValue(row.schoolName),
  schoolClass: textValue(row.schoolClass),
  parentPhone: textValue(row.parentPhone),
  studentPhone: textValue(row.studentPhone),
  cccd: textValue(row.cccd),
  tuitionStatus: ['PAID', 'PENDING', 'DEBT'].includes(textValue(row.tuitionStatus))
    ? (textValue(row.tuitionStatus) as StudentImportRow['tuitionStatus'])
    : 'PENDING',
});

const normalizeTeacherRow = (row: SpreadsheetRow): TeacherImportRow => ({
  name: textValue(row.name),
  phone: textValue(row.phone),
  specialization: textValue(row.specialization),
  bankAccount: textValue(row.bankAccount),
  bankName: textValue(row.bankName),
  salaryRate: normalizeSalaryRate(row.salaryRate),
  workplace: textValue(row.workplace),
  cccd: textValue(row.cccd),
  notes: textValue(row.notes),
});

export function buildProfileExportRows(
  kind: 'STUDENTS',
  rows: Partial<Student>[]
): StudentImportRow[];
export function buildProfileExportRows(
  kind: 'TEACHERS',
  rows: Partial<Teacher>[]
): TeacherImportRow[];
export function buildProfileExportRows(
  kind: ProfileSpreadsheetKind,
  rows: Array<Partial<Student> | Partial<Teacher>>
) {
  if (rows.length === 0) return getProfileTemplateRows(kind);

  if (kind === 'STUDENTS') {
    return (rows as Partial<Student>[]).map((row) => normalizeStudentRow(row as SpreadsheetRow));
  }

  return (rows as Partial<Teacher>[]).map((row) => normalizeTeacherRow(row as SpreadsheetRow));
}

export function normalizeProfileImportRows(
  kind: 'STUDENTS',
  rows: SpreadsheetRow[]
): ImportResult<StudentImportRow>;
export function normalizeProfileImportRows(
  kind: 'TEACHERS',
  rows: SpreadsheetRow[]
): ImportResult<TeacherImportRow>;
export function normalizeProfileImportRows(
  kind: ProfileSpreadsheetKind,
  rows: SpreadsheetRow[]
): ImportResult<StudentImportRow | TeacherImportRow>;
export function normalizeProfileImportRows(
  kind: ProfileSpreadsheetKind,
  rows: SpreadsheetRow[]
) {
  const validRows: Array<StudentImportRow | TeacherImportRow> = [];
  const errors: string[] = [];
  const requiredFields =
    kind === 'STUDENTS'
      ? ['name', 'birthYear']
      : ['name', 'phone', 'specialization', 'bankAccount', 'bankName'];

  rows.forEach((row, index) => {
    if (isBlankRow(row)) return;

    const missing = missingFields(row, requiredFields);
    if (missing.length > 0) {
      errors.push(`Dong ${index + 2}: thieu ${missing.join(', ')}`);
      return;
    }

    validRows.push(kind === 'STUDENTS' ? normalizeStudentRow(row) : normalizeTeacherRow(row));
  });

  return { validRows, errors };
}

export const exportProfileWorkbook = (
  kind: ProfileSpreadsheetKind,
  rows: Array<Partial<Student> | Partial<Teacher>>
) => {
  const exportRows =
    kind === 'STUDENTS'
      ? buildProfileExportRows(kind, rows as Partial<Student>[])
      : buildProfileExportRows(kind, rows as Partial<Teacher>[]);
  const fileName =
    kind === 'STUDENTS'
      ? `Danh_Sach_Hoc_Sinh_${fileDate()}.xls`
      : `Danh_Sach_Giao_Vien_${fileDate()}.xls`;

  const content = rowsToExcelHtml(exportRows as SpreadsheetRow[]);
  downloadTextFile(content, fileName, 'application/vnd.ms-excel;charset=utf-8');
};

export const readSpreadsheetRows = async (file: File): Promise<SpreadsheetRow[]> => {
  const content = await file.text();
  if (content.toLowerCase().includes('<table')) {
    return parseHtmlTableRows(content);
  }
  return parseCsvRows(content);
};
