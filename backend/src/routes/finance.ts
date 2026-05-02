import { Router } from 'express';
import prisma from '../lib/prisma';
import { authenticateToken, authorizeRoles } from '../middleware/auth';
import QRCode from 'qrcode';
import { generateVietQRString } from '../lib/vietqr';

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
    const totalRevenue = await prisma.transaction.aggregate({
      _sum: { amount: true },
      where: { status: 'SUCCESS' }
    });

    const studentStats = await prisma.student.groupBy({
      by: ['tuitionStatus'],
      _count: true
    });

    res.json({
      totalRevenue: totalRevenue._sum.amount || 0,
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
    const amount = classItem.tuitionPerSession * classItem.totalSessions;
    const memo = `${student.studentCode ?? ''} ${classItem.classCode ?? ''} ${student.name}`.trim().toUpperCase().slice(0, 50);

    const qrData = generateVietQRString(bankBin, accountNo, amount, memo);
    const qrImage = await QRCode.toDataURL(qrData, {
      margin: 1,
      color: { dark: '#000000', light: '#ffffff' }
    });

    res.json({ qrImage, student: student.name, className: classItem.name, amount, memo });
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

    const [recentTxs, allClasses, pendingStudents, totalAgg] = await Promise.all([
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
        include: { students: { include: { student: { select: { id: true, tuitionStatus: true } } } } },
      }),
      prisma.student.findMany({
        where: { tuitionStatus: { in: ['PENDING', 'DEBT'] } },
        include: { classes: { include: { class: { select: { id: true, name: true, tuitionPerSession: true, totalSessions: true } } } } },
      }),
      prisma.transaction.aggregate({ _sum: { amount: true }, where: { status: 'SUCCESS' } }),
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

    // Per-class collection
    const collectionByClass = allClasses.map(cls => {
      const studentCount = cls.students.length;
      const expected = cls.tuitionPerSession * cls.totalSessions * studentCount;
      const paidCount = cls.students.filter(cs => cs.student.tuitionStatus === 'PAID').length;
      const collected = cls.tuitionPerSession * cls.totalSessions * paidCount;
      return {
        classId: cls.id, className: cls.name,
        expected, collected, gap: expected - collected,
        rate: expected > 0 ? Math.round((collected / expected) * 100) : 0,
        studentCount, paidCount,
      };
    });

    // Pending students
    const pendingList = pendingStudents.map(s => ({
      id: s.id, name: s.name, studentCode: s.studentCode, tuitionStatus: s.tuitionStatus,
      totalDebt: s.classes.reduce((sum, cs) => sum + cs.class.tuitionPerSession * cs.class.totalSessions, 0),
      classes: s.classes.map(cs => ({ id: cs.class.id, name: cs.class.name })),
    }));

    const totalCollected = totalAgg._sum.amount || 0;
    const totalExpected = allClasses.reduce(
      (sum, cls) => sum + cls.tuitionPerSession * cls.totalSessions * cls.students.length, 0
    );

    res.json({
      totalCollected, totalExpected,
      collectionRate: totalExpected > 0 ? Math.round((totalCollected / totalExpected) * 100) : 0,
      monthlyRevenue,
      collectionByClass,
      pendingStudents: pendingList,
      recentTransactions: recentTxs.map(tx => ({
        id: tx.id, amount: tx.amount, date: tx.date, status: tx.status, content: tx.content,
        studentName: tx.student?.name ?? '—',
        studentCode: tx.student?.studentCode ?? '—',
        classes: tx.student?.classes?.map(cs => cs.class.name).join(', ') ?? '—',
      })),
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

    const classQRs = await Promise.all(
      student.classes.map(async cs => {
        const cls = cs.class;
        const amount = cls.tuitionPerSession * cls.totalSessions;
        const memo = `${student.studentCode ?? student.id} ${cls.classCode ?? cls.id} ${student.name}`.trim().toUpperCase().slice(0, 50);
        const qrData = generateVietQRString(bankBin, accountNo, amount, memo);
        const qrImage = await QRCode.toDataURL(qrData, { margin: 1, color: { dark: '#000000', light: '#ffffff' } });
        return { classId: cls.id, className: cls.name, classCode: cls.classCode, amount, memo, qrImage };
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

// Public QR image endpoint — returns PNG directly for use in Zalo image messages
router.get('/qr-png/:studentId/:classId', async (req, res) => {
  try {
    const [student, classItem, bankCfg] = await Promise.all([
      prisma.student.findUnique({ where: { id: req.params.studentId }, select: { id: true, studentCode: true, name: true } }),
      prisma.class.findUnique({ where: { id: req.params.classId }, select: { id: true, classCode: true, tuitionPerSession: true, totalSessions: true } }),
      prisma.systemConfig.findMany({ where: { key: { in: ['BANK_BIN', 'BANK_ACC'] } } }),
    ]);
    if (!student || !classItem) return res.status(404).end();
    const bm = bankCfg.reduce((a, r) => { a[r.key] = r.value; return a; }, {} as Record<string, string>);
    const amount = classItem.tuitionPerSession * classItem.totalSessions;
    const memo = `${student.studentCode ?? student.id} ${classItem.classCode ?? classItem.id} ${student.name}`.trim().toUpperCase().slice(0, 50);
    const qrData = generateVietQRString(bm.BANK_BIN || process.env.BANK_BIN || '970436', bm.BANK_ACC || process.env.BANK_ACC || '', amount, memo);
    const pngBuffer = await (QRCode as any).toBuffer(qrData, { margin: 1, color: { dark: '#000000', light: '#ffffff' }, type: 'png' });
    res.type('png').send(pngBuffer);
  } catch (err) {
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

    const [students, allTransactions] = await Promise.all([
      prisma.student.findMany({
        where: studentWhere,
        include: {
          classes: { include: { class: { select: { id: true, name: true, classCode: true, tuitionPerSession: true, totalSessions: true } } } },
        },
        orderBy: { name: 'asc' },
      }),
      prisma.transaction.findMany({
        where: txWhere,
        orderBy: { date: 'desc' },
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
      const totalPaid = txList.reduce((sum: number, t: any) => sum + t.amount, 0);
      const totalExpected = s.classes.reduce((sum: number, cs: any) =>
        sum + cs.class.tuitionPerSession * cs.class.totalSessions, 0);
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
          expected: cs.class.tuitionPerSession * cs.class.totalSessions,
        })),
        totalExpected, totalPaid, totalBalance,
        paymentStatus,
        transactions: txList.map((t: any) => ({
          id: t.id, amount: t.amount,
          date: t.date, content: t.content,
          classId: t.classId,
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

export default router;
