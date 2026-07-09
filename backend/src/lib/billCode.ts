import prisma from './prisma';

export const generateBillCode = () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let result = 'HD-';
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};

// referenceCode is a random 6-char code over a 32-symbol alphabet (~1B combinations)
// with a unique DB constraint. A collision is rare but, unretried, surfaces as an
// unrelated 500 on bill creation instead of just trying a fresh code.
export async function generateUniqueBillCode(maxAttempts = 5): Promise<string> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const code = generateBillCode();
    const existing = await prisma.tuitionBill.findUnique({ where: { referenceCode: code }, select: { id: true } });
    if (!existing) return code;
  }
  throw new Error('Could not generate a unique bill reference code');
}
