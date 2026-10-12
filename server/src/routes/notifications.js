/**
 * FR-701/702 通知中心 API 路由。
 *
 * 端点（均需登录，仅能操作本人通知）：
 *   GET  /                — 通知列表（?unread=1&page=&limit= 分页，默认 20）
 *   GET  /unread-count    — 未读数
 *   PUT  /read-all        — 全部标记已读
 *   PUT  /:id(\d+)/read   — 单条标记已读
 */
import { Router } from 'express';
import pool from '../db.js';
import { authMiddleware } from '../middleware/auth.js';
import { apiLimiter } from '../middleware/rateLimit.js';
import {
  listNotifications, getUnreadCount, markRead, markAllRead,
} from '../utils/notificationService.js';
import log from '../utils/logger.js';

const router = Router();
router.use(apiLimiter);

// GET / — 通知列表
router.get('/', authMiddleware, async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 20, 100);
    const page = Math.max(Number(req.query.page) || 1, 1);
    const offset = (page - 1) * limit;
    const unreadOnly = req.query.unread === '1' || req.query.unread === 'true';
    const { rows, total } = await listNotifications(pool, req.user.id, { limit, offset, unreadOnly });
    res.json({ notifications: rows, total, page, limit });
  } catch (err) {
    log.error('listNotifications error:', err);
    res.status(500).json({ error: '获取通知列表失败' });
  }
});

// GET /unread-count — 未读数
router.get('/unread-count', authMiddleware, async (req, res) => {
  try {
    const count = await getUnreadCount(pool, req.user.id);
    res.json({ count });
  } catch (err) {
    log.error('getUnreadCount error:', err);
    res.status(500).json({ error: '获取未读数失败' });
  }
});

// PUT /read-all — 全部标记已读（须在 /:id 之前，虽 :id 有 \d+ 约束仍显式前置）
router.put('/read-all', authMiddleware, async (req, res) => {
  try {
    const affected = await markAllRead(pool, req.user.id);
    res.json({ ok: true, affected });
  } catch (err) {
    log.error('markAllRead error:', err);
    res.status(500).json({ error: '全部标记已读失败' });
  }
});

// PUT /:id/read — 单条标记已读
router.put('/:id(\\d+)/read', authMiddleware, async (req, res) => {
  try {
    const ok = await markRead(pool, Number(req.params.id), req.user.id);
    if (!ok) return res.status(404).json({ error: '通知不存在或已读' });
    res.json({ ok: true });
  } catch (err) {
    log.error('markRead error:', err);
    res.status(500).json({ error: '标记已读失败' });
  }
});

export default router;
