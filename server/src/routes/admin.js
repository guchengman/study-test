/**
 * 平台管理员 API 路由（当前含 storage_usage 视图与手动扫描）。
 *
 * 端点（仅 platform admin，即 users.role='admin'）：
 *   GET  /storage-usage        — 全部租户磁盘用量
 *   POST /storage-usage/scan   — 手动触发一次全量扫描（调试 / 集成测试用）
 */
import { Router } from 'express';
import pool from '../db.js';
import { authWithAuthority, adminMiddleware } from '../middleware/auth.js';
import { apiLimiter } from '../middleware/rateLimit.js';
import { listAllUsage, runStorageScan } from '../utils/storageUsageService.js';
import { uploadsRoot } from './upload.js';
import log from '../utils/logger.js';

const router = Router();
router.use(apiLimiter);
router.use(authWithAuthority);
router.use(adminMiddleware);

// GET /storage-usage — 全部租户用量
router.get('/storage-usage', async (req, res) => {
  try {
    const usage = await listAllUsage(pool);
    res.json({ usage });
  } catch (err) {
    log.error('listAllUsage error:', err);
    res.status(500).json({ error: '获取存储用量失败' });
  }
});

// POST /storage-usage/scan — 手动触发扫描
router.post('/storage-usage/scan', async (req, res) => {
  try {
    const summary = await runStorageScan(pool, { uploadsRoot });
    res.json({ ok: true, ...summary });
  } catch (err) {
    log.error('manual storage scan error:', err);
    res.status(500).json({ error: '手动扫描失败' });
  }
});

export default router;
