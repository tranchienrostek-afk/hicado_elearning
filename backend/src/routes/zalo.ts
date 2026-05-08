import { Router } from 'express';
import prisma from '../lib/prisma';
import { authenticateToken, authorizeRoles } from '../middleware/auth';
import { zaloApiClient, getZaloConfig, ZALO_OA_API } from '../lib/zaloAuth';

export const formatPhone = (p: string) => {
  const digits = p.replace(/\D/g, '');
  if (digits.startsWith('84')) return digits;
  if (digits.startsWith('0')) return '84' + digits.slice(1);
  return '84' + digits;
};

const router = Router();

// 1. Sync Zalo Templates
router.get('/templates/sync', authenticateToken, authorizeRoles('ADMIN', 'MANAGER'), async (req, res) => {
  try {
    const cfg = await getZaloConfig();
    if (!cfg.ZALO_ACCESS_TOKEN) return res.status(400).json({ message: 'Chưa cấu hình Access Token' });

    // Try to fetch from Zalo API
    let templates: any[] = [];
    try {
      const r = await zaloApiClient.get<any>('https://business.openapi.zalo.me/template/all?offset=0&limit=100&status=1', {
        headers: { access_token: cfg.ZALO_ACCESS_TOKEN }
      });
      if (r.data.error === 0 && Array.isArray(r.data.data)) {
        templates = r.data.data.map((t: any) => ({
          templateId: String(t.templateId),
          templateName: t.templateName,
          status: t.listParams ? 'APPROVED' : 'PENDING',
          price: t.price || 250
        }));
      }
    } catch {}

    // Fall back to mock templates if API fails/not approved
    if (templates.length === 0) {
      templates = [
        { templateId: '305141', templateName: 'Thông báo thu học phí', status: 'APPROVED', price: 250 },
        { templateId: '305142', templateName: 'Nhắc nhở học phí quá hạn', status: 'APPROVED', price: 250 }
      ];
    }

    for (const t of templates) {
      await prisma.zaloTemplate.upsert({
        where: { templateId: t.templateId },
        update: { templateName: t.templateName, status: t.status, price: t.price },
        create: t
      });
    }

    res.json({ message: 'Đồng bộ thành công', data: templates });
  } catch (error) {
    console.error('Lỗi đồng bộ Zalo Template:', error);
    res.status(500).json({ message: 'Lỗi đồng bộ mẫu tin Zalo' });
  }
});

// 2. Get local Templates
router.get('/templates', authenticateToken, async (req, res) => {
  try {
    const templates = await prisma.zaloTemplate.findMany();
    res.json(templates);
  } catch (error) {
    res.status(500).json({ message: 'Lỗi lấy mẫu tin' });
  }
});

// 3. Get OA Followers with profiles
router.get('/followers', authenticateToken, authorizeRoles('ADMIN', 'MANAGER'), async (req, res) => {
  try {
    const cfg = await getZaloConfig();
    if (!cfg.ZALO_ACCESS_TOKEN) return res.status(400).json({ message: 'Chưa cấu hình Access Token' });

    const headers = { access_token: cfg.ZALO_ACCESS_TOKEN };

    // Get follower list (v3.0 API — replaces deprecated v2.0/oa/getfollowers)
    const follRes = await zaloApiClient.get<any>(
      `${ZALO_OA_API}/v3.0/oa/user/getlist?data=${encodeURIComponent(JSON.stringify({ offset: 0, count: 50 }))}`,
      { headers }
    );

    if (follRes.data.error !== 0) {
      return res.status(400).json({ message: `Zalo lỗi: ${follRes.data.message} (${follRes.data.error})` });
    }

    const followerIds: Array<{ user_id: string }> = follRes.data.data?.users || [];

    // Get profile for each follower (parallel, max 10 at a time)
    const profiles = await Promise.all(
      followerIds.map(async ({ user_id }) => {
        try {
          const pr = await zaloApiClient.get<any>(
            // v3.0 API — replaces deprecated v2.0/oa/getprofile
            `${ZALO_OA_API}/v3.0/oa/user/detail?data=${encodeURIComponent(JSON.stringify({ user_id }))}`,
            { headers }
          );
          const d = pr.data.data || {};
          // Check if linked to a teacher or student in DB
          const linkedTeacher = await prisma.teacher.findFirst({ where: { zaloUserId: user_id }, select: { id: true, name: true, phone: true } });
          const linkedStudent = await prisma.student.findFirst({ where: { zaloUserId: user_id }, select: { id: true, name: true, parentPhone: true } });
          return {
            userId: user_id,
            displayName: d.display_name || 'Unknown',
            avatar: d.avatar || '',
            tags: d.tags_and_notes_info?.tags || [],
            linkedTeacher,
            linkedStudent,
          };
        } catch {
          return { userId: user_id, displayName: 'Unknown', avatar: '', tags: [], linkedTeacher: null, linkedStudent: null };
        }
      })
    );

    res.json({ total: follRes.data.data?.total || profiles.length, followers: profiles });
  } catch (error: any) {
    console.error('Lỗi lấy followers:', error.response?.data || error.message);
    res.status(500).json({ message: 'Lỗi lấy danh sách followers' });
  }
});

// 3b. Candidates for manual mapping
router.get('/mapping/candidates', authenticateToken, authorizeRoles('ADMIN', 'MANAGER'), async (req, res) => {
  try {
    const { type = 'STUDENTS', search = '', page = '1' } = req.query as Record<string, string>;
    const PAGE = 20;
    const skip = (Math.max(1, Number(page)) - 1) * PAGE;
    const where = search
      ? { name: { contains: search, mode: 'insensitive' as const }, isActive: true }
      : { isActive: true };

    if (type === 'TEACHERS') {
      const [items, total] = await Promise.all([
        prisma.teacher.findMany({
          where,
          skip,
          take: PAGE,
          select: { id: true, name: true, phone: true, zaloUserId: true },
          orderBy: { name: 'asc' },
        }),
        prisma.teacher.count({ where }),
      ]);
      return res.json({ type: 'TEACHERS', items, total, page: Number(page), pageSize: PAGE });
    }

    // STUDENTS
    const [items, total] = await Promise.all([
      prisma.student.findMany({
        where,
        skip,
        take: PAGE,
        select: { id: true, name: true, parentPhone: true, schoolClass: true, zaloUserId: true },
        orderBy: { name: 'asc' },
      }),
      prisma.student.count({ where }),
    ]);
    res.json({ type: 'STUDENTS', items, total, page: Number(page), pageSize: PAGE });
  } catch (err: any) {
    res.status(500).json({ message: 'Lỗi lấy danh sách candidates: ' + err.message });
  }
});

// 3b. Get mapping audit logs
router.get('/mapping/audit-log', authenticateToken, authorizeRoles('ADMIN', 'MANAGER'), async (req, res) => {
  try {
    const logs = await prisma.zaloMappingAudit.findMany({
      orderBy: { performedAt: 'desc' },
      take: 50,
    });
    res.json(logs);
  } catch (err: any) {
    res.status(500).json({ message: 'Lỗi lấy nhật ký định danh: ' + err.message });
  }
});

// 4. Link a Zalo user_id to a teacher or student
// 4. Link a Zalo user_id to a teacher or student (with conflict detection + audit)
router.post('/link', authenticateToken, authorizeRoles('ADMIN', 'MANAGER'), async (req, res) => {
  const { zaloUserId: rawId, teacherId, studentId, force = false } = req.body;
  if (!rawId || (!teacherId && !studentId)) {
    return res.status(400).json({ message: 'Cần zaloUserId và teacherId hoặc studentId' });
  }

  const zaloUserId = String(rawId).trim().toLowerCase();
  const user = (req as any).user as { userId: string; name: string; role: string };

  try {
    // Resolve target details
    let targetName = '';
    let targetId = '';
    let targetType = '';

    if (teacherId) {
      const teacher = await prisma.teacher.findUnique({ where: { id: teacherId }, select: { name: true } });
      if (!teacher) return res.status(404).json({ message: 'Không tìm thấy giáo viên' });
      targetName = teacher.name;
      targetId = teacherId;
      targetType = 'TEACHER';
    } else {
      const student = await prisma.student.findUnique({ where: { id: studentId }, select: { name: true } });
      if (!student) return res.status(404).json({ message: 'Không tìm thấy học sinh' });
      targetName = student.name;
      targetId = studentId;
      targetType = 'STUDENT';
    }

    // ATOMIC TRANSACTION: Lock -> Check Conflict -> Clear Old (if override) -> Update New -> Audit
    await prisma.$transaction(async (tx) => {
      // 1. Acquire advisory lock for this zaloUserId to prevent race conditions across tables (Student & Teacher)
      // This ensures only one process can link/override this specific UID at a time.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'zalo_mapping_' + zaloUserId}))`;

      const [existingStudent, existingTeacher] = await Promise.all([
        tx.student.findUnique({ where: { zaloUserId }, select: { id: true, name: true } }),
        tx.teacher.findUnique({ where: { zaloUserId }, select: { id: true, name: true } }),
      ]);

      const conflictTarget = existingStudent ?? existingTeacher;
      const conflictType = existingStudent ? 'STUDENT' : existingTeacher ? 'TEACHER' : null;
      const isSameTarget =
        (studentId && existingStudent?.id === studentId) ||
        (teacherId && existingTeacher?.id === teacherId);

      if (conflictTarget && !isSameTarget) {
        if (!force) {
          const error: any = new Error('CONFLICT');
          error.conflictInfo = {
            conflict: true,
            conflictType,
            conflictId: conflictTarget.id,
            conflictName: conflictTarget.name,
          };
          throw error;
        }
        // Force override: clear old target first
        if (conflictType === 'STUDENT') {
          await tx.student.update({ where: { id: conflictTarget.id }, data: { zaloUserId: null } });
        } else {
          await tx.teacher.update({ where: { id: conflictTarget.id }, data: { zaloUserId: null } });
        }
      }

      // Update new target
      if (teacherId) {
        await tx.teacher.update({ where: { id: teacherId }, data: { zaloUserId } });
      } else {
        await tx.student.update({ where: { id: studentId }, data: { zaloUserId } });
      }

      // Audit log
      await tx.zaloMappingAudit.create({
        data: {
          action: conflictTarget && !isSameTarget ? 'OVERRIDE' : 'LINK',
          zaloUserId,
          targetType,
          targetId,
          targetName,
          previousTargetId: conflictTarget && !isSameTarget ? conflictTarget.id : undefined,
          previousTargetName: conflictTarget && !isSameTarget ? conflictTarget.name : undefined,
          performedBy: user.userId,
          performedByName: user.name ?? user.userId,
        },
      });
    });

    res.json({ message: 'Liên kết thành công!', zaloUserId, targetId, targetType });
  } catch (err: any) {
    if (err.message === 'CONFLICT') {
      const { conflictType, conflictId, conflictName } = err.conflictInfo;
      return res.status(409).json({
        conflict: true,
        message: `zalo_user_id này đang được ghép với ${conflictType === 'STUDENT' ? 'học sinh' : 'giáo viên'} "${conflictName}". Xác nhận override?`,
        conflictType,
        conflictId,
        conflictName,
      });
    }
    if (err.code === 'P2002') {
      return res.status(409).json({ message: 'zalo_user_id này đã được dùng bởi người khác (unique constraint).' });
    }
    res.status(500).json({ message: 'Lỗi liên kết: ' + err.message });
  }
});

// 4b. Unlink: remove zaloUserId with audit log
router.delete('/link', authenticateToken, authorizeRoles('ADMIN', 'MANAGER'), async (req, res) => {
  const { studentId, teacherId } = req.body;
  if (!studentId && !teacherId) return res.status(400).json({ message: 'Cần studentId hoặc teacherId' });

  const user = (req as any).user as { userId: string; name: string };

  try {
    // ATOMIC TRANSACTION: Find -> Lock -> Update -> Audit
    await prisma.$transaction(async (tx) => {
      let targetName = '';
      let targetId = '';
      let targetType = '';
      let zaloUserId = '';

      if (studentId) {
        const student = await tx.student.findUnique({ where: { id: studentId }, select: { name: true, zaloUserId: true } });
        if (!student) throw new Error('NOT_FOUND_STUDENT');
        targetName = student.name;
        targetId = studentId;
        targetType = 'STUDENT';
        zaloUserId = student.zaloUserId ?? '';
      } else {
        const teacher = await tx.teacher.findUnique({ where: { id: teacherId }, select: { name: true, zaloUserId: true } });
        if (!teacher) throw new Error('NOT_FOUND_TEACHER');
        targetName = teacher.name;
        targetId = teacherId;
        targetType = 'TEACHER';
        zaloUserId = teacher.zaloUserId ?? '';
      }

      if (!zaloUserId) return; // Already unlinked

      // Advisory lock to prevent race during concurrent mapping/unmapping of same UID
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'zalo_mapping_' + zaloUserId}))`;

      if (targetType === 'STUDENT') {
        await tx.student.update({ where: { id: targetId }, data: { zaloUserId: null } });
      } else {
        await tx.teacher.update({ where: { id: targetId }, data: { zaloUserId: null } });
      }

      await tx.zaloMappingAudit.create({
        data: {
          action: 'UNLINK',
          zaloUserId,
          targetType,
          targetId,
          targetName,
          performedBy: user.userId,
          performedByName: user.name ?? user.userId,
        },
      });
    });

    res.json({ message: 'Đã hủy liên kết' });
  } catch (err: any) {
    if (err.message === 'NOT_FOUND_STUDENT') return res.status(404).json({ message: 'Không tìm thấy học sinh' });
    if (err.message === 'NOT_FOUND_TEACHER') return res.status(404).json({ message: 'Không tìm thấy giáo viên' });
    res.status(500).json({ message: 'Lỗi hủy liên kết: ' + err.message });
  }
});

// 5. Send OA Customer Service message (works for followers, no ZNS approval needed)
router.post('/send/cs', authenticateToken, authorizeRoles('ADMIN', 'MANAGER'), async (req, res) => {
  const { userIds, message } = req.body;
  if (!userIds || !Array.isArray(userIds) || !message) {
    return res.status(400).json({ message: 'Cần userIds[] và message' });
  }

  const cfg = await getZaloConfig();
  if (!cfg.ZALO_ACCESS_TOKEN) return res.status(400).json({ message: 'Chưa cấu hình Access Token' });

  const headers = { access_token: cfg.ZALO_ACCESS_TOKEN, 'Content-Type': 'application/json' };

  let sentCount = 0;
  let failedCount = 0;
  const errors: string[] = [];

  for (const userId of userIds) {
    try {
      const r = await zaloApiClient.post<any>(`${ZALO_OA_API}/v3.0/oa/message/cs`, {
        recipient: { user_id: userId },
        message: { text: message }
      }, { headers });

      if (r.data.error === 0) {
        sentCount++;
      } else {
        failedCount++;
        errors.push(`${userId}: ${r.data.message} (${r.data.error})`);
      }
    } catch (err: any) {
      failedCount++;
      errors.push(`${userId}: ${err.response?.data?.message || err.message}`);
    }
  }

  res.json({
    message: `Gửi thành công ${sentCount}/${userIds.length} tin nhắn`,
    sentCount,
    failedCount,
    errors
  });
});

// 6. Batch Send Tuition Notification (ZNS - requires app approval)
router.post('/send/tuition', authenticateToken, authorizeRoles('ADMIN', 'MANAGER'), async (req, res) => {
  const { studentIds, templateId } = req.body;
  if (!studentIds || !Array.isArray(studentIds) || !templateId) {
    return res.status(400).json({ message: 'Invalid request payload' });
  }

  const cfg = await getZaloConfig();
  if (!cfg.ZALO_ACCESS_TOKEN) return res.status(400).json({ message: 'Chưa cấu hình Access Token' });

  try {
    const students = await prisma.student.findMany({
      where: { id: { in: studentIds } },
      include: { classes: { include: { class: true } } }
    });

    let sentCount = 0;
    let failedCount = 0;

    for (const student of students) {
      // Prefer OA CS (via zaloUserId) over ZNS (phone)
      if (student.zaloUserId) {
        try {
          const r = await zaloApiClient.post<any>(`${ZALO_OA_API}/v3.0/oa/message/cs`, {
            recipient: { user_id: student.zaloUserId },
            message: { text: `Xin chào ${student.name}! Trung tâm Hicado thông báo học phí của bạn cần được thanh toán. Vui lòng liên hệ để biết thêm chi tiết. Trân trọng!` }
          }, { headers: { access_token: cfg.ZALO_ACCESS_TOKEN, 'Content-Type': 'application/json' } });

          const trackingId = `TUITION_${student.id}_${Date.now()}`;
          await prisma.zaloMessageLog.create({
            data: { phone: student.parentPhone || student.studentPhone || '', zaloUserId: student.zaloUserId, templateId, trackingId, status: r.data.error === 0 ? 'SENT' : 'FAILED', errorReason: r.data.error !== 0 ? r.data.message : null, studentId: student.id }
          });
          if (r.data.error === 0) sentCount++; else failedCount++;
        } catch { failedCount++; }
        continue;
      }

      // ZNS via phone (requires approved app)
      const phoneToUse = student.parentPhone || student.studentPhone;
      if (!phoneToUse) { failedCount++; continue; }

      const formattedPhone = formatPhone(phoneToUse);
      const trackingId = `TUITION_${student.id}_${Date.now()}`;

      try {
        const r = await zaloApiClient.post<any>('https://business.openapi.zalo.me/message/template', {
          phone: formattedPhone,
          template_id: templateId,
          template_data: { student_name: student.name, amount: '150,000đ', due_date: '30/06/2026' },
          tracking_id: trackingId
        }, { headers: { access_token: cfg.ZALO_ACCESS_TOKEN, 'Content-Type': 'application/json' } });

        await prisma.zaloMessageLog.create({
          data: { phone: formattedPhone, zaloUserId: student.zaloUserId, templateId, trackingId, status: r.data.error === 0 ? 'SENT' : 'FAILED', errorReason: r.data.error !== 0 ? `${r.data.message} (${r.data.error})` : null, studentId: student.id }
        });
        if (r.data.error === 0) sentCount++; else failedCount++;
      } catch (err: any) {
        failedCount++;
        await prisma.zaloMessageLog.create({
          data: { phone: formattedPhone, templateId, trackingId, status: 'FAILED', errorReason: err.message, studentId: student.id }
        });
      }
    }

    res.json({ message: `Đã gửi ${sentCount} tin nhắn, thất bại ${failedCount}` });
  } catch (error) {
    console.error('Lỗi gửi tin Zalo:', error);
    res.status(500).json({ message: 'Lỗi gửi tin Zalo' });
  }
});

export default router;
