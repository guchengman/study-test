/**
 * 正式考试模块路由 /api/exams
 *
 * 鉴权：全部端点需 authMiddleware（在 index.js 已挂载）。
 * owner = req.user 是 admin/teacher 或 req.user.id === exams.created_by。
 *
 * 关键约定（见技术方案第六节）：
 *   - 所有查询用 pool.execute 参数化；JSON 列 SELECT 后 JSON.parse，INSERT 前 JSON.stringify。
 *   - 评分权威在服务端：submit 用 questions 表原答案逐题评分，不信任前端分数。
 *   - 编程题不自动判分：type='programming' => is_correct=null, earned=0, needs_manual=true。
 *   - 多次参考取最高分：exam_attempts 无唯一约束；start 复用进行中未超时 attempt。
 *   - 强制自动交卷（三管齐下）：start/listAvailable/submit/getAttempt/my-history/analysis/attempts
 *     入口统一前置 sweepExpiredAttempts(scope)（后端惰性兜底）；owner 可 POST /:id/sweep 主动触发。
 */
import { Router } from 'express';
import pool from '../db.js';
import { authMiddleware } from '../middleware/auth.js';
import { canAccessSubject, canManageSubject } from '../utils/access.js';
import { gradeQuestion } from '../utils/examScoring.js';

const router = Router();

// ============ 通用辅助 ============

/** 安全解析 JSON 列（mysql2 可能返回字符串，也可能已解析；两者皆兼容）。 */
function parseJsonSafe(value, fallback = null) {
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

/** owner 判定：admin/teacher 或试卷创建者本人。 */
function isOwner(exam, userId, role) {
  return role === 'admin' || role === 'teacher' || exam.created_by === userId;
}

/**
 * 惰性自动交卷：将 status='in_progress' 且 deadline < NOW() 的 attempt 按"当前已填 answers"评分并置 auto_submitted。
 * 幂等：一旦 status != 'in_progress' 不再被选中。
 *
 * @param {number|null} examId   限定考试（owner 端点用）；null 表示全部
 * @param {number|null} userId    限定用户（学员端点用）；null 表示全部
 * @param {number|null} excludeAttemptId 排除指定 attempt（submit 自身正在提交的 attempt，避免被提前抢占）
 * @returns {Promise<number>} 本次自动交卷数量
 */
async function sweepExpiredAttempts(examId = null, userId = null, excludeAttemptId = null) {
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

  const [rows] = await pool.execute(
    `SELECT a.id, a.answers, e.question_set
     FROM exam_attempts a
     JOIN exams e ON a.exam_id = e.id
     WHERE ${where.join(' AND ')}`,
    params
  );

  let autoSubmitted = 0;
  for (const attempt of rows) {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      // 事务内加锁重查，保证幂等（并发安全）
      const [cur] = await conn.execute(
        'SELECT status, answers FROM exam_attempts WHERE id = ? FOR UPDATE',
        [attempt.id]
      );
      if (cur.length === 0 || cur[0].status !== 'in_progress') {
        await conn.commit();
        continue;
      }
      const currentAnswers = parseJsonSafe(cur[0].answers, {});
      const exam = { question_set: attempt.question_set };
      const { details, score, correctCount, totalCount } = await gradeAttempt(conn, exam, currentAnswers);
      await conn.execute(
        `UPDATE exam_attempts
         SET status = 'auto_submitted',
             answers = ?,
             details = ?,
             score = ?,
             correct_count = ?,
             total_count = ?,
             submitted_at = NOW(),
             updated_at = NOW()
         WHERE id = ?`,
        [
          JSON.stringify(currentAnswers),
          JSON.stringify(details),
          score,
          correctCount,
          totalCount,
          attempt.id,
        ]
      );
      await conn.commit();
      autoSubmitted += 1;
    } catch (err) {
      await conn.rollback();
      console.error('sweepExpiredAttempts 单条失败:', err);
    } finally {
      conn.release();
    }
  }
  return autoSubmitted;
}

/**
 * 用服务端 questions 表答案对一次 attempt 评分（缺题判错，编程题不自动判分）。
 * @param {Object} conn 数据库连接（用于 FOR UPDATE / 事务）
 * @param {Object} exam 试卷对象（需含 question_set JSON 文本/数组）
 * @param {Object} answers { [question_id]: userAnswer }
 * @returns {Promise<{details: Array, score: number, correctCount: number, totalCount: number}>}
 */
async function gradeAttempt(conn, exam, answers) {
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

// ============ owner 组卷管理 ============

/**
 * POST /api/exams — 创建试卷（draft）
 * 入参：subject_id, title, question_set:[{question_id,points}], duration_minutes?,
 *       start_time?, end_time?, pass_score?, description?
 */
router.post('/', authMiddleware, async (req, res) => {
  try {
    const {
      subject_id,
      title,
      question_set,
      duration_minutes,
      start_time,
      end_time,
      pass_score,
      description,
    } = req.body;

    if (!subject_id || !title || !Array.isArray(question_set) || question_set.length === 0) {
      return res.status(400).json({ error: '科目ID、标题与题集不能为空' });
    }

    // 校验科目可管理
    const manageable = await canManageSubject(req.user.id, subject_id);
    if (!manageable) {
      return res.status(403).json({ error: '无权在该科目下创建考试' });
    }

    const totalPoints = question_set.reduce(
      (sum, q) => sum + (Number(q.points) > 0 ? Number(q.points) : 0),
      0
    );

    const [result] = await pool.execute(
      `INSERT INTO exams
        (subject_id, title, description, created_by, question_set, total_points,
         duration_minutes, start_time, end_time, pass_score, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft')`,
      [
        subject_id,
        title,
        description || null,
        req.user.id,
        JSON.stringify(question_set),
        totalPoints,
        duration_minutes ? Number(duration_minutes) : 60,
        start_time || null,
        end_time || null,
        pass_score != null ? Number(pass_score) : 60,
      ]
    );

    res.json({ id: result.insertId, status: 'draft' });
  } catch (err) {
    console.error('创建考试错误:', err);
    res.status(500).json({ error: '创建考试失败' });
  }
});

/**
 * PUT /api/exams/:id — 更新试卷
 * published 仅允许改 start_time/end_time/status；draft/closed 可改全字段（改题集时重算 total_points）。
 */
router.put('/:id(\\d+)', authMiddleware, async (req, res) => {
  try {
    const examId = Number(req.params.id);
    const [examRows] = await pool.execute('SELECT * FROM exams WHERE id = ?', [examId]);
    if (examRows.length === 0) {
      return res.status(404).json({ error: '考试不存在' });
    }
    const exam = examRows[0];
    if (!isOwner(exam, req.user.id, req.user.role)) {
      return res.status(403).json({ error: '无权修改该考试' });
    }

    const {
      title,
      description,
      question_set,
      duration_minutes,
      start_time,
      end_time,
      pass_score,
      status,
    } = req.body;

    if (exam.status === 'published') {
      const nextStatus = status && ['draft', 'published', 'closed'].includes(status) ? status : exam.status;
      // 仅当目标状态仍是 published（未撤销发布）时才限制为只改时间窗与状态；
      // 若主动降为 draft / closed（即「撤销发布」），视为离线编辑，放行全字段更新（见下方）。
      if (nextStatus === 'published') {
        await pool.execute(
          `UPDATE exams SET start_time = ?, end_time = ?, status = ?, updated_at = NOW()
           WHERE id = ?`,
          [
            start_time !== undefined ? (start_time || null) : exam.start_time,
            end_time !== undefined ? (end_time || null) : exam.end_time,
            nextStatus,
            examId,
          ]
        );
        return res.json({ message: '考试已更新（发布状态下仅允许修改时间窗与状态）' });
      }
      // 否则（撤销发布）继续走下方全字段更新
    }

    // draft / closed：可改全字段
    const finalQuestionSet = question_set ? question_set : parseJsonSafe(exam.question_set, []);
    const totalPoints = finalQuestionSet.reduce(
      (sum, q) => sum + (Number(q.points) > 0 ? Number(q.points) : 0),
      0
    );

    await pool.execute(
      `UPDATE exams
       SET title = ?, description = ?, question_set = ?, total_points = ?,
           duration_minutes = ?, start_time = ?, end_time = ?, pass_score = ?, status = ?, updated_at = NOW()
       WHERE id = ?`,
      [
        title !== undefined ? title : exam.title,
        description !== undefined ? (description || null) : exam.description,
        JSON.stringify(finalQuestionSet),
        totalPoints,
        duration_minutes ? Number(duration_minutes) : exam.duration_minutes,
        start_time !== undefined ? (start_time || null) : exam.start_time,
        end_time !== undefined ? (end_time || null) : exam.end_time,
        pass_score != null ? Number(pass_score) : exam.pass_score,
        status && ['draft', 'published', 'closed'].includes(status) ? status : exam.status,
        examId,
      ]
    );

    res.json({ message: '考试已更新' });
  } catch (err) {
    console.error('更新考试错误:', err);
    res.status(500).json({ error: '更新考试失败' });
  }
});

/** DELETE /api/exams/:id — 删除试卷（attempts 级联删除） */
router.delete('/:id(\\d+)', authMiddleware, async (req, res) => {
  try {
    const examId = Number(req.params.id);
    const [examRows] = await pool.execute('SELECT * FROM exams WHERE id = ?', [examId]);
    if (examRows.length === 0) {
      return res.status(404).json({ error: '考试不存在' });
    }
    if (!isOwner(examRows[0], req.user.id, req.user.role)) {
      return res.status(403).json({ error: '无权删除该考试' });
    }
    await pool.execute('DELETE FROM exams WHERE id = ?', [examId]);
    res.json({ message: '考试已删除' });
  } catch (err) {
    console.error('删除考试错误:', err);
    res.status(500).json({ error: '删除考试失败' });
  }
});

/** GET /api/exams — 我的试卷列表（含 attempts 数、平均分简报） */
router.get('/', authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT e.*,
        (SELECT COUNT(*) FROM exam_attempts a WHERE a.exam_id = e.id) AS attempt_count,
        (SELECT COALESCE(AVG(score), 0)
         FROM exam_attempts a WHERE a.exam_id = e.id AND a.status IN ('submitted','auto_submitted'))
         AS avg_score
       FROM exams e
       WHERE e.created_by = ?
       ORDER BY e.created_at DESC`,
      [req.user.id]
    );

    const exams = rows.map((r) => ({
      ...r,
      question_set: parseJsonSafe(r.question_set, []),
      avg_score: Number(r.avg_score) || 0,
    }));

    res.json({ exams });
  } catch (err) {
    console.error('获取我的考试列表错误:', err);
    res.status(500).json({ error: '获取考试列表失败' });
  }
});

/** GET /api/exams/:id — 试卷详情（解析题集为含答案的完整 questions，供编辑/预览） */
router.get('/:id(\\d+)', authMiddleware, async (req, res) => {
  try {
    const examId = Number(req.params.id);
    const [examRows] = await pool.execute('SELECT * FROM exams WHERE id = ?', [examId]);
    if (examRows.length === 0) {
      return res.status(404).json({ error: '考试不存在' });
    }
    const exam = examRows[0];
    if (!isOwner(exam, req.user.id, req.user.role)) {
      return res.status(403).json({ error: '无权查看该考试' });
    }

    const questionSet = parseJsonSafe(exam.question_set, []);
    const questionIds = questionSet.map((q) => q.question_id).filter((id) => id != null);
    const questionMap = {};
    if (questionIds.length > 0) {
      const placeholders = questionIds.map(() => '?').join(',');
      const [qRows] = await pool.execute(
        `SELECT id, type, title, code, options, answer, explanation, points
         FROM questions WHERE id IN (${placeholders})`,
        questionIds
      );
      qRows.forEach((r) => {
        questionMap[r.id] = r;
      });
    }

    const questions = questionSet.map((item) => {
      const q = questionMap[item.question_id];
      if (!q) {
        return {
          id: item.question_id,
          type: 'unknown',
          title: '（题目已被删除）',
          code: null,
          options: [],
          answer: null,
          explanation: '',
          points: item.points,
          missing: true,
        };
      }
      return {
        id: q.id,
        type: q.type,
        title: q.title,
        code: q.code,
        options: parseJsonSafe(q.options, []),
        answer: parseJsonSafe(q.answer, q.answer),
        explanation: q.explanation || '',
        points: item.points,
      };
    });

    res.json({
      exam: {
        ...exam,
        question_set: questionSet,
        questions,
      },
    });
  } catch (err) {
    console.error('获取考试详情错误:', err);
    res.status(500).json({ error: '获取考试详情失败' });
  }
});

// ============ 学员参试 ============

/** GET /api/exams/available — 可参加列表（published + 窗口内 + 科目可访问），每项带 attempt_state */
router.get('/available', authMiddleware, async (req, res) => {
  try {
    // 惰性兜底：先自动交卷本用户所有过期 attempt
    await sweepExpiredAttempts(null, req.user.id);

    const [rows] = await pool.execute(
      `SELECT * FROM exams e
       WHERE e.status = 'published'
         AND (e.start_time IS NULL OR e.start_time <= NOW())
         AND (e.end_time IS NULL OR e.end_time >= NOW())
       ORDER BY e.created_at DESC`
    );

    const exams = [];
    for (const e of rows) {
      const accessible = await canAccessSubject(req.user.id, e.subject_id);
      if (!accessible) continue;

      // attempt_state：none / in_progress / submitted
      const [st] = await pool.execute(
        `SELECT
           MAX(status = 'in_progress') AS has_inprogress,
           MAX(status IN ('submitted','auto_submitted')) AS has_submitted
         FROM exam_attempts
         WHERE exam_id = ? AND user_id = ?`,
        [e.id, req.user.id]
      );
      let attemptState = 'none';
      if (st.length > 0) {
        if (st[0].has_inprogress) attemptState = 'in_progress';
        else if (st[0].has_submitted) attemptState = 'submitted';
      }

      exams.push({
        id: e.id,
        title: e.title,
        subject_id: e.subject_id,
        duration_minutes: e.duration_minutes,
        start_time: e.start_time,
        end_time: e.end_time,
        total_points: e.total_points,
        pass_score: e.pass_score,
        attempt_state: attemptState,
      });
    }

    res.json({ exams });
  } catch (err) {
    console.error('获取可参加列表错误:', err);
    res.status(500).json({ error: '获取可参加考试失败' });
  }
});

/**
 * POST /api/exams/:id/start — 开始作答
 * 校验窗口/权限；复用本用户本场「未提交且未超时」attempt（reused:true）或新建 in_progress attempt；
 * 返回剥离 answer/explanation 的试卷。
 */
router.post('/:id(\\d+)/start', authMiddleware, async (req, res) => {
  try {
    const examId = Number(req.params.id);
    // 惰性兜底：先自动交卷本用户在本场过期 attempt（不影响即将复用的进行中 attempt）
    await sweepExpiredAttempts(examId, req.user.id);

    const [examRows] = await pool.execute('SELECT * FROM exams WHERE id = ?', [examId]);
    if (examRows.length === 0) {
      return res.status(404).json({ error: '考试不存在' });
    }
    const exam = examRows[0];

    // 校验 published
    if (exam.status !== 'published') {
      return res.status(403).json({ error: '考试尚未发布' });
    }
    // 时间窗校验统一走 SQL NOW()，与 /available 同一时钟，消除 DB/Node 时区或时钟漂移导致的边界不一致
    const [win] = await pool.execute(
      `SELECT 1 FROM exams
       WHERE id = ?
         AND (start_time IS NULL OR start_time <= NOW())
         AND (end_time IS NULL OR end_time >= NOW())`,
      [examId]
    );
    if (win.length === 0) {
      return res.status(403).json({ error: '考试尚未开始或已结束' });
    }
    // 校验科目可访问
    const accessible = await canAccessSubject(req.user.id, exam.subject_id);
    if (!accessible) {
      return res.status(403).json({ error: '无权参加该考试' });
    }

    // 复用进行中且未超时的 attempt
    const [existing] = await pool.execute(
      `SELECT id, deadline FROM exam_attempts
       WHERE exam_id = ? AND user_id = ? AND status = 'in_progress' AND deadline > NOW()
       ORDER BY id DESC LIMIT 1`,
      [examId, req.user.id]
    );

    let attemptId;
    let deadline;
    let reused = false;

    if (existing.length > 0) {
      attemptId = existing[0].id;
      deadline = existing[0].deadline;
      reused = true;
    } else {
      const [ins] = await pool.execute(
        `INSERT INTO exam_attempts (exam_id, user_id, status, answers, details, deadline)
         VALUES (?, ?, 'in_progress', NULL, NULL, DATE_ADD(NOW(), INTERVAL ? MINUTE))`,
        [examId, req.user.id, exam.duration_minutes]
      );
      attemptId = ins.insertId;
      const [fresh] = await pool.execute('SELECT deadline FROM exam_attempts WHERE id = ?', [attemptId]);
      deadline = fresh[0].deadline;
    }

    // 取题并剥离 answer/explanation
    const questionSet = parseJsonSafe(exam.question_set, []);
    const questionIds = questionSet.map((q) => q.question_id).filter((id) => id != null);
    let questions = [];
    if (questionIds.length > 0) {
      const placeholders = questionIds.map(() => '?').join(',');
      const [qRows] = await pool.execute(
        `SELECT id, type, title, code, options, points
         FROM questions WHERE id IN (${placeholders})`,
        questionIds
      );
      const qMap = {};
      qRows.forEach((r) => {
        qMap[r.id] = r;
      });
      questions = questionSet
        .map((item) => {
          const q = qMap[item.question_id];
          if (!q) return null; // 缺题过滤并告警（前端可提示）
          return {
            id: q.id,
            type: q.type,
            title: q.title,
            code: q.code,
            options: parseJsonSafe(q.options, []),
            points: item.points,
          };
        })
        .filter(Boolean);
    }

    res.json({
      attemptId,
      deadline,
      reused,
      questions,
      total_points: exam.total_points,
    });
  } catch (err) {
    console.error('开始考试错误:', err);
    res.status(500).json({ error: '开始考试失败' });
  }
});

/**
 * POST /api/exams/:id/submit — 提交评分
 * 入口先 sweep 本场（排除当前 attempt）；用服务端 answers 逐题评分；返回含 correct_answer+explanation 的 details。
 */
router.post('/:id(\\d+)/submit', authMiddleware, async (req, res) => {
  let conn = null; // 提升到函数作用域，供 catch/finally 引用（避免块级作用域导致 conn 不可见）
  try {
    const examId = Number(req.params.id);
    const { attemptId, answers } = req.body;
    if (!attemptId) {
      return res.status(400).json({ error: 'attemptId 不能为空' });
    }

    // 惰性兜底：自动交卷本场其他过期 attempt（排除当前正在提交的 attempt）
    await sweepExpiredAttempts(examId, req.user.id, Number(attemptId));

    conn = await pool.getConnection();
    await conn.beginTransaction();
    const [attemptRows] = await conn.execute(
      'SELECT * FROM exam_attempts WHERE id = ? FOR UPDATE',
      [Number(attemptId)]
    );
    if (attemptRows.length === 0) {
      await conn.rollback();
      return res.status(404).json({ error: '答卷不存在' });
    }
    const attempt = attemptRows[0];
    if (attempt.exam_id !== examId) {
      await conn.rollback();
      return res.status(400).json({ error: '答卷与考试不匹配' });
    }
    if (attempt.user_id !== req.user.id) {
      await conn.rollback();
      return res.status(403).json({ error: '无权提交该答卷' });
    }

    // 已提交：返回已存结果（幂等，便于前端重复提交/刷新后展示）
    if (attempt.status !== 'in_progress') {
      await conn.rollback();
      const exam = (await conn.execute('SELECT total_points FROM exams WHERE id = ?', [examId]))[0][0];
      return res.json({
        score: attempt.score,
        total_points: exam ? exam.total_points : attempt.total_count,
        correct_count: attempt.correct_count,
        details: parseJsonSafe(attempt.details, []),
        alreadySubmitted: true,
      });
    }

    const [examRows] = await conn.execute('SELECT * FROM exams WHERE id = ?', [examId]);
    const exam = examRows[0];
    const safeAnswers = answers && typeof answers === 'object' ? answers : {};
    const { details, score, correctCount, totalCount } = await gradeAttempt(conn, exam, safeAnswers);

    const now = new Date();
    const isExpired = attempt.deadline && new Date(attempt.deadline) < now;
    const newStatus = isExpired ? 'auto_submitted' : 'submitted';

    await conn.execute(
      `UPDATE exam_attempts
       SET status = ?, answers = ?, details = ?, score = ?, correct_count = ?, total_count = ?, submitted_at = NOW(), updated_at = NOW()
       WHERE id = ?`,
      [
        newStatus,
        JSON.stringify(safeAnswers),
        JSON.stringify(details),
        score,
        correctCount,
        totalCount,
        Number(attemptId),
      ]
    );
    await conn.commit();

    res.json({
      score,
      total_points: exam.total_points,
      correct_count: correctCount,
      details,
    });
  } catch (err) {
    try {
      await conn.rollback();
    } catch {}
    console.error('提交考试错误:', err);
    res.status(500).json({ error: '提交考试失败' });
  } finally {
    if (conn) conn.release();
  }
});

/** GET /api/exams/attempts/:attemptId — 查看某次答卷（透出 correct_answer+explanation，含编程题待定项） */
router.get('/attempts/:attemptId', authMiddleware, async (req, res) => {
  try {
    const attemptId = Number(req.params.attemptId);
    const [attemptRows] = await pool.execute('SELECT * FROM exam_attempts WHERE id = ?', [attemptId]);
    if (attemptRows.length === 0) {
      return res.status(404).json({ error: '答卷不存在' });
    }
    const attempt = attemptRows[0];

    // 惰性兜底：先自动交卷本场过期 attempt
    await sweepExpiredAttempts(attempt.exam_id, null);

    const [attemptRows2] = await pool.execute('SELECT * FROM exam_attempts WHERE id = ?', [attemptId]);
    const a = attemptRows2[0];

    const [examRows] = await pool.execute('SELECT * FROM exams WHERE id = ?', [a.exam_id]);
    const exam = examRows[0];
    // 权限：本人 或 owner
    if (a.user_id !== req.user.id && !isOwner(exam, req.user.id, req.user.role)) {
      return res.status(403).json({ error: '无权查看该答卷' });
    }

    // 构建完整 questions（含标题/选项 + 作答结果），便于结果页展示
    const details = parseJsonSafe(a.details, []);
    const detailMap = {};
    details.forEach((d) => {
      detailMap[d.question_id] = d;
    });

    let questions = [];
    if (details.length > 0) {
      const ids = details.map((d) => d.question_id);
      const placeholders = ids.map(() => '?').join(',');
      const [qRows] = await pool.execute(
        `SELECT id, type, title, code, options, answer, explanation, points
         FROM questions WHERE id IN (${placeholders})`,
        ids
      );
      const qMap = {};
      qRows.forEach((r) => {
        qMap[r.id] = r;
      });
      questions = details.map((d) => {
        const q = qMap[d.question_id];
        return {
          id: d.question_id,
          type: q ? q.type : 'unknown',
          title: q ? q.title : '（题目已被删除）',
          code: q ? q.code : null,
          options: q ? parseJsonSafe(q.options, []) : [],
          correct_answer: d.correct_answer,
          user_answer: d.user_answer,
          is_correct: d.is_correct,
          points: d.points,
          earned: d.earned,
          explanation: d.explanation,
          needs_manual: d.needs_manual,
        };
      });
    }

    res.json({
      attempt: {
        ...a,
        answers: parseJsonSafe(a.answers, {}),
        details,
        exam_title: exam.title,
      },
      questions,
    });
  } catch (err) {
    console.error('查看答卷错误:', err);
    res.status(500).json({ error: '查看答卷失败' });
  }
});

/** GET /api/exams/my-history — 我的历史成绩（全部 attempt + 每场考试 bestScores + is_best 标记） */
router.get('/my-history', authMiddleware, async (req, res) => {
  try {
    // 惰性兜底：自动交卷本用户所有过期 attempt
    await sweepExpiredAttempts(null, req.user.id);

    const [rows] = await pool.execute(
      `SELECT a.*, e.title AS exam_title, e.total_points, e.pass_score
       FROM exam_attempts a
       JOIN exams e ON a.exam_id = e.id
       WHERE a.user_id = ?
       ORDER BY a.exam_id, a.id DESC`,
      [req.user.id]
    );

    // 计算每场考试最佳成绩（最高分，并列时取最新一条）
    const best = {}; // exam_id -> { score, attemptId }
    for (const r of rows) {
      const eid = r.exam_id;
      if (!best[eid] || r.score > best[eid].score) {
        best[eid] = { score: r.score, attemptId: r.id };
      }
    }

    const bestScores = {};
    const history = rows.map((r) => {
      const eid = r.exam_id;
      bestScores[eid] = best[eid].score;
      const isBest = r.id === best[eid].attemptId;
      return {
        attemptId: r.id,
        exam_id: eid,
        exam_title: r.exam_title,
        score: r.score,
        total_points: r.total_points,
        pass_score: r.pass_score,
        passed: r.score >= r.pass_score,
        status: r.status,
        correct_count: r.correct_count,
        total_count: r.total_count,
        submitted_at: r.submitted_at,
        is_best: isBest,
      };
    });

    res.json({ history, bestScores });
  } catch (err) {
    console.error('获取历史成绩错误:', err);
    res.status(500).json({ error: '获取历史成绩失败' });
  }
});

/**
 * GET /api/exams/:id/analysis — 考试分析（实时聚合，口径=每学生最高分 attempt）
 */
router.get('/:id(\\d+)/analysis', authMiddleware, async (req, res) => {
  try {
    const examId = Number(req.params.id);
    const [examRows] = await pool.execute('SELECT * FROM exams WHERE id = ?', [examId]);
    if (examRows.length === 0) {
      return res.status(404).json({ error: '考试不存在' });
    }
    const exam = examRows[0];
    if (!isOwner(exam, req.user.id, req.user.role)) {
      return res.status(403).json({ error: '无权查看该考试分析' });
    }

    // 惰性兜底：自动交卷本场所有过期 attempt
    await sweepExpiredAttempts(examId, null);

    // 取本场所有已交卷 attempt（按 user + score 降序，便于取每学生最高分）
    const [attempts] = await pool.execute(
      `SELECT id, user_id, score, details
       FROM exam_attempts
       WHERE exam_id = ? AND status IN ('submitted','auto_submitted')
       ORDER BY user_id, score DESC, id DESC`,
      [examId]
    );

    // 每学生最佳 attempt
    const bestByUser = {}; // user_id -> { score, details }
    for (const a of attempts) {
      const uid = a.user_id;
      if (!bestByUser[uid] || a.score > bestByUser[uid].score) {
        bestByUser[uid] = { score: a.score, details: parseJsonSafe(a.details, []) };
      }
    }

    const userIds = Object.keys(bestByUser);
    const referenceCount = userIds.length;

    let averageScore = 0;
    let passCount = 0;
    if (referenceCount > 0) {
      const scores = userIds.map((uid) => bestByUser[uid].score);
      averageScore = scores.reduce((s, v) => s + v, 0) / referenceCount;
      passCount = scores.filter((s) => s >= exam.pass_score).length;
    }
    const passRate = referenceCount > 0 ? passCount / referenceCount : 0;

    // 每题错误率（基于每人最佳成绩；编程题 is_correct=null 不计入口径）
    const qStats = {}; // question_id -> { correct, wrong }
    for (const uid of userIds) {
      const details = bestByUser[uid].details;
      for (const d of details) {
        if (d.is_correct === true) {
          qStats[d.question_id] = qStats[d.question_id] || { correct: 0, wrong: 0 };
          qStats[d.question_id].correct += 1;
        } else if (d.is_correct === false) {
          qStats[d.question_id] = qStats[d.question_id] || { correct: 0, wrong: 0 };
          qStats[d.question_id].wrong += 1;
        }
        // is_correct === null（编程题待定）不计入错误率分母
      }
    }

    const questionErrorRates = Object.keys(qStats).map((qid) => {
      const { correct, wrong } = qStats[qid];
      const total = correct + wrong;
      return {
        question_id: Number(qid),
        errorRate: total > 0 ? wrong / total : 0,
        correctCount: correct,
        wrongCount: wrong,
        totalCount: total,
      };
    });

    res.json({
      analysis: {
        examId,
        title: exam.title,
        total_points: exam.total_points,
        pass_score: exam.pass_score,
        referenceCount,
        averageScore,
        passRate,
        questionErrorRates,
        scope: '每学生最高分 attempt',
      },
    });
  } catch (err) {
    console.error('考试分析错误:', err);
    res.status(500).json({ error: '获取考试分析失败' });
  }
});

/** GET /api/exams/:id/attempts — 本卷全部答卷列表（下钻，同一学生可有多条） */
router.get('/:id(\\d+)/attempts', authMiddleware, async (req, res) => {
  try {
    const examId = Number(req.params.id);
    const [examRows] = await pool.execute('SELECT * FROM exams WHERE id = ?', [examId]);
    if (examRows.length === 0) {
      return res.status(404).json({ error: '考试不存在' });
    }
    if (!isOwner(examRows[0], req.user.id, req.user.role)) {
      return res.status(403).json({ error: '无权查看该考试答卷' });
    }

    // 惰性兜底：自动交卷本场所有过期 attempt
    await sweepExpiredAttempts(examId, null);

    const [rows] = await pool.execute(
      `SELECT a.*, u.username
       FROM exam_attempts a
       LEFT JOIN users u ON a.user_id = u.id
       WHERE a.exam_id = ?
       ORDER BY a.user_id, a.id`,
      [examId]
    );

    const attempts = rows.map((r) => ({
      ...r,
      answers: parseJsonSafe(r.answers, {}),
      details: parseJsonSafe(r.details, []),
    }));

    res.json({ attempts });
  } catch (err) {
    console.error('获取答卷列表错误:', err);
    res.status(500).json({ error: '获取答卷列表失败' });
  }
});

/** POST /api/exams/:id/sweep — 批量强制自动交卷（owner/外部 cron 触发） */
router.post('/:id(\\d+)/sweep', authMiddleware, async (req, res) => {
  try {
    const examId = Number(req.params.id);
    const [examRows] = await pool.execute('SELECT * FROM exams WHERE id = ?', [examId]);
    if (examRows.length === 0) {
      return res.status(404).json({ error: '考试不存在' });
    }
    if (!isOwner(examRows[0], req.user.id, req.user.role)) {
      return res.status(403).json({ error: '无权对该考试执行自动交卷' });
    }
    const autoSubmitted = await sweepExpiredAttempts(examId, null);
    res.json({ autoSubmitted });
  } catch (err) {
    console.error('批量自动交卷错误:', err);
    res.status(500).json({ error: '批量自动交卷失败' });
  }
});

export default router;
