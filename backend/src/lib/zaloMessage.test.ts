import assert from 'assert';
import { buildMultiClassTuitionMessage, buildZaloImageMessage } from './zaloMessage';

const message = buildZaloImageMessage('attachment-123', 'Hicado payment slip');

assert.deepStrictEqual(message, {
  text: 'Hicado payment slip',
  attachment: {
    type: 'template',
    payload: {
      template_type: 'media',
      elements: [
        {
          media_type: 'image',
          attachment_id: 'attachment-123',
        },
      ],
    },
  },
});

const tuitionMessage = buildMultiClassTuitionMessage(
  'Lê Quốc Tiến',
  [
    { className: 'Toán 5', teacherNames: ['Cô Lan'], sessions: 4, pricePerSession: 200000, subtotal: 800000 },
    { className: 'Văn 5', teacherNames: ['Thầy Minh'], sessions: 3, pricePerSession: 150000, subtotal: 450000 },
  ],
  1250000,
  '30/04/2026',
  '30/05/2026',
  '10/05/2026',
  '17/05/2026'
);

assert(tuitionMessage.includes('💌 **Kính gửi phụ huynh em Lê Quốc Tiến**'));
assert(tuitionMessage.includes('📘 **Toán 5 - Cô Lan**'));
assert(tuitionMessage.includes('* 👨‍🏫 Giáo viên: Cô Lan'));
assert(tuitionMessage.includes('* 🗓️ Số buổi học: 4'));
assert(tuitionMessage.includes('* 💵 Học phí: 200.000đ/buổi'));
assert(tuitionMessage.includes('* 🏷️ Thành tiền: 800.000đ'));
assert(tuitionMessage.includes('📙 **Văn 5 - Thầy Minh**'));
assert(tuitionMessage.includes('💰 **Tổng cộng: 1.250.000đ**'));
assert(tuitionMessage.includes('⏳ Thời gian thu: từ ngày 10/05/2026 đến ngày 17/05/2026'));

console.log('zaloMessage tests passed');
