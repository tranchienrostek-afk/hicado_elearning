import { Router } from 'express';
import prisma from '../lib/prisma';
import { authenticateToken, authorizeRoles } from '../middleware/auth';
import { normalizePhone, normalizeVietnameseName, calculateStudentMatchScore } from '../lib/studentIdentity';

const router = Router();

type StudentDuplicateInput = {
  name?: string;
  parentPhone?: string;
  studentPhone?: string;
  birthYear?: number;
  cccd?: string;
  studentCode?: string;
};

const uniquePhones = (input: StudentDuplicateInput) =>
  Array.from(new Set([normalizePhone(input.parentPhone), normalizePhone(input.studentPhone)].filter(Boolean))) as string[];

async function findStudentDuplicateCandidates(input: StudentDuplicateInput, excludeId?: string) {
  const phones = uniquePhones(input);
  const orConditions: any[] = [];
  const normalizedName = input.name ? normalizeVietnameseName(input.name) : '';

  if (normalizedName) orConditions.push({ nameNorm: { contains: normalizedName } });
  for (const phone of phones) {
    orConditions.push({ parentPhoneNorm: phone }, { phoneNorm: phone });
  }
  if (input.cccd) orConditions.push({ cccd: input.cccd });
  if (input.studentCode) orConditions.push({ studentCode: input.studentCode });

  if (orConditions.length === 0) return [];

  const candidates = await prisma.student.findMany({
    where: {
      isActive: true,
      ...(excludeId ? { id: { not: excludeId } } : {}),
      OR: orConditions
    },
    include: { classes: { include: { class: { select: { name: true } } } } }
  });

  return candidates
    .map(c => {
      const match = calculateStudentMatchScore(
        {
          name: input.name || '',
          parentPhone: input.parentPhone,
          studentPhone: input.studentPhone,
          birthYear: input.birthYear,
          cccd: input.cccd,
          studentCode: input.studentCode
        },
        c
      );
      return {
        studentId: c.id,
        name: c.name,
        studentCode: c.studentCode,
        parentPhone: c.parentPhone,
        studentPhone: c.studentPhone,
        birthYear: c.birthYear,
        classes: c.classes.map(cl => cl.class.name),
        ...match
      };
    })
    .filter(r => r.score >= 30)
    .sort((a, b) => b.score - a.score);
}

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

// Duplicate preview for add student form
router.post('/duplicate-preview', authenticateToken, authorizeRoles('ADMIN', 'MANAGER'), async (req, res) => {
  try {
    const { name, parentPhone, studentPhone, birthYear, cccd, studentCode } = req.body;
    if (!name) return res.status(400).json({ message: 'Tên học sinh là bắt buộc' });

    const results = await findStudentDuplicateCandidates({ name, parentPhone, studentPhone, birthYear, cccd, studentCode });

    res.json({
      decision: results.length > 0 && results[0].score >= 90 ? 'MATCH_EXISTING' : results.length > 0 ? 'REVIEW' : 'CREATE_NEW',
      candidates: results
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Lỗi khi kiểm tra trùng lặp' });
  }
});

// Create student
router.post('/', authenticateToken, authorizeRoles('ADMIN', 'MANAGER'), async (req, res) => {
  try {
    const { forceCreate, ...studentData } = req.body;
    const { name, parentPhone, studentPhone, birthYear, cccd, studentCode } = studentData;

    if (!forceCreate) {
      const duplicateCandidates = await findStudentDuplicateCandidates({ name, parentPhone, studentPhone, birthYear, cccd, studentCode });
      const strongest = duplicateCandidates[0];
      if (strongest && strongest.score >= 90) {
        return res.status(409).json({
          message: `Hoc sinh co the da ton tai: ${strongest.name} (${strongest.score}%). Ly do: ${strongest.reasons.join(', ')}`,
          candidate: strongest,
          candidates: duplicateCandidates
        });
      }
    }
    // Auto-populate normalized fields
    const data = {
      ...studentData,
      nameNorm: name ? normalizeVietnameseName(name) : undefined,
      parentPhoneNorm: parentPhone ? normalizePhone(parentPhone) : undefined,
      phoneNorm: studentPhone ? normalizePhone(studentPhone) : undefined
    };

    const student = await prisma.student.create({ data });
    res.status(201).json(student);
  } catch (error) {
    console.error(error);
    res.status(400).json({ message: 'Lỗi khi tạo học sinh' });
  }
});

// Update student
router.put('/:id', authenticateToken, authorizeRoles('ADMIN', 'MANAGER'), async (req, res) => {
  try {
    const { name, parentPhone, studentPhone, ...rest } = req.body;
    const data = {
      ...rest,
      name,
      parentPhone,
      studentPhone,
      nameNorm: name ? normalizeVietnameseName(name) : undefined,
      parentPhoneNorm: parentPhone ? normalizePhone(parentPhone) : undefined,
      phoneNorm: studentPhone ? normalizePhone(studentPhone) : undefined
    };

    const student = await prisma.student.update({
      where: { id: req.params.id as string },
      data
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

// Scan for all duplicates in the system
router.get('/scan-duplicates', authenticateToken, authorizeRoles('ADMIN', 'MANAGER'), async (req, res) => {
  try {
    const students = await prisma.student.findMany({
      where: { isActive: true },
      select: { id: true, name: true, nameNorm: true, parentPhone: true, parentPhoneNorm: true, studentPhone: true, phoneNorm: true, birthYear: true, studentCode: true }
    });

    const duplicates: any[] = [];
    const seen = new Set<string>();

    for (let i = 0; i < students.length; i++) {
      if (seen.has(students[i].id)) continue;
      const group = [students[i]];
      
      for (let j = i + 1; j < students.length; j++) {
        if (seen.has(students[j].id)) continue;
        
        const match = calculateStudentMatchScore(
          students[i] as any,
          students[j] as any
        );

        if (match.score >= 70) {
          group.push({ ...students[j], ...match } as any);
          seen.add(students[j].id);
        }
      }

      if (group.length > 1) {
        duplicates.push({
          primary: group[0],
          others: group.slice(1)
        });
      }
    }

    res.json(duplicates);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Lỗi khi quét học sinh trùng' });
  }
});

// Merge students
router.post('/:sourceId/merge-into/:targetId', authenticateToken, authorizeRoles('ADMIN', 'MANAGER'), async (req, res) => {
  const sourceId = req.params.sourceId as string;
  const targetId = req.params.targetId as string;
  const { reason } = req.body;
  const user = (req as any).user;

  if (sourceId === targetId) return res.status(400).json({ message: 'Source và Target phải khác nhau' });

  try {
    const [source, target] = await Promise.all([
      prisma.student.findUnique({ 
        where: { id: sourceId },
        include: { 
          classes: true, 
          attendances: true, 
          paymentAdjustments: true, 
          transactions: true, 
          zaloMessageLogs: true,
          tuitionBills: true 
        }
      }) as any,
      prisma.student.findUnique({ where: { id: targetId } }) as any
    ]);

    if (!source || !target) return res.status(404).json({ message: 'Không tìm thấy học sinh' });
    if (!source.isActive) return res.status(400).json({ message: 'Học sinh nguồn đã bị vô hiệu hóa hoặc đã merge' });

    await prisma.$transaction(async (tx) => {
      // 1. Move ClassStudent relations (avoid duplicates)
      for (const cs of source.classes) {
        const exists = await tx.classStudent.findUnique({
          where: { classId_studentId: { classId: cs.classId, studentId: targetId } }
        });
        if (!exists) {
          await tx.classStudent.update({
            where: { classId_studentId: { classId: cs.classId, studentId: sourceId } },
            data: { studentId: targetId }
          });
        } else {
          // If target already in class, just delete the source's link
          await tx.classStudent.delete({
            where: { classId_studentId: { classId: cs.classId, studentId: sourceId } }
          });
        }
      }

      // 2. Move Attendances (handle unique constraint collisions)
      for (const att of source.attendances) {
        const exists = await tx.attendance.findUnique({
          where: {
            classId_studentId_date_slot: {
              classId: att.classId,
              studentId: targetId,
              date: att.date,
              slot: att.slot
            }
          }
        });
        if (!exists) {
          await tx.attendance.update({
            where: { id: att.id },
            data: { studentId: targetId }
          });
        } else {
          // Collision: target already has attendance. 
          // We keep the target's record and delete the source's redundant one.
          await tx.attendance.delete({ where: { id: att.id } });
        }
      }

      // 3. Move PaymentAdjustments
      await tx.paymentAdjustment.updateMany({
        where: { studentId: sourceId },
        data: { studentId: targetId }
      });

      // 4. Move Transactions
      await tx.transaction.updateMany({
        where: { studentId: sourceId },
        data: { studentId: targetId }
      });

      // 5. Move Zalo Logs
      await tx.zaloMessageLog.updateMany({
        where: { studentId: sourceId },
        data: { studentId: targetId }
      });

      // 6. Move Attendance Audits
      await tx.attendanceAudit.updateMany({
        where: { studentId: sourceId },
        data: { studentId: targetId }
      });

      // 7. Move Tuition Bills
      await tx.tuitionBill.updateMany({
        where: { studentId: sourceId },
        data: { studentId: targetId }
      });

      // 8. Handle User (Account)
      const sourceUser = await tx.user.findUnique({ where: { studentId: sourceId } });
      const targetUser = await tx.user.findUnique({ where: { studentId: targetId } });
      if (sourceUser && !targetUser) {
        await tx.user.update({
          where: { id: sourceUser.id },
          data: { studentId: targetId }
        });
      } else if (sourceUser && targetUser) {
        // Both have accounts, deactivate source account
        await tx.user.update({
          where: { id: sourceUser.id },
          data: { isActive: false, studentId: null }
        });
      }

      // 9. Update Source Student
      await tx.student.update({
        where: { id: sourceId },
        data: {
          isActive: false,
          mergedIntoId: targetId,
          mergedAt: new Date(),
          mergeReason: reason
        }
      });

      // 10. Audit Log
      await tx.studentMergeAudit.create({
        data: {
          sourceStudentId: sourceId,
          targetStudentId: targetId,
          sourceSnapshot: JSON.stringify(source),
          targetSnapshot: JSON.stringify(target),
          movedRelations: JSON.stringify({
            classes: source.classes.length,
            attendances: source.attendances.length,
            paymentAdjustments: source.paymentAdjustments.length,
            transactions: source.transactions.length,
            tuitionBills: source.tuitionBills.length
          }),
          reason,
          performedById: user.id,
          performedByName: user.name
        }
      });
    });

    res.json({ message: 'Merge thành công' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Lỗi khi merge học sinh' });
  }
});

export default router;
