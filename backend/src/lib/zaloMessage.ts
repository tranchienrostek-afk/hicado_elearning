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
  teacherNames?:   string[];
  sessions:        number;
  pricePerSession: number;
  total:           number;
  note?:           string;
  fromDate?:       string;  // Tuition from
  toDate?:         string;    // Tuition to
  collectionFrom?: string;  // Collection from
  collectionTo?:   string;    // Collection to
}

const classIcon = (index: number) => ['📘', '📙', '📗', '📕', '📒'][index % 5];
const teacherLabel = (teacherNames?: string[]) => teacherNames?.length ? teacherNames.join(', ') : 'Chưa có giáo viên';
const classTitle = (className: string, teacherNames?: string[]) =>
  teacherNames?.length ? `${className} - ${teacherNames.join(', ')}` : className;

function buildTuitionClassBlock(
  className: string,
  teacherNames: string[] | undefined,
  sessions: number,
  pricePerSession: number,
  subtotal: number,
  index: number
) {
  return [
    `${classIcon(index)} ${classTitle(className, teacherNames)}`,
    ``,
    `👨‍🏫 Giáo viên: ${teacherLabel(teacherNames)}`,
    `🗓️ Số buổi học: ${sessions}`,
    `💵 Học phí: ${pricePerSession.toLocaleString('vi-VN')}đ/buổi`,
    `🏷️ Thành tiền: ${subtotal.toLocaleString('vi-VN')}đ`,
  ].join('\n');
}

export function buildCustomTuitionMessage(studentName: string, p: CustomTuitionPayload): string {
  const dateRange = p.fromDate && p.toDate ? ` từ ${p.fromDate} đến ${p.toDate}` : '';
  const itemBlock = p.sessions > 0
    ? buildTuitionClassBlock(p.className, p.teacherNames, p.sessions, p.pricePerSession, p.total, 0)
    : `(Không có buổi học trong kỳ)`;

  return [
    `💌 Kính gửi phụ huynh em ${studentName}`,
    `🏫 Trung tâm Hicado xin thông báo học phí${dateRange}`,
    ``,
    `------`,
    itemBlock,
    ``,
    `------`,
    `💰 Tổng cộng: ${p.total.toLocaleString('vi-VN')}đ`,
    ``,
    `💳 PH có thể thanh toán qua chuyển khoản hoặc đóng tiền mặt tại Trung tâm.`,
    p.collectionFrom && p.collectionTo ? `⏳ Thời gian thu: từ ngày ${p.collectionFrom} đến ngày ${p.collectionTo}` : null,
    `📌 Phụ huynh vui lòng thanh toán đúng hạn`,
    `✨ Trân trọng - Hicado Center`,
  ].filter(Boolean).join('\n');
}

export function buildMultiClassTuitionMessage(
  studentName: string, items: any[], total: number,
  fromDate?: string, toDate?: string,
  collectionFrom?: string, collectionTo?: string
): string {
  const dateRange = fromDate && toDate ? ` từ ${fromDate} đến ${toDate}` : '';
  const itemLines = items.length > 0
    ? items.map((it, index) => buildTuitionClassBlock(it.className, it.teacherNames, it.sessions, it.pricePerSession, it.subtotal, index))
    : ["(Không có buổi học trong kỳ)"];

  return [
    `💌 Kính gửi phụ huynh em ${studentName}`,
    `🏫 Trung tâm Hicado xin thông báo học phí${dateRange}`,
    ``,
    `------`,
    itemLines.join('\n\n------\n\n'),
    ``,
    `------`,
    `💰 Tổng cộng: ${total.toLocaleString('vi-VN')}đ`,
    ``,
    `💳 PH có thể thanh toán qua chuyển khoản hoặc đóng tiền mặt tại Trung tâm.`,
    collectionFrom && collectionTo ? `⏳ Thời gian thu: từ ngày ${collectionFrom} đến ngày ${collectionTo}` : null,
    `📌 Phụ huynh vui lòng thanh toán đúng hạn`,
    `✨ Trân trọng - Hicado Center`,
  ].filter(Boolean).join('\n');
}
