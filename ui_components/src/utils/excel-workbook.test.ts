import { describe, expect, it } from 'vitest';
import { unzipSync, strFromU8 } from 'fflate';
import { readXlsxWorkbook, writeXlsxWorkbook } from './excel-workbook';

const unzipEntries = (bytes: Uint8Array) => {
  const entries = unzipSync(bytes);
  return Object.fromEntries(
    Object.entries(entries).map(([name, value]) => [name, strFromU8(value)])
  );
};

describe('excel workbook', () => {
  it('writes a valid xlsx package with the required workbook parts', () => {
    const bytes = writeXlsxWorkbook({
      sheetName: 'Hoc sinh',
      rows: [{ name: 'Nguyen Van A', birthYear: 2012 }],
    });

    const entries = unzipEntries(bytes);

    expect(entries['[Content_Types].xml']).toContain('worksheet+xml');
    expect(entries['xl/workbook.xml']).toContain('Hoc sinh');
    expect(entries['xl/worksheets/sheet1.xml']).toContain('Nguyen Van A');
  });

  it('reads back exported workbook rows and preserves Vietnamese text', async () => {
    const bytes = writeXlsxWorkbook({
      sheetName: 'Phòng học',
      rows: [{ name: 'Phòng 101', center: 'Vạn Xuân', capacity: 30 }],
    });

    const rows = await readXlsxWorkbook(bytes);

    expect(rows).toEqual([
      { name: 'Phòng 101', center: 'Vạn Xuân', capacity: '30' },
    ]);
  });
});
