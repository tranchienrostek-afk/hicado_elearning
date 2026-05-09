import { Router } from 'express';
import prisma from '../lib/prisma';
import { authenticateToken, authorizeRoles } from '../middleware/auth';
import { findStudentByPaymentContent, normalizeSepayWebhookPayload, findBillByPaymentContent } from '../lib/sepayMatch';
import { getZaloConfig, ZALO_OA_API, zaloApiClient } from '../lib/zaloAuth';

const digitsOnly = (value: string) => value.replace(/\D/g, '');
const normalizePhone = (value: string) => {
  const d = digitsOnly(value);
  if (!d) return '';
  if (d.startsWith('84')) return d;
  if (d.startsWith('0')) return `84${d.slice(1)}`;
  return `84${d}`;
};
const normalizeName = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

// Zalo OA Webhook: captures follower user_ids when they message/follow OA
const handleZaloOA = async (req: any, res: any) => {
  res.json({ error: 0 }); // ACK immediately
  try {
    const { event_name, follower } = req.body;
    const userId: string | undefined = follower?.id;
    if (!userId) return;

    console.log(`[Zalo Webhook] event=${event_name} user_id=${userId}`);

    const linkTeacher = async (teacherId: string, reason: string) => {
      await prisma.teacher.update({ where: { id: teacherId }, data: { zaloUserId: userId } });
      console.log(`[Zalo Webhook] Linked userId=${userId} -> teacherId=${teacherId} (${reason})`);
    };

    const linkStudent = async (studentId: string, reason: string) => {
      await prisma.student.update({ where: { id: studentId }, data: { zaloUserId: userId } });
      console.log(`[Zalo Webhook] Linked userId=${userId} -> studentId=${studentId} (${reason})`);
    };

    const hasExistingLink = async () => {
      const [teacher, student] = await Promise.all([
        prisma.teacher.findFirst({ where: { zaloUserId: userId }, select: { id: true } }),
        prisma.student.findFirst({ where: { zaloUserId: userId }, select: { id: true } }),
      ]);
      return !!teacher || !!student;
    };

    // Auto-link on incoming text: username first, then phone number
    if (event_name === 'user_send_text') {
      const rawText: string = (req.body.message?.text || '').trim();
      const text = rawText.toLowerCase();

      if (text) {
        const user = await prisma.user.findFirst({
          where: { username: text },
          include: { teacher: true, student: true },
        });

        if (user?.teacherId) {
          await linkTeacher(user.teacherId, `username:${text}`);
        } else if (user?.studentId) {
          await linkStudent(user.studentId, `username:${text}`);
        } else {
          const phone = normalizePhone(rawText);
          if (phone) {
            const teachers = await prisma.teacher.findMany({
              where: { zaloUserId: null, phone: { not: null } },
              select: { id: true, phone: true },
            });
            const students = await prisma.student.findMany({
              where: {
                zaloUserId: null,
                OR: [{ parentPhone: { not: null } }, { studentPhone: { not: null } }],
              },
              select: { id: true, parentPhone: true, studentPhone: true },
            });

            const teacherMatches = teachers.filter(t => normalizePhone(t.phone || '') === phone);
            const studentMatches = students.filter(s =>
              [s.parentPhone, s.studentPhone].some(p => normalizePhone(p || '') === phone),
            );

            if (teacherMatches.length + studentMatches.length === 1) {
              if (teacherMatches.length === 1) {
                await linkTeacher(teacherMatches[0].id, `phone:${phone}`);
              } else {
                await linkStudent(studentMatches[0].id, `phone:${phone}`);
              }
            }
          }
        }
      }
    }

    // Auto-link by display_name if user follows OA (or sends text) and is still not linked
    if ((event_name === 'follow' || event_name === 'user_follow_oa' || event_name === 'user_send_text') && !(await hasExistingLink())) {
      try {
        const cfg = await getZaloConfig();
        if (cfg.ZALO_ACCESS_TOKEN) {
          const profileRes = await zaloApiClient.get<any>(
            `${ZALO_OA_API}/v2.0/oa/getprofile?data=${encodeURIComponent(JSON.stringify({ user_id: userId }))}`,
            { headers: { access_token: cfg.ZALO_ACCESS_TOKEN } },
          );

          const displayName = normalizeName(profileRes.data?.data?.display_name || '');
          if (displayName) {
            const [teachers, students] = await Promise.all([
              prisma.teacher.findMany({ where: { zaloUserId: null }, select: { id: true, name: true } }),
              prisma.student.findMany({ where: { zaloUserId: null }, select: { id: true, name: true } }),
            ]);

            const matchedTeachers = teachers.filter(t => normalizeName(t.name) === displayName);
            const matchedStudents = students.filter(s => normalizeName(s.name) === displayName);

            if (matchedTeachers.length + matchedStudents.length === 1) {
              if (matchedTeachers.length === 1) {
                await linkTeacher(matchedTeachers[0].id, `display_name:${displayName}`);
              } else {
                await linkStudent(matchedStudents[0].id, `display_name:${displayName}`);
              }
            }
          }
        }
      } catch (err: any) {
        console.warn(`[Zalo Webhook] profile-link skipped for userId=${userId}: ${err?.message || err}`);
      }
    }

    // Read receipt: update ZaloMessageLog status -> READ and increment campaign readCount
    if (event_name === 'user_seen_message') {
      const seenMsgId: string | undefined = req.body.message?.msg_id;
      const log = await (prisma as any).zaloMessageLog.findFirst({
        where: {
          zaloUserId: userId,
          status: 'SENT',
          ...(seenMsgId ? { zaloMsgId: seenMsgId } : {}),
        },
        orderBy: { sentAt: 'desc' },
      });

      if (log) {
        await (prisma as any).zaloMessageLog.update({
          where: { id: log.id },
          data: { status: 'READ', readAt: new Date() },
        });

        if (log.campaignId) {
          await (prisma as any).campaign.update({
            where: { id: log.campaignId },
            data: { readCount: { increment: 1 } },
          });
        }

        console.log(`[Zalo Webhook] READ receipt: userId=${userId} logId=${log.id}`);
      }
    }
  } catch (err) {
    console.error('[Zalo Webhook] Error:', err);
  }
};

// Core SePay processing logic: shared by webhook and manual endpoint
async function processSepayTransaction(payload: {
  id?: number | null;
  gateway?: string;
  transactionDate?: string;
  content?: string;
  transferType?: string;
  transferAmount: number;
  referenceCode?: string;
  sepayCode?: string;
}): Promise<{ success: boolean; message: string; studentName?: string; className?: string }> {
  const { id, gateway, transactionDate, content, transferAmount, referenceCode, sepayCode } = payload;

  const combinedContent = `${sepayCode || ''} ${content || ''}`.toUpperCase().trim();
  console.log(`[SePay] Processing: amount=${transferAmount} content="${combinedContent}"`);

  // Load all students/classes once. QR memos use studentCode when present, otherwise student id.
  const [allStudents, allClasses] = await Promise.all([
    prisma.student.findMany({ select: { id: true, name: true, studentCode: true } }),
    prisma.class.findMany({ where: { classCode: { not: null } }, select: { id: true, name: true, classCode: true } }),
  ]);

  const matchedStudent = findStudentByPaymentContent(allStudents, combinedContent);
  if (!matchedStudent) {
    console.warn(`[SePay] No student identifier found in: "${combinedContent}"`);
    return { success: false, message: `Khong tim thay ma hoc sinh trong noi dung: "${combinedContent}"` };
  }

  // Match class: find any classCode that appears in the content
  const matchedClass = allClasses.find(c => c.classCode && combinedContent.includes(c.classCode.toUpperCase())) ?? null;

  console.log(`[SePay] Matched student=${matchedStudent.name} class=${matchedClass?.name ?? 'none'}`);

  const transaction = await prisma.transaction.upsert({
    where: { sepayId: id ?? -1 } as any,
    update: {},
    create: {
      sepayId: id ?? null,
      amount: transferAmount,
      date: transactionDate ? new Date(transactionDate) : new Date(),
      gateway: gateway ?? 'manual',
      content: content ?? '',
      transferDate: transactionDate ? new Date(transactionDate) : new Date(),
      referenceCode: referenceCode ?? null,
      status: 'SUCCESS',
      studentId: matchedStudent.id,
      classId: matchedClass?.id ?? null,
    } as any,
  });

  // NEW: Check if this is a TuitionBill payment
  const bill = await findBillByPaymentContent(combinedContent);
  if (bill && bill.status !== 'CANCELLED') {
    const newPaidAmount = bill.paidAmount + transferAmount;
    const newStatus = newPaidAmount >= bill.amount ? 'PAID' : 'PARTIAL';

    await prisma.$transaction([
      prisma.billPayment.create({
        data: {
          billId: bill.id,
          amount: transferAmount,
          source: 'SEPAY',
          transactionId: (transaction as any).id,
          note: `Auto-matched via SePay content: "${content}"`
        }
      }),
      prisma.tuitionBill.update({
        where: { id: bill.id },
        data: {
          paidAmount: newPaidAmount,
          status: newStatus
        }
      })
    ]);
    console.log(`[SePay] Linked to TuitionBill: ${bill.referenceCode} status=${newStatus}`);
  }

  await prisma.student.update({ where: { id: matchedStudent.id }, data: { tuitionStatus: 'PAID' } });

  if (matchedClass) {
    await prisma.classStudent.upsert({
      where: { classId_studentId: { classId: matchedClass.id, studentId: matchedStudent.id } },
      update: {},
      create: { classId: matchedClass.id, studentId: matchedStudent.id },
    });
  }

  return { success: true, message: 'OK', studentName: matchedStudent.name, className: matchedClass?.name };
}

const router = Router();

/**
 * SePay Webhook Endpoint
 * Documentation: https://developer.sepay.vn/vi/sepay-webhooks/lap-trinh-webhooks
 */
router.post('/sepay', async (req, res) => {
  console.log(`[SePay Webhook] Raw body: ${JSON.stringify(req.body)}`);

  const authHeader = req.headers.authorization;
  const cfgRow = await prisma.systemConfig.findUnique({ where: { key: 'SEPAY_API_KEY' } }).catch(() => null);
  const apiKey = cfgRow?.value || process.env.SEPAY_API_KEY;

  if (apiKey && authHeader !== `Apikey ${apiKey}`) {
    console.error(`[SePay Webhook] Auth failed. Got: "${authHeader}" Expected: "Apikey ${apiKey?.slice(0, 6)}..."`);
    return res.status(401).json({ message: 'Unauthorized' });
  }

  const { id, gateway, transactionDate, content, transferType, transferAmount, referenceCode, sepayCode } = normalizeSepayWebhookPayload(req.body);

  if (transferType !== 'in') {
    return res.json({ success: true, message: 'Not an incoming transfer' });
  }

  try {
    const result = await processSepayTransaction({ id, gateway, transactionDate, content, transferType, transferAmount, referenceCode, sepayCode });
    console.log(`[SePay Webhook] Result: ${JSON.stringify(result)}`);
    res.json(result);
  } catch (error: any) {
    console.error('[SePay Webhook] Error:', error.message);
    res.status(500).json({ message: 'Internal server error' });
  }
});

/**
 * Manual transaction entry: for payments missed by webhook (Render sleep, SePay misconfiguration, etc.)
 * POST /api/webhook/manual-transaction
 * Body: { studentCode, amount, content?, classCode?, transactionDate? }
 */
router.post('/manual-transaction', authenticateToken, authorizeRoles('ADMIN', 'MANAGER'), async (req, res) => {
  const { studentCode, amount, content, classCode, transactionDate } = req.body as {
    studentCode: string;
    amount: number;
    content?: string;
    classCode?: string;
    transactionDate?: string;
  };

  if (!studentCode || !amount) return res.status(400).json({ message: 'Can studentCode va amount' });

  try {
    const result = await processSepayTransaction({
      id: null,
      gateway: 'manual',
      transactionDate,
      content: content ?? `${studentCode} ${classCode ?? ''}`.trim(),
      transferType: 'in',
      transferAmount: amount,
      sepayCode: studentCode,
    });

    if (!result.success) return res.status(404).json({ message: result.message });
    res.json({ message: `Da ghi nhan: ${result.studentName} - ${amount.toLocaleString('vi-VN')}d`, ...result });
  } catch (err: any) {
    console.error('[Manual Tx]', err.message);
    res.status(500).json({ message: err.message });
  }
});

// Zalo OA Webhook endpoint (GET = verification, POST = events)
router.get('/zalo', (req, res) => res.send(req.query.challenge || 'OK'));
router.post('/zalo', handleZaloOA);

export default router;
