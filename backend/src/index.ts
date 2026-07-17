import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import path from 'path';
import cors from 'cors';
import prisma from './lib/prisma';
import authRoutes from './routes/auth';
import teacherRoutes from './routes/teachers';
import studentRoutes from './routes/students';
import classRoutes from './routes/classes';
import roomRoutes from './routes/rooms';
import attendanceRoutes from './routes/attendance';
import financeRoutes from './routes/finance';
import webhookRoutes from './routes/webhook';
import userRoutes from './routes/users';
import zaloRoutes from './routes/zalo';
import configRoutes from './routes/config';
import campaignRoutes from './routes/campaigns';
import { shouldProactiveRefresh, refreshZaloToken, getZaloConfig } from './lib/zaloAuth';
import { zaloSearchLimiter } from './middleware/rateLimit';

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/teachers', teacherRoutes);
app.use('/api/students', studentRoutes);
app.use('/api/classes', classRoutes);
app.use('/api/rooms', roomRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/finance', financeRoutes);
app.use('/api/webhook', webhookRoutes);
app.use('/api/users', userRoutes);
app.use('/api/zalo/mapping/candidates', zaloSearchLimiter);
app.use('/api/zalo', zaloRoutes);
app.use('/api/config', configRoutes);
app.use('/api/campaigns', campaignRoutes);

// Verifies the database is actually reachable — a static "ok" here previously
// masked a fully-down database (Render's health check kept reporting the
// deploy as healthy while every DB-backed request was failing with P1001).
app.get('/health', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: 'ok', database: 'ok', timestamp: new Date().toISOString() });
  } catch (err: any) {
    console.error('[Health] Database check failed:', err.message);
    res.status(503).json({ status: 'error', database: 'unreachable', timestamp: new Date().toISOString() });
  }
});

// Serve React frontend in production
const publicPath = path.join(__dirname, '../public');
app.use(express.static(publicPath));
app.use((_req, res) => {
  res.sendFile(path.join(publicPath, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`[Server] Running on port ${PORT}`);

  void (async () => {
    try {
      if (await shouldProactiveRefresh()) {
        console.log('[Zalo] Access token > 20 hours or missing. Refreshing on startup...');
        await refreshZaloToken();
        console.log('[Zalo] Token refresh succeeded.');
      }
    } catch (err: any) {
      console.warn('[Zalo] Startup refresh skipped:', err.message);
    }
  })();

  const ZALO_REFRESH_INTERVAL = 20 * 60 * 60 * 1000; // 20 giờ
  setInterval(async () => {
    try {
      const cfg = await getZaloConfig();
      if (!cfg.ZALO_REFRESH_TOKEN) return; // không có refresh token → bỏ qua
      await refreshZaloToken();
      console.log('✅ [Zalo] Scheduled access token refresh OK');
    } catch (err: any) {
      console.warn('[Zalo] Scheduled refresh failed:', err.message);
    }
  }, ZALO_REFRESH_INTERVAL);

});
