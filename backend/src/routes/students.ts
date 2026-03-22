import { Router } from 'express';
import prisma from '../lib/prisma';
import { authenticateToken, authorizeRoles } from '../middleware/auth';

const router = Router();

// Get all students
router.get('/', authenticateToken, authorizeRoles('ADMIN', 'MANAGER', 'TEACHER'), async (req, res) => {
  try {
    const students = await prisma.student.findMany();
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
      where: { id: req.params.id },
      data: req.body
    });
    res.json(student);
  } catch (error) {
    res.status(400).json({ message: 'Lỗi khi cập nhật học sinh' });
  }
});

export default router;
