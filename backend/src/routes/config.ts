import { Router } from 'express';
import { randomBytes, createHash } from 'node:crypto';
import prisma from '../lib/prisma';
import { authenticateToken, authorizeRoles } from '../middleware/auth';
import axios from 'axios';
import { zaloApiClient, refreshZaloToken } from '../lib/zaloAuth';

const router = Router();

const upsertConfigs = async (entries: { key: string; value: string }[]) => {
  for (const { key, value } of entries) {
    await prisma.systemConfig.upsert({
      where: { key },
      update: { value },
      create: { key, value },
    });
  }
};

const getConfigs = async (keys: string[]): Promise<Record<string, string>> => {
  const rows = await prisma.systemConfig.findMany({ where: { key: { in: keys } } });
  return rows.reduce((acc, row) => {
    acc[row.key] = row.value;
    return acc;
  }, {} as Record<string, string>);
};

const buildTokenStatus = (issuedAt?: string, hasRefreshToken?: boolean) => {
  if (!issuedAt) {
    return {
      issuedAt: null,
      ageDays: null,
      ageHours: null,
      estimatedExpiresIn: null,
      healthStatus: 'unknown',
      accessTokenStatus: 'unknown',
      hasRefreshToken: !!hasRefreshToken,
    };
  }

  const ageMs = Date.now() - new Date(issuedAt).getTime();
  const ageDays = Math.max(0, Math.floor(ageMs / (1000 * 60 * 60 * 24)));
  const ageHours = ageMs / (1000 * 60 * 60);

  // Access token health (25h TTL)
  const accessTokenStatus = ageHours < 20 ? 'ok' : ageHours < 25 ? 'warning' : 'expired';

  // Refresh token health (90d TTL)
  const estimatedExpiresIn = Math.max(0, Math.round(90 - ageDays));
  let healthStatus: 'ok' | 'warning' | 'critical' = 'ok';

  if (ageDays >= 80) healthStatus = 'critical';
  else if (ageDays >= 60) healthStatus = 'warning';

  return {
    issuedAt,
    ageDays: Math.round(ageDays),
    ageHours: Math.round(ageHours),
    estimatedExpiresIn,
    healthStatus,
    accessTokenStatus,
    hasRefreshToken: !!hasRefreshToken,
  };
};

router.get('/zalo', authenticateToken, authorizeRoles('ADMIN', 'MANAGER'), async (_req, res) => {
  try {
    res.json(await getConfigs([
      'ZALO_APP_ID',
      'ZALO_SECRET_KEY',
      'ZALO_REFRESH_TOKEN',
      'ZALO_ACCESS_TOKEN',
      'ZALO_ACCESS_TOKEN_ISSUED_AT',
    ]));
  } catch {
    res.status(500).json({ message: 'Loi server' });
  }
});

router.post('/zalo', authenticateToken, authorizeRoles('ADMIN', 'MANAGER'), async (req, res) => {
  try {
    const { ZALO_APP_ID, ZALO_SECRET_KEY, ZALO_REFRESH_TOKEN, ZALO_ACCESS_TOKEN } = req.body;
    const trimmedAccessToken = ZALO_ACCESS_TOKEN?.trim();
    const updates = [
      { key: 'ZALO_APP_ID', value: ZALO_APP_ID?.trim() },
      { key: 'ZALO_SECRET_KEY', value: ZALO_SECRET_KEY?.trim() },
      { key: 'ZALO_REFRESH_TOKEN', value: ZALO_REFRESH_TOKEN?.trim() },
      { key: 'ZALO_ACCESS_TOKEN', value: trimmedAccessToken },
      ...(trimmedAccessToken
        ? [{ key: 'ZALO_ACCESS_TOKEN_ISSUED_AT', value: new Date().toISOString() }]
        : []),
    ].filter((entry) => entry.value !== undefined && entry.value !== '');
    await upsertConfigs(updates);
    res.json({ message: 'Cap nhat cau hinh Zalo thanh cong!' });
  } catch {
    res.status(500).json({ message: 'Loi luu cau hinh Zalo' });
  }
});

router.get('/zalo/token-status', authenticateToken, authorizeRoles('ADMIN', 'MANAGER'), async (_req, res) => {
  try {
    const cfg = await getConfigs(['ZALO_ACCESS_TOKEN_ISSUED_AT', 'ZALO_REFRESH_TOKEN']);
    res.json(buildTokenStatus(cfg.ZALO_ACCESS_TOKEN_ISSUED_AT, !!cfg.ZALO_REFRESH_TOKEN));
  } catch {
    res.status(500).json({ message: 'Loi lay trang thai token' });
  }
});

router.post('/zalo/refresh-token', authenticateToken, authorizeRoles('ADMIN', 'MANAGER'), async (_req, res) => {
  try {
    await refreshZaloToken();
    const cfg = await getConfigs(['ZALO_ACCESS_TOKEN_ISSUED_AT', 'ZALO_REFRESH_TOKEN']);
    res.json({ success: true, ...buildTokenStatus(cfg.ZALO_ACCESS_TOKEN_ISSUED_AT, !!cfg.ZALO_REFRESH_TOKEN) });
  } catch (err: any) {
    res.status(400).json({
      success: false,
      message: err.message,
      requiresReconnect: true,
    });
  }
});

router.get('/zalo/oauth-url', authenticateToken, authorizeRoles('ADMIN', 'MANAGER'), async (req, res) => {
  try {
    const cfg = await getConfigs(['ZALO_APP_ID']);
    if (!cfg.ZALO_APP_ID) {
      return res.status(400).json({ success: false, message: 'Chua cau hinh ZALO_APP_ID' });
    }

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
  } catch {
    res.status(500).json({ success: false, message: 'Loi tao URL OAuth' });
  }
});

router.get('/zalo/oauth-callback', async (req, res) => {
  const { code, state, error } = req.query;

  const html = (success: boolean, message: string) => {
    const safePostMsg = JSON.stringify(success ? 'zalo_auth_success' : `zalo_auth_error:${message}`);
    const displayMsg = message.replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return res.send(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Zalo Auth</title></head><body style="font-family:sans-serif;text-align:center;padding:60px;background:#f8fafc">
      <p style="font-size:56px;margin:0">${success ? 'OK' : 'ERR'}</p>
      <p style="font-size:16px;font-weight:700;color:${success ? '#10B981' : '#EF4444'};margin:16px 0 8px">${success ? 'Ket noi thanh cong!' : 'Ket noi that bai'}</p>
      <p style="font-size:13px;color:#64748b">${displayMsg}</p>
      <p style="font-size:12px;color:#94a3b8;margin-top:24px">Cua so nay se tu dong...</p>
      <script>try{window.opener?.postMessage(${safePostMsg},'*')}catch(e){}setTimeout(()=>window.close(),2000)</script>
    </body></html>`);
  };

  if (error) return html(false, 'Nguoi dung tu choi cap quyen');
  if (!code) return html(false, 'Thieu authorization code');

  try {
    const cfg = await getConfigs(['ZALO_APP_ID', 'ZALO_SECRET_KEY', 'ZALO_OAUTH_CODE_VERIFIER', 'ZALO_OAUTH_STATE']);

    if (!cfg.ZALO_OAUTH_STATE || cfg.ZALO_OAUTH_STATE !== String(state)) {
      return html(false, 'Loi xac thuc state, thu lai');
    }

    const params = new URLSearchParams({
      grant_type: 'authorization_code',
      code: String(code),
      app_id: cfg.ZALO_APP_ID,
      code_verifier: cfg.ZALO_OAUTH_CODE_VERIFIER,
    });

    const tokenResponse = await axios.post<any>(
      'https://oauth.zaloapp.com/v4/oa/access_token',
      params.toString(),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded', secret_key: cfg.ZALO_SECRET_KEY } }
    );

    if (tokenResponse.data?.access_token) {
      const updates: { key: string; value: string }[] = [
        { key: 'ZALO_ACCESS_TOKEN', value: tokenResponse.data.access_token },
        { key: 'ZALO_ACCESS_TOKEN_ISSUED_AT', value: new Date().toISOString() },
      ];
      if (tokenResponse.data.refresh_token) {
        updates.push({ key: 'ZALO_REFRESH_TOKEN', value: tokenResponse.data.refresh_token });
      }
      await upsertConfigs(updates);
      await prisma.systemConfig.deleteMany({ where: { key: { in: ['ZALO_OAUTH_CODE_VERIFIER', 'ZALO_OAUTH_STATE'] } } });
      return html(true, `Token moi da duoc luu. Expires in: ${tokenResponse.data.expires_in}s`);
    }

    return html(false, tokenResponse.data?.error_description || tokenResponse.data?.message || JSON.stringify(tokenResponse.data));
  } catch (err: any) {
    const message = err.response?.data?.error_description || err.message;
    return html(false, message);
  }
});

router.get('/zalo/test', authenticateToken, authorizeRoles('ADMIN', 'MANAGER'), async (_req, res) => {
  try {
    const cfg = await getConfigs(['ZALO_ACCESS_TOKEN']);
    if (!cfg.ZALO_ACCESS_TOKEN) return res.status(400).json({ success: false, message: 'Chua co Access Token!' });
    const response = await zaloApiClient.get<any>('https://openapi.zalo.me/v2.0/oa/getoa', {
      headers: { access_token: cfg.ZALO_ACCESS_TOKEN },
    });
    if (response.data.error === 0) {
      res.json({ success: true, message: `Ket noi thanh cong! Ten OA: ${response.data.data.name}` });
    } else {
      res.json({ success: false, message: `Loi Zalo: ${response.data.message} (${response.data.error})` });
    }
  } catch {
    res.json({ success: false, message: 'Ket noi that bai!' });
  }
});

const BANK_KEYS = ['BANK_BIN', 'BANK_ACC', 'BANK_NAME', 'BANK_LABEL', 'SEPAY_API_KEY', 'SEPAY_ACCOUNT_NUMBER'];

router.get('/bank', authenticateToken, authorizeRoles('ADMIN', 'MANAGER'), async (_req, res) => {
  try {
    const cfg = await getConfigs(BANK_KEYS);
    if (!cfg.BANK_BIN) cfg.BANK_BIN = process.env.BANK_BIN || '';
    if (!cfg.BANK_ACC) cfg.BANK_ACC = process.env.BANK_ACC || '';
    if (!cfg.SEPAY_API_KEY) cfg.SEPAY_API_KEY = process.env.SEPAY_API_KEY || '';
    res.json(cfg);
  } catch {
    res.status(500).json({ message: 'Loi lay cau hinh ngan hang' });
  }
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
    ].filter((entry) => entry.value !== undefined && entry.value !== null);
    await upsertConfigs(updates);
    res.json({ message: 'Luu cau hinh ngan hang thanh cong!' });
  } catch {
    res.status(500).json({ message: 'Loi luu cau hinh ngan hang' });
  }
});

router.get('/bank/test', authenticateToken, authorizeRoles('ADMIN', 'MANAGER'), async (_req, res) => {
  try {
    const cfg = await getConfigs(['SEPAY_API_KEY', 'SEPAY_ACCOUNT_NUMBER', 'BANK_ACC']);
    const apiKey = cfg.SEPAY_API_KEY || process.env.SEPAY_API_KEY;
    if (!apiKey) return res.json({ success: false, message: 'Chua cau hinh SePay API Key' });

    const accountNumber = cfg.SEPAY_ACCOUNT_NUMBER || cfg.BANK_ACC;
    const response = await axios.get<any>('https://my.sepay.vn/userapi/transactions/list?limit=1', {
      headers: { Authorization: `Bearer ${apiKey}` },
      timeout: 8000,
    });

    if (response.data?.status === 200 || response.status === 200) {
      res.json({ success: true, message: `Ket noi SePay thanh cong! Tai khoan: ${accountNumber || 'khong xac dinh'}` });
    } else {
      res.json({ success: false, message: `SePay phan hoi: ${response.data?.message || 'Unknown error'}` });
    }
  } catch (err: any) {
    const message = err.response?.data?.message || err.message;
    res.json({ success: false, message: `Loi ket noi SePay: ${message}` });
  }
});

router.get('/bank/transactions', authenticateToken, authorizeRoles('ADMIN', 'MANAGER'), async (_req, res) => {
  try {
    const transactions = await prisma.transaction.findMany({
      orderBy: { date: 'desc' },
      take: 30,
      include: { student: { select: { name: true, studentCode: true } } },
    });
    res.json(transactions);
  } catch {
    res.status(500).json({ message: 'Loi lay lich su giao dich' });
  }
});

export default router;
