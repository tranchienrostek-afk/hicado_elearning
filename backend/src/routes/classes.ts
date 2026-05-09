import { Router } from 'express';
import prisma from '../lib/prisma';
import { authenticateToken, authorizeRoles } from '../middleware/auth';

const router = Router();

const toClient = (c: any) => ({
  ...c,
  studentIds: c.students?.map((s: any) => s.studentId) ?? c.studentIds ?? [],
  schedule: { days: c.scheduleDays ?? [], time: c.scheduleTime ?? '' },
});

router.get('/', authenticateToken, async (req, res) => {
  try {
    const classes = await prisma.class.findMany({
      include: {
        teacher: { select: { name: true } },
        room: { select: { name: true } },
        students: { 
          select: { 
            studentId: true,
            customTuitionPerSession: true,
            discountFrom: true,
            discountTo: true,
            discountReason: true
          } 
        }

      }
    });
    res.json(classes.map(toClient));
  } catch { res.status(500).json({ message: 'Lỗi khi lấy danh sách lớp học' }); }
});

router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const cls = await prisma.class.findUnique({
      where: { id: String(req.params.id) },
      include: {
        teacher: true,
        room: true,
        students: { 
          include: { 
            student: true 
          } 
        },

        attendances: { take: 10, orderBy: { date: 'desc' } }
      }
    });
    if (!cls) return res.status(404).json({ message: 'Không tìm thấy lớp học' });
    res.json(toClient(cls));
  } catch { res.status(500).json({ message: 'Lỗi máy chủ' }); }
});

router.post('/', authenticateToken, authorizeRoles('ADMIN', 'MANAGER'), async (req, res) => {
  try {
    const { name, teacherId, roomId, tuitionPerSession, totalSessions, teacherShare, schedule, studentIds = [] } = req.body;
    const cls = await prisma.class.create({
      data: {
        name,
        teacherId,
        roomId: roomId || null,
        tuitionPerSession: Number(tuitionPerSession),
        totalSessions: Number(totalSessions),
        teacherShare: teacherShare != null ? Number(teacherShare) / 100 : null,
        scheduleDays: schedule?.days ?? [],
        scheduleTime: schedule?.time ?? null,
        students: { create: (studentIds as string[]).map((id: string) => ({ studentId: id })) },
      },
      include: { students: { select: { studentId: true } } }
    });
    res.status(201).json(toClient(cls));
  } catch (err: any) {
    res.status(500).json({ message: err.message || 'Lỗi tạo lớp học' });
  }
});

router.put('/:id', authenticateToken, authorizeRoles('ADMIN', 'MANAGER'), async (req, res) => {
  try {
    const id = String(req.params.id);
    const { name, teacherId, roomId, tuitionPerSession, totalSessions, teacherShare, schedule, studentIds } = req.body;
    const cls = await prisma.class.update({
      where: { id },
      data: {
        name,
        teacherId,
        roomId: roomId || null,
        tuitionPerSession: Number(tuitionPerSession),
        totalSessions: Number(totalSessions),
        teacherShare: teacherShare != null ? Number(teacherShare) / 100 : null,
        scheduleDays: schedule?.days ?? [],
        scheduleTime: schedule?.time ?? null,
        ...(studentIds != null && {
          students: {
            deleteMany: {},
            create: (studentIds as string[]).map((sid: string) => ({ studentId: sid })),
          }
        }),
      },
      include: { students: { select: { studentId: true } } }
    });
    res.json(toClient(cls));
  } catch (err: any) {
    res.status(500).json({ message: err.message || 'Lỗi cập nhật lớp học' });
  }
});

router.delete('/:id', authenticateToken, authorizeRoles('ADMIN', 'MANAGER'), async (req, res) => {
  try {
    await prisma.class.delete({ where: { id: String(req.params.id) } });
    res.json({ message: 'Đã xóa lớp học' });
  } catch (err: any) {
    res.status(500).json({ message: err.message || 'Lỗi xóa lớp học' });
  }
});

// Reorder classes
router.post('/reorder', authenticateToken, authorizeRoles('ADMIN', 'MANAGER'), async (req, res) => {
  try {
    const { classIds } = req.body;
    if (!Array.isArray(classIds)) return res.status(400).json({ message: 'classIds must be an array' });

    await prisma.$transaction(
      classIds.map((id, index) =>
        prisma.class.update({
          where: { id },
          data: { sortOrder: index }
        })
      )
    );
    res.json({ message: 'Đã cập nhật thứ tự' });
  } catch (error) {
    res.status(500).json({ message: 'Lỗi khi cập nhật thứ tự lớp học' });
  }
});

// Tuition override for a student in a class
router.put('/:classId/students/:studentId/tuition-override', authenticateToken, authorizeRoles('ADMIN', 'MANAGER'), async (req, res) => {
  try {
    const { classId, studentId } = req.params as { classId: string, studentId: string };

    const { customTuitionPerSession, discountFrom, discountTo, discountReason } = req.body;

    const updated = await prisma.classStudent.update({
      where: { classId_studentId: { classId, studentId } },
      data: {
        customTuitionPerSession: customTuitionPerSession === null ? null : Number(customTuitionPerSession),
        discountFrom: discountFrom ? new Date(discountFrom) : null,
        discountTo: discountTo ? new Date(discountTo) : null,
        discountReason: discountReason || null,
      }
    });

    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ message: err.message || 'Lỗi cập nhật học phí đặc biệt' });
  }
});

export default router;

