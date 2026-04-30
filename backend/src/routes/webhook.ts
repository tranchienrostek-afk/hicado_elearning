import { Router } from 'express';
import prisma from '../lib/prisma';

// Zalo OA Webhook — captures follower user_ids when they message the OA
// Configure URL in oa.zalo.me → Cài đặt → Webhook
const handleZaloOA = async (req: any, res: any) => {
  res.json({ error: 0 });  // ACK immediately
  try {
    const { event_name, follower } = req.body;
    const userId: string | undefined = follower?.id;
    if (!userId) return;

    console.log(`[Zalo Webhook] event=${event_name} user_id=${userId}`);

    // Auto-link: if follower sent a message containing their system username, link them
    if (event_name === 'user_send_text') {
      const text: string = (req.body.message?.text || '').trim().toLowerCase();
      if (text) {
        const user = await prisma.user.findFirst({
          where: { username: text },
          include: { teacher: true, student: true }
        });
        if (user?.teacherId) {
          await prisma.teacher.update({ where: { id: user.teacherId }, data: { zaloUserId: userId } });
          console.log(`[Zalo Webhook] Auto-linked userId=${userId} → teacher ${user.name}`);
        } else if (user?.studentId) {
          await prisma.student.update({ where: { id: user.studentId }, data: { zaloUserId: userId } });
          console.log(`[Zalo Webhook] Auto-linked userId=${userId} → student ${user.name}`);
        }
      }
    }
  } catch (err) {
    console.error('[Zalo Webhook] Error:', err);
  }
};

const router = Router();

/**
 * SePay Webhook Endpoint
 * Documentation: https://developer.sepay.vn/vi/sepay-webhooks/lap-trinh-webhooks
 */
router.post('/sepay', async (req, res) => {
  const authHeader = req.headers.authorization;

  // Read API key from DB first, fallback to env
  const cfgRow = await prisma.systemConfig.findUnique({ where: { key: 'SEPAY_API_KEY' } }).catch(() => null);
  const apiKey = cfgRow?.value || process.env.SEPAY_API_KEY;

  // 1. Verify Authentication
  if (apiKey && authHeader !== `Apikey ${apiKey}`) {
    console.error('[SePay Webhook] Unauthorized request');
    return res.status(401).json({ message: 'Unauthorized' });
  }

  const {
    id,
    gateway,
    transactionDate,
    content,
    transferType,
    transferAmount,
    referenceCode,
    code: sepayCode
  } = req.body;

  console.log(`[SePay Webhook] Received transaction ${id}: ${content} (${transferAmount})`);

  // 2. Only process incoming transfers
  if (transferType !== 'in') {
    return res.json({ success: true, message: 'Not an incoming transfer' });
  }

  try {
    // 3. Extract Student Code and Class Code from content
    // pattern: HSxxx CLASSxxx (e.g., HS001 TOAN)
    const combinedContent = `${sepayCode || ''} ${content || ''}`.toUpperCase();
    
    // Regex to find HS followed by digits, and a word for class code
    const studentMatch = combinedContent.match(/HS\d+/);
    const studentCode = studentMatch ? studentMatch[0] : null;

    // After student code, look for class code (e.g. TOAN, ANHVĂN, etc.)
    // We'll search for all words and see which one matches a classCode in DB
    const words = combinedContent.split(/\s+/);
    
    if (!studentCode) {
      console.warn(`[SePay Webhook] Could not find student code in: ${combinedContent}`);
      return res.json({ success: true, message: 'Student code not found' });
    }

    // 4. Find student in database
    const student = await prisma.student.findUnique({
      where: { studentCode } as any
    });

    if (!student) {
      console.warn(`[SePay Webhook] Student ${studentCode} not found in database`);
      return res.json({ success: true, message: 'Student not found' });
    }

    // 5. Find Class
    // Try to find if any word in the content matches a known classCode
    let targetClass = null;
    for (const word of words) {
      if (word === studentCode) continue;
      const foundClass = await prisma.class.findUnique({
        where: { classCode: word } as any
      });
      if (foundClass) {
        targetClass = foundClass;
        break;
      }
    }

    // 6. Record Transaction
    await prisma.transaction.upsert({
      where: { sepayId: id } as any,
      update: {},
      create: {
        sepayId: id,
        amount: transferAmount,
        date: transactionDate ? new Date(transactionDate) : new Date(),
        gateway,
        content,
        transferDate: transactionDate ? new Date(transactionDate) : new Date(),
        referenceCode,
        status: 'SUCCESS',
        studentId: student.id
      } as any
    });

    // 7. Update Student Status
    await prisma.student.update({
      where: { id: student.id },
      data: { tuitionStatus: 'PAID' }
    });

    // 8. Enroll in Class if found
    if (targetClass) {
      await prisma.classStudent.upsert({
        where: {
          classId_studentId: {
            classId: targetClass.id,
            studentId: student.id
          }
        },
        update: {},
        create: {
          classId: targetClass.id,
          studentId: student.id
        }
      });
      console.log(`[SePay Webhook] Enrolled student ${student.name} in class ${targetClass.name}`);
    }

    res.json({ success: true });
  } catch (error) {
    console.error('[SePay Webhook] Error processing webhook:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Zalo OA Webhook endpoint (GET = verification, POST = events)
router.get('/zalo', (req, res) => res.send(req.query.challenge || 'OK'));
router.post('/zalo', handleZaloOA);

export default router;
