/**
 * FR-104 材料题（一拖 N）——材料组路由。
 *
 * 资源：/api/question-groups
 *   POST /          建组（一段共享材料 + N 道普通子题，事务写入）
 *   GET  /          按科目列组（返回组 + 其子题摘要，供组卷「选组批量加入」）
 *   GET  /:id(\d+)  组详情（owner/管理员视角，子题含答案）
 *
 * 设计：子题仍是普通题型行，仅多写 group_id 软引用；判分零改动（见 spec D3）。
 * 本路由不挂 apiLimiter（与 /api/exams 一致），避免集成/隔离脚本连跑触发 429 串扰。
 */
import { Router } from 'express';
import pool from '../db.js';
import { authMiddleware } from '../middleware/auth.js';
import { resolvePersonalOrgId } from '../utils/personalOrg.js';
import { validateGroupPayload } from '../utils/questionGroups.js';
import log from '../utils/logger.js';

const router = Router();

// POST / — 建组（事务：插 group → 逐子题插 questions 并写 group_id）
router.post('/', authMiddleware, async (req, res) => {
  const { ok, errors } = validateGroupPayload(req.body);
  if (!ok) return res.status(400).json({ error: errors.join('; ') });

  const { subject_id, material, questions } = req.body;
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const orgId = await resolvePersonalOrgId(conn, req.user.id);
    const [g] = await conn.execute(
      'INSERT INTO question_groups (subject_id, material, created_by, org_id) VALUES (?, ?, ?, ?)',
      [subject_id, material, req.user.id, orgId]
    );
    const groupId = g.insertId;
    const ids = [];
    for (const q of questions) {
      const [r] = await conn.execute(
        `INSERT INTO questions (subject_id, type, title, code, options, answer, explanation, points, created_by, org_id, group_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          subject_id,
          q.type || 'single',
          q.title,
          q.code || null,
          q.options ? JSON.stringify(q.options) : null,
          JSON.stringify(q.answer),
          q.explanation || null,
          q.points || 1,
          req.user.id,
          orgId,
          groupId,
        ]
      );
      ids.push(r.insertId);
    }
    await conn.commit();
    res.json({ group_id: groupId, question_ids: ids, message: '材料组创建成功' });
  } catch (err) {
    await conn.rollback();
    log.error('创建材料组错误:', err);
    res.status(500).json({ error: '创建材料组失败' });
  } finally {
    conn.release();
  }
});

// GET /?subject_id= — 列某科目的组（id, material, 子题摘要）
router.get('/', authMiddleware, async (req, res) => {
  try {
    const { subject_id } = req.query;
    if (!subject_id) return res.status(400).json({ error: 'subject_id 必填' });
    // 属主隔离：非管理员仅见自己创建的组（与 GET /:id 的 created_by 守卫一致，杜绝按 subject_id 横向越权读取）
    const mineOnly = req.user.role !== 'admin';
    const listSql =
      'SELECT id, subject_id, material, created_by, created_at FROM question_groups WHERE subject_id = ?' +
      (mineOnly ? ' AND created_by = ?' : '') +
      ' ORDER BY created_at DESC';
    const listParams = mineOnly ? [subject_id, req.user.id] : [subject_id];
    const [groups] = await pool.execute(listSql, listParams);
    const ids = groups.map((g) => g.id);
    const qMap = {};
    if (ids.length > 0) {
      const ph = ids.map(() => '?').join(',');
      const [qs] = await pool.execute(
        `SELECT id, group_id, type, title, points FROM questions WHERE group_id IN (${ph}) AND deleted_at IS NULL ORDER BY id ASC`,
        ids
      );
      for (const q of qs) (qMap[q.group_id] ||= []).push(q);
    }
    res.json({ groups: groups.map((g) => ({ ...g, questions: qMap[g.id] || [] })) });
  } catch (err) {
    log.error('获取材料组列表错误:', err);
    res.status(500).json({ error: '获取材料组列表失败' });
  }
});

// GET /:id(\d+) — 组详情（owner/管理员视角，子题含答案）
router.get('/:id(\\d+)', authMiddleware, async (req, res) => {
  try {
    const [g] = await pool.execute('SELECT * FROM question_groups WHERE id = ?', [req.params.id]);
    if (g.length === 0) return res.status(404).json({ error: '材料组不存在' });
    const group = g[0];
    if (req.user.role !== 'admin' && group.created_by !== req.user.id) {
      return res.status(403).json({ error: '无权查看该材料组' });
    }
    const [qs] = await pool.execute(
      'SELECT id, type, title, code, options, answer, explanation, points FROM questions WHERE group_id = ? AND deleted_at IS NULL ORDER BY id ASC',
      [group.id]
    );
    res.json({ group: { ...group, questions: qs } });
  } catch (err) {
    log.error('获取材料组详情错误:', err);
    res.status(500).json({ error: '获取材料组详情失败' });
  }
});

export default router;
