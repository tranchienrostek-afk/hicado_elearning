import prisma from './prisma';

type PaymentStudent = {
  id: string;
  name: string;
  studentCode?: string | null;
};

function normalizePaymentText(value: string): string {
  return value.toUpperCase().trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// A plain substring check lets a shorter code that happens to be a prefix of another
// student's code match the wrong student (e.g. code "HS1" is a substring of "HS123").
// Require the identifier to appear as a whole token — bounded by the start/end of the
// content or a non-alphanumeric separator — rather than anywhere inside a longer token.
function containsWholeToken(content: string, identifier: string): boolean {
  const pattern = new RegExp(`(?<![A-Z0-9])${escapeRegExp(identifier)}(?![A-Z0-9])`);
  return pattern.test(content);
}

export function findStudentByPaymentContent<T extends PaymentStudent>(
  students: T[],
  content: string
): T | undefined {
  const normalized = normalizePaymentText(content);

  return students.find(student => {
    const identifiers = [student.studentCode, student.id]
      .filter((value): value is string => Boolean(value))
      .map(normalizePaymentText);

    return identifiers.some(identifier => containsWholeToken(normalized, identifier));
  });
}

function numberOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function normalizeSepayWebhookPayload(body: any) {
  const amountIn = numberOrNull(body.transferAmount ?? body.amount_in);
  const amountOut = numberOrNull(body.amount_out);
  const transferType = body.transferType ?? (amountIn && amountIn > 0 ? 'in' : amountOut && amountOut > 0 ? 'out' : undefined);

  return {
    id: numberOrNull(body.id),
    gateway: body.gateway ?? body.bank_brand_name,
    transactionDate: body.transactionDate ?? body.transaction_date,
    content: body.content ?? body.transaction_content,
    transferType,
    transferAmount: amountIn ?? 0,
    referenceCode: body.referenceCode ?? body.reference_number,
    sepayCode: body.code ?? null,
  };
}

export async function findBillByPaymentContent(content: string) {
  const match = content.match(/HD-[A-Z0-9]{6}/i);
  if (!match) return null;
  const referenceCode = match[0].toUpperCase();
  return prisma.tuitionBill.findUnique({
    where: { referenceCode },
    include: { student: true }
  });
}
