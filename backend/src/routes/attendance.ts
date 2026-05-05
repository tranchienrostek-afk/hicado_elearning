import { Router } from 'express';
import prisma from '../lib/prisma';
import { authenticateToken } from '../middleware/auth';

const router = Router();
const allowedSlots = ['MORNING', 'AFTERNOON', 'EVENING', 'CUSTOM'] as const;

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
router.post('/mark', authenticateToken, async (req, res) => {
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

    const existing = await prisma.attendance.findUnique({
      where: {
        classId_studentId_date_slot: {
          classId,
          studentId,
          date: new Date(date),
          slot: normalizedSlot,
        }
      }
    });

    const record = await prisma.attendance.upsert({
      where: {
        classId_studentId_date_slot: {
          classId,
          studentId,
          date: new Date(date),
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
        date: new Date(date),
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
router.patch('/:id', authenticateToken, async (req, res) => {
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

    const updated = await prisma.attendance.update({
      where: { id },
      data: {
        classId: classId ?? existing.classId,
        studentId: studentId ?? existing.studentId,
        date: date ? new Date(date) : existing.date,
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
router.delete('/:id', authenticateToken, async (req, res) => {
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

export default router;
