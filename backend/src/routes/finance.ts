import { Router } from 'express';
import prisma from '../lib/prisma';
import { authenticateToken, authorizeRoles } from '../middleware/auth';
import QRCode from 'qrcode';
import { generateVietQRString } from '../lib/vietqr';
import { buildPaymentSlipPNG, deaccent } from '../lib/paymentSlip';
import { buildClassCollectionStats, buildStudentPaymentRows, expectedForStudentClass } from '../lib/financeMath';

import { generateBillCode } from '../lib/billCode';

const router = Router();

// Get all transactions (Admin/Manager)
router.get('/transactions', authenticateToken, authorizeRoles('ADMIN', 'MANAGER'), async (req, res) => {
  try {
    const transactions = await prisma.transaction.findMany({
      include: { student: { select: { name: true } } },
      orderBy: { date: 'desc' },
      take: 100
    });
    res.json(transactions);
  } catch (error) {
    res.status(500).json({ message: 'Lỗi khi lấy giao dịch' });
  }
});

// Financial summary
router.get('/summary', authenticateToken, authorizeRoles('ADMIN', 'MANAGER'), async (req, res) => {
  try {
    const [totalRevenue, totalAdjustments] = await Promise.all([
      prisma.transaction.aggregate({
        _sum: { amount: true },
        where: { status: 'SUCCESS' }
      }),
      prisma.paymentAdjustment.aggregate({
        _sum: { amount: true },
      }),
    ]);

    const studentStats = await prisma.student.groupBy({
      by: ['tuitionStatus'],
      _count: true
    });

    res.json({
      totalRevenue: (totalRevenue._sum.amount || 0) + (totalAdjustments._sum.amount || 0),
      studentStats
    });
  } catch (error) {
    res.status(500).json({ message: 'Lỗi khi lấy báo cáo tài chính' });
  }
});

router.get('/qr/:studentId/:classId', authenticateToken, async (req, res) => {
  const studentId = req.params.studentId as string;
  const classId = req.params.classId as string;

  try {
    const [student, classItem] = await Promise.all([
      prisma.student.findUnique({
        where: { id: studentId },
        select: { id: true, studentCode: true, name: true }
      }),
      prisma.class.findUnique({
        where: { id: classId },
        select: { id: true, classCode: true, name: true, tuitionPerSession: true, totalSessions: true }
      })
    ]);

    if (!student || !classItem) {
      return res.status(404).json({ message: 'Học sinh hoặc Lớp không tồn tại' });
    }

    const bankCfg = await prisma.systemConfig.findMany({ where: { key: { in: ['BANK_BIN', 'BANK_ACC'] } } });
    const bankCfgMap = bankCfg.reduce((a, r) => { a[r.key] = r.value; return a; }, {} as Record<string, string>);
    const bankBin = bankCfgMap.BANK_BIN || process.env.BANK_BIN || '970436';
    const accountNo = bankCfgMap.BANK_ACC || process.env.BANK_ACC || '123456789';
    
    // Check if we have a specific bill
    const billId = req.query.billId as string;
    let billRef = '';
    let billAmount = 0;
    if (billId) {
      const bill = await prisma.tuitionBill.findUnique({ where: { id: billId } });
      if (bill) {
        billRef = bill.referenceCode;
        billAmount = bill.amount - bill.paidAmount;
      }
    }

    const attendedAgg = await prisma.attendance.aggregate({
      _sum: { sessionUnits: true },
      where: { studentId, classId, status: 'PRESENT' },
    });
    const attended = attendedAgg._sum.sessionUnits || 0;
    const amount = billAmount || (classItem.tuitionPerSession * attended);
    const memoPrefix = billRef ? `${billRef} ` : '';
    const memo = deaccent(`${memoPrefix}${student.studentCode ?? ''} ${classItem.classCode ?? ''} ${student.name}`).trim().toUpperCase().slice(0, 50);

    const qrData = generateVietQRString(bankBin, accountNo, amount, memo);
    const qrImage = await QRCode.toDataURL(qrData, {
      margin: 1,
      color: { dark: '#000000', light: '#ffffff' }
    });

    res.json({ qrImage, student: student.name, className: classItem.name, attended, amount, memo, billRef });
  } catch (error) {
    console.error('[QR] Error generating QR:', error);
    res.status(500).json({ message: 'Lỗi khi tạo mã QR' });
  }
});

// Comprehensive payment dashboard stats (ADMIN/MANAGER)
router.get('/stats', authenticateToken, authorizeRoles('ADMIN', 'MANAGER'), async (req, res) => {
  try {
    const twelveMonthsAgo = new Date();
    twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 11);
    twelveMonthsAgo.setDate(1);
    twelveMonthsAgo.setHours(0, 0, 0, 0);

    const [recentTxs, allClasses, allSuccessTxs, presentAttendances, totalAgg, allAdjustments] = await Promise.all([
      prisma.transaction.findMany({
        where: { status: 'SUCCESS', date: { gte: twelveMonthsAgo } },
        include: {
          student: {
            select: {
              name: true, studentCode: true,
              classes: { include: { class: { select: { name: true } } } },
            },
          },
        },
        orderBy: { date: 'desc' },
        take: 50,
      }),
      prisma.class.findMany({
        include: {
          students: {
            include: {
              student: { select: { id: true, name: true, studentCode: true, tuitionStatus: true } },
            },
          },
        },
      }),
      prisma.transaction.findMany({
        where: { status: 'SUCCESS' },
        select: { id: true, studentId: true, classId: true, amount: true },
      }),
      prisma.attendance.findMany({
        where: { status: 'PRESENT' },
        select: { classId: true, studentId: true, status: true, sessionUnits: true, date: true },
      }),
      prisma.transaction.aggregate({ _sum: { amount: true }, where: { status: 'SUCCESS' } }),
      prisma.paymentAdjustment.findMany({
        select: { id: true, studentId: true, classId: true, amount: true, effectiveDate: true, note: true, source: true },
      }),
    ]);

    // Monthly revenue
    const monthlyMap: Record<string, number> = {};
    for (const tx of recentTxs) {
      const key = `${tx.date.getFullYear()}-${String(tx.date.getMonth() + 1).padStart(2, '0')}`;
      monthlyMap[key] = (monthlyMap[key] || 0) + tx.amount;
    }
    const monthlyRevenue = Object.entries(monthlyMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, amount]) => ({ month, amount }));

    const virtualAdjustmentsAsTx = allAdjustments.map((a) => ({
      id: `adj-${a.id}`,
      studentId: a.studentId,
      classId: a.classId,
      amount: a.amount,
    }));
    const allPaidLike = [...allSuccessTxs, ...virtualAdjustmentsAsTx];

    const collectionByClass = buildClassCollectionStats(allClasses, allPaidLike as any, presentAttendances);
    const pendingList = buildStudentPaymentRows(allClasses, allPaidLike as any, presentAttendances)
      .filter(s => s.paymentStatus !== 'PAID_FULL')
      .map(s => ({
        id: s.id,
        name: s.name,
        studentCode: s.studentCode,
        tuitionStatus: s.tuitionStatus,
        paymentStatus: s.paymentStatus,
        totalDebt: s.totalDebt,
        totalPaid: s.totalPaid,
        classes: s.classes,
      }));

    const totalCollected = (totalAgg._sum.amount || 0) + allAdjustments.reduce((sum, adj) => sum + adj.amount, 0);
    const totalExpected = collectionByClass.reduce((sum, cls) => sum + cls.expected, 0);

    res.json({
      totalCollected, totalExpected,
      collectionRate: totalExpected > 0 ? Number(((totalCollected / totalExpected) * 100).toFixed(1)) : 0,
      monthlyRevenue,
      collectionByClass,
      pendingStudents: pendingList,
      recentTransactions: recentTxs.map(tx => ({
        id: tx.id, amount: tx.amount, date: tx.date, status: tx.status, content: tx.content,
        studentName: tx.student?.name ?? '—',
        studentCode: tx.student?.studentCode ?? '—',
        classes: tx.student?.classes?.map(cs => cs.class.name).join(', ') ?? '—',
      })),
      manualAdjustments: allAdjustments,
    });
  } catch (err) {
    console.error('[Finance Stats]', err);
    res.status(500).json({ message: 'Lỗi khi lấy thống kê tài chính' });
  }
});

// Public endpoint — no auth — used by /pay/:studentId page
router.get('/public/student/:studentId', async (req, res) => {
  const studentId = String(req.params.studentId);
  try {
    const student = await prisma.student.findUnique({
      where: { id: studentId },
      include: {
        classes: {
          include: { class: { select: { id: true, name: true, classCode: true, tuitionPerSession: true, totalSessions: true } } },
        },
      },
    });
    if (!student) return res.status(404).json({ message: 'Học sinh không tồn tại' });

    const bankCfg = await prisma.systemConfig.findMany({ where: { key: { in: ['BANK_BIN', 'BANK_ACC', 'BANK_NAME', 'BANK_LABEL'] } } });
    const bm = bankCfg.reduce((a: any, r) => { a[r.key] = r.value; return a; }, {} as Record<string, string>);
    const bankBin = bm.BANK_BIN || process.env.BANK_BIN || '970436';
    const accountNo = bm.BANK_ACC || process.env.BANK_ACC || '';
    const bankName = bm.BANK_NAME || bm.BANK_LABEL || '';

    const { from, to } = req.query as Record<string, string>;
    const fromDate = from ? new Date(from) : null;
    const toDate = to ? new Date(to) : null;
    if (fromDate) fromDate.setHours(0,0,0,0);
    if (toDate) toDate.setHours(23,59,59,999);

    const classQRs = await Promise.all(
      student.classes.map(async cs => {
        const cls = cs.class;
        const [attendedAgg, adjustmentAgg] = await Promise.all([
          prisma.attendance.aggregate({
            _sum: { sessionUnits: true },
            where: { 
              studentId: student.id, classId: cls.id, status: 'PRESENT',
              ...(fromDate || toDate ? { date: { ...(fromDate ? { gte: fromDate } : {}), ...(toDate ? { lte: toDate } : {}) } } : {})
            },
          }),
          prisma.paymentAdjustment.aggregate({
            _sum: { amount: true },
            where: {
              studentId: student.id, classId: cls.id,
              ...(fromDate || toDate ? { effectiveDate: { ...(fromDate ? { gte: fromDate } : {}), ...(toDate ? { lte: toDate } : {}) } } : {})
            }
          })
        ]);

        const attended = attendedAgg._sum.sessionUnits || 0;
        let amount = cls.tuitionPerSession * attended;
        const paidOrAdj = adjustmentAgg._sum.amount || 0;
        amount = Math.max(0, amount - paidOrAdj);

        const periodLabel = fromDate && toDate ? ` ${from.slice(5)}den${to.slice(5)}` : '';
        const memo = deaccent(`${student.studentCode ?? student.id}${periodLabel} ${cls.classCode ?? cls.id} ${student.name}`).trim().toUpperCase().slice(0, 50);
        
        const qrData = generateVietQRString(bankBin, accountNo, amount, memo);
        const qrImage = await QRCode.toDataURL(qrData, { margin: 1, color: { dark: '#000000', light: '#ffffff' } });
        return { classId: cls.id, className: cls.name, classCode: cls.classCode, attended, amount, memo, qrImage };
      })
    );

    res.json({
      student: { id: student.id, name: student.name, studentCode: student.studentCode, tuitionStatus: student.tuitionStatus },
      bankName, accountNo, classQRs,
    });
  } catch (err) {
    console.error('[Public Pay]', err);
    res.status(500).json({ message: 'Lỗi' });
  }
});

// Public payment-slip image — navy header + info + QR in one PNG, used in Zalo image messages
router.get('/qr-png/:studentId/:classId', async (req, res) => {
  try {
    const [student, classItem, bankCfg] = await Promise.all([
      prisma.student.findUnique({ where: { id: req.params.studentId }, select: { id: true, studentCode: true, name: true } }),
      prisma.class.findUnique({ where: { id: req.params.classId }, select: { id: true, classCode: true, name: true, tuitionPerSession: true, totalSessions: true } }),
      prisma.systemConfig.findMany({ where: { key: { in: ['BANK_BIN', 'BANK_ACC'] } } }),
    ]);
    if (!student || !classItem) return res.status(404).end();
    const bm = bankCfg.reduce((a, r) => { a[r.key] = r.value; return a; }, {} as Record<string, string>);
    const attendedFromQuery = req.query.attended != null ? Number(req.query.attended) : null;
    const attendedAgg = attendedFromQuery == null ? await prisma.attendance.aggregate({
      _sum: { sessionUnits: true },
      where: { studentId: student.id, classId: classItem.id, status: 'PRESENT' },
    }) : null;
    const attended = attendedFromQuery ?? attendedAgg?._sum.sessionUnits ?? 0;
    const amount = classItem.tuitionPerSession * attended;
    const memo = deaccent(`${student.studentCode ?? student.id} ${classItem.classCode ?? classItem.id} ${student.name}`).trim().toUpperCase().slice(0, 50);
    const qrData = generateVietQRString(bm.BANK_BIN || process.env.BANK_BIN || '970436', bm.BANK_ACC || process.env.BANK_ACC || '', amount, memo);
    const pngBuffer = await buildPaymentSlipPNG({
      studentName: student.name, studentCode: student.studentCode ?? student.id,
      className: classItem.name, classCode: classItem.classCode ?? '',
      attended, tuitionPerSession: classItem.tuitionPerSession, amount, memo, qrData,
    });
    res.type('png').send(pngBuffer);
  } catch (err) {
    console.error('[QR-PNG]', err);
    res.status(500).end();
  }
});

// Payment Tracking — per-student cross-reference of transactions vs expected + last Zalo notification
router.get('/payment-tracking', authenticateToken, authorizeRoles('ADMIN', 'MANAGER'), async (req, res) => {
  try {
    const { classId, dateFrom, dateTo, status } = req.query as Record<string, string | undefined>;

    const txWhere: any = { status: 'SUCCESS' };
    if (dateFrom || dateTo) {
      txWhere.date = {};
      if (dateFrom) txWhere.date.gte = new Date(dateFrom);
      if (dateTo) { const d = new Date(dateTo); d.setHours(23, 59, 59, 999); txWhere.date.lte = d; }
    }

    // Load students (optionally filtered by class)
    const studentWhere: any = {};
    if (classId) studentWhere.classes = { some: { classId } };

    const [students, allTransactions, allAdjustments] = await Promise.all([
      prisma.student.findMany({
        where: studentWhere,
        include: {
          classes: { include: { class: { select: { id: true, name: true, classCode: true, tuitionPerSession: true, totalSessions: true } } } },
          attendances: { where: { status: 'PRESENT' }, select: { classId: true, studentId: true, status: true, sessionUnits: true, date: true } },
        },
        orderBy: { name: 'asc' },
      }),
      prisma.transaction.findMany({
        where: txWhere,
        orderBy: { date: 'desc' },
      }),
      prisma.paymentAdjustment.findMany({
        orderBy: { effectiveDate: 'desc' },
      }),
    ]);

    // Last Zalo notification per student
    const zaloLogs = await (prisma as any).zaloMessageLog.findMany({
      where: {
        studentId: { in: students.map((s: any) => s.id) },
        status: { in: ['SENT', 'READ'] },
      },
      include: { campaign: { select: { name: true } } },
      orderBy: { sentAt: 'desc' },
    });
    const lastZaloByStudent: Record<string, any> = {};
    for (const log of zaloLogs) {
      if (!lastZaloByStudent[log.studentId]) lastZaloByStudent[log.studentId] = log;
    }

    // Build per-student result
    const result = students.map((s: any) => {
      const txList = allTransactions.filter((t: any) => t.studentId === s.id);
      const adjustmentList = allAdjustments.filter((a: any) => a.studentId === s.id);
      const totalPaid = txList.reduce((sum: number, t: any) => sum + t.amount, 0) + adjustmentList.reduce((sum: number, a: any) => sum + a.amount, 0);
      const totalExpected = s.classes.reduce((sum: number, cs: any) => {
        const atts = s.attendances.filter((a: any) => a.classId === cs.class.id);
        return sum + expectedForStudentClass(cs.class as any, s.id, atts as any, cs);
      }, 0);
      const totalBalance = Math.max(0, totalExpected - totalPaid);

      let paymentStatus: string;
      if (totalExpected === 0) paymentStatus = 'NOT_PAID';
      else if (totalPaid >= totalExpected) paymentStatus = 'PAID_FULL';
      else if (totalPaid > 0) paymentStatus = 'PAID_PARTIAL';
      else paymentStatus = 'NOT_PAID';

      const lastZalo = lastZaloByStudent[s.id] ?? null;

      return {
        id: s.id, name: s.name, studentCode: s.studentCode,
        tuitionStatus: s.tuitionStatus,
        classes: s.classes.map((cs: any) => ({
          classId: cs.class.id, className: cs.class.name, classCode: cs.class.classCode,
          attended: s.attendances
            .filter((a: any) => a.classId === cs.class.id)
            .reduce((sum: number, a: any) => sum + (a.sessionUnits ?? 1), 0),
          expected: expectedForStudentClass(
            cs.class as any, s.id,
            s.attendances.filter((a: any) => a.classId === cs.class.id),
            cs
          ),
        })),
        totalExpected, totalPaid, totalBalance,
        paymentStatus,
        transactions: txList.map((t: any) => ({
          id: t.id, amount: t.amount,
          date: t.date, content: t.content,
          classId: t.classId,
        })),
        adjustments: adjustmentList.map((a: any) => ({
          id: a.id,
          amount: a.amount,
          source: a.source,
          note: a.note,
          date: a.effectiveDate,
          classId: a.classId,
        })),
        lastPaymentDate: txList[0]?.date ?? null,
        lastZaloNotification: lastZalo ? {
          sentAt: lastZalo.sentAt,
          status: lastZalo.status,
          campaignName: lastZalo.campaign?.name ?? null,
        } : null,
      };
    });

    // Apply status filter
    const filtered = status && status !== 'ALL'
      ? result.filter((r: any) => r.paymentStatus === status)
      : result;

    const summary = {
      total: filtered.length,
      paidFull: filtered.filter((r: any) => r.paymentStatus === 'PAID_FULL').length,
      paidPartial: filtered.filter((r: any) => r.paymentStatus === 'PAID_PARTIAL').length,
      notPaid: filtered.filter((r: any) => r.paymentStatus === 'NOT_PAID').length,
      totalExpected: filtered.reduce((s: number, r: any) => s + r.totalExpected, 0),
      totalCollected: filtered.reduce((s: number, r: any) => s + r.totalPaid, 0),
    };

    res.json({ students: filtered, summary });
  } catch (err) {
    console.error('[Payment Tracking]', err);
    res.status(500).json({ message: 'Lỗi khi lấy dữ liệu theo dõi thu tiền' });
  }
});

// Manual adjustments (cash/other), with actor + note for audit trail
router.post('/payment-adjustments', authenticateToken, authorizeRoles('ADMIN', 'MANAGER', 'TEACHER'), async (req, res) => {
  const user = (req as any).user;
  const { studentId, classId, amount, source = 'CASH', note, effectiveDate } = req.body || {};
  const value = Number(amount);
  if (!studentId || !Number.isFinite(value) || value === 0) {
    return res.status(400).json({ message: 'studentId va amount hop le la bat buoc' });
  }
  try {
    const actorName = user.name ?? (
      await prisma.user.findUnique({ where: { id: user.id }, select: { name: true } })
    )?.name;
    const created = await prisma.paymentAdjustment.create({
      data: {
        studentId,
        classId: classId || null,
        amount: Math.round(value),
        source: source === 'ADJUSTMENT' ? 'ADJUSTMENT' : 'CASH',
        note: note || null,
        effectiveDate: effectiveDate ? new Date(effectiveDate) : new Date(),
        createdByUserId: user.id,
        createdByName: actorName || null,
        createdByRole: user.role,
      }
    });
    res.status(201).json(created);
  } catch (error) {
    console.error('[Payment Adjustment Create]', error);
    res.status(500).json({ message: 'Khong the tao dieu chinh thanh toan' });
  }
});

router.get('/payment-adjustments', authenticateToken, authorizeRoles('ADMIN', 'MANAGER', 'TEACHER'), async (req, res) => {
  const studentId = req.query.studentId as string | undefined;
  try {
    const rows = await prisma.paymentAdjustment.findMany({
      where: studentId ? { studentId } : undefined,
      orderBy: { createdAt: 'desc' },
      include: { student: { select: { id: true, name: true, studentCode: true } } },
      take: 500,
    });
    res.json(rows);
  } catch (error) {
    console.error('[Payment Adjustment List]', error);
    res.status(500).json({ message: 'Khong the lay lich su dieu chinh thanh toan' });
  }
});

// --- Tuition Bills ---

// Preview bill calculation
router.post('/bills/preview', authenticateToken, authorizeRoles('ADMIN', 'MANAGER'), async (req, res) => {
  const { studentId, coveredClassIds, fromDate, toDate } = req.body;
  if (!studentId || !coveredClassIds?.length || !fromDate || !toDate) {
    return res.status(400).json({ message: 'Thiếu thông tin để preview hóa đơn' });
  }

  try {
    const from = new Date(fromDate);
    const to = new Date(toDate);
    from.setHours(0,0,0,0);
    to.setHours(23,59,59,999);

    const classes = await prisma.class.findMany({
      where: { id: { in: coveredClassIds } }
    });

    const sessionsDetail = await Promise.all(classes.map(async (cls) => {
      const attendances = await prisma.attendance.findMany({
        where: {
          studentId,
          classId: cls.id,
          status: 'PRESENT',
          date: { gte: from, lte: to }
        }
      });
      
      const cs = await prisma.classStudent.findUnique({
        where: { classId_studentId: { classId: cls.id, studentId } }
      });

      const sessions = attendances.reduce((sum, att) => sum + (att.sessionUnits || 1), 0);
      const subtotal = expectedForStudentClass(cls as any, studentId, attendances as any, cs || undefined);
      
      return {
        classId: cls.id,
        className: cls.name,
        sessions,
        pricePerSession: (cs?.customTuitionPerSession != null) ? cs.customTuitionPerSession : cls.tuitionPerSession,
        subtotal
      };
    }));


    const amount = sessionsDetail.reduce((sum, item) => sum + item.subtotal, 0);
    res.json({ sessionsDetail, amount });
  } catch (error) {
    res.status(500).json({ message: 'Lỗi preview hóa đơn' });
  }
});

// Record cash payment — creates TuitionBill(PAID) + BillPayment(CASH) + PaymentAdjustment in one TX
router.post('/cash-payment', authenticateToken, authorizeRoles('ADMIN', 'MANAGER'), async (req, res) => {
  const user = (req as any).user;
  const { studentId, coveredClassIds, fromDate, toDate, billingMonth, totalAmountOverride, note, date } = req.body as {
    studentId: string;
    coveredClassIds: string[];
    fromDate: string;
    toDate: string;
    billingMonth?: string;
    totalAmountOverride?: number;
    note?: string;
    date?: string;
  };

  if (!studentId || !coveredClassIds?.length || !fromDate || !toDate) {
    return res.status(400).json({ message: 'Thiếu studentId, coveredClassIds, fromDate hoặc toDate' });
  }

  try {
    const from = new Date(fromDate); from.setHours(0, 0, 0, 0);
    const to = new Date(toDate); to.setHours(23, 59, 59, 999);
    const paidAt = date ? new Date(date) : new Date();

    const classes = await prisma.class.findMany({ where: { id: { in: coveredClassIds } } });

    const sessionsDetail = await Promise.all(classes.map(async (cls) => {
      const attendances = await prisma.attendance.findMany({
        where: { studentId, classId: cls.id, status: 'PRESENT', date: { gte: from, lte: to } }
      });

      const cs = await prisma.classStudent.findUnique({
        where: { classId_studentId: { classId: cls.id, studentId } }
      });

      const sessions = attendances.reduce((sum, att) => sum + (att.sessionUnits || 1), 0);
      const subtotal = expectedForStudentClass(cls as any, studentId, attendances as any, cs || undefined);

      return { 
        classId: cls.id, 
        className: cls.name, 
        sessions, 
        pricePerSession: (cs?.customTuitionPerSession != null) ? cs.customTuitionPerSession : cls.tuitionPerSession, 
        subtotal 
      };
    }));


    const calculatedAmount = sessionsDetail.reduce((sum, it) => sum + it.subtotal, 0);
    const amount = totalAmountOverride ?? calculatedAmount;

    if (amount <= 0) {
      return res.status(400).json({ message: 'Số tiền phải lớn hơn 0' });
    }

    const referenceCode = generateBillCode();

    const result = await prisma.$transaction(async (tx) => {
      const bill = await tx.tuitionBill.create({
        data: {
          studentId,
          coveredClassIds,
          fromDate: from,
          toDate: to,
          amount,
          paidAmount: amount,
          status: 'PAID',
          sessionsDetail: JSON.stringify(sessionsDetail),
          referenceCode,
          billingMonth: billingMonth || null,
          notes: note || null,
          createdByName: user.name || user.username || 'System',
          sentAt: null,
        }
      });

      const payment = await tx.billPayment.create({
        data: { billId: bill.id, amount, source: 'CASH', paidAt, note: note || null }
      });

      await tx.paymentAdjustment.create({
        data: {
          studentId,
          amount,
          source: 'CASH',
          note: `Tiền mặt HĐ ${referenceCode}${note ? '. ' + note : ''}`,
          effectiveDate: paidAt,
          createdByUserId: user.id,
          createdByName: user.name || user.username || 'System',
          createdByRole: user.role,
        }
      });

      await tx.student.update({ where: { id: studentId }, data: { tuitionStatus: 'PAID' } });

      return { bill, payment };
    });

    res.status(201).json(result);
  } catch (error) {
    console.error('[Cash Payment]', error);
    res.status(500).json({ message: 'Lỗi ghi nhận tiền mặt' });
  }
});


// Create bill
router.post('/bills', authenticateToken, authorizeRoles('ADMIN', 'MANAGER'), async (req, res) => {
  const user = (req as any).user;
  const { studentId, coveredClassIds, fromDate, toDate, dueDate, notes } = req.body;

  try {
    const from = new Date(fromDate);
    const to = new Date(toDate);
    from.setHours(0,0,0,0);
    to.setHours(23,59,59,999);

    const classes = await prisma.class.findMany({
      where: { id: { in: coveredClassIds } }
    });

    const detailItems = await Promise.all(classes.map(async (cls) => {
      const [attendances, cs] = await Promise.all([
        prisma.attendance.findMany({
          where: { studentId, classId: cls.id, status: 'PRESENT', date: { gte: from, lte: to } }
        }),
        prisma.classStudent.findUnique({
          where: { classId_studentId: { classId: cls.id, studentId } }
        }),
      ]);
      const sessions = attendances.reduce((sum, att) => sum + (att.sessionUnits || 1), 0);
      const subtotal = expectedForStudentClass(cls as any, studentId, attendances as any, cs || undefined);
      return {
        classId: cls.id,
        className: cls.name,
        sessions,
        pricePerSession: (cs?.customTuitionPerSession != null) ? cs.customTuitionPerSession : cls.tuitionPerSession,
        subtotal
      };
    }));

    const amount = detailItems.reduce((sum, item) => sum + item.subtotal, 0);
    if (amount === 0) return res.status(400).json({ message: 'Hóa đơn có số tiền bằng 0, không thể tạo' });

    const bill = await prisma.tuitionBill.create({
      data: {
        studentId,
        coveredClassIds,
        fromDate: from,
        toDate: to,
        dueDate: dueDate ? new Date(dueDate) : null,
        amount,
        sessionsDetail: JSON.stringify(detailItems),
        referenceCode: generateBillCode(),
        notes,
        createdByName: user.name || user.username || 'System',
        status: 'UNPAID'
      }
    });

    res.status(201).json(bill);
  } catch (error) {
    console.error('[Create Bill]', error);
    res.status(500).json({ message: 'Lỗi tạo hóa đơn' });
  }
});

// List bills
router.get('/bills', authenticateToken, authorizeRoles('ADMIN', 'MANAGER'), async (req, res) => {
  const { studentId, status, from, to } = req.query;
  const where: any = {};
  if (studentId) where.studentId = studentId as string;
  if (status && status !== 'ALL') where.status = status as any;
  if (from || to) {
    where.createdAt = {};
    if (from) where.createdAt.gte = new Date(from as string);
    if (to) { const d = new Date(to as string); d.setHours(23, 59, 59, 999); where.createdAt.lte = d; }
  }

  try {
    const bills = await prisma.tuitionBill.findMany({
      where,
      include: {
        student: { select: { id: true, name: true, studentCode: true } },
        payments: true
      },
      orderBy: { createdAt: 'desc' }
    });
    res.json(bills);
  } catch (error) {
    res.status(500).json({ message: 'Lỗi danh sách hóa đơn' });
  }
});

// Bill detail
router.get('/bills/:id', authenticateToken, authorizeRoles('ADMIN', 'MANAGER'), async (req, res) => {
  try {
    const bill = await prisma.tuitionBill.findUnique({
      where: { id: req.params.id as string },
      include: {
        student: { select: { id: true, name: true, studentCode: true } },
        payments: { orderBy: { paidAt: 'desc' } },
        messageLog: { orderBy: { sentAt: 'desc' }, take: 10 }
      }
    });
    if (!bill) return res.status(404).json({ message: 'Không tìm thấy hóa đơn' });
    res.json(bill);
  } catch (error) {
    res.status(500).json({ message: 'Lỗi chi tiết hóa đơn' });
  }
});

// Cancel bill
router.patch('/bills/:id', authenticateToken, authorizeRoles('ADMIN', 'MANAGER'), async (req, res) => {
  const { status, notes, dueDate } = req.body;
  try {
    const data: any = {};
    if (status === 'CANCELLED') data.status = 'CANCELLED';
    if (notes !== undefined) data.notes = notes;
    if (dueDate !== undefined) data.dueDate = dueDate ? new Date(dueDate) : null;

    const updated = await prisma.tuitionBill.update({
      where: { id: req.params.id as string },
      data
    });
    res.json(updated);
  } catch (error) {
    res.status(500).json({ message: 'Lỗi cập nhật hóa đơn' });
  }
});

// Manual payment for a bill
router.post('/bills/:id/manual-payment', authenticateToken, authorizeRoles('ADMIN', 'MANAGER'), async (req, res) => {
  const user = (req as any).user;
  const { amount, source, note, date } = req.body;
  const billId = req.params.id;

  try {
    const bill = await prisma.tuitionBill.findUnique({ where: { id: billId as string } });
    if (!bill) return res.status(404).json({ message: 'Không tìm thấy hóa đơn' });

    const paidVal = Number(amount);
    const newPaidAmount = bill.paidAmount + paidVal;
    let newStatus: any = 'PARTIAL';
    if (newPaidAmount >= bill.amount) newStatus = 'PAID';

    const result = await prisma.$transaction(async (tx) => {
      // 1. Create payment record linked to bill
      const payment = await tx.billPayment.create({
        data: {
          billId: billId as string,
          amount: paidVal,
          source: source || 'CASH',
          note: note || null,
          paidAt: date ? new Date(date) : new Date()
        }
      });

      // 2. Update bill status and amount
      await tx.tuitionBill.update({
        where: { id: billId as string },
        data: {
          paidAmount: newPaidAmount,
          status: newStatus
        }
      });

      // 3. Create a PaymentAdjustment (Legacy compatibility) so it shows up in general tracking
      await tx.paymentAdjustment.create({
        data: {
          studentId: bill.studentId,
          amount: paidVal,
          source: source === 'ADJUSTMENT' ? 'ADJUSTMENT' : 'CASH',
          note: `Thanh toán cho HĐ ${bill.referenceCode}. ${note || ''}`,
          effectiveDate: date ? new Date(date) : new Date(),
          createdByUserId: user.id,
          createdByName: user.name || user.username || 'System',
          createdByRole: user.role
        }
      });

      return payment;
    });

    res.json(result);
  } catch (error) {
    console.error('[Manual Payment]', error);
    res.status(500).json({ message: 'Lỗi ghi nhận thanh toán' });
  }
});

export default router;

