
/**
 * Normalizes phone numbers to a standard format (e.g., 0912345678).
 * Removes spaces, dots, and handles +84/84 prefix.
 */
export function normalizePhone(phone?: string | null): string | null {
  if (!phone) return null;
  let cleaned = phone.replace(/\D/g, '');
  if (cleaned.startsWith('84') && cleaned.length > 9) {
    cleaned = '0' + cleaned.slice(2);
  } else if (cleaned.length === 9 && !cleaned.startsWith('0')) {
    cleaned = '0' + cleaned;
  }
  return cleaned || null;
}

/**
 * Normalizes Vietnamese names for fuzzy comparison.
 * Lowercase, remove accents, collapse multiple spaces.
 */
export function normalizeVietnameseName(name: string): string {
  if (!name) return '';
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'd')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Simple string similarity based on Levenshtein distance.
 */
export function calculateStringSimilarity(s1: string, s2: string): number {
  const n1 = normalizeVietnameseName(s1);
  const n2 = normalizeVietnameseName(s2);
  if (n1 === n2) return 100;
  if (!n1 || !n2) return 0;

  const longer = n1.length > n2.length ? n1 : n2;
  const shorter = n1.length > n2.length ? n2 : n1;
  const longerLength = longer.length;
  
  if (longerLength === 0) return 100.0;
  
  const editDistance = levenshteinDistance(longer, shorter);
  return Math.round(((longerLength - editDistance) / longerLength) * 100);
}

function levenshteinDistance(s1: string, s2: string): number {
  const costs = new Array<number>();
  for (let i = 0; i <= s1.length; i++) {
    let lastValue = i;
    for (let j = 0; j <= s2.length; j++) {
      if (i === 0) {
        costs[j] = j;
      } else {
        if (j > 0) {
          let newValue = costs[j - 1];
          if (s1.charAt(i - 1) !== s2.charAt(j - 1)) {
            newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
          }
          costs[j - 1] = lastValue;
          lastValue = newValue;
        }
      }
    }
    if (i > 0) costs[s2.length] = lastValue;
  }
  return costs[s2.length];
}

export function calculateStudentMatchScore(
  input: { name: string; parentPhone?: string; studentPhone?: string; cccd?: string; studentCode?: string; birthYear?: number },
  existing: { name: string; nameNorm?: string | null; parentPhone?: string | null; studentPhone?: string | null; cccd?: string | null; studentCode?: string | null; birthYear?: number | null }
): { score: number; reasons: string[] } {
  let score = 0;
  const reasons: string[] = [];

  // 1. CCCD exact match
  if (input.cccd && input.cccd === existing.cccd) {
    return { score: 100, reasons: ['Trùng mã định danh/CCCD'] };
  }

  // 2. StudentCode exact match
  if (input.studentCode && input.studentCode === existing.studentCode) {
    return { score: 100, reasons: ['Trùng mã học sinh'] };
  }

  // 3. Name similarity
  const nameSim = calculateStringSimilarity(input.name, existing.name);
  const nameNormInput = normalizeVietnameseName(input.name);
  const nameNormExisting = existing.nameNorm || normalizeVietnameseName(existing.name);
  const exactNameMatch = nameNormInput === nameNormExisting;

  // 4. Phone matching. Imported files often put the same contact number in
  // either parentPhone or studentPhone, so compare the two phone pools.
  const pPhoneInput = normalizePhone(input.parentPhone);
  const pPhoneExisting = normalizePhone(existing.parentPhone);
  const sPhoneInput = normalizePhone(input.studentPhone);
  const sPhoneExisting = normalizePhone(existing.studentPhone);

  const inputPhones = [pPhoneInput, sPhoneInput].filter(Boolean);
  const existingPhones = [pPhoneExisting, sPhoneExisting].filter(Boolean);
  const anyPhoneMatch = inputPhones.some(phone => existingPhones.includes(phone));

  if (anyPhoneMatch && nameSim >= 85) {
    score = 95;
    reasons.push('Trung so dien thoai va ten giong nhau');
  } else if (anyPhoneMatch && exactNameMatch) {
    score = 95;
    reasons.push('Trung so dien thoai va ten chinh xac');
  } else if (anyPhoneMatch) {
    score = 75;
    reasons.push('Trung so dien thoai');
  } else if (exactNameMatch && input.birthYear && input.birthYear === existing.birthYear) {
    score = 80;
    reasons.push('Trùng tên và năm sinh');
  } else if (nameSim >= 95) {
    score = 40;
    reasons.push('Tên gần như trùng khớp hoàn toàn');
  } else if (nameSim >= 80) {
    score = 30;
    reasons.push('Tên khá giống nhau');
  }

  return { score, reasons };
}
