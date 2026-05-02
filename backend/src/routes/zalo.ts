import { Router } from 'express';
import prisma from '../lib/prisma';
import { authenticateToken, authorizeRoles } from '../middleware/auth';
import { zaloApiClient, getZaloConfig, ZALO_OA_API } from '../lib/zaloAuth';

export const formatPhone = (p: string) => p.replace(/^0/, '84');

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

    // Get follower list
    const follRes = await zaloApiClient.get<any>(
      `${ZALO_OA_API}/v2.0/oa/getfollowers?data=${encodeURIComponent(JSON.stringify({ offset: 0, count: 50 }))}`,
      { headers }
    );

    if (follRes.data.error !== 0) {
      return res.status(400).json({ message: `Zalo lỗi: ${follRes.data.message} (${follRes.data.error})` });
    }

    const followerIds: Array<{ user_id: string }> = follRes.data.data?.followers || [];

    // Get profile for each follower (parallel, max 10 at a time)
    const profiles = await Promise.all(
      followerIds.map(async ({ user_id }) => {
        try {
          const pr = await zaloApiClient.get<any>(
            `${ZALO_OA_API}/v2.0/oa/getprofile?data=${encodeURIComponent(JSON.stringify({ user_id }))}`,
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

// 4. Link a Zalo user_id to a teacher or student
router.post('/link', authenticateToken, authorizeRoles('ADMIN', 'MANAGER'), async (req, res) => {
  const { zaloUserId, teacherId, studentId } = req.body;
  if (!zaloUserId || (!teacherId && !studentId)) {
    return res.status(400).json({ message: 'Cần zaloUserId và teacherId hoặc studentId' });
  }
  try {
    if (teacherId) {
      await prisma.teacher.update({ where: { id: teacherId }, data: { zaloUserId } });
    }
    if (studentId) {
      await prisma.student.update({ where: { id: studentId }, data: { zaloUserId } });
    }
    res.json({ message: 'Liên kết thành công!' });
  } catch (error) {
    console.error('Lỗi link Zalo:', error);
    res.status(500).json({ message: 'Lỗi liên kết' });
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
