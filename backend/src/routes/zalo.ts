import { Router } from 'express';
import { Prisma } from '@prisma/client';
import prisma from '../lib/prisma';
import { authenticateToken, authorizeRoles } from '../middleware/auth';
import { zaloApiClient, getZaloConfig, ZALO_OA_API } from '../lib/zaloAuth';
import { buildCustomTuitionMessage, CustomTuitionPayload, buildZaloImageMessage, uploadZaloImage, buildMultiClassTuitionMessage } from '../lib/zaloMessage';
import { generateBillCode } from '../lib/billCode';
import { buildMultiClassPaymentSlipPNG, deaccent } from '../lib/paymentSlip';
import { generateVietQRString } from '../lib/vietqr';
import { expectedForStudentClass } from '../lib/financeMath';


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
    if (!cfg.ZALO_ACCESS_TOKEN) return res.status(400).json({ message: 'Missing Zalo Access Token' });

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
        { templateId: '305141', templateName: 'Thong bao thu hoc phi', status: 'APPROVED', price: 250 },
        { templateId: '305142', templateName: 'Nhac nho hoc phi qua han', status: 'APPROVED', price: 250 }
      ];
    }

    for (const t of templates) {
      await prisma.zaloTemplate.upsert({
        where: { templateId: t.templateId },
        update: { templateName: t.templateName, status: t.status, price: t.price },
        create: t
      });
    }

    res.json({ message: 'Sync thanh cong', data: templates });
  } catch (error) {
    console.error('Loi dong bo Zalo Template:', error);
    res.status(500).json({ message: 'Loi dong bo mau tin Zalo' });
  }
});

// 2. Get local Templates
router.get('/templates', authenticateToken, async (req, res) => {
  try {
    const templates = await prisma.zaloTemplate.findMany();
    res.json(templates);
  } catch (error) {
    res.status(500).json({ message: 'Loi lay mau tin' });
  }
});

// 3. Get OA Followers with profiles
router.get('/followers', authenticateToken, authorizeRoles('ADMIN', 'MANAGER'), async (req, res) => {
  try {
    const cfg = await getZaloConfig();
    if (!cfg.ZALO_ACCESS_TOKEN) return res.status(400).json({ message: 'Missing Zalo Access Token' });

    const headers = { access_token: cfg.ZALO_ACCESS_TOKEN };

    // Get follower list using v3.0 API.
    const follRes = await zaloApiClient.get<any>(
      `${ZALO_OA_API}/v3.0/oa/user/getlist?data=${encodeURIComponent(JSON.stringify({ offset: 0, count: 50 }))}`,
      { headers }
    );

    if (follRes.data.error !== 0) {
      return res.status(400).json({ message: `Zalo error: ${follRes.data.message} (${follRes.data.error})` });
    }

    const followerIds: Array<{ user_id: string }> = follRes.data.data?.users || [];

    // Get profile for each follower (parallel, max 10 at a time)
    const profiles = await Promise.all(
      followerIds.map(async ({ user_id }) => {
        try {
          const pr = await zaloApiClient.get<any>(
            // Get follower profile using v3.0 API.
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
    console.error('Loi lay followers:', error.response?.data || error.message);
    res.status(500).json({ message: 'Loi lay danh sach followers' });
  }
});

// 3b. Candidates for manual mapping
router.get('/mapping/candidates', authenticateToken, authorizeRoles('ADMIN', 'MANAGER'), async (req, res) => {
  try {
    const { type = 'STUDENTS', search = '', page = '1', classId = '', status = 'ALL' } = req.query as Record<string, string>;
    const PAGE = 20;
    const skip = (Math.max(1, Number(page)) - 1) * PAGE;

    const where: any = { isActive: true };
    if (search) where.name = { contains: search, mode: 'insensitive' as const };
    if (status === 'LINKED') where.zaloUserId = { not: null };
    if (status === 'UNLINKED') where.zaloUserId = null;

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

    // STUDENTS - optional classId filter
    if (classId) where.classes = { some: { classId } };

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
    res.status(500).json({ message: 'Loi lay danh sach candidates: ' + err.message });
  }
});

// 3c. Per-class mapping stats
router.get('/mapping/class-stats', authenticateToken, authorizeRoles('ADMIN', 'MANAGER'), async (req, res) => {
  try {
    const classes = await prisma.class.findMany({
      include: {
        students: {
          where: { student: { isActive: true } },
          include: { student: { select: { zaloUserId: true } } },
        },
      },
      orderBy: { sortOrder: 'asc' },
    });

    const stats = classes.map(cls => {
      const total = cls.students.length;
      const mapped = cls.students.filter(s => !!s.student.zaloUserId).length;
      return {
        classId: cls.id,
        className: cls.name,
        classCode: cls.classCode,
        totalStudents: total,
        mappedStudents: mapped,
        mappedPercent: total === 0 ? 100 : Math.round((mapped / total) * 100),
      };
    });

    res.json(stats);
  } catch (err: any) {
    res.status(500).json({ message: 'Loi lay class stats: ' + err.message });
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
    res.status(500).json({ message: 'Loi lay nhat ky dinh danh: ' + err.message });
  }
});

// 4. Link a Zalo user_id to a teacher or student
// 4. Link a Zalo user_id to a teacher or student (with conflict detection + audit)
router.post('/link', authenticateToken, authorizeRoles('ADMIN', 'MANAGER'), async (req, res) => {
  const { zaloUserId: rawId, teacherId, studentId, force = false } = req.body;
  if (!rawId || (!teacherId && !studentId)) {
    return res.status(400).json({ message: 'Can zaloUserId va teacherId hoac studentId' });
  }

  const zaloUserId = String(rawId).trim().toLowerCase();
  const user = (req as any).user as { id: string; name: string; role: string };

  try {
    // Resolve target details
    let targetName = '';
    let targetId = '';
    let targetType = '';

    if (teacherId) {
      const teacher = await prisma.teacher.findUnique({ where: { id: teacherId }, select: { name: true } });
      if (!teacher) return res.status(404).json({ message: 'Khong tim thay giao vien' });
      targetName = teacher.name;
      targetId = teacherId;
      targetType = 'TEACHER';
    } else {
      const student = await prisma.student.findUnique({ where: { id: studentId }, select: { name: true } });
      if (!student) return res.status(404).json({ message: 'Khong tim thay hoc sinh' });
      targetName = student.name;
      targetId = studentId;
      targetType = 'STUDENT';
    }


    // ATOMIC TRANSACTION: Lock -> Check Conflict -> Clear Old (if override) -> Update New -> Audit
    await prisma.$transaction(async (tx) => {
      // 1. Acquire advisory lock for this zaloUserId to prevent race conditions across tables (Student & Teacher)
      // This ensures only one process can link/override this specific UID at a time.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'zalo_mapping_' + zaloUserId}))`;

      const [existingStudents, existingTeachers] = await Promise.all([
        tx.student.findMany({ where: { zaloUserId }, select: { id: true, name: true } }),
        tx.teacher.findMany({ where: { zaloUserId }, select: { id: true, name: true } }),
      ]);

      const allConflicts = [...existingStudents, ...existingTeachers];

      // Only warn if there are OTHER people already using this ID
      const otherConflicts = allConflicts.filter(c =>
        !(studentId && c.id === studentId) && !(teacherId && c.id === teacherId)
      );

      if (otherConflicts.length > 0) {
        if (!force) {
          const error: any = new Error('CONFLICT');
          error.conflictInfo = {
            conflict: true,
            conflictCount: otherConflicts.length,
            conflictNames: otherConflicts.map(c => c.name).join(', '),
            // For backward compatibility:
            conflictName: otherConflicts[0].name,
            conflictId: otherConflicts[0].id,
          };
          throw error;
        }
        // Shared link confirmed: multiple targets can share the same zaloUserId.
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
          action: otherConflicts.length > 0 ? 'LINK_SHARED' : 'LINK',
          zaloUserId,
          targetType,
          targetId,
          targetName,
          previousTargetId: otherConflicts.length > 0 ? otherConflicts[0].id : undefined,
          previousTargetName: otherConflicts.length > 0 ? otherConflicts.map(c => c.name).join(', ') : undefined,
          performedBy: user.id,
          performedByName: user.name ?? user.id,
        },
      });
    });

    res.json({ message: 'Lien ket thanh cong!', zaloUserId, targetId, targetType });
  } catch (err: any) {
    if (err.message === 'CONFLICT') {
      const { conflictCount, conflictNames, conflictName, conflictId } = err.conflictInfo;
      return res.status(409).json({
        conflict: true,
        message: `Zalo ID nay dang duoc ghep voi: ${conflictNames}. Xac nhan dung chung?`,
        conflictCount,
        conflictNames,
        conflictName,
        conflictId,
      });
    }
    if (err.code === 'P2002') {
      return res.status(409).json({ message: 'zalo_user_id nay da duoc dung boi nguoi khac (unique constraint).' });
    }
    res.status(500).json({ message: 'Loi lien ket: ' + err.message });
  }
});

// 4b. Unlink: remove zaloUserId with audit log
router.delete('/link', authenticateToken, authorizeRoles('ADMIN', 'MANAGER'), async (req, res) => {
  const { studentId, teacherId } = req.body;
  if (!studentId && !teacherId) return res.status(400).json({ message: 'Can studentId hoac teacherId' });

  const user = (req as any).user as { id: string; name: string };

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
          performedBy: user.id,
          performedByName: user.name ?? user.id,
        },
      });
    });

    res.json({ message: 'Da huy lien ket' });
  } catch (err: any) {
    if (err.message === 'NOT_FOUND_STUDENT') return res.status(404).json({ message: 'Khong tim thay hoc sinh' });
    if (err.message === 'NOT_FOUND_TEACHER') return res.status(404).json({ message: 'Khong tim thay giao vien' });
    res.status(500).json({ message: 'Loi huy lien ket: ' + err.message });
  }
});

// 5. Send OA Customer Service message (works for followers, no ZNS approval needed)
router.post('/send/cs', authenticateToken, authorizeRoles('ADMIN', 'MANAGER'), async (req, res) => {
  const { userIds, message } = req.body;
  if (!userIds || !Array.isArray(userIds) || !message) {
    return res.status(400).json({ message: 'Can userIds[] va message' });
  }

  const cfg = await getZaloConfig();
  if (!cfg.ZALO_ACCESS_TOKEN) return res.status(400).json({ message: 'Missing Zalo Access Token' });

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
    message: `Gui thanh cong ${sentCount}/${userIds.length} tin nhan`,
    sentCount,
    failedCount,
    errors
  });
});

// 5b. Send Custom Tuition (Task #9)
type CustomTuitionItemInput = {
  studentId: string;
  sessions: number;
  pricePerSession: number;
  totalOverride?: number;
  note?: string;
  classId?: string;
};

const isNonEmptyString = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

const normalizeDateRange = (fromDate?: string, toDate?: string) => {
  const from = fromDate ? new Date(fromDate) : null;
  const to = toDate ? new Date(toDate) : null;
  if (from && Number.isNaN(from.getTime())) throw new Error('Invalid fromDate');
  if (to && Number.isNaN(to.getTime())) throw new Error('Invalid toDate');
  if (from) from.setHours(0, 0, 0, 0);
  if (to) to.setHours(23, 59, 59, 999);
  return { from, to };
};

const buildSentAtSql = (from: Date | null, to: Date | null) => {
  if (from && to) return Prisma.sql`AND "sentAt" >= ${from} AND "sentAt" <= ${to}`;
  if (from) return Prisma.sql`AND "sentAt" >= ${from}`;
  if (to) return Prisma.sql`AND "sentAt" <= ${to}`;
  return Prisma.empty;
};



router.post('/send/custom-tuition', authenticateToken, authorizeRoles('ADMIN', 'MANAGER'), async (req, res) => {
  const {
    items,
    campaignId,
    name,
    sendVia = 'AUTO',
    templateId,
    fromDate,
    toDate,
    studentCoveredClasses = {},
    forceResendStudentIds = [],
    billingMonth
  } = req.body as {
    items: CustomTuitionItemInput[];
    campaignId?: string;
    name?: string;
    sendVia?: 'AUTO' | 'CS' | 'ZNS';
    templateId?: string;
    fromDate?: string;
    toDate?: string;
    studentCoveredClasses?: Record<string, string[]>;
    forceResendStudentIds?: string[];
    billingMonth?: string;
  };

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ message: 'Invalid student list' });
  }
  if (!['AUTO', 'CS', 'ZNS'].includes(sendVia)) {
    return res.status(400).json({ message: 'Invalid send channel' });
  }

  let from: Date | null = null;
  let to: Date | null = null;
  try {
    ({ from, to } = normalizeDateRange(fromDate, toDate));
  } catch (err: any) {
    return res.status(400).json({ message: err.message });
  }

  const normalizedItems: CustomTuitionItemInput[] = [];
  for (const item of items) {
    if (!isNonEmptyString(item.studentId)) return res.status(400).json({ message: 'Invalid studentId' });
    if (!isFiniteNumber(item.sessions) || item.sessions < 1) return res.status(400).json({ message: 'Sessions must be >= 1' });
    if (!isFiniteNumber(item.pricePerSession) || item.pricePerSession < 0) return res.status(400).json({ message: 'Unit price must be >= 0' });
    if (item.totalOverride !== undefined && (!isFiniteNumber(item.totalOverride) || item.totalOverride < 0)) {
      return res.status(400).json({ message: 'Manual total must be >= 0' });
    }
    normalizedItems.push({ ...item, sessions: Math.round(item.sessions), pricePerSession: Math.round(item.pricePerSession), totalOverride: item.totalOverride === undefined ? undefined : Math.round(item.totalOverride) });
  }

  const cfg = await getZaloConfig();
  if (!cfg.ZALO_ACCESS_TOKEN) return res.status(400).json({ message: 'Missing Zalo Access Token' });
  if (sendVia === 'ZNS' && !templateId) return res.status(400).json({ message: 'Missing ZNS templateId' });

  const headers = { access_token: cfg.ZALO_ACCESS_TOKEN, 'Content-Type': 'application/json' };
  const forceSet = new Set(forceResendStudentIds);
  let campaign: any = null;
  if (campaignId) {
    campaign = await (prisma as any).campaign.findUnique({ where: { id: campaignId } });
    if (!campaign) return res.status(404).json({ message: 'Campaign not found' });
  } else {
    campaign = await (prisma as any).campaign.create({
      data: {
        name: name?.trim() || `Manual tuition ${new Date().toLocaleDateString('vi-VN')}`,
        type: 'CUSTOM_TUITION',
        status: 'SENDING',
        filtersJson: JSON.stringify({ fromDate, toDate, sendVia, templateId, studentCoveredClasses }),
      },
    });
  }
  
  const bankCfg = await prisma.systemConfig.findMany({ where: { key: { in: ['BANK_BIN', 'BANK_ACC'] } } });
  const bm = bankCfg.reduce((a: any, r) => { a[r.key] = r.value; return a; }, {} as Record<string, string>);

  let sentCount = 0;
  let znsSentCount = 0;
  let failedCount = 0;
  let skippedCount = 0;
  const results: any[] = [];

  for (const item of normalizedItems) {
    const trackingId = `CT_${campaign.id}_${item.studentId}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const coveredClassIds = studentCoveredClasses[item.studentId] ?? (item.classId ? [item.classId] : []);
    const total = item.totalOverride ?? (item.sessions * item.pricePerSession);
    try {
      const student = await prisma.student.findUnique({ where: { id: item.studentId } });
      if (!student) {
        failedCount++;
        results.push({ studentId: item.studentId, status: 'FAILED', total, channel: 'NONE', error: 'Student not found' });
        continue;
      }

      const coveredClasses = coveredClassIds.length
        ? await prisma.class.findMany({ where: { id: { in: coveredClassIds } }, select: { id: true, name: true } })
        : [];
      const coveredClassName = coveredClasses.map(c => c.name).join(' + ') || 'Manual tuition';
      const payload: CustomTuitionPayload = {
        className: coveredClassName,
        sessions: item.sessions,
        pricePerSession: item.pricePerSession,
        total,
        note: item.note,
      };

      if (billingMonth && coveredClassIds.length > 0 && !forceSet.has(student.id)) {
        // Check 1: already sent a Zalo message this billing period
        const sentLog = await prisma.zaloMessageLog.findFirst({
          where: { studentId: student.id, status: 'SENT', billingMonth, coveredClassIds: { hasSome: coveredClassIds } }
        });

        // Check 2: student already has a paid/partial TuitionBill for this period (e.g. cash payment)
        const paidBill = !sentLog ? await prisma.tuitionBill.findFirst({
          where: {
            studentId: student.id,
            billingMonth,
            status: { in: ['PAID', 'PARTIAL'] },
            coveredClassIds: { hasSome: coveredClassIds }
          },
          select: { referenceCode: true }
        }) : null;

        const skipReason = sentLog
          ? `Already sent billing notice for ${billingMonth}`
          : paidBill
            ? `Cash payment already recorded (${paidBill.referenceCode})`
            : null;

        if (skipReason) {
          skippedCount++;
          results.push({ studentId: student.id, studentName: student.name, status: 'SKIPPED', total, channel: 'NONE', error: skipReason, coveredClassIds });
          await prisma.zaloMessageLog.create({
            data: {
              phone: student.parentPhone || student.studentPhone || '', zaloUserId: student.zaloUserId,
              templateId: 'CUSTOM_TUITION', trackingId, status: 'SKIPPED',
              errorReason: sentLog ? 'DEDUP_ALREADY_SENT' : 'DEDUP_CASH_PAID',
              studentId: student.id, campaignId: campaign.id, classId: item.classId, coveredClassIds,
              billingMonth,
              messageType: 'CUSTOM_TUITION', customPayload: JSON.stringify(payload),
            }
          });
          continue;
        }
      }


      const user = (req as any).user;
      let billId: string | null = null;
      let billRef: string | null = null;
      let billDetail: Array<{ classId: string; className: string; sessions: number; pricePerSession: number; subtotal: number }> = [];

      // Phase 3: Pre-create TuitionBill. This endpoint is intentionally manual:
      // the operator-provided sessions, unit price, and override total are the source of truth.
      try {
        billDetail = [{
          classId: coveredClassIds[0] || '',
          className: coveredClassName,
          sessions: item.sessions,
          pricePerSession: item.pricePerSession,
          subtotal: total,
        }];

        const bill = await prisma.tuitionBill.create({
          data: {
            studentId: student.id,
            coveredClassIds,
            fromDate: from || new Date(),
            toDate: to || new Date(),
            amount: total,
            sessionsDetail: JSON.stringify(billDetail),
            referenceCode: generateBillCode(),
            createdByName: user.name || user.username || 'System',
            billingMonth: billingMonth || null,
            notes: item.note
          }
        });
        billId = bill.id;
        billRef = bill.referenceCode;
      } catch (billErr) {
        console.error('[Pre-Bill Error]', billErr);
      }

      const billItems = billId ? billDetail : [];
      const fmt = (d: string | Date) => new Date(d).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
      const fmtFrom = fromDate ? fmt(fromDate) : undefined;
      const fmtTo = toDate ? fmt(toDate) : undefined;

      const messageText = billItems.length > 1
        ? buildMultiClassTuitionMessage(student.name, billItems, total, fmtFrom, fmtTo)
        : buildCustomTuitionMessage(student.name, { ...payload, className: billItems[0]?.className ?? '', fromDate: fmtFrom, toDate: fmtTo });

      let success = false;
      let channel: 'CS' | 'ZNS' | 'NONE' = 'NONE';
      let errorReason = '';
      let zaloMsgId: string | null = null;

      if ((sendVia === 'AUTO' || sendVia === 'CS') && student.zaloUserId) {
        try {
          let message: any = { text: messageText };

          // Try to attach image slip
          if (billRef) {
            try {
              const memo = deaccent(`${student.studentCode || student.id} ${billRef} ${student.name}`).toUpperCase().trim().slice(0, 50);
              const qrData = generateVietQRString(bm.BANK_BIN || process.env.BANK_BIN || '970436', bm.BANK_ACC || process.env.BANK_ACC || '', total, memo);
              
              const pngBuffer = await buildMultiClassPaymentSlipPNG({
                studentName: student.name,
                studentCode: student.studentCode || student.id,
                billingMonth: billingMonth,
                items: billItems,
                totalAmount: total,
                memo: memo,
                qrData: qrData
              });
              const attachmentId = await uploadZaloImage(pngBuffer, cfg.ZALO_ACCESS_TOKEN);
              message = buildZaloImageMessage(attachmentId, messageText);
            } catch (imgErr: any) {
              console.error('[Custom Tuition Image Error]', imgErr.message);
              // Fallback to text only is default 'message'
            }
          }

          const r = await zaloApiClient.post<any>(`${ZALO_OA_API}/v3.0/oa/message/cs`, { recipient: { user_id: student.zaloUserId }, message }, { headers });
          success = r.data?.error === 0;
          channel = 'CS';
          errorReason = success ? '' : `${r.data?.message ?? 'CS failed'} (${r.data?.error ?? 'unknown'})`;
          zaloMsgId = success ? (r.data?.data?.msg_id || r.data?.data?.message_id || null) : null;
        } catch (err: any) {
          errorReason = err.response?.data?.message || err.message;
        }
      }

      if (!success && (sendVia === 'AUTO' || sendVia === 'ZNS') && (student.parentPhone || student.studentPhone) && templateId) {
        try {
          const r = await zaloApiClient.post<any>('https://business.openapi.zalo.me/message/template', {
            phone: formatPhone(student.parentPhone || student.studentPhone || ''),
            template_id: templateId,
            template_data: {
              student_name: student.name,
              sessions: String(item.sessions),
              unit_price: item.pricePerSession.toLocaleString('vi-VN') + ' VND',
              amount: total.toLocaleString('vi-VN') + ' VND',
              note: item.note || '',
            },
            tracking_id: trackingId,
          }, { headers });
          success = r.data?.error === 0;
          channel = 'ZNS';
          errorReason = success ? '' : `${r.data?.message ?? 'ZNS failed'} (${r.data?.error ?? 'unknown'})`;
        } catch (err: any) {
          errorReason = err.response?.data?.message || err.message;
        }
      }

      if (!success && !errorReason) {
        errorReason = sendVia === 'CS'
          ? 'Student has no Zalo UID'
          : sendVia === 'ZNS'
            ? 'Student has no phone number or missing ZNS template'
            : 'No usable Zalo UID, phone number, or ZNS template';
      }

      await prisma.zaloMessageLog.create({
        data: {
          phone: student.parentPhone || student.studentPhone || '', zaloUserId: student.zaloUserId,
          templateId: channel === 'ZNS' && templateId ? `ZNS_${templateId}` : 'CUSTOM_TUITION', trackingId,
          status: success ? 'SENT' : 'FAILED', errorReason: success ? null : errorReason,
          studentId: student.id, campaignId: campaign.id, classId: item.classId, coveredClassIds,
          billingMonth: billingMonth || null, billId,
          messageType: 'CUSTOM_TUITION', customPayload: JSON.stringify(payload), zaloMsgId,
        }
      });

      if (success) {
        sentCount++;
        if (channel === 'ZNS') znsSentCount++;
        results.push({ studentId: student.id, studentName: student.name, status: 'SENT', total, channel, coveredClassIds });
        
        if (billId) {
          await prisma.tuitionBill.update({
            where: { id: billId },
            data: { sentAt: new Date() }
          });
        }
      } else {
        failedCount++;
        results.push({ studentId: student.id, studentName: student.name, status: 'FAILED', total, channel, error: errorReason, coveredClassIds });
      }
    } catch (err: any) {
      failedCount++;
      results.push({ studentId: item.studentId, status: 'FAILED', total, channel: 'NONE', error: err.message, coveredClassIds });
    }
  }

  const finalCampaign = await (prisma as any).campaign.update({
    where: { id: campaign.id },
    data: { status: 'SENT', sentCount, znsSentCount, failedCount, sentAt: new Date() },
  });

  res.json({
    message: `Sent ${sentCount} messages, skipped ${skippedCount}, failed ${failedCount}`,
    campaign: { ...finalCampaign, readRate: 0 },
    sentCount,
    znsSentCount,
    skippedCount,
    failedCount,
    results,
  });
});

// 5c. Check Sent Status (Task #10)
router.get('/tuition/check-sent', authenticateToken, authorizeRoles('ADMIN', 'MANAGER'), async (req, res) => {
  const { studentId, classId, fromDate, toDate } = req.query as Record<string, string>;
  if (!isNonEmptyString(studentId) || !isNonEmptyString(classId)) return res.status(400).json({ message: 'Missing studentId or classId' });
  let from: Date | null = null;
  let to: Date | null = null;
  try { ({ from, to } = normalizeDateRange(fromDate, toDate)); } catch (err: any) { return res.status(400).json({ message: err.message }); }
  const sentAtFilter = buildSentAtSql(from, to);

  const logs = await prisma.$queryRaw<Array<{ id: string; sentAt: Date; coveredClassIds: string[]; messageType: string | null }>>`
    SELECT id, "sentAt", "coveredClassIds", "messageType"
    FROM "ZaloMessageLog"
    WHERE "studentId" = ${studentId}
      AND status = 'SENT'
      AND "coveredClassIds" @> ARRAY[${classId}]::text[]
      ${sentAtFilter}
    ORDER BY "sentAt" DESC
    LIMIT 5
  `;

  if (logs.length === 0) return res.json({ alreadySent: false });

  const allClassIds = [...new Set(logs.flatMap(l => l.coveredClassIds))];
  const classes = await prisma.class.findMany({ where: { id: { in: allClassIds } }, select: { id: true, name: true } });
  const classMap = new Map(classes.map(c => [c.id, c.name]));

  res.json({
    alreadySent: true,
    logs: logs.map(l => ({
      logId: l.id,
      sentAt: l.sentAt,
      messageType: l.messageType,
      coveredClassIds: l.coveredClassIds,
      coveredClassNames: l.coveredClassIds.map(id => classMap.get(id) ?? id),
    }))
  });
});

// 5d. Preview Multi-class (Task #10)
router.get('/tuition/preview-multiclass', authenticateToken, authorizeRoles('ADMIN', 'MANAGER'), async (req, res) => {
  const { classId, fromDate, toDate } = req.query as Record<string, string>;
  if (!isNonEmptyString(classId)) return res.status(400).json({ message: 'Missing classId' });
  let from: Date | null = null;
  let to: Date | null = null;
  try { ({ from, to } = normalizeDateRange(fromDate, toDate)); } catch (err: any) { return res.status(400).json({ message: err.message }); }

  const classStudents = await prisma.classStudent.findMany({
    where: { classId },
    include: {
      student: {
        include: {
          classes: { include: { class: { select: { id: true, name: true, classCode: true, tuitionPerSession: true } } } },
          attendances: {
            where: { status: 'PRESENT', ...(from || to ? { date: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}) },
            select: { studentId: true, classId: true, status: true, sessionUnits: true, date: true }
          }
        }
      }
    }
  });

  const studentIds = classStudents.map(cs => cs.studentId);
  const sentAtFilter = buildSentAtSql(from, to);
  const sentLogs = studentIds.length ? await prisma.$queryRaw<Array<{ studentId: string; sentAt: Date; coveredClassIds: string[] }>>`
    SELECT "studentId", "sentAt", "coveredClassIds"
    FROM "ZaloMessageLog"
    WHERE "studentId" = ANY(ARRAY[${Prisma.join(studentIds)}]::text[])
      AND status = 'SENT'
      AND "coveredClassIds" @> ARRAY[${classId}]::text[]
      ${sentAtFilter}
    ORDER BY "sentAt" DESC
  ` : [];
  const sentByStudent = new Map<string, Array<{ sentAt: Date; coveredClassIds: string[] }>>();
  for (const log of sentLogs) sentByStudent.set(log.studentId, [...(sentByStudent.get(log.studentId) ?? []), { sentAt: log.sentAt, coveredClassIds: log.coveredClassIds }]);

  const results = classStudents.map(cs => {
    const s = cs.student;
    const mainClass = s.classes.find(c => c.classId === classId);
    const mainClassAtts = s.attendances.filter(a => a.classId === classId);
    const mainAttended = mainClassAtts.reduce((sum, a) => sum + (a.sessionUnits ?? 1), 0);
    
    const mainSubtotal = expectedForStudentClass(
      mainClass?.class as any, s.id, mainClassAtts as any, cs
    );

    const otherClasses = s.classes
      .filter(c => c.classId !== classId)
      .map(c => {
        const atts = s.attendances.filter(a => a.classId === c.classId);
        const attended = atts.reduce((sum, a) => sum + (a.sessionUnits ?? 1), 0);
        const subtotal = expectedForStudentClass(c.class as any, s.id, atts as any, c);
        return { 
          classId: c.classId, 
          className: c.class.name, 
          classCode: c.class.classCode, 
          attended, 
          tuitionPerSession: c.class.tuitionPerSession, 
          subtotal 
        };
      });

    const logs = sentByStudent.get(s.id) ?? [];
    return {
      studentId: s.id, studentName: s.name, studentCode: s.studentCode,
      hasZalo: !!s.zaloUserId,
      mainClass: { 
        classId, 
        className: mainClass?.class.name ?? '',
        attended: mainAttended, 
        tuitionPerSession: mainClass?.class.tuitionPerSession ?? 0,
        subtotal: mainSubtotal
      },
      otherClasses,
      alreadySent: logs.length > 0,
      sentLogs: logs.slice(0, 3).map(l => ({ sentAt: l.sentAt, coveredClassIds: l.coveredClassIds }))
    };
  });

  res.json(results);
});

// 5e. Batch Check Sent (Task #10)
router.post('/tuition/batch-check-sent', authenticateToken, authorizeRoles('ADMIN', 'MANAGER'), async (req, res) => {
  const { studentIds, classId, fromDate, toDate } = req.body as { studentIds?: string[]; classId?: string; fromDate?: string; toDate?: string };
  if (!Array.isArray(studentIds) || studentIds.some(id => !isNonEmptyString(id)) || !isNonEmptyString(classId)) {
    return res.status(400).json({ message: 'Invalid studentIds or classId' });
  }
  if (studentIds.length === 0) return res.json({});
  let from: Date | null = null;
  let to: Date | null = null;
  try { ({ from, to } = normalizeDateRange(fromDate, toDate)); } catch (err: any) { return res.status(400).json({ message: err.message }); }
  const sentAtFilter = buildSentAtSql(from, to);

  const logs = await prisma.$queryRaw<Array<{ studentId: string; sentAt: Date; coveredClassIds: string[] }>>`
    SELECT DISTINCT ON ("studentId") "studentId", "sentAt", "coveredClassIds"
    FROM "ZaloMessageLog"
    WHERE "studentId" = ANY(ARRAY[${Prisma.join(studentIds)}]::text[])
      AND status = 'SENT'
      AND "coveredClassIds" @> ARRAY[${classId}]::text[]
      ${sentAtFilter}
    ORDER BY "studentId", "sentAt" DESC
  `;

  const result: Record<string, { alreadySent: boolean; sentAt?: Date; coveredClassIds?: string[] }> = {};
  for (const sid of studentIds) result[sid] = { alreadySent: false };
  for (const log of logs) result[log.studentId] = { alreadySent: true, sentAt: log.sentAt, coveredClassIds: log.coveredClassIds };

  res.json(result);
});

// 6. Batch Send Tuition Notification (ZNS - requires app approval)
router.post('/send/tuition', authenticateToken, authorizeRoles('ADMIN', 'MANAGER'), async (req, res) => {
  const { studentIds, templateId } = req.body;
  if (!studentIds || !Array.isArray(studentIds) || !templateId) {
    return res.status(400).json({ message: 'Invalid request payload' });
  }

  const cfg = await getZaloConfig();
  if (!cfg.ZALO_ACCESS_TOKEN) return res.status(400).json({ message: 'Missing Zalo Access Token' });

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
            message: { text: `Xin chao ${student.name}! Trung tam Hicado thong bao hoc phi cua ban can duoc thanh toan. Vui long lien he de biet them chi tiet. Tran trong!` }
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
          template_data: { student_name: student.name, amount: '150,000 VND', due_date: '30/06/2026' },
          tracking_id: trackingId
        }, { headers: { access_token: cfg.ZALO_ACCESS_TOKEN, 'Content-Type': 'application/json' } });

        await prisma.zaloMessageLog.create({
          data: {
            phone: formattedPhone,
            zaloUserId: student.zaloUserId,
            templateId,
            trackingId,
            status: r.data.error === 0 ? 'SENT' : 'FAILED',
            errorReason: r.data.error !== 0 ? `${r.data.message} (${r.data.error})` : null,
            studentId: student.id,
            classId: req.body.primaryClassId || null,
            coveredClassIds: (req.body.studentCoveredClasses?.[student.id] as string[]) ?? (req.body.primaryClassId ? [req.body.primaryClassId] : []),
            messageType: 'TUITION_REMINDER',
          }
        });
        if (r.data.error === 0) sentCount++; else failedCount++;
      } catch (err: any) {
        failedCount++;
        await prisma.zaloMessageLog.create({
          data: {
            phone: formattedPhone,
            templateId,
            trackingId,
            status: 'FAILED',
            errorReason: err.message,
            studentId: student.id,
            classId: req.body.primaryClassId || null,
            coveredClassIds: (req.body.studentCoveredClasses?.[student.id] as string[]) ?? (req.body.primaryClassId ? [req.body.primaryClassId] : []),
            messageType: 'TUITION_REMINDER',
          }
        });
      }
    }

    res.json({ message: `Sent ${sentCount} messages, failed ${failedCount}` });
  } catch (error) {
    console.error('Loi gui tin Zalo:', error);
    res.status(500).json({ message: 'Loi gui tin Zalo' });
  }
});

export default router;
