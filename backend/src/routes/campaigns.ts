import { Router } from 'express';
import { Prisma } from '@prisma/client';
import prisma from '../lib/prisma';
import { authenticateToken, authorizeRoles } from '../middleware/auth';
import { zaloApiClient, getZaloConfig, ZALO_OA_API } from '../lib/zaloAuth';
import { formatPhone } from './zalo';
import { buildPaymentSlipPNG, buildMultiClassPaymentSlipPNG, deaccent } from '../lib/paymentSlip';
import { generateVietQRString } from '../lib/vietqr';
import { buildZaloImageMessage, uploadZaloImage, buildCustomTuitionMessage, buildMultiClassTuitionMessage } from '../lib/zaloMessage';
import { generateBillCode } from '../lib/billCode';
import { expectedForStudentClass } from '../lib/financeMath';

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
      fromDate?: string;
      toDate?: string;
      collectionFromDate?: string;
      collectionToDate?: string;
      studentCoveredClasses?: Record<string, string[]>;
      forceResendStudentIds?: string[];
      billingMonth?: string;
    };
  };
  if (!name || !type) return res.status(400).json({ message: 'Thiếu tên hoặc loại chiến dịch' });

  const cfg = await getZaloConfig();
  if (!cfg.ZALO_ACCESS_TOKEN) return res.status(400).json({ message: 'Chưa cấu hình Zalo Access Token' });

  // Build student filter
  const where: any = {};
  if (filters.tuitionStatuses?.length) where.tuitionStatus = { in: filters.tuitionStatuses };
  if (filters.requireZalo) where.zaloUserId = { not: null };

  const from = filters.fromDate ? new Date(filters.fromDate) : null;
  const to = filters.toDate ? new Date(filters.toDate) : null;
  if (from) from.setHours(0,0,0,0);
  if (to) to.setHours(23,59,59,999);

  const students = await prisma.student.findMany({
    where,
    include: {
      classes: {
        ...(filters.classIds?.length ? { where: { classId: { in: filters.classIds } } } : {}),
        include: { class: { select: { id: true, name: true, classCode: true, tuitionPerSession: true, totalSessions: true } } },
      },
      attendances: {
        where: {
          status: 'PRESENT',
          ...(from || to ? { date: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {})
        },
        select: { studentId: true, classId: true, status: true, sessionUnits: true, date: true }
      },
      paymentAdjustments: {
        where: {
          ...(from || to ? { effectiveDate: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {})
        }
      }
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
  const forceResendSet = new Set(filters.forceResendStudentIds ?? []);
  const sentAtFilter = from && to
    ? Prisma.sql`AND "sentAt" BETWEEN ${from} AND ${to}`
    : from
      ? Prisma.sql`AND "sentAt" >= ${from}`
      : to
        ? Prisma.sql`AND "sentAt" <= ${to}`
        : Prisma.empty;

  // due_date
  const now = new Date();
  const lastDay = to ? to : new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const dueDate = `${String(lastDay.getDate()).padStart(2, '0')}/${String(lastDay.getMonth() + 1).padStart(2, '0')}/${lastDay.getFullYear()}`;
  const periodStr = from && to
    ? `(từ ${from.toLocaleDateString('vi-VN')} đến ${to.toLocaleDateString('vi-VN')})`
    : '';

  for (const student of students) {
    if (!student.classes.length) { failedCount++; continue; }

    const primaryClassId = student.classes[0]?.class?.id ?? null;
    const phone = student.parentPhone || student.studentPhone || '';
    const coveredClassIds = filters.studentCoveredClasses?.[student.id] ?? (primaryClassId ? [primaryClassId] : []);

    if (type === 'TUITION_REMINDER' && coveredClassIds.length > 0 && !forceResendSet.has(student.id)) {
      const existing = await prisma.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM "ZaloMessageLog"
        WHERE "studentId" = ${student.id}
          AND status = 'SENT'
          AND "coveredClassIds" && ARRAY[${Prisma.join(coveredClassIds)}]::text[]
          ${sentAtFilter}
        LIMIT 1
      `;
      if (existing.length > 0) {
        failedCount++;
        await (prisma as any).zaloMessageLog.create({
          data: { phone, templateId: `CAMPAIGN_${type}`, trackingId: `CAMP_${campaign.id}_${student.id}_${Date.now()}_SKIP`, status: 'SKIPPED', errorReason: 'DEDUP_ALREADY_SENT', studentId: student.id, campaignId: campaign.id, classId: primaryClassId, coveredClassIds, messageType: 'TUITION_REMINDER' },
        });
        continue;
      }
    }

    // ── Compute tuition amount (used by both CS message and ZNS template_data) ──
    let totalDue = 0;
    for (const cs of student.classes) {
      const classAtts = student.attendances.filter((a: any) => a.classId === cs.class.id);
      totalDue += expectedForStudentClass(cs.class as any, student.id, classAtts as any, cs);
    }
    // Subtract adjustments/payments in this period
    const totalAdjustments = (student as any).paymentAdjustments.reduce((sum: number, adj: any) => sum + adj.amount, 0);
    totalDue -= totalAdjustments;
    if (totalDue < 0) totalDue = 0; // Don't notify negative due

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
            coveredClassIds,
            messageType: 'TUITION_REMINDER',
          },
        });
        if (success) { sentCount++; znsSentCount++; } else failedCount++;
      } catch (err: any) {
        failedCount++;
        await (prisma as any).zaloMessageLog.create({
          data: {
            phone: formatPhone(phone),
            templateId: `ZNS_${filters.znsTemplateId}`,
            trackingId,
            status: 'FAILED',
            errorReason: err.message,
            studentId: student.id,
            campaignId: campaign.id,
            classId: primaryClassId,
            coveredClassIds,
            messageType: 'TUITION_REMINDER',
          },
        });
      }
      continue;
    }

    // ── Branch: OA CS message (requires zaloUserId) ──
    if (!student.zaloUserId) { failedCount++; continue; }

    // Build message + capture step-by-step trace (stored in errorReason for full UI visibility)
    const primaryAttended = student.attendances
      .filter((a: any) => a.classId === primaryClassId)
      .reduce((sum: number, a: any) => sum + (a.sessionUnits ?? 1), 0);
    const trace: string[] = [];
    let message: any;
    let billId: string | null = null;
    let billDetail: Array<{ classId: string; className: string; sessions: number; pricePerSession: number; subtotal: number }> = [];

    if (type === 'TUITION_REMINDER') {
      trace.push('①BILL...');
      let billRef = '';
      try {
        const classes = await prisma.class.findMany({ where: { id: { in: coveredClassIds } } });
        billDetail = await Promise.all(classes.map(async (cls) => {
          const cs = student.classes.find((c: any) => c.classId === cls.id);
          const classAtts = student.attendances.filter((a: any) => a.classId === cls.id);
          const sess = classAtts.reduce((sum: number, a: any) => sum + (a.sessionUnits ?? 1), 0);
          const subtotal = expectedForStudentClass(cls as any, student.id, classAtts as any, cs as any);

          return {
            classId: cls.id,
            className: cls.name,
            sessions: sess,
            pricePerSession: (cs as any)?.customTuitionPerSession != null ? (cs as any).customTuitionPerSession : cls.tuitionPerSession,
            subtotal
          };
        }));

        const bill = await prisma.tuitionBill.create({
          data: {
            studentId: student.id,
            coveredClassIds,
            fromDate: from || new Date(),
            toDate: to || new Date(),
            amount: totalDue,
            sessionsDetail: JSON.stringify(billDetail),
            referenceCode: generateBillCode(),
            createdByName: 'Campaign System',
            billingMonth: filters.billingMonth || null,
          }
        });
        billId = bill.id;
        billRef = bill.referenceCode;
        trace[trace.length - 1] = `①BILL_OK(${billRef})`;
      } catch (billErr: any) {
        trace[trace.length - 1] = `①BILL_FAIL:${billErr.message}`;
      }

      const memo = deaccent(`${student.studentCode ?? student.id} ${billRef} ${student.name}`).toUpperCase().trim().slice(0, 50);
      const qrData = generateVietQRString(bm.BANK_BIN || process.env.BANK_BIN || '970436', bm.BANK_ACC || process.env.BANK_ACC || '', totalDue, memo);
      
      const billItems = billDetail;
      const fmt = (d: string | Date) => new Date(d).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
      const fmtFrom = from ? fmt(from) : undefined;
      const fmtTo = to ? fmt(to) : undefined;
      const fmtCollFrom = filters.collectionFromDate ? fmt(filters.collectionFromDate) : undefined;
      const fmtCollTo = filters.collectionToDate ? fmt(filters.collectionToDate) : undefined;

      const textMessage = billItems.length > 1 
        ? buildMultiClassTuitionMessage(student.name, billItems, totalDue, fmtFrom, fmtTo, fmtCollFrom, fmtCollTo)
        : buildCustomTuitionMessage(student.name, { 
            className: billItems[0]?.className ?? '',
            sessions: billItems[0]?.sessions || 0, 
            pricePerSession: billItems[0]?.pricePerSession || 0, 
            total: totalDue, 
            note: periodStr,
            fromDate: fmtFrom,
            toDate: fmtTo,
            collectionFrom: fmtCollFrom,
            collectionTo: fmtCollTo
          });

      // Step 2: Build PNG
      trace.push('②PNG...');
      try {
        const pngBuffer = await buildMultiClassPaymentSlipPNG({
          studentName: student.name, studentCode: student.studentCode ?? student.id,
          billingMonth: filters.billingMonth,
          items: billItems,
          totalAmount: totalDue, memo, qrData,
        });
        trace[trace.length - 1] = `②PNG_OK(${Math.round(pngBuffer.length / 1024)}KB)`;

        // Step 3: Upload to Zalo
        trace.push('③UPLOAD...');
        const attachmentId = await uploadZaloImage(pngBuffer, cfg.ZALO_ACCESS_TOKEN);
        trace[trace.length - 1] = `③UPLOAD_OK`;
        message = buildZaloImageMessage(attachmentId, textMessage);
        trace.push('④MSG=MEDIA_IMAGE');
      } catch (imgErr: any) {
        trace[trace.length - 1] += `_FAIL:${imgErr.message}`;
        trace.push('④FALLBACK=TEXT');
        const payUrl = `${appBaseUrl}/pay/${student.id}${from && to ? `?from=${filters.fromDate}&to=${filters.toDate}` : ''}`;
        message = { text: `Trung tâm Hicado thông báo học phí em ${student.name} ${periodStr}: ${(totalDue).toLocaleString('vi-VN')}đ. QR nộp tiền: ${payUrl}` };
      }
    } else {
      message = { text: filters.message || 'Thông báo từ Trung tâm Hicado' };
      trace.push('①MSG=TEXT');
    }

    const trackingId = `CAMP_${campaign.id}_${student.id}_${Date.now()}`;
    try {
      const r = await zaloApiClient.post<any>(
        `${ZALO_OA_API}/v3.0/oa/message/cs`,
        { recipient: { user_id: student.zaloUserId }, message },
        { headers }
      );
      const success = r.data?.error === 0;
      const zaloMsgId: string | null = success ? (r.data?.data?.msg_id ?? r.data?.data?.message_id ?? null) : null;
      trace.push(success ? `⑤CS_OK` : `⑤CS_FAIL[${r.data?.error}]:${r.data?.message}`);
      
      if (success && billId) {
        await prisma.tuitionBill.update({ where: { id: billId }, data: { sentAt: new Date() } });
      }

      const traceStr = trace.join(' → ');
      console.log(`[Campaign] ${student.name}: ${traceStr}`);

      await (prisma as any).zaloMessageLog.create({
        data: {
          phone,
          zaloUserId: student.zaloUserId,
          templateId: `CAMPAIGN_${type}`,
          trackingId,
          status: success ? 'SENT' : 'FAILED',
          errorReason: traceStr,
          studentId: student.id,
          campaignId: campaign.id,
          zaloMsgId,
          billId,
          classId: primaryClassId,
          coveredClassIds,
          messageType: 'TUITION_REMINDER',
          billingMonth: filters.billingMonth || null,
        },
      });
      if (success) sentCount++; else failedCount++;
    } catch (err: any) {
      trace.push(`④CS_EXCEPTION:${err.message}`);
      const traceStr = trace.join(' → ');
      console.error(`[Campaign] ${student.name}: ${traceStr}`);
      failedCount++;
      await (prisma as any).zaloMessageLog.create({
        data: {
          phone,
          zaloUserId: student.zaloUserId,
          templateId: `CAMPAIGN_${type}`,
          trackingId,
          status: 'FAILED',
          errorReason: traceStr,
          studentId: student.id,
          campaignId: campaign.id,
          classId: primaryClassId,
          coveredClassIds,
          messageType: 'TUITION_REMINDER',
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

// Debug endpoint — uploads test PNG then tries every known CS image format + text fallback
// GET /api/campaigns/debug/image-send?zaloUserId=XXXX  (zaloUserId optional — skips send test if omitted)
router.get('/debug/image-send', authenticateToken, authorizeRoles('ADMIN', 'MANAGER'), async (req, res) => {
  const testUserId = req.query.zaloUserId as string | undefined;
  const result: Record<string, any> = {};
  try {
    const cfg = await getZaloConfig();
    result.token_preview = cfg.ZALO_ACCESS_TOKEN?.slice(0, 12) + '...' + cfg.ZALO_ACCESS_TOKEN?.slice(-4);
    result.has_token = !!cfg.ZALO_ACCESS_TOKEN;

    // PNG build
    const qrData = generateVietQRString('970436', '123456789', 100000, 'HS001 TOAN TEST');
    const pngBuffer = await buildPaymentSlipPNG({ studentName: 'Test Student', studentCode: 'HS001', className: 'Toan Hoc', classCode: 'TOAN', attended: 5, tuitionPerSession: 200000, amount: 1000000, memo: 'HS001 TOAN TEST', qrData });
    result.png_bytes = pngBuffer.length;

    // Upload
    const uploadedToken = await uploadZaloImage(pngBuffer, cfg.ZALO_ACCESS_TOKEN);
    result.upload = { error: 0, message: 'Success', data: { attachment_id: uploadedToken } };
    if (!uploadedToken) return res.json({ ok: false, result, verdict: 'Upload failed or no attachment_id in response' });

    if (!testUserId) return res.json({ ok: true, result, verdict: 'Upload OK. Re-call with ?zaloUserId=XXX to test CS send formats.' });

    const headers = { access_token: cfg.ZALO_ACCESS_TOKEN, 'Content-Type': 'application/json' };

    // Try 4 CS message formats in parallel
    const tryFormat = async (label: string, message: any) => {
      try {
        const r = await zaloApiClient.post<any>(`${ZALO_OA_API}/v3.0/oa/message/cs`,
          { recipient: { user_id: testUserId }, message }, { headers });
        return { label, error: r.data?.error, message: r.data?.message, data: r.data?.data };
      } catch (e: any) { return { label, exception: e.message }; }
    };

    result.cs_format_tests = await Promise.all([
      tryFormat('A: {token}',         { attachment: { type: 'image', payload: { token: uploadedToken } } }),
      tryFormat('B: {attachment_id}', { attachment: { type: 'image', payload: { attachment_id: uploadedToken } } }),
      tryFormat('C: text fallback',   { text: 'Hicado debug test - plain text' }),
      tryFormat('D: template/media',  { attachment: { type: 'template', payload: { template_type: 'media', elements: [{ media_type: 'image', attachment_id: uploadedToken }] } } }),
    ]);

    const winner = result.cs_format_tests.find((t: any) => t.error === 0);
    result.verdict = winner ? `✅ Working format: ${winner.label}` : `❌ All formats failed — check OA type/permissions`;
    res.json({ ok: !!winner, result });
  } catch (err: any) {
    res.json({ ok: false, result, error: err.message });
  }
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
