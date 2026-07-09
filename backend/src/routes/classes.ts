import { Router } from 'express';
import prisma from '../lib/prisma';
import { authenticateToken, authorizeRoles } from '../middleware/auth';

const router = Router();

const toClient = (c: any) => ({
  ...c,
  studentIds: c.students?.map((s: any) => s.studentId) ?? c.studentIds ?? [],
  schedule: { days: c.scheduleDays ?? [], time: c.scheduleTime ?? '' },
});

// teacherShare is the internal center/teacher revenue-split ratio — not relevant to
// students or teachers themselves. A student also has no legitimate reason to see
// another classmate's individual discount (customTuitionPerSession/discountFrom/To/
// discountReason) via the generic class roster endpoint.
const sanitizeForRole = (c: any, req: any) => {
  const role = req.user?.role;
  const out = { ...c };
  if (role !== 'ADMIN' && role !== 'MANAGER') delete out.teacherShare;
  if (role === 'STUDENT' && Array.isArray(out.students)) {
    out.students = out.students.map((s: any) => {
      if (s.studentId === req.user?.studentId) return s;
      const { customTuitionPerSession, discountFrom, discountTo, discountReason, ...rest } = s;
      return rest;
    });
  }
  return out;
};

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
    res.json(classes.map(c => sanitizeForRole(toClient(c), req)));
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
    res.json(sanitizeForRole(toClient(cls), req));
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

    const cls = await prisma.$transaction(async (tx) => {
      await tx.class.update({
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
        },
      });

      // Diff the roster instead of deleteMany+recreate — a blanket delete wipes
      // customTuitionPerSession/discountFrom/discountTo/discountReason for every
      // student still in the class on every class edit, even one that only
      // changes the name or schedule. Only touch rows that actually change.
      if (studentIds != null) {
        const existing = await tx.classStudent.findMany({ where: { classId: id }, select: { studentId: true } });
        const existingIds = new Set(existing.map(e => e.studentId));
        const nextIds = new Set(studentIds as string[]);

        const toRemove = [...existingIds].filter(sid => !nextIds.has(sid));
        const toAdd = [...nextIds].filter(sid => !existingIds.has(sid));

        if (toRemove.length) {
          await tx.classStudent.deleteMany({ where: { classId: id, studentId: { in: toRemove } } });
        }
        if (toAdd.length) {
          await tx.classStudent.createMany({ data: toAdd.map(sid => ({ classId: id, studentId: sid })) });
        }
      }

      return tx.class.findUnique({
        where: { id },
        include: { students: { select: { studentId: true } } },
      });
    });

    res.json(toClient(cls));
  } catch (err: any) {
    res.status(500).json({ message: err.message || 'Lỗi cập nhật lớp học' });
  }
});

router.delete('/:id', authenticateToken, authorizeRoles('ADMIN', 'MANAGER'), async (req, res) => {
  try {
    const id = String(req.params.id);
    const [attendanceCount, billCount, transactionCount] = await Promise.all([
      prisma.attendance.count({ where: { classId: id } }),
      prisma.tuitionBill.count({ where: { coveredClassIds: { has: id } } }),
      prisma.transaction.count({ where: { classId: id } }),
    ]);
    if (attendanceCount > 0 || billCount > 0 || transactionCount > 0) {
      return res.status(409).json({
        message: `Không thể xóa lớp học đã có dữ liệu (${attendanceCount} điểm danh, ${billCount} hóa đơn, ${transactionCount} giao dịch). Hãy lưu trữ (ẩn) lớp thay vì xóa.`,
      });
    }
    await prisma.class.delete({ where: { id } });
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

