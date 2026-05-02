import { describe, expect, it } from 'vitest';
import {
  buildProfileExportRows,
  getProfileTemplateRows,
  normalizeProfileImportRows,
} from './user-spreadsheet';

describe('user spreadsheet helpers', () => {
  it('builds a student template row when there are no students', () => {
    const rows = buildProfileExportRows('STUDENTS', []);

    expect(rows).toEqual([
      {
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
      },
    ]);
  });

  it('normalizes student rows and applies default tuition status', () => {
    const result = normalizeProfileImportRows('STUDENTS', [
      {
        name: ' Tran Thi B ',
        birthYear: '2011',
        address: 'HCM',
        schoolName: 'THCS Nguyen Trai',
        schoolClass: '8A',
        parentPhone: '0900000000',
      },
    ]);

    expect(result.validRows).toEqual([
      {
        id: undefined,
        name: 'Tran Thi B',
        birthYear: 2011,
        address: 'HCM',
        schoolName: 'THCS Nguyen Trai',
        schoolClass: '8A',
        parentPhone: '0900000000',
        studentPhone: '',
        cccd: '',
        tuitionStatus: 'PENDING',
      },
    ]);
    expect(result.errors).toEqual([]);
  });

  it('normalizes teacher rows with salary percentage converted to ratio', () => {
    const result = normalizeProfileImportRows('TEACHERS', [
      {
        name: ' Le Van C ',
        phone: '0987654321',
        specialization: 'Math',
        bankAccount: '123456789',
        bankName: 'VCB',
        salaryRate: '80',
      },
    ]);

    expect(result.validRows).toEqual([
      {
        id: undefined,
        name: 'Le Van C',
        phone: '0987654321',
        specialization: 'Math',
        bankAccount: '123456789',
        bankName: 'VCB',
        salaryRate: 0.8,
        workplace: '',
        cccd: '',
        notes: '',
      },
    ]);
    expect(result.errors).toEqual([]);
  });

  it('reports row numbers for missing required fields', () => {
    const result = normalizeProfileImportRows('TEACHERS', [
      getProfileTemplateRows('TEACHERS')[0],
      { name: 'Missing Phone', specialization: 'English' },
    ]);

    expect(result.validRows).toHaveLength(1);
    expect(result.errors).toEqual([
      'Dong 3: thieu phone',
      'Dong 3: thieu bankAccount',
      'Dong 3: thieu bankName',
    ]);
  });
});
