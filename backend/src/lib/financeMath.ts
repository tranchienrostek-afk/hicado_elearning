import { startOfDayUTC, endOfDayUTC } from './dateRange';

type StudentLike = {
  id: string;
  name: string;
  studentCode?: string | null;
  tuitionStatus?: string;
};

type ClassStudentLike = {
  student: StudentLike;
  customTuitionPerSession?: number | null;
  discountFrom?: string | Date | null;
  discountTo?: string | Date | null;
};


type ClassLike = {
  id: string;
  name: string;
  tuitionPerSession: number;
  totalSessions: number;
  students: ClassStudentLike[];
};

type TransactionLike = {
  id?: string;
  studentId: string;
  classId?: string | null;
  amount: number;
};

type AttendanceLike = {
  classId: string;
  studentId: string;
  status: string;
  date?: string | Date;
  sessionUnits?: number;
};

export type TuitionRateGroup = {
  pricePerSession: number;
  sessions: number;
  subtotal: number;
  label: 'OVERRIDE' | 'CLASS_DEFAULT';
};

export function breakdownForStudentClass(
  classItem: ClassLike,
  studentId: string,
  attendances?: AttendanceLike[],
  override?: {
    customTuitionPerSession?: number | null;
    discountFrom?: string | Date | null;
    discountTo?: string | Date | null;
  }
): { total: number; groups: TuitionRateGroup[] } {
  if (!attendances) {
    // No attendance data supplied — fall back to the planned totalSessions.
    // There are no per-session dates here, so the discount window cannot be
    // split; the override (if any) applies to the whole planned total.
    const hasOverride = override?.customTuitionPerSession != null;
    const price = hasOverride ? (override!.customTuitionPerSession as number) : classItem.tuitionPerSession;
    const sessions = classItem.totalSessions;
    const subtotal = Math.round(price * sessions);
    return {
      total: subtotal,
      groups: [{ pricePerSession: price, sessions, subtotal, label: hasOverride ? 'OVERRIDE' : 'CLASS_DEFAULT' }],
    };
  }

  const studentAttendances = attendances.filter(
    attendance =>
      attendance.classId === classItem.id &&
      attendance.studentId === studentId &&
      attendance.status === 'PRESENT'
  );

  // Discount window boundaries are compared in UTC to match how attendance
  // dates are persisted (UTC midnight) — local setHours() would shift the
  // window by the server's timezone offset.
  const from = override?.discountFrom ? startOfDayUTC(override.discountFrom) : null;
  const to = override?.discountTo ? endOfDayUTC(override.discountTo) : null;

  const groupMap = new Map<string, TuitionRateGroup>();
  for (const att of studentAttendances) {
    let price = classItem.tuitionPerSession;
    let label: 'OVERRIDE' | 'CLASS_DEFAULT' = 'CLASS_DEFAULT';

    if (override?.customTuitionPerSession != null) {
      if (!att.date) {
        price = override.customTuitionPerSession;
        label = 'OVERRIDE';
      } else {
        const attDate = startOfDayUTC(att.date);
        const isAfterFrom = !from || attDate >= from;
        const isBeforeTo = !to || attDate <= to;
        if (isAfterFrom && isBeforeTo) {
          price = override.customTuitionPerSession;
          label = 'OVERRIDE';
        }
      }
    }

    const units = att.sessionUnits ?? 1;
    const key = `${label}:${price}`;
    const existing = groupMap.get(key);
    if (existing) {
      existing.sessions += units;
      existing.subtotal += units * price;
    } else {
      groupMap.set(key, { pricePerSession: price, sessions: units, subtotal: units * price, label });
    }
  }

  const groups = Array.from(groupMap.values())
    .map(g => ({ ...g, subtotal: Math.round(g.subtotal) }))
    .sort((a, b) => {
      if (a.label === 'OVERRIDE' && b.label !== 'OVERRIDE') return -1;
      if (b.label === 'OVERRIDE' && a.label !== 'OVERRIDE') return 1;
      return a.pricePerSession - b.pricePerSession;
    });
  const total = groups.reduce((sum, g) => sum + g.subtotal, 0);
  return { total, groups };
}

export function expectedForStudentClass(
  classItem: ClassLike,
  studentId: string,
  attendances?: AttendanceLike[],
  override?: {
    customTuitionPerSession?: number | null;
    discountFrom?: string | Date | null;
    discountTo?: string | Date | null;
  }
): number {
  return breakdownForStudentClass(classItem, studentId, attendances, override).total;
}

export type BillItem = {
  classId: string;
  className: string;
  sessions: number;
  pricePerSession: number;
  subtotal: number;
  breakdown: TuitionRateGroup[];
};

// Single source of truth for "one line of a tuition bill" — replaces the
// hand-rolled { sessions, pricePerSession, subtotal } construction that used
// to be duplicated (and drift) across finance.ts, campaigns.ts and zalo.ts.
// pricePerSession/subtotal always come from the same override-aware
// calculation, and the full per-rate breakdown travels with the item so
// callers can render a mixed-price line (see breakdown) instead of a single
// price that disagrees with the total when a discount window splits the period.
export function buildBillItemForClass(
  classItem: ClassLike,
  studentId: string,
  attendances: AttendanceLike[],
  override?: {
    customTuitionPerSession?: number | null;
    discountFrom?: string | Date | null;
    discountTo?: string | Date | null;
  }
): BillItem {
  const { total: subtotal, groups } = breakdownForStudentClass(classItem, studentId, attendances, override);
  const sessions = groups.reduce((sum, g) => sum + g.sessions, 0);
  return {
    classId: classItem.id,
    className: classItem.name,
    sessions,
    pricePerSession: groups[0]?.pricePerSession ?? classItem.tuitionPerSession,
    subtotal,
    breakdown: groups,
  };
}

export function sumBillItems(items: BillItem[]): number {
  return Math.round(items.reduce((sum, item) => sum + item.subtotal, 0));
}


// A transaction with no classId cannot be attributed to every class the
// student belongs to (that double-counts it in per-class stats when a
// student is enrolled in more than one class). Resolve each untagged
// transaction to exactly one class: the first (in roster order) that the
// student still owes money on, tracking amounts already allocated so
// repeated untagged transactions for the same student don't all pile onto
// the same class.
function resolveTransactionClassIds(
  classes: ClassLike[],
  transactions: TransactionLike[],
  attendances?: AttendanceLike[]
): TransactionLike[] {
  const studentClassIds = new Map<string, string[]>();
  const classById = new Map(classes.map(c => [c.id, c]));
  for (const cls of classes) {
    for (const cs of cls.students) {
      const arr = studentClassIds.get(cs.student.id) ?? [];
      arr.push(cls.id);
      studentClassIds.set(cs.student.id, arr);
    }
  }

  const expectedCache = new Map<string, number>();
  const expectedFor = (studentId: string, classId: string): number => {
    const key = `${studentId}:${classId}`;
    const cached = expectedCache.get(key);
    if (cached != null) return cached;
    const cls = classById.get(classId);
    const cs = cls?.students.find(s => s.student.id === studentId);
    const value = cls ? expectedForStudentClass(cls, studentId, attendances, cs) : 0;
    expectedCache.set(key, value);
    return value;
  };

  const allocated = new Map<string, number>();
  const allocKey = (studentId: string, classId: string) => `${studentId}:${classId}`;
  for (const tx of transactions) {
    if (!tx.classId) continue;
    const k = allocKey(tx.studentId, tx.classId);
    allocated.set(k, (allocated.get(k) ?? 0) + tx.amount);
  }

  return transactions.map(tx => {
    if (tx.classId) return tx;
    const classIds = studentClassIds.get(tx.studentId) ?? [];
    if (classIds.length === 0) return tx;

    let target = classIds[0];
    for (const cid of classIds) {
      const owed = expectedFor(tx.studentId, cid) - (allocated.get(allocKey(tx.studentId, cid)) ?? 0);
      if (owed > 0) { target = cid; break; }
    }
    const k = allocKey(tx.studentId, target);
    allocated.set(k, (allocated.get(k) ?? 0) + tx.amount);
    return { ...tx, classId: target };
  });
}

export function buildClassCollectionStats(
  classes: ClassLike[],
  transactions: TransactionLike[],
  attendances?: AttendanceLike[]
) {
  const resolvedTransactions = resolveTransactionClassIds(classes, transactions, attendances);

  return classes.map(classItem => {
    const expected = classItem.students.reduce(
      (sum, cs) => sum + expectedForStudentClass(classItem, cs.student.id, attendances, cs),
      0
    );

    const collected = resolvedTransactions
      .filter(tx => tx.classId === classItem.id)
      .reduce((sum, tx) => sum + tx.amount, 0);

    let paidCount = 0;
    let partialCount = 0;
    for (const cs of classItem.students) {
      const studentExpected = expectedForStudentClass(classItem, cs.student.id, attendances, cs);

      const studentPaid = resolvedTransactions
        .filter(tx => tx.studentId === cs.student.id && tx.classId === classItem.id)
        .reduce((sum, tx) => sum + tx.amount, 0);
      if (studentExpected > 0 && studentPaid >= studentExpected) paidCount++;
      else if (studentPaid > 0) partialCount++;
    }

    return {
      classId: classItem.id,
      className: classItem.name,
      expected,
      collected,
      gap: Math.max(0, expected - collected),
      rate: expected > 0 ? Number(((collected / expected) * 100).toFixed(1)) : 0,
      studentCount: classItem.students.length,
      paidCount,
      partialCount,
    };
  });
}

export function buildStudentPaymentRows(
  classes: ClassLike[],
  transactions: TransactionLike[],
  attendances?: AttendanceLike[]
) {
  const rows = new Map<string, {
    id: string;
    name: string;
    studentCode: string | null;
    tuitionStatus: string | undefined;
    totalExpected: number;
    totalPaid: number;
    totalDebt: number;
    paymentStatus: 'PAID_FULL' | 'PAID_PARTIAL' | 'NOT_PAID';
    classes: { id: string; name: string }[];
  }>();

  for (const classItem of classes) {
    for (const cs of classItem.students) {
      const student = cs.student;
      const studentClassExpected = expectedForStudentClass(classItem, student.id, attendances, cs);

      const existing = rows.get(student.id) ?? {
        id: student.id,
        name: student.name,
        studentCode: student.studentCode ?? null,
        tuitionStatus: student.tuitionStatus,
        totalExpected: 0,
        totalPaid: 0,
        totalDebt: 0,
        paymentStatus: 'NOT_PAID' as const,
        classes: [],
      };

      existing.totalExpected += studentClassExpected;
      existing.classes.push({ id: classItem.id, name: classItem.name });
      rows.set(student.id, existing);
    }
  }

  for (const row of rows.values()) {
    row.totalPaid = transactions
      .filter(tx => tx.studentId === row.id)
      .reduce((sum, tx) => sum + tx.amount, 0);
    row.totalDebt = Math.max(0, row.totalExpected - row.totalPaid);
    row.paymentStatus =
      row.totalExpected > 0 && row.totalPaid >= row.totalExpected
        ? 'PAID_FULL'
        : row.totalPaid > 0
          ? 'PAID_PARTIAL'
          : 'NOT_PAID';
  }

  return Array.from(rows.values()).sort((a, b) => a.name.localeCompare(b.name, 'vi'));
}
