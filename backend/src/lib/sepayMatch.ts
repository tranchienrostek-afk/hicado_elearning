type PaymentStudent = {
  id: string;
  name: string;
  studentCode?: string | null;
};

function normalizePaymentText(value: string): string {
  return value.toUpperCase().trim();
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

    return identifiers.some(identifier => normalized.includes(identifier));
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
