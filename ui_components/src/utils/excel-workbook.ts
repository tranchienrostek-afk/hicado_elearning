import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';

export type WorkbookRow = Record<string, string | number | boolean | null | undefined>;

interface WriteWorkbookInput {
  sheetName: string;
  rows: WorkbookRow[];
}

const xmlEscape = (value: unknown) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

const xmlUnescape = (value: string) =>
  value
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&gt;/g, '>')
    .replace(/&lt;/g, '<')
    .replace(/&amp;/g, '&');

const columnName = (index: number) => {
  let dividend = index + 1;
  let name = '';
  while (dividend > 0) {
    const modulo = (dividend - 1) % 26;
    name = String.fromCharCode(65 + modulo) + name;
    dividend = Math.floor((dividend - modulo) / 26);
  }
  return name;
};

const getHeaders = (rows: WorkbookRow[]) => {
  const seen = new Set<string>();
  rows.forEach((row) => Object.keys(row).forEach((key) => seen.add(key)));
  return Array.from(seen);
};

const buildSheetXml = (rows: WorkbookRow[]) => {
  const headers = getHeaders(rows);
  const allRows = [Object.fromEntries(headers.map((header) => [header, header])), ...rows];
  const xmlRows = allRows
    .map((row, rowIndex) => {
      const cells = headers
        .map((header, columnIndex) => {
          const ref = `${columnName(columnIndex)}${rowIndex + 1}`;
          return `<c r="${ref}" t="inlineStr"><is><t>${xmlEscape(row[header])}</t></is></c>`;
        })
        .join('');
      return `<row r="${rowIndex + 1}">${cells}</row>`;
    })
    .join('');

  const dimension = headers.length > 0 ? `A1:${columnName(headers.length - 1)}${allRows.length}` : 'A1';
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <dimension ref="${dimension}"/>
  <sheetData>${xmlRows}</sheetData>
</worksheet>`;
};

const workbookXml = (sheetName: string) => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="${xmlEscape(sheetName.slice(0, 31) || 'Sheet1')}" sheetId="1" r:id="rId1"/>
  </sheets>
</workbook>`;

const workbookRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
</Relationships>`;

const rootRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;

const contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
</Types>`;

export const writeXlsxWorkbook = ({ sheetName, rows }: WriteWorkbookInput): Uint8Array => {
  const entries: Record<string, Uint8Array> = {
    '[Content_Types].xml': strToU8(contentTypesXml),
    '_rels/.rels': strToU8(rootRelsXml),
    'xl/workbook.xml': strToU8(workbookXml(sheetName)),
    'xl/_rels/workbook.xml.rels': strToU8(workbookRelsXml),
    'xl/worksheets/sheet1.xml': strToU8(buildSheetXml(rows)),
  };
  return zipSync(entries, { level: 6 });
};

const getWorkbookBytes = async (input: Uint8Array | ArrayBuffer | File): Promise<Uint8Array> => {
  if (input instanceof Uint8Array) return input;
  if (input instanceof ArrayBuffer) return new Uint8Array(input);
  return new Uint8Array(await input.arrayBuffer());
};

const parseCellValues = (sheetXml: string) => {
  const cellPattern = /<c\b[^>]*?r="([A-Z]+)(\d+)"[^>]*?>([\s\S]*?)<\/c>/g;
  const values = new Map<number, Map<string, string>>();
  let match: RegExpExecArray | null;
  while ((match = cellPattern.exec(sheetXml))) {
    const [, col, rowString, body] = match;
    const textMatch = body.match(/<t[^>]*>([\s\S]*?)<\/t>/);
    const valueMatch = body.match(/<v[^>]*>([\s\S]*?)<\/v>/);
    const raw = textMatch?.[1] ?? valueMatch?.[1] ?? '';
    const rowIndex = Number(rowString);
    if (!values.has(rowIndex)) values.set(rowIndex, new Map());
    values.get(rowIndex)!.set(col, xmlUnescape(raw));
  }
  return values;
};

export const readXlsxWorkbook = async (input: Uint8Array | ArrayBuffer | File): Promise<Record<string, string>[]> => {
  const bytes = await getWorkbookBytes(input);
  const entries = unzipSync(bytes);
  const sheet = entries['xl/worksheets/sheet1.xml'];
  if (!sheet) return [];

  const values = parseCellValues(strFromU8(sheet));
  const headerRow = values.get(1);
  if (!headerRow) return [];

  const headers = Array.from(headerRow.entries()).map(([column, header]) => ({ column, header }));
  const rowNumbers = Array.from(values.keys()).filter((row) => row > 1).sort((a, b) => a - b);

  return rowNumbers.map((rowNumber) => {
    const rowValues = values.get(rowNumber) || new Map<string, string>();
    return headers.reduce<Record<string, string>>((row, { column, header }) => {
      row[header] = rowValues.get(column) || '';
      return row;
    }, {});
  });
};

export const downloadXlsxWorkbook = (input: WriteWorkbookInput & { fileName: string }) => {
  const bytes = writeXlsxWorkbook(input);
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = input.fileName;
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};
