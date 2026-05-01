import { Router } from 'express';
import prisma from '../lib/prisma';
import { authenticateToken, authorizeRoles } from '../middleware/auth';

const router = Router();

router.get('/', authenticateToken, async (req, res) => {
  try {
    res.json(await prisma.room.findMany());
  } catch { res.status(500).json({ message: 'Lỗi khi lấy danh sách phòng' }); }
});

router.post('/', authenticateToken, authorizeRoles('ADMIN', 'MANAGER'), async (req, res) => {
  try {
    const { name, center, capacity, notes } = req.body;
    const room = await prisma.room.create({ data: { name, center, capacity: Number(capacity), notes } });
    res.status(201).json(room);
  } catch (err: any) {
    res.status(500).json({ message: err.message || 'Lỗi tạo phòng học' });
  }
});

router.put('/:id', authenticateToken, authorizeRoles('ADMIN', 'MANAGER'), async (req, res) => {
  try {
    const { name, center, capacity, notes } = req.body;
    const room = await prisma.room.update({
      where: { id: String(req.params.id) },
      data: { name, center, capacity: Number(capacity), notes },
    });
    res.json(room);
  } catch (err: any) {
    res.status(500).json({ message: err.message || 'Lỗi cập nhật phòng học' });
  }
});

router.delete('/:id', authenticateToken, authorizeRoles('ADMIN', 'MANAGER'), async (req, res) => {
  try {
    await prisma.room.delete({ where: { id: String(req.params.id) } });
    res.json({ message: 'Đã xóa phòng học' });
  } catch (err: any) {
    res.status(500).json({ message: err.message || 'Lỗi xóa phòng học' });
  }
});

export default router;
