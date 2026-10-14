// 公开分享端点：无需鉴权，置于 /api/public。限流防刷；响应来自 service 白名单，不含答案。
import { Router } from 'express';
import { createLimiter } from '../middleware/rateLimit.js';
import { buildPreview, buildGrade } from '../services/publicShareService.js';
import log from '../utils/logger.js';

const router = Router();

const previewLimiter = createLimiter({ windowMs: 15 * 60 * 1000, max: 60, message: '预览过于频繁，请稍后再试' });
// grade 更严：防批量刷判分/探测答案
const gradeLimiter = createLimiter({ windowMs: 15 * 60 * 1000, max: 30, message: '提交过于频繁，请稍后再试' });

router.get('/share/:code', previewLimiter, async (req, res) => {
  try {
    const r = await buildPreview(req.db || undefined, req.params.code);
    res.status(r.status).json(r.body);
  } catch (e) {
    log.error({ err: e }, '分享预览失败');
    res.status(500).json({ error: '服务器内部错误' });
  }
});

router.post('/share/grade', gradeLimiter, async (req, res) => {
  try {
    const { quizToken, answers } = req.body || {};
    const r = await buildGrade(req.db || undefined, quizToken, answers);
    res.status(r.status).json(r.body);
  } catch (e) {
    log.error({ err: e }, '分享判分失败');
    res.status(500).json({ error: '服务器内部错误' });
  }
});

export default router;
