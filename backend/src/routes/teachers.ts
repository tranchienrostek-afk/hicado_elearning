import { Router } from 'express';
import prisma from '../lib/prisma';
import { authenticateToken, authorizeRoles } from '../middleware/auth';

const router = Router();

// Get all teachers (Admin/Manager only)
router.get('/', authenticateToken, authorizeRoles('ADMIN', 'MANAGER'), async (req, res) => {
  try {
    const teachers = await prisma.teacher.findMany({
      include: { user: { select: { username: true } } }
    });
    res.json(teachers);
  } catch (error) {
    res.status(500).json({ message: 'Lỗi khi lấy danh sách giáo viên' });
  }
});

// Get single teacher details
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const teacher = await prisma.teacher.findUnique({
      where: { id: req.params.id },
      include: { classes: true }
    });
    if (!teacher) return res.status(404).json({ message: 'Không tìm thấy giáo viên' });
    res.json(teacher);
  } catch (error) {
    res.status(500).json({ message: 'Lỗi máy chủ' });
  }
});

// Create teacher (Admin only)
router.post('/', authenticateToken, authorizeRoles('ADMIN'), async (req, res) => {
  try {
    const teacher = await prisma.teacher.create({
      data: req.body
    });
    res.status(201).json(teacher);
  } catch (error) {
    res.status(400).json({ message: 'Lỗi khi tạo giáo viên' });
  }
});

// Update teacher
router.put('/:id', authenticateToken, authorizeRoles('ADMIN', 'MANAGER'), async (req, res) => {
  try {
    const teacher = await prisma.teacher.update({
      where: { id: req.params.id },
      data: req.body
    });
    res.json(teacher);
  } catch (error) {
    res.status(400).json({ message: 'Lỗi khi cập nhật giáo viên' });
  }
});

export default router;
