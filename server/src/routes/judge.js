// server/src/routes/judge.js
// FR-106 编程题在线判题：练习同步运行样例（不计分）+ 答卷判题运行查询（属主/管理员）。
import { Router } from 'express';
import pool from '../db.js';
import { authWithAuthority } from '../middleware/auth.js';
import { getRunner, acquireSlot, releaseSlot } from '../services/judgeService.js';
import log from '../utils/logger.js';

const router = Router();

/** 读取 JSON 列（mysql2 已解析为对象；字符串时兜底 parse）。 */
function asArray(v) {
  if (Array.isArray(v)) return v;
  if (typeof v === 'string') { try { return JSON.parse(v); } catch { return []; } }
  return [];
}

/** POST /api/judge/practice  { question_id, code } — 同步跑样例用例（is_sample，无则全部），不计分。 */
router.post('/practice', authWithAuthority, async (req, res) => {
  try {
    const qid = Number(req.body?.question_id);
    const code = String(req.body?.code ?? '');
    if (!qid) return res.status(400).json({ error: 'question_id 不能为空' });
    const userId = req.user.id;
    // 属主/共享可见性校验（与 questions 详情、practice 同一谓词）：不可见则 404，防跨租户越权触发判题/隔空探测期望输出
    const [jc] = await pool.execute(
      `SELECT jc.language, jc.time_limit_ms, jc.memory_limit_mb, jc.test_cases
       FROM question_judge_configs jc JOIN questions q ON q.id = jc.question_id
       WHERE jc.question_id = ? AND q.type = 'programming' AND q.deleted_at IS NULL AND (
         q.created_by = ?
         OR q.subject_id IN (SELECT ss.subject_id FROM subject_subscriptions ss WHERE ss.user_id = ? AND ss.status = 'approved')
         OR q.subject_id IN (SELECT s.id FROM subjects s WHERE s.share_scope = 'all' AND s.created_by IN (SELECT teacher_id FROM users WHERE id = ?))
         OR q.subject_id IN (SELECT s.id FROM subjects s WHERE s.share_scope = 'students' AND s.created_by IN (SELECT teacher_id FROM users WHERE id = ?)
           AND (NOT EXISTS (SELECT 1 FROM subject_student_access sa WHERE sa.subject_id = s.id) OR EXISTS (SELECT 1 FROM subject_student_access sa WHERE sa.subject_id = s.id AND sa.student_user_id = ?)))
       )`,
      [qid, userId, userId, userId, userId, userId]);
    if (jc.length === 0) return res.status(404).json({ error: '题目不存在或无判题配置' });
    const all = asArray(jc[0].test_cases);
    const samples = all.filter((c) => c.is_sample !== false);
    const cases = (samples.length ? samples : all);
    await acquireSlot();
    let result;
    try {
      result = await getRunner().run({ code, language: jc[0].language, testCases: cases, timeLimitMs: jc[0].time_limit_ms, memoryLimitMb: jc[0].memory_limit_mb });
    } finally { releaseSlot(); }
    res.json({ verdict: result.verdict, passed: result.passed, total: result.total, perCase: result.perCase, time_ms: result.time_ms });
  } catch (err) {
    log.error('练习判题错误:', err);
    res.status(500).json({ error: '判题失败' });
  }
});

/** GET /api/judge/runs/:attemptId — 某答卷的判题运行（仅属主/管理员）。 */
router.get('/runs/:attemptId(\\d+)', authWithAuthority, async (req, res) => {
  try {
    const [a] = await pool.execute('SELECT user_id FROM exam_attempts WHERE id = ?', [Number(req.params.attemptId)]);
    if (a.length === 0) return res.status(404).json({ error: '答卷不存在' });
    if (a[0].user_id !== req.user.id && req.user.role !== 'admin') return res.status(403).json({ error: '无权查看' });
    const [runs] = await pool.execute('SELECT id, question_id, status, verdict, passed, total, time_ms FROM judge_runs WHERE attempt_id = ? ORDER BY id', [Number(req.params.attemptId)]);
    res.json({ runs });
  } catch (err) { log.error('判题运行查询错误:', err); res.status(500).json({ error: '查询失败' }); }
});

export default router;
