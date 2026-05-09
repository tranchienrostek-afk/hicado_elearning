import FormData from 'form-data';
import { zaloApiClient, ZALO_OA_API } from './zaloAuth';

// Upload PNG buffer to Zalo and return attachment_id
export async function uploadZaloImage(buffer: Buffer, accessToken: string): Promise<string> {
  const form = new FormData();
  form.append('file', buffer, { filename: 'payment.png', contentType: 'image/png' });
  const res = await zaloApiClient.post<any>(`${ZALO_OA_API}/v2.0/oa/upload/image`, form, {
    headers: { ...form.getHeaders(), access_token: accessToken },
  });
  if (res.data?.error !== 0) throw new Error(res.data?.message ?? 'Upload failed');
  return res.data.data.attachment_id as string;
}

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

export function buildMultiClassTuitionMessage(studentName: string, items: any[], total: number, note?: string): string {
  const itemLines = items.map(it => `  • ${it.className}: ${it.sessions} buổi x ${(it.pricePerSession/1000)}k = ${it.subtotal.toLocaleString('vi-VN')}đ`);
  return [
    `Kính gửi phụ huynh em ${studentName}!`,
    ``,
    `Trung tâm Hicado xin thông báo học phí${note ? ` (${note})` : ''}:`,
    ``,
    ...itemLines,
    `  ─────────────────────────────`,
    `  💰 Tổng cộng   : ${total.toLocaleString('vi-VN')}đ`,
    ``,
    `Quý phụ huynh vui lòng thanh toán đúng hạn (Chi tiết trong ảnh).`,
    `Trân trọng - Hicado Center 🌱`,
  ].join('\n');
}
