/**
 * FR-606 配额 API 路由。
 *
 * 端点：
 *   GET  /usage          — 本人租户当前周期配额快照（需登录）
 *   GET  /admin/overview — 平台全部租户配额用量概览（仅 platform admin）
 *   POST /byo-register   — 登记自带 AI Key（仅存 sha256 指纹，需登录）
 */
import { Router } from 'express';
import pool from '../db.js';
import { authWithAuthority, adminMiddleware } from '../middleware/auth.js';
import { apiLimiter } from '../middleware/rateLimit.js';
import { resolvePersonalOrgId } from '../utils/personalOrg.js';
import { getOrgPlan, listQuotaUsage, registerByoKey } from '../utils/quotaService.js';
import log from '../utils/logger.js';

const router = Router();
router.use(apiLimiter);

const BYO_PROVIDERS = ['gemini', 'paddle_ocr'];

// GET /usage — 本人配额快照
router.get('/usage', authWithAuthority, async (req, res) => {
  try {
    const orgId = await resolvePersonalOrgId(pool, req.user.id);
    const plan = orgId != null ? await getOrgPlan(pool, orgId) : 'FREE';
    const usage = await listQuotaUsage(pool, orgId);
    res.json({ org_id: orgId, plan, usage });
  } catch (err) {
    log.error('quota usage error:', err);
    res.status(500).json({ error: '获取配额用量失败' });
  }
});

// GET /admin/overview — 平台租户配额概览（当前周期 quota_usage + 计划 + 存储熔断标记）
router.get('/admin/overview', authWithAuthority, adminMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT o.id AS org_id, o.name AS org_name, UPPER(o.plan) AS plan,
              o.type AS org_type, su.bytes_used, su.circuit_broken
       FROM organizations o
       LEFT JOIN storage_usage su ON su.org_id = o.id
       ORDER BY su.bytes_used DESC, o.id ASC`
    );
    const overview = [];
    for (const r of rows) {
      const usage = await listQuotaUsage(pool, r.org_id);
      overview.push({ ...r, usage });
    }
    res.json({ overview });
  } catch (err) {
    log.error('quota overview error:', err);
    res.status(500).json({ error: '获取配额概览失败' });
  }
});

// POST /byo-register — 登记自带 Key（哈希指纹）
router.post('/byo-register', authWithAuthority, async (req, res) => {
  try {
    const { provider, key_preview } = req.body || {};
    if (!provider || !BYO_PROVIDERS.includes(String(provider))) {
      return res.status(400).json({ error: '不支持的 provider' });
    }
    if (typeof key_preview !== 'string' || key_preview.length === 0) {
      return res.status(400).json({ error: 'key_preview 不能为空' });
    }
    const result = await registerByoKey(pool, { user_id: req.user.id, provider, key_preview });
    res.json({ ok: true, ...result });
  } catch (err) {
    log.error('byo-register error:', err);
    res.status(500).json({ error: '登记失败' });
  }
});

export default router;
