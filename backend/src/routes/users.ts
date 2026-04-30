import { Router, Response } from 'express';
import bcrypt from 'bcryptjs';
import prisma from '../lib/prisma';
import { authenticateToken, authorizeRoles, AuthRequest } from '../middleware/auth';

const router = Router();

// Get all users (Admin only)
router.get('/', authenticateToken, authorizeRoles('ADMIN', 'MANAGER'), async (req: AuthRequest, res: Response) => {
  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        username: true,
        role: true,
        name: true,
        teacherId: true,
        studentId: true,
        createdAt: true,
      },
    });
    res.json(users);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching users' });
  }
});

// Create a new user account
router.post('/', authenticateToken, authorizeRoles('ADMIN', 'MANAGER'), async (req: AuthRequest, res: Response) => {
  const { username, password, role, name, teacherId, studentId } = req.body;

  try {
    const existingUser = await prisma.user.findUnique({ where: { username } });
    if (existingUser) {
      return res.status(400).json({ message: 'Username already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: {
        username,
        password: hashedPassword,
        role,
        name,
        teacherId: teacherId || null,
        studentId: studentId || null,
      },
    });

    const { password: _, ...userWithoutPassword } = user;
    res.status(201).json(userWithoutPassword);
  } catch (error: any) {
    console.error('Error creating user:', error);
    if (error.code === 'P2002') {
      const target = error.meta?.target || [];
      if (target.includes('username')) {
        return res.status(400).json({ message: 'Tên tài khoản này đã được sử dụng' });
      }
      if (target.includes('teacherId')) {
        return res.status(400).json({ message: 'Giáo viên này đã có tài khoản truy cập' });
      }
      if (target.includes('studentId')) {
        return res.status(400).json({ message: 'Học sinh này đã có tài khoản truy cập' });
      }
    }
    res.status(500).json({ message: 'Lỗi khi tạo tài khoản' });
  }
});


// Update a user account
router.patch('/:id', authenticateToken, authorizeRoles('ADMIN', 'MANAGER'), async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { username, password, role, name } = req.body;

  try {
    const updateData: any = {};
    if (username) updateData.username = username;
    if (password) updateData.password = await bcrypt.hash(password, 10);
    if (role) updateData.role = role;
    if (name) updateData.name = name;

    const user = await prisma.user.update({
      where: { id: id as string },
      data: updateData,
    });

    const { password: _, ...userWithoutPassword } = user;
    res.json(userWithoutPassword);
  } catch (error) {
    res.status(500).json({ message: 'Error updating user' });
  }
});

// Delete a user account
router.delete('/:id', authenticateToken, authorizeRoles('ADMIN', 'MANAGER'), async (req: AuthRequest, res: Response) => {
  const { id } = req.params;

  try {
    await prisma.user.delete({ where: { id: id as string } });
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ message: 'Error deleting user' });
  }
});

export default router;
