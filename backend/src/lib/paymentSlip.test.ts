import assert from 'assert';
import { buildMultiClassPaymentSlipTextLines } from './paymentSlip';

const lines = buildMultiClassPaymentSlipTextLines({
  studentName: 'Lê Quốc Tiến',
  studentCode: 'HS001',
  tuitionFromDate: '30/04/2026',
  tuitionToDate: '30/05/2026',
  collectionFromDate: '10/05/2026',
  collectionToDate: '17/05/2026',
  bankName: 'Vietcombank',
  bankAccount: '123456789',
  accountName: 'HICADO CENTER',
  items: [
    { className: 'Toán 5', teacherNames: ['Cô Lan'], sessions: 4, pricePerSession: 200000, subtotal: 800000 },
    { className: 'Văn 5', teacherNames: ['Thầy Minh'], sessions: 3, pricePerSession: 150000, subtotal: 450000 },
  ],
  totalAmount: 1250000,
  memo: 'HS001 BILL001',
  qrData: 'qr',
});

assert(lines.some(line => line.includes('KY HOC PHI: 30/04/2026 - 30/05/2026')));
assert(lines.some(line => line.includes('THOI GIAN THU: 10/05/2026 - 17/05/2026')));
assert(lines.some(line => line.includes('TOAN 5 | GV: CO LAN | 4 BUOI | 200.000D | 800.000D')));
assert(lines.some(line => line.includes('VAN 5 | GV: THAY MINH | 3 BUOI | 150.000D | 450.000D')));
assert(lines.some(line => line.includes('TONG CONG: 1.250.000D')));
assert(lines.some(line => line.includes('VIETCOMBANK | 123456789 | HICADO CENTER')));

console.log('paymentSlip tests passed');
