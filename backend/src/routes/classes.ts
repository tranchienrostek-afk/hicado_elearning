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
        students: { select: { studentId: true } }
      }
    });

    const transformed = classes.map(c => ({
      ...c,
      studentIds: c.students.map(s => s.studentId)
    }));

    res.json(transformed);

  } catch (error) {
    res.status(500).json({ message: 'Lỗi khi lấy danh sách lớp học' });
  }
});

// Get class details with students
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const cls = await prisma.class.findUnique({
      where: { id: req.params.id as string },
      include: {
        teacher: true,
        room: true,
        students: { include: { student: true } },
        attendances: { take: 10, orderBy: { date: 'desc' } }
      }
    });
    if (!cls) return res.status(404).json({ message: 'Không tìm thấy lớp học' });
    
    const transformed = {
      ...cls,
      studentIds: cls.students.map(s => s.studentId)
    };

    res.json(transformed);

  } catch (error) {
    res.status(500).json({ message: 'Lỗi máy chủ' });
  }
});

export default router;
