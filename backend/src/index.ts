import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
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
app.use('/api/zalo', zaloRoutes);
app.use('/api/config', configRoutes);

app.get('/', (req, res) => {
  res.json({ 
    message: 'Welcome to Hicado E-learning API',
    status: 'running',
    health: '/health'
  });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
