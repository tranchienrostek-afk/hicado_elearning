import { Router } from 'express';
import { randomBytes, createHash } from 'node:crypto';
import prisma from '../lib/prisma';
import { authenticateToken, authorizeRoles } from '../middleware/auth';
import axios from 'axios';
import { zaloApiClient } from '../lib/zaloAuth';

const router = Router();

// ─── Helper ──────────────────────────────────────────────────────────────────
const upsertConfigs = async (entries: { key: string; value: string }[]) => {
  for (const { key, value } of entries) {
    await prisma.systemConfig.upsert({
      where: { key },
      update: { value },
      create: { key, value }
    });
  }
};

const getConfigs = async (keys: string[]): Promise<Record<string, string>> => {
  const rows = await prisma.systemConfig.findMany({ where: { key: { in: keys } } });
  return rows.reduce((acc, r) => { acc[r.key] = r.value; return acc; }, {} as Record<string, string>);
};

// ─── ZALO ─────────────────────────────────────────────────────────────────────
router.get('/zalo', authenticateToken, authorizeRoles('ADMIN', 'MANAGER'), async (req, res) => {
  try {
    res.json(await getConfigs(['ZALO_APP_ID', 'ZALO_SECRET_KEY', 'ZALO_REFRESH_TOKEN', 'ZALO_ACCESS_TOKEN']));
  } catch { res.status(500).json({ message: 'Lỗi server' }); }
});

router.post('/zalo', authenticateToken, authorizeRoles('ADMIN', 'MANAGER'), async (req, res) => {
  try {
    const { ZALO_APP_ID, ZALO_SECRET_KEY, ZALO_REFRESH_TOKEN, ZALO_ACCESS_TOKEN } = req.body;
    const updates = [
      { key: 'ZALO_APP_ID', value: ZALO_APP_ID },
      { key: 'ZALO_SECRET_KEY', value: ZALO_SECRET_KEY },
      { key: 'ZALO_REFRESH_TOKEN', value: ZALO_REFRESH_TOKEN },
      { key: 'ZALO_ACCESS_TOKEN', value: ZALO_ACCESS_TOKEN },
    ].filter(u => u.value !== undefined);
    await upsertConfigs(updates);
    res.json({ message: 'Cập nhật cấu hình Zalo thành công!' });
  } catch { res.status(500).json({ message: 'Lỗi lưu cấu hình Zalo' }); }
});

// GET /zalo/oauth-url — generate PKCE auth URL for user to authorize OA access
router.get('/zalo/oauth-url', authenticateToken, authorizeRoles('ADMIN', 'MANAGER'), async (req, res) => {
  try {
    const cfg = await getConfigs(['ZALO_APP_ID']);
    if (!cfg.ZALO_APP_ID) return res.status(400).json({ success: false, message: 'Chưa cấu hình ZALO_APP_ID' });

    const verifier = randomBytes(32).toString('base64url');
    const challenge = createHash('sha256').update(verifier).digest('base64url');
    const state = randomBytes(16).toString('hex');
    const callbackUrl = `${req.protocol}://${req.get('host')}/api/config/zalo/oauth-callback`;

    await upsertConfigs([
      { key: 'ZALO_OAUTH_CODE_VERIFIER', value: verifier },
      { key: 'ZALO_OAUTH_STATE', value: state },
    ]);

    const authUrl = `https://oauth.zaloapp.com/v4/oa/permission?app_id=${cfg.ZALO_APP_ID}&redirect_uri=${encodeURIComponent(callbackUrl)}&code_challenge=${challenge}&state=${state}`;
    res.json({ success: true, authUrl, callbackUrl });
  } catch { res.status(500).json({ success: false, message: 'Lỗi tạo URL OAuth' }); }
});

// GET /zalo/oauth-callback — called by Zalo after user authorizes (no auth required)
router.get('/zalo/oauth-callback', async (req, res) => {
  const { code, state, error } = req.query;

  const html = (success: boolean, msg: string) => {
    const safePostMsg = JSON.stringify(success ? 'zalo_auth_success' : `zalo_auth_error:${msg}`);
    const displayMsg = msg.replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return res.send(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Zalo Auth</title></head><body style="font-family:sans-serif;text-align:center;padding:60px;background:#f8fafc">
      <p style="font-size:56px;margin:0">${success ? '✅' : '❌'}</p>
      <p style="font-size:16px;font-weight:700;color:${success ? '#10B981' : '#EF4444'};margin:16px 0 8px">${success ? 'Kết nối thành công!' : 'Kết nối thất bại'}</p>
      <p style="font-size:13px;color:#64748b">${displayMsg}</p>
      <p style="font-size:12px;color:#94a3b8;margin-top:24px">Cửa sổ này sẽ tự đóng...</p>
      <script>try{window.opener?.postMessage(${safePostMsg},'*')}catch(e){}setTimeout(()=>window.close(),2000)</script>
    </body></html>`);
  };

  if (error) return html(false, 'Người dùng từ chối cấp quyền');
  if (!code) return html(false, 'Thiếu authorization code');

  try {
    const cfg = await getConfigs(['ZALO_APP_ID', 'ZALO_SECRET_KEY', 'ZALO_OAUTH_CODE_VERIFIER', 'ZALO_OAUTH_STATE']);

    if (!cfg.ZALO_OAUTH_STATE || cfg.ZALO_OAUTH_STATE !== String(state)) {
      return html(false, 'Lỗi xác thực state (có thể đã hết hạn, thử lại)');
    }

    const callbackUrl = `${req.protocol}://${req.get('host')}/api/config/zalo/oauth-callback`;
    const params = new URLSearchParams({
      grant_type: 'authorization_code',
      code: String(code),
      app_id: cfg.ZALO_APP_ID,
      code_verifier: cfg.ZALO_OAUTH_CODE_VERIFIER,
    });

    const r = await axios.post<any>(
      'https://oauth.zaloapp.com/v4/oa/access_token',
      params.toString(),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'secret_key': cfg.ZALO_SECRET_KEY } }
    );

    if (r.data?.access_token) {
      const updates: { key: string; value: string }[] = [
        { key: 'ZALO_ACCESS_TOKEN', value: r.data.access_token },
      ];
      if (r.data.refresh_token) updates.push({ key: 'ZALO_REFRESH_TOKEN', value: r.data.refresh_token });
      await upsertConfigs(updates);
      await prisma.systemConfig.deleteMany({ where: { key: { in: ['ZALO_OAUTH_CODE_VERIFIER', 'ZALO_OAUTH_STATE'] } } });
      return html(true, `Token mới đã được lưu. Expires in: ${r.data.expires_in}s`);
    } else {
      return html(false, r.data?.error_description || r.data?.message || JSON.stringify(r.data));
    }
  } catch (err: any) {
    const msg = err.response?.data?.error_description || err.message;
    return html(false, msg);
  }
});

router.get('/zalo/test', authenticateToken, authorizeRoles('ADMIN', 'MANAGER'), async (req, res) => {
  try {
    const cfg = await getConfigs(['ZALO_ACCESS_TOKEN']);
    if (!cfg.ZALO_ACCESS_TOKEN) return res.status(400).json({ success: false, message: 'Chưa có Access Token!' });
    const response = await zaloApiClient.get('https://openapi.zalo.me/v2.0/oa/getoa', {
      headers: { access_token: cfg.ZALO_ACCESS_TOKEN }
    });
    if (response.data.error === 0) {
      res.json({ success: true, message: `Kết nối thành công! Tên OA: ${response.data.data.name}` });
    } else {
      res.json({ success: false, message: `Lỗi Zalo: ${response.data.message} (${response.data.error})` });
    }
  } catch { res.json({ success: false, message: 'Kết nối thất bại!' }); }
});

// ─── BANK / SEPAY ─────────────────────────────────────────────────────────────
const BANK_KEYS = ['BANK_BIN', 'BANK_ACC', 'BANK_NAME', 'BANK_LABEL', 'SEPAY_API_KEY', 'SEPAY_ACCOUNT_NUMBER'];

router.get('/bank', authenticateToken, authorizeRoles('ADMIN', 'MANAGER'), async (req, res) => {
  try {
    const cfg = await getConfigs(BANK_KEYS);
    // Fallback to env for migration
    if (!cfg.BANK_BIN) cfg.BANK_BIN = process.env.BANK_BIN || '';
    if (!cfg.BANK_ACC) cfg.BANK_ACC = process.env.BANK_ACC || '';
    if (!cfg.SEPAY_API_KEY) cfg.SEPAY_API_KEY = process.env.SEPAY_API_KEY || '';
    res.json(cfg);
  } catch { res.status(500).json({ message: 'Lỗi lấy cấu hình ngân hàng' }); }
});

router.post('/bank', authenticateToken, authorizeRoles('ADMIN', 'MANAGER'), async (req, res) => {
  try {
    const { BANK_BIN, BANK_ACC, BANK_NAME, BANK_LABEL, SEPAY_API_KEY, SEPAY_ACCOUNT_NUMBER } = req.body;
    const updates = [
      { key: 'BANK_BIN', value: BANK_BIN },
      { key: 'BANK_ACC', value: BANK_ACC },
      { key: 'BANK_NAME', value: BANK_NAME },
      { key: 'BANK_LABEL', value: BANK_LABEL },
      { key: 'SEPAY_API_KEY', value: SEPAY_API_KEY },
      { key: 'SEPAY_ACCOUNT_NUMBER', value: SEPAY_ACCOUNT_NUMBER },
    ].filter(u => u.value !== undefined && u.value !== null);
    await upsertConfigs(updates);
    res.json({ message: 'Lưu cấu hình ngân hàng thành công!' });
  } catch { res.status(500).json({ message: 'Lỗi lưu cấu hình ngân hàng' }); }
});

// Test SePay connection — verify API key is accepted by calling SePay's account info API
router.get('/bank/test', authenticateToken, authorizeRoles('ADMIN', 'MANAGER'), async (req, res) => {
  try {
    const cfg = await getConfigs(['SEPAY_API_KEY', 'SEPAY_ACCOUNT_NUMBER', 'BANK_ACC']);
    const apiKey = cfg.SEPAY_API_KEY || process.env.SEPAY_API_KEY;
    if (!apiKey) return res.json({ success: false, message: 'Chưa cấu hình SePay API Key' });

    const accountNumber = cfg.SEPAY_ACCOUNT_NUMBER || cfg.BANK_ACC;

    const r = await axios.get<any>('https://my.sepay.vn/userapi/transactions/list?limit=1', {
      headers: { Authorization: `Bearer ${apiKey}` },
      timeout: 8000
    });

    if (r.data?.status === 200 || r.status === 200) {
      const count = r.data?.transactions?.length ?? 0;
      res.json({ success: true, message: `Kết nối SePay thành công! Tài khoản: ${accountNumber || 'không xác định'}` });
    } else {
      res.json({ success: false, message: `SePay phản hồi: ${r.data?.message || 'Unknown error'}` });
    }
  } catch (err: any) {
    const msg = err.response?.data?.message || err.message;
    res.json({ success: false, message: `Lỗi kết nối SePay: ${msg}` });
  }
});

// Recent webhook transactions (last 30)
router.get('/bank/transactions', authenticateToken, authorizeRoles('ADMIN', 'MANAGER'), async (req, res) => {
  try {
    const transactions = await prisma.transaction.findMany({
      orderBy: { date: 'desc' },
      take: 30,
      include: { student: { select: { name: true, studentCode: true } } }
    });
    res.json(transactions);
  } catch { res.status(500).json({ message: 'Lỗi lấy lịch sử giao dịch' }); }
});

export default router;
