/**
 * 考试自动交卷（sweep）领域逻辑 —— 从 routes/exams.js 迁出（FR-204）。
 *
 * 职责：
 *   - parseJsonSafe：JSON 列安全解析（mysql2 可能返回字符串或已解析对象）。
 *   - gradeAttempt：用服务端 questions 表答案对一次 attempt 评分（submit 与 sweep 共用）。
 *   - sweepExpiredAttempts：将过期 in_progress attempt 分页、有界地置 auto_submitted。
 *   - sweepSingleAttempt：定向收卷单份 attempt。
 *
 * 设计（FR-204 根因治理）：
 *   - 分页：候选查询 ORDER BY deadline ASC + LIMIT，每批 ≤ batchSize，批间 setImmediate 释放事件循环，
 *     单次调用累计 ≤ maxRows（多余积压留给后续调用 / 后台调度器 tick）。
 *   - 幂等：事务内 FOR UPDATE 重查 status，一旦 != 'in_progress' 即跳过。
 *   - 判分口径与结果零改变：仍调用同一 gradeQuestion（examScoring）。
 *   - 可测：db 作为依赖注入（默认 pool），单测可 mock。
 */
import pool from '../db.js';
import { gradeQuestion } from './examScoring.js';
import log from './logger.js';

/** 单请求/单 tick 候选积压超过该阈值即告警（PRD R11）。 */
const ALERT_THRESHOLD = 100;

/** 安全解析 JSON 列（mysql2 可能返回字符串，也可能已解析；两者皆兼容）。 */
export function parseJsonSafe(value, fallback = null) {
  if (value === null || value === undefined) return fallback;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch {
      return fallback;
    }
  }
  return value; // 已是对象/数组
}

/**
 * 用服务端 questions 表答案对一次 attempt 评分（缺题判错，编程题不自动判分）。
 * @param {Object} conn 数据库连接（用于事务 / FOR UPDATE）
 * @param {Object} exam 试卷对象（需含 question_set JSON 文本/数组）
 * @param {Object} answers { [question_id]: userAnswer }
 * @returns {Promise<{details: Array, score: number, correctCount: number, totalCount: number}>}
 */
export async function gradeAttempt(conn, exam, answers) {
  const questionSet = parseJsonSafe(exam.question_set, []);
  const questionIds = questionSet.map((q) => q.question_id).filter((id) => id != null);
  const questionMap = {};

  if (questionIds.length > 0) {
    const placeholders = questionIds.map(() => '?').join(',');
    const [rows] = await conn.execute(
      `SELECT id, type, options, answer, explanation, points
       FROM questions WHERE id IN (${placeholders})`,
      questionIds
    );
    rows.forEach((r) => {
      questionMap[r.id] = r;
    });
  }

  const details = [];
  let score = 0;
  let correctCount = 0;
  let totalCount = 0;

  for (const item of questionSet) {
    const qid = item.question_id;
    const q = questionMap[qid];
    const points = item.points != null ? Number(item.points) : q ? Number(q.points) || 0 : 0;
    totalCount += 1;
    const userAnswer = answers ? answers[qid] : undefined;

    if (!q) {
      // 题目已被删除（科目级联删除等）：无法评分，按判错处理并注明
      details.push({
        question_id: qid,
        user_answer: userAnswer ?? null,
        correct_answer: null,
        is_correct: false,
        points,
        earned: 0,
        explanation: '题目已被删除，无法评分',
        needs_manual: false,
      });
      continue;
    }

    const options = parseJsonSafe(q.options, []);
    const answer = parseJsonSafe(q.answer, q.answer);
    const graded = gradeQuestion({ type: q.type, answer, options }, userAnswer, points);

    details.push({
      question_id: qid,
      user_answer: userAnswer ?? null,
      correct_answer: answer,
      is_correct: graded.is_correct,
      points,
      earned: graded.earned,
      explanation: q.explanation || '',
      needs_manual: graded.needs_manual,
    });

    score += graded.earned;
    if (graded.is_correct === true) correctCount += 1;
  }

  return { details, score, correctCount, totalCount };
}

/** 构造过期候选的 WHERE 条件（examId/userId/excludeAttemptId 任意组合）。 */
function buildWhere({ examId, userId, excludeAttemptId }) {
  const where = ["a.status = 'in_progress'", 'a.deadline < NOW()'];
  const params = [];
  if (examId) {
    where.push('a.exam_id = ?');
    params.push(examId);
  }
  if (userId) {
    where.push('a.user_id = ?');
    params.push(userId);
  }
  if (excludeAttemptId) {
    where.push('a.id <> ?');
    params.push(excludeAttemptId);
  }
  return { sql: where.join(' AND '), params };
}

/** 统计过期候选总数（用于积压告警与分页预算），依赖 idx_sweep(status, deadline)。 */
async function countExpired(db, scope) {
  const { sql, params } = buildWhere(scope);
  const [rows] = await db.execute(`SELECT COUNT(*) AS c FROM exam_attempts a WHERE ${sql}`, params);
  return Number(rows[0] ? rows[0].c : 0);
}

/** 取一页过期候选 id（按 deadline 升序，最先到期的先处理）。 */
async function collectExpiredIds(db, scope, limit) {
  const { sql, params } = buildWhere(scope);
  const [rows] = await db.execute(
    `SELECT a.id FROM exam_attempts a WHERE ${sql} ORDER BY a.deadline ASC LIMIT ?`,
    [...params, limit]
  );
  return rows.map((r) => r.id);
}

/**
 * 定向收卷单份 attempt：事务内加锁重查 → 评分 → 置 auto_submitted。
 * 幂等：非 in_progress（已提交/已被并发抢占）时不动并返回 false。
 * @returns {Promise<boolean>} 是否真正完成了本次收卷
 */
async function autoSubmitOne(db, attemptId) {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const [cur] = await conn.execute(
      'SELECT status, answers, exam_id FROM exam_attempts WHERE id = ? FOR UPDATE',
      [attemptId]
    );
    if (cur.length === 0 || cur[0].status !== 'in_progress') {
      await conn.commit();
      return false; // 幂等：已被处理或不存在
    }
    const [examRows] = await conn.execute('SELECT question_set FROM exams WHERE id = ?', [cur[0].exam_id]);
    const exam = examRows[0] || { question_set: null };
    const currentAnswers = parseJsonSafe(cur[0].answers, {});
    const { details, score, correctCount, totalCount } = await gradeAttempt(conn, exam, currentAnswers);
    await conn.execute(
      `UPDATE exam_attempts
       SET status = 'auto_submitted',
           answers = ?, details = ?, score = ?, correct_count = ?, total_count = ?,
           submitted_at = NOW(), updated_at = NOW()
       WHERE id = ?`,
      [JSON.stringify(currentAnswers), JSON.stringify(details), score, correctCount, totalCount, attemptId]
    );
    await conn.commit();
    return true;
  } catch (err) {
    try {
      await conn.rollback();
    } catch {}
    log.error({ err, attemptId }, 'autoSubmitOne 单条失败');
    return false;
  } finally {
    conn.release();
  }
}

/**
 * 惰性/后台自动交卷：将过期 in_progress attempt 分页、有界地置 auto_submitted。
 *
 * @param {number|null} examId   限定考试；null=全部
 * @param {number|null} userId   限定用户；null=全部
 * @param {number|null} excludeAttemptId 排除指定 attempt（submit 自身正在提交的那份）
 * @param {Object} [opts]
 * @param {Object} [opts.db=pool]        连接池（注入以便测试）
 * @param {number} [opts.batchSize=50]   每批处理条数
 * @param {number} [opts.maxRows=200]    单次调用累计上限（超出留给后续调用/tick）
 * @returns {Promise<number>} 本次真正收卷的数量
 */
export async function sweepExpiredAttempts(examId = null, userId = null, excludeAttemptId = null, opts = {}) {
  const { db = pool, batchSize = 50, maxRows = 200 } = opts;
  const scope = { examId, userId, excludeAttemptId };

  const candidateCount = await countExpired(db, scope);
  if (candidateCount > ALERT_THRESHOLD) {
    log.warn({ msg: 'exam_sweep_backlog', scope, candidateCount }, '过期候选积压超阈值');
  }

  let processed = 0;
  let budget = Math.min(candidateCount, maxRows);

  while (budget > 0) {
    const pageLimit = Math.min(batchSize, budget);
    const ids = await collectExpiredIds(db, scope, pageLimit);
    if (ids.length === 0) break;
    for (const id of ids) {
      const done = await autoSubmitOne(db, id);
      if (done) processed += 1;
    }
    budget -= ids.length;
    if (ids.length < pageLimit) break; // 已排空
    // 批间让出事件循环，避免长时间占用连接/阻塞其他请求
    await new Promise((resolve) => setImmediate(resolve));
  }

  return processed;
}

/**
 * 定向收卷单份 attempt（供 GET /attempts/:attemptId 使用，避免触发全场扫描）。
 * 仅当该 attempt 确为 in_progress 且已过期时才收卷。
 * @returns {Promise<boolean>} 是否完成了收卷
 */
export async function sweepSingleAttempt(attemptId, opts = {}) {
  const { db = pool } = opts;
  const [rows] = await db.execute(
    "SELECT id FROM exam_attempts WHERE id = ? AND status = 'in_progress' AND deadline < NOW()",
    [attemptId]
  );
  if (rows.length === 0) return false;
  return autoSubmitOne(db, attemptId);
}
