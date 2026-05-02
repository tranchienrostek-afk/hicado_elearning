import { Router } from 'express';
import prisma from '../lib/prisma';
import { authenticateToken, authorizeRoles } from '../middleware/auth';

const router = Router();

// Get students - STUDENT role only sees their own record
router.get('/', authenticateToken, async (req: any, res) => {
  try {
    if (req.user.role === 'STUDENT') {
      const students = await prisma.student.findMany({
        where: { id: req.user.studentId }
      });
      return res.json(students);
    }
    if (!['ADMIN', 'MANAGER', 'TEACHER'].includes(req.user.role)) {
      return res.status(403).json({ message: 'Insufficient permissions' });
    }
    const students = await prisma.student.findMany({
      include: { classes: { select: { classId: true } } },
    });
    res.json(students);
  } catch (error) {
    res.status(500).json({ message: 'Lỗi khi lấy danh sách học sinh' });
  }
});

// Create student
router.post('/', authenticateToken, authorizeRoles('ADMIN', 'MANAGER'), async (req, res) => {
  try {
    const student = await prisma.student.create({
      data: req.body
    });
    res.status(201).json(student);
  } catch (error) {
    res.status(400).json({ message: 'Lỗi khi tạo học sinh' });
  }
});

// Update student
router.put('/:id', authenticateToken, authorizeRoles('ADMIN', 'MANAGER'), async (req, res) => {
  try {
    const student = await prisma.student.update({
      where: { id: req.params.id as string },
      data: req.body
    });
    res.json(student);
  } catch (error) {
    res.status(400).json({ message: 'Lỗi khi cập nhật học sinh' });
  }
});

export default router;
