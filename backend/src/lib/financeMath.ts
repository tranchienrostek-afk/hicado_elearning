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

function attendedSessions(classItem: ClassLike, studentId: string, attendances?: AttendanceLike[]): number {

  if (!attendances) return classItem.totalSessions;
  return attendances
    .filter(
      attendance =>
        attendance.classId === classItem.id &&
        attendance.studentId === studentId &&
        attendance.status === 'PRESENT'
    )
    .reduce((sum, item) => sum + (item.sessionUnits ?? 1), 0);
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
  if (!attendances) return (override?.customTuitionPerSession ?? classItem.tuitionPerSession) * classItem.totalSessions;
  
  const studentAttendances = (attendances || []).filter(
    attendance =>
      attendance.classId === classItem.id &&
      attendance.studentId === studentId &&
      attendance.status === 'PRESENT'
  );
  
  let total = 0;
  for (const att of studentAttendances) {
    let price = classItem.tuitionPerSession;
    
    if (override?.customTuitionPerSession != null) {
      if (!att.date) {
        price = override.customTuitionPerSession;
      } else {
        const attDate = new Date(att.date);
        attDate.setHours(0, 0, 0, 0);

        const from = override.discountFrom ? new Date(override.discountFrom) : null;
        if (from) from.setHours(0, 0, 0, 0);

        const to = override.discountTo ? new Date(override.discountTo) : null;
        if (to) to.setHours(23, 59, 59, 999);
        
        const isAfterFrom = !from || attDate >= from;
        const isBeforeTo = !to || attDate <= to;
        
        if (isAfterFrom && isBeforeTo) {
          price = override.customTuitionPerSession;
        }
      }
    }
    
    total += (att.sessionUnits ?? 1) * price;
  }
  
  return total;
}


function transactionBelongsToClass(tx: TransactionLike, classItem: ClassLike): boolean {
  if (tx.classId) return tx.classId === classItem.id;
  return classItem.students.some(cs => cs.student.id === tx.studentId);
}

export function buildClassCollectionStats(
  classes: ClassLike[],
  transactions: TransactionLike[],
  attendances?: AttendanceLike[]
) {
  return classes.map(classItem => {
    const expected = classItem.students.reduce(
      (sum, cs) => sum + expectedForStudentClass(classItem, cs.student.id, attendances, cs),
      0
    );

    const collected = transactions
      .filter(tx => transactionBelongsToClass(tx, classItem))
      .reduce((sum, tx) => sum + tx.amount, 0);

    let paidCount = 0;
    let partialCount = 0;
    for (const cs of classItem.students) {
      const studentExpected = expectedForStudentClass(classItem, cs.student.id, attendances, cs);

      const studentPaid = transactions
        .filter(tx => tx.studentId === cs.student.id && transactionBelongsToClass(tx, classItem))
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
