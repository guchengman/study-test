/**
 * FR-501 Streak 连续打卡 API 路由。
 *
 * 端点：
 *   GET  /        — 本人 streak 状态（current/longest/补签卡/是否今日已打卡）
 *   POST /makeup  — 使用一张补签卡修复紧邻断点（昨日活跃、今日缺席）
 */
import { Router } from 'express';
import pool from '../db.js';
import { authMiddleware } from '../middleware/auth.js';
import { apiLimiter } from '../middleware/rateLimit.js';
import { getStreak, useMakeupCard } from '../utils/streakService.js';
import log from '../utils/logger.js';

const router = Router();
router.use(apiLimiter);

// GET / — 我的 streak 状态
router.get('/', authMiddleware, async (req, res) => {
  try {
    const streak = await getStreak(pool, req.user.id);
    res.json({ streak });
  } catch (err) {
    log.error('getStreak error:', err);
    res.status(500).json({ error: '获取打卡状态失败' });
  }
});

// POST /makeup — 使用补签卡
router.post('/makeup', authMiddleware, async (req, res) => {
  try {
    const result = await useMakeupCard(pool, req.user.id);
    if (!result.ok) {
      return res.status(400).json({ error: result.reason, ok: false });
    }
    res.json({ ok: true, streak: await getStreak(pool, req.user.id) });
  } catch (err) {
    log.error('useMakeupCard error:', err);
    res.status(500).json({ error: '补签失败' });
  }
});

export default router;
