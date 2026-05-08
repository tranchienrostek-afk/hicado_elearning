export type ZaloCsMessage = {
  text?: string;
  attachment?: {
    type: 'template';
    payload: {
      template_type: 'media';
      elements: Array<{
        media_type: 'image';
        attachment_id: string;
      }>;
    };
  };
};

export function buildZaloImageMessage(attachmentId: string, text?: string): ZaloCsMessage {
  const message: ZaloCsMessage = {
    attachment: {
      type: 'template',
      payload: {
        template_type: 'media',
        elements: [
          {
            media_type: 'image',
            attachment_id: attachmentId,
          },
        ],
      },
    },
  };

  if (text?.trim()) message.text = text.trim();

  return message;
}

export interface CustomTuitionPayload {
  sessions:        number;
  pricePerSession: number;
  total:           number;
  note?:           string;
}

export function buildCustomTuitionMessage(studentName: string, p: CustomTuitionPayload): string {
  return [
    `Kính gửi phụ huynh em ${studentName}!`,
    ``,
    `Trung tâm Hicado xin thông báo học phí${p.note ? ` (${p.note})` : ''}:`,
    ``,
    `  📚 Số buổi học : ${p.sessions} buổi`,
    `  💵 Đơn giá/buổi: ${p.pricePerSession.toLocaleString('vi-VN')}đ`,
    `  ─────────────────────────────`,
    `  💰 Tổng cộng   : ${p.total.toLocaleString('vi-VN')}đ`,
    ``,
    `Quý phụ huynh vui lòng thanh toán đúng hạn.`,
    `Trân trọng - Hicado Center 🌱`,
  ].join('\n');
}
