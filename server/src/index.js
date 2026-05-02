import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3100;

// 中间件
app.use(cors({
  origin: [
    'https://www.xiaoyue.shop',
    'https://xiaoyue.shop',
    'http://localhost:3000',
  ],
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));

// 路由
import authRoutes from './routes/auth.js';
import questionRoutes from './routes/questions.js';
import subjectRoutes from './routes/subjects.js';
import practiceRoutes from './routes/practice.js';
import syncRoutes from './routes/sync.js';
import inviteCodeRoutes from './routes/invite-codes.js';
import studentRoutes from './routes/students.js';

app.use('/api/auth', authRoutes);
app.use('/api/questions', questionRoutes);
app.use('/api/subjects', subjectRoutes);
app.use('/api/practice', practiceRoutes);
app.use('/api/sync', syncRoutes);
app.use('/api/invite-codes', inviteCodeRoutes);
app.use('/api/students', studentRoutes);

// 健康检查
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// 错误处理
app.use((err, req, res, next) => {
  console.error('未处理错误:', err);
  res.status(500).json({ error: '服务器内部错误' });
});

app.listen(PORT, '127.0.0.1', () => {
  console.log(`Study API 运行在 http://127.0.0.1:${PORT}`);
  console.log(`环境: ${process.env.NODE_ENV || 'development'}`);
});
