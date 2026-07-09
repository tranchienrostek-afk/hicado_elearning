import { Router } from 'express';
import prisma from '../lib/prisma';
import { authenticateToken, authorizeRoles } from '../middleware/auth';
import { expectedForStudentClass, resolveTeacherShareRate } from '../lib/financeMath';
import { startOfDayUTC, endOfDayUTC, monthRangeUTC } from '../lib/dateRange';

const router = Router();
const allowedSlots = ['MORNING', 'AFTERNOON', 'EVENING', 'CUSTOM'] as const;

// GET /api/attendance/monthly-report?classId=xxx&month=2026-05
router.get('/monthly-report', authenticateToken, async (req, res) => {
  const { classId, month } = req.query as { classId: string; month: string };
  if (!classId || !month) return res.status(400).json({ message: 'Thiếu classId hoặc month' });

  // month = "2026-05" → dateFrom = 2026-05-01, dateTo = 2026-05-31 (UTC — attendance dates are stored at UTC midnight)
  const [year, mon] = month.split('-').map(Number);
  const { from: dateFrom, to: dateTo } = monthRangeUTC(year, mon);

  try {
    const [cls, records] = await Promise.all([
      prisma.class.findUnique({
        where: { id: classId },
        include: {
          teacher: { select: { name: true, salaryType: true, hourlyRate: true, salaryRate: true } },
          students: { include: { student: { select: { id: true, name: true, studentCode: true } } } },
        },
      }),
      prisma.attendance.findMany({
        where: { classId, date: { gte: dateFrom, lte: dateTo } },
        orderBy: [{ date: 'asc' }, { slot: 'asc' }],
      }),
    ]);

    if (!cls) return res.status(404).json({ message: 'Không tìm thấy lớp học' });

    // Build unique session columns: [{ date: "2026-05-03", slot: "EVENING" }, ...]
    const sessionSet = new Map<string, string>();
    for (const r of records) {
      const key = `${r.date.toISOString().slice(0, 10)}__${r.slot}`;
      sessionSet.set(key, r.date.toISOString().slice(0, 10));
    }
    const sessions = [...sessionSet.keys()].map(k => {
      const [date, slot] = k.split('__');
      return { date, slot };
    });

    // Per-student summary
    const students = cls.students.map((cs) => {
      const s = cs.student;
      const studentRecords = records.filter(r => r.studentId === s.id);
      const presentRecords = studentRecords.filter(r => r.status === 'PRESENT');
      const totalSessionUnits = presentRecords.reduce((sum, r) => sum + r.sessionUnits, 0);
      return {
        id: s.id,
        name: s.name,
        studentCode: s.studentCode,
        records: studentRecords.map(r => ({
          date: r.date.toISOString().slice(0, 10),
          slot: r.slot,
          status: r.status,
          sessionUnits: r.sessionUnits,
        })),
        totalPresent: presentRecords.length,
        totalSessionUnits,
        tuitionDue: expectedForStudentClass(cls as any, s.id, presentRecords as any, cs),
      };
    });

    const totalTuition = students.reduce((sum, s) => sum + s.tuitionDue, 0);
    const shareRate = resolveTeacherShareRate((cls as any).teacherShare, cls.teacher.salaryRate);
    const teacherSalary = cls.teacher.salaryType === 'HOURLY'
      ? sessions.length * (cls.teacher.hourlyRate || 0)
      : Math.round(totalTuition * shareRate);

    const totalUniqueDates = new Set(sessions.map(s => s.date)).size;
    const totalPresentCount = students.reduce((sum, s) => sum + s.totalPresent, 0);
    const totalPossibleAttendance = students.length * sessions.length;
    const avgAttendanceRate = totalPossibleAttendance > 0 
      ? Math.round((totalPresentCount / totalPossibleAttendance) * 100) 
      : 0;

    res.json({
      classId: cls.id,
      className: cls.name,
      classCode: cls.classCode,
      tuitionPerSession: cls.tuitionPerSession,
      teacher: { 
        name: cls.teacher.name,
        salary: teacherSalary,
        salaryType: cls.teacher.salaryType
      },
      month,
      sessions,
      students,
      summary: {
        totalStudents: students.length,
        totalUniqueDates,
        totalSessions: sessions.length,
        avgAttendanceRate,
        totalTuition,
        teacherSalary
      },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Lỗi khi tạo báo cáo điểm danh tháng' });
  }
});

// GET /api/attendance/overview?classId=xxx&fromDate=2026-05-01&toDate=2026-05-31
router.get('/overview', authenticateToken, async (req, res) => {
  const { classId, fromDate, toDate } = req.query as Record<string, string>;
  if (!classId || !fromDate || !toDate)
    return res.status(400).json({ message: 'Thiếu classId, fromDate hoặc toDate' });

  let from: Date, to: Date;
  try {
    from = startOfDayUTC(fromDate);
    to = endOfDayUTC(toDate);
  } catch {
    return res.status(400).json({ message: 'fromDate hoặc toDate không hợp lệ' });
  }
  if (from > to)
    return res.status(400).json({ message: 'fromDate phải trước toDate' });

  try {
    const [cls, records] = await Promise.all([
      prisma.class.findUnique({
        where: { id: classId },
        include: {
          teacher: { select: { name: true, salaryType: true, hourlyRate: true, salaryRate: true } },
          students: { include: { student: { select: { id: true, name: true, studentCode: true } } } },
        },
      }),
      prisma.attendance.findMany({
        where: { classId, date: { gte: from, lte: to } },
        orderBy: [{ date: 'asc' }, { slot: 'asc' }],
      }),
    ]);

    if (!cls) return res.status(404).json({ message: 'Không tìm thấy lớp học' });

    const sessionSet = new Set(records.map(r => `${r.date.toISOString().slice(0, 10)}__${r.slot}`));
    const totalClassSessions = sessionSet.size;

    const SLOT_ORDER: Record<string, number> = { MORNING: 1, AFTERNOON: 2, EVENING: 3, CUSTOM: 4 };
    const sessions = Array.from(sessionSet)
      .map(s => {
        const [date, slot] = s.split('__');
        return { date, slot };
      })
      .sort((a, b) => {
        if (a.date !== b.date) return a.date.localeCompare(b.date);
        return (SLOT_ORDER[a.slot] || 99) - (SLOT_ORDER[b.slot] || 99);
      });

    const students = cls.students.map((cs) => {
      const s = cs.student;
      const stuRecs = records.filter(r => r.studentId === s.id);
      
      const sessionRecords = sessions.map(sess => {
        const rec = stuRecs.find(r => r.date.toISOString().slice(0, 10) === sess.date && r.slot === sess.slot);
        return {
          date: sess.date,
          slot: sess.slot,
          status: rec ? rec.status : null
        };
      });

      const presentRecs = stuRecs.filter(r => r.status === 'PRESENT');
      const absentRecs  = stuRecs.filter(r => r.status === 'ABSENT' || r.status === 'LEAVE_REQUEST');
      const totalSessionUnits = presentRecs.reduce((sum, r) => sum + r.sessionUnits, 0);

      return {
        studentId:    s.id,
        studentName:  s.name,
        studentCode:  s.studentCode,
        sessionCount: totalClassSessions,
        presentCount: presentRecs.length,
        absentCount:  absentRecs.length,
        amount:       expectedForStudentClass(cls as any, s.id, presentRecs as any, cs),
        sessionRecords,
      };
    });

    res.json({
      classId:            cls.id,
      className:          cls.name,
      tuitionPerSession:  cls.tuitionPerSession,
      fromDate,
      toDate,
      totalClassSessions,
      sessions,
      summary: {
        studentCount:  students.length,
        totalPresent:  students.reduce((sum, s) => sum + s.presentCount, 0),
        totalAbsent:   students.reduce((sum, s) => sum + s.absentCount, 0),
        totalAmount:   students.reduce((sum, s) => sum + s.amount, 0),
        teacherSalary: cls.teacher.salaryType === 'HOURLY'
          ? sessions.length * (cls.teacher.hourlyRate || 0)
          : Math.round(students.reduce((sum, s) => sum + s.amount, 0) * resolveTeacherShareRate((cls as any).teacherShare, cls.teacher.salaryRate))
      },
      students,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Lỗi khi tạo tổng quan điểm danh' });
  }
});

// Get attendance for a class on a specific date
router.get('/:classId', authenticateToken, async (req, res) => {
  const { date, slot } = req.query;
  const classId = req.params.classId as string;

  try {
    const records = await prisma.attendance.findMany({
      where: {
        classId,
        date: date ? new Date(date as string) : undefined,
        slot: typeof slot === 'string' && allowedSlots.includes(slot as any) ? (slot as any) : undefined,
      },
      orderBy: [{ date: 'desc' }, { slot: 'asc' }, { studentId: 'asc' }],
    });
    res.json(records);
  } catch (error) {
    res.status(500).json({ message: 'Loi khi lay du lieu diem danh' });
  }
});

// Mark attendance
router.post('/mark', authenticateToken, authorizeRoles('ADMIN', 'MANAGER', 'TEACHER'), async (req, res) => {
  const { classId, studentId, date, status, note, slot = 'MORNING', sessionUnits = 1, reason } = req.body;
  const user = (req as any).user;

  try {
    const normalizedSlot = allowedSlots.includes(slot) ? slot : 'MORNING';
    const normalizedSessionUnits = Number(sessionUnits);
    if (!Number.isFinite(normalizedSessionUnits) || normalizedSessionUnits <= 0) {
      return res.status(400).json({ message: 'sessionUnits phai lon hon 0' });
    }

    const markerName = user.name ?? (
      await prisma.user.findUnique({ where: { id: user.id }, select: { name: true } })
    )?.name;

    let normalizedDate: Date;
    try {
      normalizedDate = startOfDayUTC(date);
    } catch {
      return res.status(400).json({ message: 'date khong hop le' });
    }

    const existing = await prisma.attendance.findUnique({
      where: {
        classId_studentId_date_slot: {
          classId,
          studentId,
          date: normalizedDate,
          slot: normalizedSlot,
        }
      }
    });

    const record = await prisma.attendance.upsert({
      where: {
        classId_studentId_date_slot: {
          classId,
          studentId,
          date: normalizedDate,
          slot: normalizedSlot,
        }
      },
      update: {
        status,
        note,
        sessionUnits: normalizedSessionUnits,
        markedByUserId: user.id,
        markedByName: markerName,
        markedByRole: user.role,
        markedAt: new Date()
      },
      create: {
        classId,
        studentId,
        date: normalizedDate,
        slot: normalizedSlot,
        sessionUnits: normalizedSessionUnits,
        status,
        note,
        markedByUserId: user.id,
        markedByName: markerName,
        markedByRole: user.role,
        markedAt: new Date()
      }
    });

    await prisma.attendanceAudit.create({
      data: {
        attendanceId: record.id,
        action: existing ? 'UPDATE' : 'CREATE',
        reason: reason || null,
        classId: record.classId,
        studentId: record.studentId,
        oldStudentId: existing?.studentId || null,
        date: record.date,
        oldDate: existing?.date || null,
        slot: record.slot,
        oldSlot: existing?.slot || null,
        status: record.status,
        oldStatus: existing?.status || null,
        sessionUnits: record.sessionUnits,
        oldSessionUnits: existing?.sessionUnits || null,
        note: record.note || null,
        oldNote: existing?.note || null,
        changedByUserId: user.id,
        changedByName: markerName || null,
        changedByRole: user.role,
      }
    });

    res.json(record);
  } catch (error) {
    console.error(error);
    res.status(400).json({ message: 'Loi khi ghi nhan diem danh' });
  }
});

// Edit wrong attendance entry
router.patch('/:id', authenticateToken, authorizeRoles('ADMIN', 'MANAGER', 'TEACHER'), async (req, res) => {
  const id = req.params.id as string;
  const { classId, studentId, date, slot, status, note, sessionUnits, reason } = req.body;
  const user = (req as any).user;

  try {
    const existing = await prisma.attendance.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ message: 'Khong tim thay ban ghi diem danh' });

    const markerName = user.name ?? (
      await prisma.user.findUnique({ where: { id: user.id }, select: { name: true } })
    )?.name;

    const nextSlot = allowedSlots.includes(slot) ? slot : existing.slot;
    const nextSessionUnits = sessionUnits != null ? Number(sessionUnits) : existing.sessionUnits;
    if (!Number.isFinite(nextSessionUnits) || nextSessionUnits <= 0) {
      return res.status(400).json({ message: 'sessionUnits phai lon hon 0' });
    }

    let nextDate = existing.date;
    if (date) {
      try {
        nextDate = startOfDayUTC(date);
      } catch {
        return res.status(400).json({ message: 'date khong hop le' });
      }
    }

    const updated = await prisma.attendance.update({
      where: { id },
      data: {
        classId: classId ?? existing.classId,
        studentId: studentId ?? existing.studentId,
        date: nextDate,
        slot: nextSlot,
        status: status ?? existing.status,
        note: note ?? existing.note,
        sessionUnits: nextSessionUnits,
        markedByUserId: user.id,
        markedByName: markerName,
        markedByRole: user.role,
        markedAt: new Date(),
      }
    });

    await prisma.attendanceAudit.create({
      data: {
        attendanceId: updated.id,
        action: 'UPDATE',
        reason: reason || 'manual-edit',
        classId: updated.classId,
        studentId: updated.studentId,
        oldStudentId: existing.studentId,
        date: updated.date,
        oldDate: existing.date,
        slot: updated.slot,
        oldSlot: existing.slot,
        status: updated.status,
        oldStatus: existing.status,
        sessionUnits: updated.sessionUnits,
        oldSessionUnits: existing.sessionUnits,
        note: updated.note || null,
        oldNote: existing.note || null,
        changedByUserId: user.id,
        changedByName: markerName || null,
        changedByRole: user.role,
      }
    });

    res.json(updated);
  } catch (error: any) {
    console.error(error);
    res.status(400).json({ message: error?.code === 'P2002' ? 'Trung ban ghi theo ngay/ca/hoc sinh' : 'Khong the cap nhat diem danh' });
  }
});

// Delete wrong attendance entry and keep audit trail
router.delete('/:id', authenticateToken, authorizeRoles('ADMIN', 'MANAGER', 'TEACHER'), async (req, res) => {
  const id = req.params.id as string;
  const { reason } = req.body || {};
  const user = (req as any).user;
  try {
    const existing = await prisma.attendance.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ message: 'Khong tim thay ban ghi diem danh' });
    const markerName = user.name ?? (
      await prisma.user.findUnique({ where: { id: user.id }, select: { name: true } })
    )?.name;

    await prisma.attendanceAudit.create({
      data: {
        attendanceId: existing.id,
        action: 'DELETE',
        reason: reason || 'manual-delete',
        classId: existing.classId,
        studentId: existing.studentId,
        oldStudentId: existing.studentId,
        date: existing.date,
        oldDate: existing.date,
        slot: existing.slot,
        oldSlot: existing.slot,
        status: existing.status,
        oldStatus: existing.status,
        sessionUnits: existing.sessionUnits,
        oldSessionUnits: existing.sessionUnits,
        note: existing.note || null,
        oldNote: existing.note || null,
        changedByUserId: user.id,
        changedByName: markerName || null,
        changedByRole: user.role,
      }
    });

    await prisma.attendance.delete({ where: { id } });
    res.status(204).send();
  } catch (error) {
    console.error(error);
    res.status(400).json({ message: 'Khong the xoa ban ghi diem danh' });
  }
});

router.get('/:id/audits', authenticateToken, async (req, res) => {
  const id = req.params.id as string;
  try {
    const audits = await prisma.attendanceAudit.findMany({
      where: { attendanceId: id },
      orderBy: { changedAt: 'desc' },
    });
    res.json(audits);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Khong the lay lich su diem danh' });
  }
});

router.get('/audit-log/all', authenticateToken, async (req, res) => {
  try {
    const audits = await prisma.attendanceAudit.findMany({
      orderBy: { changedAt: 'desc' },
      take: 100,
      include: {
        attendance: {
          select: {
            student: { select: { name: true } },
            class: { select: { name: true } }
          }
        }
      }
    });
    res.json(audits);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Lỗi khi lấy nhật ký điểm danh' });
  }
});

export default router;
