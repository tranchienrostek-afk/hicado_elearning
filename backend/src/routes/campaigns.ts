import { Router } from 'express';
import prisma from '../lib/prisma';
import { authenticateToken, authorizeRoles } from '../middleware/auth';
import { zaloApiClient, getZaloConfig, ZALO_OA_API } from '../lib/zaloAuth';
import { formatPhone } from './zalo';

const router = Router();

router.get('/', authenticateToken, authorizeRoles('ADMIN', 'MANAGER'), async (req, res) => {
  try {
    const campaigns = await (prisma as any).campaign.findMany({ orderBy: { createdAt: 'desc' } });
    res.json(campaigns.map((c: any) => ({
      ...c,
      readRate: c.sentCount > 0 ? Math.round((c.readCount / c.sentCount) * 100) : 0,
    })));
  } catch { res.status(500).json({ message: 'Lỗi khi lấy danh sách chiến dịch' }); }
});

router.get('/:id', authenticateToken, authorizeRoles('ADMIN', 'MANAGER'), async (req, res) => {
  try {
    const campaign = await (prisma as any).campaign.findUnique({
      where: { id: String(req.params.id) },
      include: {
        logs: {
          include: { student: { select: { name: true, studentCode: true } } },
          orderBy: { sentAt: 'desc' },
        },
      },
    });
    if (!campaign) return res.status(404).json({ message: 'Chiến dịch không tồn tại' });
    res.json({ ...campaign, readRate: campaign.sentCount > 0 ? Math.round((campaign.readCount / campaign.sentCount) * 100) : 0 });
  } catch { res.status(500).json({ message: 'Lỗi khi lấy chi tiết chiến dịch' }); }
});

router.post('/', authenticateToken, authorizeRoles('ADMIN', 'MANAGER'), async (req, res) => {
  const { name, type, filters = {} } = req.body as {
    name: string;
    type: 'TUITION_REMINDER' | 'GENERAL';
    filters: {
      classIds?: string[];
      tuitionStatuses?: string[];
      requireZalo?: boolean;
      message?: string;
      fallbackZNS?: boolean;
      znsTemplateId?: string;
    };
  };
  if (!name || !type) return res.status(400).json({ message: 'Thiếu tên hoặc loại chiến dịch' });

  const cfg = await getZaloConfig();
  if (!cfg.ZALO_ACCESS_TOKEN) return res.status(400).json({ message: 'Chưa cấu hình Zalo Access Token' });

  // Build student filter
  const where: any = {};
  if (filters.tuitionStatuses?.length) where.tuitionStatus = { in: filters.tuitionStatuses };
  if (filters.requireZalo) where.zaloUserId = { not: null };

  const students = await prisma.student.findMany({
    where,
    include: {
      classes: {
        ...(filters.classIds?.length ? { where: { classId: { in: filters.classIds } } } : {}),
        include: { class: { select: { id: true, name: true, classCode: true, tuitionPerSession: true, totalSessions: true } } },
      },
      attendances: { where: { status: 'PRESENT' }, select: { classId: true } },
    },
  });

  const bankCfg = await prisma.systemConfig.findMany({ where: { key: { in: ['BANK_BIN', 'BANK_ACC'] } } });
  const bm = bankCfg.reduce((a: any, r) => { a[r.key] = r.value; return a; }, {} as Record<string, string>);
  const appBaseUrl = process.env.APP_URL || `https://${req.get('host')}`;

  const campaign = await (prisma as any).campaign.create({
    data: { name, type, status: 'SENDING', filtersJson: JSON.stringify(filters) },
  });

  let sentCount = 0;
  let znsSentCount = 0;
  let failedCount = 0;
  const headers = { access_token: cfg.ZALO_ACCESS_TOKEN, 'Content-Type': 'application/json' };

  // due_date = last day of current month in DD/MM/YYYY
  const now = new Date();
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const dueDate = `${String(lastDay.getDate()).padStart(2, '0')}/${String(lastDay.getMonth() + 1).padStart(2, '0')}/${lastDay.getFullYear()}`;

  for (const student of students) {
    if (!student.classes.length) { failedCount++; continue; }

    const primaryClassId = student.classes[0]?.class?.id ?? null;
    const phone = student.parentPhone || student.studentPhone || '';

    // ── Compute tuition amount (used by both CS message and ZNS template_data) ──
    let totalDue = 0;
    for (const cs of student.classes) {
      const attended = student.attendances.filter((a: any) => a.classId === cs.class.id).length;
      totalDue += cs.class.tuitionPerSession * attended;
    }

    // ── Branch: ZNS via phone (if no UID, fallbackZNS ON, TUITION_REMINDER) ──
    if (!student.zaloUserId && filters.fallbackZNS && type === 'TUITION_REMINDER' && phone && filters.znsTemplateId) {
      const trackingId = `CAMP_${campaign.id}_${student.id}_${Date.now()}`;
      try {
        const r = await zaloApiClient.post<any>(
          'https://business.openapi.zalo.me/message/template',
          {
            phone: formatPhone(phone),
            template_id: filters.znsTemplateId,
            template_data: {
              student_name: student.name,
              amount: totalDue.toLocaleString('vi-VN') + 'đ',
              due_date: dueDate,
            },
            tracking_id: trackingId,
          },
          { headers }
        );
        const success = r.data?.error === 0;
        await (prisma as any).zaloMessageLog.create({
          data: {
            phone: formatPhone(phone),
            templateId: `ZNS_${filters.znsTemplateId}`,
            trackingId,
            status: success ? 'SENT' : 'FAILED',
            errorReason: success ? null : (r.data?.message ?? 'Unknown'),
            studentId: student.id,
            campaignId: campaign.id,
            classId: primaryClassId,
          },
        });
        if (success) { sentCount++; znsSentCount++; } else failedCount++;
      } catch (err: any) {
        failedCount++;
        await (prisma as any).zaloMessageLog.create({
          data: { phone: formatPhone(phone), templateId: `ZNS_${filters.znsTemplateId}`, trackingId, status: 'FAILED', errorReason: err.message, studentId: student.id, campaignId: campaign.id, classId: primaryClassId },
        });
      }
      continue;
    }

    // ── Branch: OA CS message (requires zaloUserId) ──
    if (!student.zaloUserId) { failedCount++; continue; }

    // TUITION_REMINDER → single image message (payment slip PNG with QR embedded)
    // GENERAL → text message
    const primaryAttended = student.attendances.filter((a: any) => a.classId === primaryClassId).length;
    const message = type === 'TUITION_REMINDER' && primaryClassId
      ? { attachment: { type: 'image', payload: { url: `${appBaseUrl}/api/finance/qr-png/${student.id}/${primaryClassId}?attended=${primaryAttended}` } } }
      : { text: filters.message || 'Thông báo từ Trung tâm Hicado' };

    const trackingId = `CAMP_${campaign.id}_${student.id}_${Date.now()}`;
    try {
      const r = await zaloApiClient.post<any>(
        `${ZALO_OA_API}/v3.0/oa/message/cs`,
        { recipient: { user_id: student.zaloUserId }, message },
        { headers }
      );
      const success = r.data?.error === 0;
      const zaloMsgId: string | null = success ? (r.data?.data?.msg_id ?? r.data?.data?.message_id ?? null) : null;

      await (prisma as any).zaloMessageLog.create({
        data: {
          phone,
          zaloUserId: student.zaloUserId,
          templateId: `CAMPAIGN_${type}`,
          trackingId,
          status: success ? 'SENT' : 'FAILED',
          errorReason: success ? null : (r.data?.message ?? 'Unknown'),
          studentId: student.id,
          campaignId: campaign.id,
          zaloMsgId,
          classId: primaryClassId,
        },
      });
      if (success) sentCount++; else failedCount++;
    } catch (err: any) {
      failedCount++;
      await (prisma as any).zaloMessageLog.create({
        data: {
          phone,
          zaloUserId: student.zaloUserId,
          templateId: `CAMPAIGN_${type}`,
          trackingId,
          status: 'FAILED',
          errorReason: err.message,
          studentId: student.id,
          campaignId: campaign.id,
          classId: primaryClassId,
        },
      });
    }
  }

  const finalCampaign = await (prisma as any).campaign.update({
    where: { id: campaign.id },
    data: { status: 'SENT', sentCount, znsSentCount, failedCount, sentAt: new Date() },
  });

  res.json({
    message: `Chiến dịch "${name}": gửi thành công ${sentCount} (ZNS: ${znsSentCount}), thất bại ${failedCount}`,
    campaign: { ...finalCampaign, readRate: 0 },
  });
});

router.delete('/:id', authenticateToken, authorizeRoles('ADMIN', 'MANAGER'), async (req, res) => {
  try {
    const id = String(req.params.id);
    const campaign = await (prisma as any).campaign.findUnique({ where: { id } });
    if (!campaign) return res.status(404).json({ message: 'Chiến dịch không tồn tại' });
    if (campaign.status !== 'DRAFT') return res.status(400).json({ message: 'Chỉ xóa được chiến dịch DRAFT' });
    await (prisma as any).campaign.delete({ where: { id } });
    res.json({ message: 'Đã xóa chiến dịch' });
  } catch { res.status(500).json({ message: 'Lỗi xóa chiến dịch' }); }
});

export default router;
