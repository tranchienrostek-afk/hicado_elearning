import assert from 'assert';
import { findStudentByPaymentContent, normalizeSepayWebhookPayload } from './sepayMatch';

const students = [
  { id: 'S1777711126499', name: 'Le Quoc Tien', studentCode: null },
  { id: 'student-2', name: 'Nguyen Van A', studentCode: 'HS001' },
];

assert.deepStrictEqual(
  findStudentByPaymentContent(students, 'S1777711126499 TOAN LE QUOC TIEN GD 6123TPBVI2Q4LTPR'),
  students[0]
);

assert.deepStrictEqual(
  findStudentByPaymentContent(students, 'HS001 TOAN NGUYEN VAN A'),
  students[1]
);

assert.deepStrictEqual(
  normalizeSepayWebhookPayload({
    id: '55194546',
    bank_brand_name: 'ACB',
    transaction_date: '2026-05-03 09:19:02',
    transaction_content: 'S1777711126499 TOAN LE QUOC TIEN',
    amount_in: '5000.00',
    reference_number: '2503',
    code: null,
  }),
  {
    id: 55194546,
    gateway: 'ACB',
    transactionDate: '2026-05-03 09:19:02',
    content: 'S1777711126499 TOAN LE QUOC TIEN',
    transferType: 'in',
    transferAmount: 5000,
    referenceCode: '2503',
    sepayCode: null,
  }
);

console.log('sepayMatch tests passed');
