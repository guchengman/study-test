// 必须在所有其他导入之前加载环境变量
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPath = path.resolve(__dirname, '../.env');
console.log('Loading .env from:', envPath);
console.log('File exists:', existsSync(envPath));
dotenv.config({ path: envPath });

import express from 'express';
import cors from 'cors';
import axios from 'axios';

const app = express();
const PORT = process.env.PORT || 3100;
const BAIDU_API_KEY = process.env.BAIDU_API_KEY || '';
const BAIDU_SECRET_KEY = process.env.BAIDU_SECRET_KEY || '';

// 百度 OCR Token 缓存
let baiduAccessToken = '';

// 获取百度 access_token
async function getBaiduAccessToken() {
  if (!BAIDU_API_KEY || !BAIDU_SECRET_KEY) {
    console.warn('百度 OCR 未配置 BAIDU_API_KEY / BAIDU_SECRET_KEY');
    return null;
  }
  try {
    const res = await axios.post(
      'https://aip.baidubce.com/oauth/2.0/token',
      null,
      { params: { grant_type: 'client_credentials', client_id: BAIDU_API_KEY, client_secret: BAIDU_SECRET_KEY } }
    );
    baiduAccessToken = res.data.access_token;
    console.log('百度 OCR token 获取成功:', baiduAccessToken ? '已获取' : '为空');
    return baiduAccessToken;
  } catch (err) {
    console.error('百度 OCR token 获取失败:', err.message);
    return null;
  }
}

// 定时刷新 token
getBaiduAccessToken();
setInterval(getBaiduAccessToken, 86400 * 1000 * 29);

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

// 百度高精度 OCR 接口（必须在 express.json() 之后）
app.post('/api/ocr/baidu', async (req, res) => {
  if (!baiduAccessToken) {
    await getBaiduAccessToken();
  }
  if (!baiduAccessToken) {
    return res.status(500).json({ error: '百度 OCR Token 未配置或获取失败' });
  }
  try {
    const { image } = req.body;
    const result = await axios.post(
      `https://aip.baidubce.com/rest/2.0/ocr/v1/accurate_basic`,
      { image },
      { params: { access_token: baiduAccessToken }, headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );
    res.json(result.data);
  } catch (err) {
    console.error('百度 OCR 请求失败:', err.message);
    res.status(500).json({ error: '识别失败' });
  }
});

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
