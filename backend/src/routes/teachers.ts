import { Router } from 'express';
import prisma from '../lib/prisma';
import { authenticateToken, authorizeRoles } from '../middleware/auth';

const router = Router();

// Get all teachers (Admin/Manager only)
router.get('/', authenticateToken, authorizeRoles('ADMIN', 'MANAGER'), async (req, res) => {
  try {
    const teachers = await prisma.teacher.findMany({
      where: { isActive: true },
      include: { user: { select: { username: true } } },
      orderBy: { sortOrder: 'asc' },
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
      where: { id: req.params.id as string, isActive: true },
      include: { classes: true }
    });
    if (!teacher) return res.status(404).json({ message: 'Không tìm thấy giáo viên' });

    const canSeeSalary = ['ADMIN', 'MANAGER'].includes((req as any).user?.role);
    if (canSeeSalary) return res.json(teacher);

    const { hourlyRate, salaryRate, ...safeTeacher } = teacher as any;
    res.json(safeTeacher);
  } catch (error) {
    res.status(500).json({ message: 'Lỗi máy chủ' });
  }
});

// Create teacher (Admin only)
router.post('/', authenticateToken, authorizeRoles('ADMIN', 'MANAGER'), async (req, res) => {
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
      where: { id: req.params.id as string },
      data: req.body
    });
    res.json(teacher);
  } catch (error) {
    res.status(400).json({ message: 'Lỗi khi cập nhật giáo viên' });
  }
});

// Delete teacher (soft delete)
router.delete('/:id', authenticateToken, authorizeRoles('ADMIN', 'MANAGER'), async (req, res) => {
  try {
    await prisma.teacher.update({
      where: { id: req.params.id as string },
      data: { isActive: false }
    });
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ message: 'Lỗi khi xóa giáo viên' });
  }
});

// Reorder teachers
router.post('/reorder', authenticateToken, authorizeRoles('ADMIN', 'MANAGER'), async (req, res) => {
  try {
    const { teacherIds } = req.body;
    if (!Array.isArray(teacherIds)) return res.status(400).json({ message: 'teacherIds must be an array' });

    await prisma.$transaction(
      teacherIds.map((id, index) =>
        prisma.teacher.update({
          where: { id },
          data: { sortOrder: index }
        })
      )
    );
    res.json({ message: 'Đã cập nhật thứ tự' });
  } catch (error) {
    res.status(500).json({ message: 'Lỗi khi cập nhật thứ tự giáo viên' });
  }
});

export default router;
