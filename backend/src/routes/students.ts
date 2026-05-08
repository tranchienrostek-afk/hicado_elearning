import { Router } from 'express';
import prisma from '../lib/prisma';
import { authenticateToken, authorizeRoles } from '../middleware/auth';

const router = Router();

// Get students - STUDENT role only sees their own record
router.get('/', authenticateToken, async (req: any, res) => {
  try {
    if (req.user.role === 'STUDENT') {
      const students = await prisma.student.findMany({
        where: { id: req.user.studentId, isActive: true }
      });
      return res.json(students);
    }
    if (!['ADMIN', 'MANAGER', 'TEACHER'].includes(req.user.role)) {
      return res.status(403).json({ message: 'Insufficient permissions' });
    }
    const students = await prisma.student.findMany({
      where: { isActive: true },
      include: { classes: { select: { classId: true } } },
      orderBy: { sortOrder: 'asc' },
    });
    res.json(students);
  } catch (error) {
    res.status(500).json({ message: 'Lỗi khi lấy danh sách học sinh' });
  }
});

// Create student
router.post('/', authenticateToken, authorizeRoles('ADMIN', 'MANAGER'), async (req, res) => {
  try {
    const { forceCreate, ...studentData } = req.body;
    const { name, birthYear } = studentData;

    if (name && birthYear && !forceCreate) {
      const existing = await prisma.student.findFirst({
        where: {
          name: { equals: name, mode: 'insensitive' },
          birthYear: Number(birthYear),
          isActive: true
        }
      });
      if (existing) {
        return res.status(409).json({
          message: `Học sinh "${name}" sinh năm ${birthYear} đã tồn tại trong hệ thống.`,
          existingId: existing.id
        });
      }
    }

    const student = await prisma.student.create({ data: studentData });
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

// Delete student (soft delete)
router.delete('/:id', authenticateToken, authorizeRoles('ADMIN', 'MANAGER'), async (req, res) => {
  try {
    await prisma.student.update({
      where: { id: req.params.id as string },
      data: { isActive: false }
    });
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ message: 'Lỗi khi xóa học sinh' });
  }
});

// Reorder students
router.post('/reorder', authenticateToken, authorizeRoles('ADMIN', 'MANAGER'), async (req, res) => {
  try {
    const { studentIds } = req.body; // Array of IDs in new order
    if (!Array.isArray(studentIds)) return res.status(400).json({ message: 'studentIds must be an array' });

    await prisma.$transaction(
      studentIds.map((id, index) =>
        prisma.student.update({
          where: { id },
          data: { sortOrder: index }
        })
      )
    );
    res.json({ message: 'Đã cập nhật thứ tự' });
  } catch (error) {
    res.status(500).json({ message: 'Lỗi khi cập nhật thứ tự học sinh' });
  }
});

export default router;
