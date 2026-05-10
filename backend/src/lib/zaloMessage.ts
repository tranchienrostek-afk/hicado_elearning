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
  className:       string;
  sessions:        number;
  pricePerSession: number;
  total:           number;
  note?:           string;
  fromDate?:       string;  // Tuition from
  toDate?:         string;    // Tuition to
  collectionFrom?: string;  // Collection from
  collectionTo?:   string;    // Collection to
}

export function buildCustomTuitionMessage(studentName: string, p: CustomTuitionPayload): string {
  const dateRange = p.fromDate && p.toDate ? ` từ ${p.fromDate} đến ${p.toDate}` : '';
  const itemLine = p.sessions > 0
    ? `${p.className} | Số buổi học: ${p.sessions} | Học phí: ${p.pricePerSession.toLocaleString('vi-VN')}đ/buổi | Thành tiền: ${p.total.toLocaleString('vi-VN')}đ`
    : `(Không có buổi học trong kỳ)`;

  return [
    `Kính gửi phụ huynh em ${studentName}`,
    `Trung tâm Hicado xin thông báo học phí${dateRange}`,
    ``,
    itemLine,
    ``,
    `Tổng cộng: ${p.total.toLocaleString('vi-VN')}đ`,
    `PH có thể thanh toán qua chuyển khoản hoặc đóng tiền mặt tại Trung tâm.`,
    p.collectionFrom && p.collectionTo ? `Thời gian thu: từ ngày ${p.collectionFrom} đến ngày ${p.collectionTo}` : null,
    `Phụ huynh vui lòng thanh toán đúng hạn`,
    `Trân trọng - Hicado Center`,
  ].filter(Boolean).join('\n');
}

export function buildMultiClassTuitionMessage(
  studentName: string, items: any[], total: number,
  fromDate?: string, toDate?: string,
  collectionFrom?: string, collectionTo?: string
): string {
  const dateRange = fromDate && toDate ? ` từ ${fromDate} đến ${toDate}` : '';
  const itemLines = items.length > 0
    ? items.map(it => `${it.className} | Số buổi học: ${it.sessions} | Học phí: ${it.pricePerSession.toLocaleString('vi-VN')}đ/buổi | Thành tiền: ${it.subtotal.toLocaleString('vi-VN')}đ`)
    : ["(Không có buổi học trong kỳ)"];

  return [
    `Kính gửi phụ huynh em ${studentName}`,
    `Trung tâm Hicado xin thông báo học phí${dateRange}`,
    ``,
    ...itemLines,
    ``,
    `Tổng cộng: ${total.toLocaleString('vi-VN')}đ`,
    `PH có thể thanh toán qua chuyển khoản hoặc đóng tiền mặt tại Trung tâm.`,
    collectionFrom && collectionTo ? `Thời gian thu: từ ngày ${collectionFrom} đến ngày ${collectionTo}` : null,
    `Phụ huynh vui lòng thanh toán đúng hạn`,
    `Trân trọng - Hicado Center`,
  ].filter(Boolean).join('\n');
}
