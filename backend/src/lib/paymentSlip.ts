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
