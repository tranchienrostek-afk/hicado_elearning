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

export default router;
