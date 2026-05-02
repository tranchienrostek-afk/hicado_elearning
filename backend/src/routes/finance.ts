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
    const memo = `${student.studentCode ?? ''} ${classItem.classCode ?? ''}`.trim().toUpperCase();

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
        const memo = `${student.studentCode ?? student.id} ${cls.classCode ?? cls.id}`.trim().toUpperCase();
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

export default router;
