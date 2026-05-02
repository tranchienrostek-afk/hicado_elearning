import { Router } from 'express';
import prisma from '../lib/prisma';
import { authenticateToken, authorizeRoles } from '../middleware/auth';
import { zaloApiClient, getZaloConfig, ZALO_OA_API } from '../lib/zaloAuth';

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
    filters: { classIds?: string[]; tuitionStatuses?: string[]; requireZalo?: boolean; message?: string };
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
  let failedCount = 0;
  const headers = { access_token: cfg.ZALO_ACCESS_TOKEN, 'Content-Type': 'application/json' };

  for (const student of students) {
    if (!student.zaloUserId) { failedCount++; continue; }
    if (!student.classes.length) { failedCount++; continue; }

    let messageText = '';
    const primaryClassId = student.classes[0]?.class?.id ?? null;

    if (type === 'TUITION_REMINDER') {
      const lines: string[] = [
        `Kính gửi phụ huynh em ${student.name}!`,
        `Trung tâm Hicado xin thông báo học phí:\n`,
      ];
      let totalDue = 0;
      for (const cs of student.classes) {
        const cls = cs.class;
        const attended = student.attendances.filter((a: any) => a.classId === cls.id).length;
        const amount = cls.tuitionPerSession * (attended || cls.totalSessions);
        totalDue += amount;
        lines.push(
          `• Lớp ${cls.name}${cls.classCode ? ` (${cls.classCode})` : ''}\n` +
          `  Đã học: ${attended} buổi × ${cls.tuitionPerSession.toLocaleString('vi-VN')}đ\n` +
          `  Tạm tính: ${amount.toLocaleString('vi-VN')}đ`
        );
      }
      lines.push(`\n💰 Tổng: ${totalDue.toLocaleString('vi-VN')}đ`);
      lines.push(`📱 Quét QR nộp tiền: ${appBaseUrl}/pay/${student.id}`);
      if (student.studentCode) lines.push(`📝 Nội dung CK: ${student.studentCode}`);
      messageText = lines.join('\n');
    } else {
      messageText = filters.message || 'Thông báo từ Trung tâm Hicado';
    }

    const trackingId = `CAMP_${campaign.id}_${student.id}_${Date.now()}`;
    try {
      const r = await zaloApiClient.post<any>(
        `${ZALO_OA_API}/v3.0/oa/message/cs`,
        { recipient: { user_id: student.zaloUserId }, message: { text: messageText } },
        { headers }
      );
      const success = r.data?.error === 0;
      const zaloMsgId: string | null = success ? (r.data?.data?.msg_id ?? r.data?.data?.message_id ?? null) : null;

      await (prisma as any).zaloMessageLog.create({
        data: {
          phone: student.parentPhone || student.studentPhone || '',
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
          phone: student.parentPhone || student.studentPhone || '',
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
    data: { status: 'SENT', sentCount, failedCount, sentAt: new Date() },
  });

  res.json({
    message: `Chiến dịch "${name}": gửi thành công ${sentCount}, thất bại ${failedCount}`,
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
