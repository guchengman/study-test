/**
 * FR-108 知识点标签体系 API 路由。
 *
 * 端点：
 *   GET    /tree                     — 当前用户 PERSONAL 租户的标签树（扁平列表）
 *   POST   /                         — 创建标签 {name, parent_id?, level}
 *   PUT    /:id(\d+)                 — 重命名 {name}
 *   DELETE /:id(\d+)                 — 删除标签（子标签提升）
 *   POST   /question/:qid/bindTags   — 绑定标签 {tag_ids: []}
 *   DELETE /question/:qid/unbindTag/:tagId — 解绑
 *   GET    /question/:qid            — 获取题目的标签列表
 */
import { Router } from 'express';
import pool from '../db.js';
import { authMiddleware } from '../middleware/auth.js';
import { apiLimiter } from '../middleware/rateLimit.js';
import { resolvePersonalOrgId } from '../utils/personalOrg.js';
import { canViewQuestion } from '../utils/questionAccess.js';
import {
  listTags, createTag, renameTag, deleteTag,
  bindTags, unbindTag, getTagsForQuestion, tagBelongsToOrg,
} from '../utils/tagService.js';
import log from '../utils/logger.js';

const router = Router();
router.use(apiLimiter);

// GET /tree — 标签列表（当前用户 org）
router.get('/tree', authMiddleware, async (req, res) => {
  try {
    const orgId = await resolvePersonalOrgId(pool, req.user.id);
    const tags = await listTags(pool, orgId);
    res.json({ tags });
  } catch (err) {
    log.error('listTags error:', err);
    res.status(500).json({ error: '获取标签列表失败' });
  }
});

// POST / — 创建标签
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { name, parent_id = null, level } = req.body || {};
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).json({ error: '标签名称不能为空' });
    }
    if (!level || ![1, 2, 3].includes(Number(level))) {
      return res.status(400).json({ error: 'level 必须为 1/2/3' });
    }
    const orgId = await resolvePersonalOrgId(pool, req.user.id);
    const tag = await createTag(pool, {
      name: name.trim(),
      parent_id: parent_id ? Number(parent_id) : null,
      level: Number(level),
      org_id: orgId,
    });
    res.status(201).json(tag);
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: '同层级下标签名已存在' });
    }
    log.error('createTag error:', err);
    res.status(500).json({ error: '创建标签失败' });
  }
});

// PUT /:id — 重命名
router.put('/:id(\\d+)', authMiddleware, async (req, res) => {
  try {
    const { name } = req.body || {};
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).json({ error: '标签名称不能为空' });
    }
    const tagId = Number(req.params.id);
    // org 作用域守卫：仅本人 PERSONAL 租户的标签可改名（跨租户/不存在 → 统一 404，防枚举）
    const orgId = await resolvePersonalOrgId(pool, req.user.id);
    if (!(await tagBelongsToOrg(pool, tagId, orgId))) {
      return res.status(404).json({ error: '标签不存在' });
    }
    const ok = await renameTag(pool, tagId, name.trim());
    if (!ok) return res.status(404).json({ error: '标签不存在' });
    res.json({ ok: true });
  } catch (err) {
    log.error('renameTag error:', err);
    res.status(500).json({ error: '重命名失败' });
  }
});

// DELETE /:id — 删除标签
router.delete('/:id(\\d+)', authMiddleware, async (req, res) => {
  try {
    const tagId = Number(req.params.id);
    // org 作用域守卫：仅本人 PERSONAL 租户的标签可删除
    const orgId = await resolvePersonalOrgId(pool, req.user.id);
    if (!(await tagBelongsToOrg(pool, tagId, orgId))) {
      return res.status(404).json({ error: '标签不存在' });
    }
    const ok = await deleteTag(pool, tagId);
    if (!ok) return res.status(404).json({ error: '标签不存在' });
    res.json({ ok: true });
  } catch (err) {
    log.error('deleteTag error:', err);
    res.status(500).json({ error: '删除标签失败' });
  }
});

// POST /question/:qid/bindTags — 为题目绑定标签
router.post('/question/:qid(\\d+)/bindTags', authMiddleware, async (req, res) => {
  try {
    const qid = Number(req.params.qid);
    const { tag_ids } = req.body || {};
    if (!Array.isArray(tag_ids) || tag_ids.length === 0) {
      return res.status(400).json({ error: 'tag_ids 必须为非空数组' });
    }
    // 验证题目属于当前用户
    const [check] = await pool.execute(
      'SELECT id FROM questions WHERE id = ? AND created_by = ? AND deleted_at IS NULL',
      [qid, req.user.id]
    );
    if (check.length === 0) {
      return res.status(404).json({ error: '题目不存在或无权操作' });
    }
    const added = await bindTags(pool, qid, tag_ids.map(Number));
    res.json({ added });
  } catch (err) {
    log.error('bindTags error:', err);
    res.status(500).json({ error: '绑定标签失败' });
  }
});

// DELETE /question/:qid/unbindTag/:tagId — 解绑
router.delete('/question/:qid(\\d+)/unbindTag/:tagId(\\d+)', authMiddleware, async (req, res) => {
  try {
    const qid = Number(req.params.qid);
    const tagId = Number(req.params.tagId);
    const [check] = await pool.execute(
      'SELECT id FROM questions WHERE id = ? AND created_by = ? AND deleted_at IS NULL',
      [qid, req.user.id]
    );
    if (check.length === 0) {
      return res.status(404).json({ error: '题目不存在或无权操作' });
    }
    const ok = await unbindTag(pool, qid, tagId);
    if (!ok) return res.status(404).json({ error: '绑定关系不存在' });
    res.json({ ok: true });
  } catch (err) {
    log.error('unbindTag error:', err);
    res.status(500).json({ error: '解绑失败' });
  }
});

// GET /question/:qid — 获取题目的标签
router.get('/question/:qid(\\d+)', authMiddleware, async (req, res) => {
  try {
    const qid = Number(req.params.qid);
    // 读侧越权修复：仅当调用者可见该题（属主/订阅/共享，同 questions/:id）才返回其标签
    if (!(await canViewQuestion(pool, qid, req.user.id))) {
      return res.status(404).json({ error: '题目不存在或无权限' });
    }
    const tags = await getTagsForQuestion(pool, qid);
    res.json({ tags });
  } catch (err) {
    log.error('getTagsForQuestion error:', err);
    res.status(500).json({ error: '获取题目标签失败' });
  }
});

export default router;
