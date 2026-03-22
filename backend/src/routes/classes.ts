import { Router } from 'express';
import prisma from '../lib/prisma';
import { authenticateToken, authorizeRoles } from '../middleware/auth';

const router = Router();

// Get all classes
router.get('/', authenticateToken, async (req, res) => {
  try {
    const classes = await prisma.class.findMany({
      include: {
        teacher: { select: { name: true } },
        room: { select: { name: true } },
        _count: { select: { students: true } }
      }
    });
    res.json(classes);
  } catch (error) {
    res.status(500).json({ message: 'Lỗi khi lấy danh sách lớp học' });
  }
});

// Get class details with students
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const cls = await prisma.class.findUnique({
      where: { id: req.params.id },
      include: {
        teacher: true,
        room: true,
        students: { include: { student: true } },
        attendances: { take: 10, orderBy: { date: 'desc' } }
      }
    });
    if (!cls) return res.status(404).json({ message: 'Không tìm thấy lớp học' });
    res.json(cls);
  } catch (error) {
    res.status(500).json({ message: 'Lỗi máy chủ' });
  }
});

export default router;
