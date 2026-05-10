import QRCode from 'qrcode';
import Jimp from 'jimp';

// Strip Vietnamese diacritics — jimp's bitmap fonts are ASCII-only
export const deaccent = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, (c) => c === 'đ' ? 'd' : 'D');

export interface PaymentSlipOpts {
  studentName: string;
  studentCode: string;
  className: string;
  classCode: string;
  attended: number;
  tuitionPerSession: number;
  amount: number;
  memo: string;
  qrData: string;
}

export async function buildPaymentSlipPNG(opts: PaymentSlipOpts): Promise<Buffer> {
  const W = 600, H = 680;
  const canvas = new Jimp(W, H, 0xFFFFFFFF);

  const header = new Jimp(W, 84, 0x0F172AFF);
  canvas.composite(header, 0, 0);

  const accent = new Jimp(W, 4, 0x10B981FF);
  canvas.composite(accent, 0, 84);

  const qrSize = 260;
  const qrBuf = await (QRCode as any).toBuffer(opts.qrData, { width: qrSize, margin: 1, color: { dark: '#000000', light: '#ffffff' } });
  const qrImg = await Jimp.read(qrBuf);
  const qrBox = new Jimp(qrSize + 16, qrSize + 16, 0xF8FAFCFF);
  canvas.composite(qrBox, (W - qrSize - 16) / 2, 253);
  canvas.composite(qrImg, (W - qrSize) / 2, 261);

  const sep = new Jimp(540, 1, 0xE2E8F0FF);
  canvas.composite(sep, 30, 168);
  canvas.composite(sep, 30, 540);

  const [f32w, f16w, f32b, f16b, f14b] = await Promise.all([
    Jimp.loadFont(Jimp.FONT_SANS_32_WHITE),
    Jimp.loadFont(Jimp.FONT_SANS_16_WHITE),
    Jimp.loadFont(Jimp.FONT_SANS_32_BLACK),
    Jimp.loadFont(Jimp.FONT_SANS_16_BLACK),
    Jimp.loadFont(Jimp.FONT_SANS_14_BLACK),
  ]);

  const px = 30;
  canvas.print(f32w, px, 14, 'HICADO');
  canvas.print(f16w, px, 54, 'THONG BAO HOC PHI');
  canvas.print(f16b, px, 100, `HOC SINH : ${deaccent(opts.studentName).toUpperCase()} (${opts.studentCode})`);
  canvas.print(f16b, px, 128, `LOP      : ${deaccent(opts.className).toUpperCase()}${opts.classCode ? ` (${opts.classCode})` : ''}`);
  canvas.print(f16b, px, 153, `DA HOC   : ${opts.attended} BUOI x ${opts.tuitionPerSession.toLocaleString('vi-VN')}d`);
  canvas.print(f14b, px, 180, 'HOAN PHI :');
  canvas.print(f32b, px, 200, `${opts.amount.toLocaleString('vi-VN')}d`);
  canvas.print(f14b, px, 548, 'NOI DUNG CHUYEN KHOAN:');
  canvas.print(f16b, px, 570, deaccent(opts.memo).toUpperCase());
  canvas.print(f14b, px, 610, 'Quet ma QR tren de thanh toan nhanh');
  canvas.print(f14b, px, 650, 'Trung tam Hicado | hicado-elearning.onrender.com');

  return canvas.getBufferAsync(Jimp.MIME_PNG) as Promise<Buffer>;
}

export interface MultiClassPaymentSlipOpts {
  studentName: string;
  studentCode: string;
  billingMonth?: string;
  tuitionFromDate?: string;
  tuitionToDate?: string;
  collectionFromDate?: string;
  collectionToDate?: string;
  bankName?: string;
  bankAccount?: string;
  accountName?: string;
  items: Array<{
    className: string;
    teacherNames?: string[];
    sessions: number;
    pricePerSession: number;
    subtotal: number;
  }>;
  totalAmount: number;
  memo: string;
  qrData: string;
}

const ascii = (value: string) => deaccent(value || '').toUpperCase();
const money = (value: number) => `${Math.round(value || 0).toLocaleString('vi-VN')}D`;
const shortText = (value: string, max = 34) => {
  const text = ascii(value).replace(/\s+/g, ' ').trim();
  return text.length > max ? `${text.slice(0, max - 1)}.` : text;
};

export function buildMultiClassPaymentSlipTextLines(opts: MultiClassPaymentSlipOpts): string[] {
  const lines = [
    `HOC SINH: ${ascii(opts.studentName)} (${opts.studentCode})`,
  ];

  if (opts.tuitionFromDate && opts.tuitionToDate) {
    lines.push(`KY HOC PHI: ${opts.tuitionFromDate} - ${opts.tuitionToDate}`);
  } else if (opts.billingMonth) {
    lines.push(`KY HOC PHI: ${opts.billingMonth}`);
  }

  for (const item of opts.items) {
    const teachers = item.teacherNames?.length ? item.teacherNames.join(', ') : 'Chua phan cong';
    lines.push(
      `${shortText(item.className, 18)} | GV: ${shortText(teachers, 18)} | ${item.sessions} BUOI | ${money(item.pricePerSession)} | ${money(item.subtotal)}`
    );
  }

  lines.push(`TONG CONG: ${money(opts.totalAmount)}`);

  if (opts.collectionFromDate && opts.collectionToDate) {
    lines.push(`THOI GIAN THU: ${opts.collectionFromDate} - ${opts.collectionToDate}`);
  }

  const bankParts = [opts.bankName, opts.bankAccount, opts.accountName].filter(Boolean);
  if (bankParts.length) lines.push(bankParts.map(part => ascii(String(part))).join(' | '));

  lines.push(`NOI DUNG CK: ${ascii(opts.memo)}`);
  return lines;
}

export async function buildMultiClassPaymentSlipPNG(opts: MultiClassPaymentSlipOpts): Promise<Buffer> {
  const W = 600;
  const baseH = 690;
  const itemsH = Math.max(opts.items.length, 1) * 50;
  const H = baseH + itemsH;
  
  const canvas = new Jimp(W, H, 0xFFFFFFFF);

  const header = new Jimp(W, 84, 0x0F172AFF);
  canvas.composite(header, 0, 0);

  const accent = new Jimp(W, 4, 0x10B981FF);
  canvas.composite(accent, 0, 84);

  const [f32w, f16w, f32b, f16b, f14b, f12b] = await Promise.all([
    Jimp.loadFont(Jimp.FONT_SANS_32_WHITE),
    Jimp.loadFont(Jimp.FONT_SANS_16_WHITE),
    Jimp.loadFont(Jimp.FONT_SANS_32_BLACK),
    Jimp.loadFont(Jimp.FONT_SANS_16_BLACK),
    Jimp.loadFont(Jimp.FONT_SANS_14_BLACK),
    Jimp.loadFont(Jimp.FONT_SANS_12_BLACK),
  ]);

  const px = 40;
  canvas.print(f32w, px, 14, 'HICADO');
  canvas.print(f16w, px, 54, 'THONG BAO HOC PHI');

  canvas.print(f16b, px, 110, `HOC SINH : ${deaccent(opts.studentName).toUpperCase()} (${opts.studentCode})`);
  const periodText = opts.tuitionFromDate && opts.tuitionToDate
    ? `KY HOC PHI: ${opts.tuitionFromDate} - ${opts.tuitionToDate}`
    : (opts.billingMonth ? `KY HOC PHI: ${opts.billingMonth}` : '');
  if (periodText) canvas.print(f14b, px, 134, periodText);
  
  // Table Header
  let currY = 170;
  const sep = new Jimp(W - 80, 1, 0xE2E8F0FF);
  canvas.composite(sep, 40, currY);
  currY += 10;
  canvas.print(f12b, px, currY, 'LOP / GIAO VIEN');
  canvas.print(f12b, 300, currY, 'BUOI');
  canvas.print(f12b, 365, currY, 'DON GIA');
  canvas.print(f12b, 490, currY, 'THANH TIEN');
  
  currY += 25;
  canvas.composite(sep, 40, currY);
  currY += 15;

  // Items
  for (const item of opts.items) {
    const teachers = item.teacherNames?.length ? item.teacherNames.join(', ') : 'Chua phan cong';
    canvas.print(f14b, px, currY, shortText(item.className, 24));
    canvas.print(f12b, px, currY + 18, `GV: ${shortText(teachers, 26)}`);
    canvas.print(f14b, 300, currY, String(item.sessions));
    canvas.print(f14b, 365, currY, money(item.pricePerSession));
    canvas.print(f14b, 490, currY, money(item.subtotal));
    currY += 50;
  }

  canvas.composite(sep, 40, currY);
  currY += 15;
  
  // Total
  canvas.print(f16b, px, currY + 10, 'TONG CONG:');
  canvas.print(f32b, 300, currY, money(opts.totalAmount));
  
  currY += 55;
  if (opts.collectionFromDate && opts.collectionToDate) {
    canvas.print(f14b, px, currY, `THOI GIAN THU: ${opts.collectionFromDate} - ${opts.collectionToDate}`);
    currY += 28;
  }

  if (opts.bankName || opts.bankAccount || opts.accountName) {
    canvas.print(f12b, px, currY, `NH: ${shortText(opts.bankName || '', 20)} | STK: ${opts.bankAccount || ''}`);
    currY += 20;
    if (opts.accountName) {
      canvas.print(f12b, px, currY, `TEN TK: ${shortText(opts.accountName, 42)}`);
      currY += 22;
    }
  }
  
  // QR Section
  const qrSize = 280;
  const qrBuf = await (QRCode as any).toBuffer(opts.qrData, { width: qrSize, margin: 1, color: { dark: '#000000', light: '#ffffff' } });
  const qrImg = await Jimp.read(qrBuf);
  const qrBox = new Jimp(qrSize + 16, qrSize + 16, 0xF8FAFCFF);
  canvas.composite(qrBox, (W - qrSize - 16) / 2, currY);
  canvas.composite(qrImg, (W - qrSize) / 2, currY + 8);
  
  currY += qrSize + 30;
  
  canvas.print(f12b, px, currY, 'NOI DUNG CHUYEN KHOAN:');
  canvas.print(f16b, px, currY + 20, ascii(opts.memo));
  
  currY += 60;
  canvas.print(f12b, px, currY, 'Trung tam Hicado | hicado-elearning.onrender.com');

  return canvas.getBufferAsync(Jimp.MIME_PNG) as Promise<Buffer>;
}
