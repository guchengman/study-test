// 必须在所有其他导入之前加载环境变量
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPath = path.resolve(__dirname, '../.env');
import log from './utils/logger.js';
log.info(`Loading .env from: ${envPath} (exists: ${existsSync(envPath)})`);
dotenv.config({ path: envPath });

import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import axios from 'axios';
import { pinoHttp } from 'pino-http';
import { authMiddleware } from './middleware/auth.js';
import authRoutes from './routes/auth.js';
import questionRoutes from './routes/questions.js';
import questionGroupRoutes from './routes/questionGroups.js';
import subjectRoutes from './routes/subjects.js';
import practiceRoutes from './routes/practice.js';
import syncRoutes from './routes/sync.js';
import inviteCodeRoutes from './routes/invite-codes.js';
import studentRoutes from './routes/students.js';
import aiRoutes from './routes/ai.js';
import uploadRoutes, { uploadsRoot } from './routes/upload.js';
import examsRoutes from './routes/exams.js';
import { startExamSweepScheduler, stopExamSweepScheduler } from './utils/examSweepScheduler.js';
import { startRecycleCleanupScheduler, stopRecycleCleanupScheduler } from './utils/recycleCleanupScheduler.js';
import { startExportJobScheduler, stopExportJobScheduler } from './utils/exportJobScheduler.js';
import { startStorageUsageScheduler, stopStorageUsageScheduler } from './utils/storageUsageScheduler.js';
import { startStatsAggScheduler, stopStatsAggScheduler } from './utils/statsAggregationScheduler.js';
import { startStreakBreakScheduler, stopStreakBreakScheduler } from './utils/streakBreakScheduler.js';
import exportRoutes from './routes/exports.js';
import tagRoutes from './routes/tags.js';
import notificationRoutes from './routes/notifications.js';
import adminRoutes from './routes/admin.js';
import quotaRoutes from './routes/quota.js';
import statsRoutes from './routes/stats.js';
import streakRoutes from './routes/streak.js';

const app = express();
const PORT = process.env.PORT || 3100;

if (process.env.TRUST_PROXY === '1' || process.env.TRUST_PROXY === 'true') {
  app.set('trust proxy', 1);
}

if (process.env.NODE_ENV === 'production') {
  const j = process.env.JWT_SECRET;
  if (!j || String(j).trim().length < 16) {
    log.fatal('FATAL: 生产环境必须在环境变量中设置 JWT_SECRET（建议≥32字符）');
    process.exit(1);
  }
}
const BAIDU_API_KEY = process.env.BAIDU_API_KEY || '';
const BAIDU_SECRET_KEY = process.env.BAIDU_SECRET_KEY || '';

// 百度 OCR Token 缓存
let baiduAccessToken = '';

// 标记是否是首次获取 token
let isFirstTokenFetch = true;

// 获取百度 access_token
async function getBaiduAccessToken() {
  if (!BAIDU_API_KEY || !BAIDU_SECRET_KEY) {
    if (isFirstTokenFetch) {
      log.warn('百度 OCR 未配置 BAIDU_API_KEY / BAIDU_SECRET_KEY');
    }
    return null;
  }
  try {
    const res = await axios.post(
      'https://aip.baidubce.com/oauth/2.0/token',
      null,
      { params: { grant_type: 'client_credentials', client_id: BAIDU_API_KEY, client_secret: BAIDU_SECRET_KEY } }
    );
    baiduAccessToken = res.data.access_token;
    // 只在首次获取时输出成功日志
    if (isFirstTokenFetch) {
      log.info('百度 OCR token 获取成功');
    }
    isFirstTokenFetch = false;
    return baiduAccessToken;
  } catch (err) {
    log.error({ err }, '百度 OCR token 获取失败');
    return null;
  }
}

// 定时刷新 token（每24小时刷新一次）
getBaiduAccessToken();
setInterval(getBaiduAccessToken, 86400 * 1000);

// 中间件
// CORS 白名单从环境变量 ALLOWED_ORIGINS（逗号分隔）读取；为空则仅允许同源请求，生产不再硬编码来源
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    // 同源请求（origin 为 undefined）或命中白名单则允许
    if (!origin || allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(null, false);
    }
  },
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));

// 结构化访问日志（P1-7）：每请求一行 JSON，含 reqId/耗时/状态码；探活与埋点高频端点不记
app.use(pinoHttp({
  logger: log,
  autoLogging: {
    ignore: (req) => req.url === '/api/health' || req.url === '/api/visit',
  },
  customLogLevel: (_req, res, err) =>
    err || res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info',
}));

// 须在 SPA 兜底路由之前注册，供监控与负载均衡探活
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

app.use('/api/auth', authRoutes);
app.use('/api/questions', questionRoutes);
app.use('/api/question-groups', questionGroupRoutes);
app.use('/api/subjects', subjectRoutes);
app.use('/api/practice', practiceRoutes);
app.use('/api/sync', syncRoutes);
app.use('/api/invite-codes', inviteCodeRoutes);
app.use('/api/students', studentRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/upload', uploadRoutes);
// 上传图片：需登录 + 禁止内容嗅探/内嵌脚本执行（防御历史 SVG 等存储型 XSS）
app.use('/api/uploads', authMiddleware, express.static(uploadsRoot, {
  setHeaders: (res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self'; sandbox");
  },
}));
app.use('/api/exams', examsRoutes);
app.use('/api/exports', exportRoutes);
app.use('/api/tags', tagRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/quota', quotaRoutes);
app.use('/api/stats', statsRoutes);
app.use('/api/streak', streakRoutes);

// 百度高精度 OCR 接口（必须在 express.json() 之后）
// 鉴权 + 限流：15 分钟内每 IP 最多 30 次
const ocrBaiduLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'OCR 请求过于频繁，请稍后再试' },
});
app.post('/api/ocr/baidu', authMiddleware, ocrBaiduLimiter, async (req, res) => {
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
    log.error({ err }, '百度 OCR 请求失败');
    res.status(500).json({ error: '识别失败' });
  }
});

// 静态文件服务（必须在 API 路由之后）
const distPath = path.join(__dirname, '../../dist');
log.info(`Serving static files from: ${distPath}`);
if (existsSync(distPath)) {
  app.use(express.static(distPath, {
    setHeaders: (res, path) => {
      if (path.endsWith('.js')) {
        res.setHeader('Content-Type', 'application/javascript');
      } else if (path.endsWith('.css')) {
        res.setHeader('Content-Type', 'text/css');
      } else if (path.endsWith('.json')) {
        res.setHeader('Content-Type', 'application/json');
      } else if (path.endsWith('.html')) {
        res.setHeader('Content-Type', 'text/html');
      } else if (path.endsWith('.png')) {
        res.setHeader('Content-Type', 'image/png');
      } else if (path.endsWith('.jpg') || path.endsWith('.jpeg')) {
        res.setHeader('Content-Type', 'image/jpeg');
      } else if (path.endsWith('.svg')) {
        res.setHeader('Content-Type', 'image/svg+xml');
      }
    },
  }));

  // 处理 SPA 路由（必须在所有路由最后）
  app.get('*', (req, res) => {
    const indexPath = path.join(distPath, 'index.html');
    if (existsSync(indexPath)) {
      res.sendFile(indexPath);
    } else {
      res.status(404).send('Not found');
    }
  });
} else {
  log.warn('dist directory not found, static files not served');
}

// 错误处理
app.use((err, req, res, next) => {
  req.log ? req.log.error(err, '未处理错误') : log.error(err, '未处理错误');
  res.status(500).json({ error: '服务器内部错误' });
});

// 全局异常钩子：避免裸 console 堆消失在 pm2 混杂日志中
process.on('unhandledRejection', (reason) => log.error({ reason: reason instanceof Error ? { message: reason.message, stack: reason.stack } : String(reason) }, 'unhandledRejection'));
process.on('uncaughtException', (err) => { log.fatal({ err }, 'uncaughtException'); process.exit(1); });

app.listen(PORT, '0.0.0.0', () => {
  log.info(`Study API 运行在 http://0.0.0.0:${PORT} (环境: ${process.env.NODE_ENV || 'development'})`);
  // FR-204：启动考试自动交卷后台调度器（带 GET_LOCK 单例守卫，周期分页兜底收卷）
  startExamSweepScheduler();
  // FR-107：启动回收站过期清理调度器（带 GET_LOCK 单例守卫，物理删除软删超期且未被考试引用的题目）
  startRecycleCleanupScheduler();
  // FR-206：启动导出任务兜底调度器（GET_LOCK 单例，轮询 queued jobs 处理）
  startExportJobScheduler();
  // storage_usage：启动存储用量扫描调度器（GET_LOCK 单例，周期汇总磁盘用量 + 阈值告警/熔断）
  startStorageUsageScheduler();
  // FR-301/302：启动学情日聚合调度器（GET_LOCK 单例，周期把 exam_attempts 明细预聚合进 stats_daily）
  startStatsAggScheduler();
  // FR-501：启动 Streak 断流检测调度器（GET_LOCK 单例，跨日未活跃归零并下发 streak_break 通知）
  startStreakBreakScheduler();
});

// 优雅退出：停掉后台调度器（PM2 reload/SIGTERM）
process.on('SIGTERM', () => {
  stopExamSweepScheduler();
  stopRecycleCleanupScheduler();
  stopExportJobScheduler();
  stopStorageUsageScheduler();
  stopStatsAggScheduler();
  stopStreakBreakScheduler();
});
