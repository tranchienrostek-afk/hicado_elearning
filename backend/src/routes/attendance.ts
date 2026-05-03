import { Router } from 'express';
import prisma from '../lib/prisma';
import { authenticateToken } from '../middleware/auth';

const router = Router();

// Get attendance for a class on a specific date
router.get('/:classId', authenticateToken, async (req, res) => {
  const { date } = req.query;
  const classId = req.params.classId as string;

  try {
    const records = await prisma.attendance.findMany({
      where: {
        classId,
        date: date ? new Date(date as string) : undefined
      }
    });
    res.json(records);
  } catch (error) {
    res.status(500).json({ message: 'Lỗi khi lấy dữ liệu điểm danh' });
  }
});

// Mark attendance
router.post('/mark', authenticateToken, async (req, res) => {
  const { classId, studentId, date, status, note } = req.body;
  const user = (req as any).user;

  try {
    const markerName = user.name ?? (
      await prisma.user.findUnique({ where: { id: user.id }, select: { name: true } })
    )?.name;

    const record = await prisma.attendance.upsert({
      where: {
        classId_studentId_date: {
          classId,
          studentId,
          date: new Date(date)
        }
      },
      update: {
        status,
        note,
        markedByUserId: user.id,
        markedByName: markerName,
        markedByRole: user.role,
        markedAt: new Date()
      },
      create: {
        classId,
        studentId,
        date: new Date(date),
        status,
        note,
        markedByUserId: user.id,
        markedByName: markerName,
        markedByRole: user.role,
        markedAt: new Date()
      }
    });
    res.json(record);
  } catch (error) {
    console.error(error);
    res.status(400).json({ message: 'Lỗi khi ghi nhận điểm danh' });
  }
});

export default router;
