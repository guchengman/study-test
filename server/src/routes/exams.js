/**
 * 正式考试模块路由 /api/exams
 *
 * 鉴权：全部端点需 authMiddleware（在 index.js 已挂载）。
 * owner = req.user 是 platform admin 或 req.user.id === exams.created_by（teacher 需为创建者）。
 *
 * 关键约定（见技术方案第六节）：
 *   - 所有查询用 pool.execute 参数化；JSON 列 SELECT 后 JSON.parse，INSERT 前 JSON.stringify。
 *   - 评分权威在服务端：submit 用 questions 表原答案逐题评分，不信任前端分数。
 *   - 编程题不自动判分：type='programming' => is_correct=null, earned=0, needs_manual=true。
 *   - 多次参考取最高分：exam_attempts 无唯一约束；start 复用进行中未超时 attempt。
 *   - 强制自动交卷（FR-204 重构）：权威兜底改由后台调度器 examSweepScheduler 周期性带锁分页收卷（见 utils/examSweepScheduler.js）；
 *     写路径（start/submit）与学员读路径（available/my-history）保留有界(用户/本场)即时收卷；getAttempt 仅定向收单份；
 *     owner 读路径（analysis/attempts）不再同步全卷收卷，需即时可 POST /:id/sweep 触发（经分页模块）。
 */
import { Router } from 'express';
import pool from '../db.js';
import { authMiddleware } from '../middleware/auth.js';
import { canAccessSubject, canManageSubject } from '../utils/access.js';
import { sweepExpiredAttempts, sweepSingleAttempt, gradeAttempt, parseJsonSafe } from '../utils/examSweep.js';
import { resolvePersonalOrgId } from '../utils/personalOrg.js';
import { checkQuota, recordUsage } from '../utils/quotaService.js';
import { tickDay } from '../utils/streakService.js';
import { generateSeed, shuffleQuestions, buildOptionOrder, applyOptionOrder } from '../utils/seededShuffle.js';
import { applyManualScore, applyJudgeScore } from '../utils/manualGrading.js';
import { getRunner, acquireSlot, releaseSlot } from '../services/judgeService.js';
import { createNotification } from '../utils/notificationService.js';
import log from '../utils/logger.js';

const router = Router();

// ============ 通用辅助 ============

/** owner 判定：platform admin 或试卷创建者本人（teacher 需为创建者，避免跨租户越权）。 */
function isOwner(exam, userId, role) {
  return role === 'admin' || exam.created_by === userId;
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

    // FR-606：创建考试前校验配额（exam_count，年度滚动）
    const orgId = await resolvePersonalOrgId(pool, req.user.id);
    const quota = await checkQuota(pool, orgId, 'exam_count', 1);
    if (!quota.allowed) {
      return res.status(quota.status || 429).json({ error: '考试创建已达配额上限', reason: quota.reason });
    }

    const [result] = await pool.execute(
      `INSERT INTO exams
        (subject_id, title, description, created_by, question_set, total_points,
         duration_minutes, start_time, end_time, pass_score, status, org_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?)`,
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
        orgId,
      ]
    );

    // 记账（容错：配额基础设施异常不阻断创建结果）
    try { await recordUsage(pool, orgId, 'exam_count', 1); } catch (e) { log.warn('exam_count 记账失败:', e.message); }

    res.json({ id: result.insertId, status: 'draft' });
  } catch (err) {
    log.error('创建考试错误:', err);
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
    log.error('更新考试错误:', err);
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
    log.error('删除考试错误:', err);
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
    log.error('获取我的考试列表错误:', err);
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
        `SELECT q.id, q.type, q.title, q.code, q.options, q.answer, q.explanation, q.points,
                q.group_id, qg.material AS group_material, q.audio_url
         FROM questions q LEFT JOIN question_groups qg ON q.group_id = qg.id
         WHERE q.id IN (${placeholders})`,
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
        group_id: q.group_id ?? null,
        group_material: q.group_material ?? null,
        audio_url: q.audio_url ?? null,
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
    log.error('获取考试详情错误:', err);
    res.status(500).json({ error: '获取考试详情失败' });
  }
});

// ============ 学员参试 ============

/** GET /api/exams/available — 可参加列表（published + 窗口内 + 科目可访问），每项带 attempt_state */
router.get('/available', authMiddleware, async (req, res) => {
  try {
    // 有界收卷：仅本用户过期 attempt（代价有界，刷新本人彽标）
    await sweepExpiredAttempts(null, req.user.id, null, { batchSize: 5, maxRows: 10 });

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
    log.error('获取可参加列表错误:', err);
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
    // 有界收卷：仅本用户在本场过期 attempt（不影响即将复用的进行中 attempt）
    await sweepExpiredAttempts(examId, req.user.id, null, { batchSize: 5, maxRows: 5 });

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

    // 复用进行中且未超时的 attempt（FR-202: 同时读取 shuffle_seed/option_order 保证不复洗）
    const [existing] = await pool.execute(
      `SELECT id, deadline, shuffle_seed, option_order FROM exam_attempts
       WHERE exam_id = ? AND user_id = ? AND status = 'in_progress' AND deadline > NOW()
       ORDER BY id DESC LIMIT 1`,
      [examId, req.user.id]
    );

    let attemptId;
    let deadline;
    let reused = false;
    let shuffleSeed;
    let storedOptionOrder;

    if (existing.length > 0) {
      attemptId = existing[0].id;
      deadline = existing[0].deadline;
      reused = true;
      shuffleSeed = existing[0].shuffle_seed || null;
      storedOptionOrder = parseJsonSafe(existing[0].option_order, null);
    } else {
      shuffleSeed = generateSeed();
      const [ins] = await pool.execute(
        `INSERT INTO exam_attempts (exam_id, user_id, status, answers, details, deadline, org_id, shuffle_seed)
         VALUES (?, ?, 'in_progress', NULL, NULL, DATE_ADD(NOW(), INTERVAL ? MINUTE), ?, ?)`,
        [examId, req.user.id, exam.duration_minutes, await resolvePersonalOrgId(pool, req.user.id), shuffleSeed]
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
        `SELECT q.id, q.type, q.title, q.code, q.options, q.points,
                q.group_id, qg.material AS group_material, q.audio_url
         FROM questions q LEFT JOIN question_groups qg ON q.group_id = qg.id
         WHERE q.deleted_at IS NULL AND q.id IN (${placeholders})`,
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
            group_id: q.group_id ?? null,
            group_material: q.group_material ?? null,
            audio_url: q.audio_url ?? null,
          };
        })
        .filter(Boolean);
      // FR-106：编程题带出语言与初始代码（供答题界面按语言显示提示、回填 starter_code）；不下发 test_cases
      const startProgIds = questions.filter((q) => q.type === 'programming').map((q) => q.id);
      if (startProgIds.length > 0) {
        const [jcRows] = await pool.query(
          `SELECT question_id, language, starter_code FROM question_judge_configs WHERE question_id IN (${startProgIds.map(() => '?').join(',')})`,
          startProgIds,
        );
        const jcMap = new Map(jcRows.map((r) => [r.question_id, r]));
        questions = questions.map((q) => (q.type === 'programming'
          ? { ...q, judge_config: jcMap.get(q.id) ? { language: jcMap.get(q.id).language, starter_code: jcMap.get(q.id).starter_code } : null }
          : q));
      }
    }

    // ── FR-202 乱序处理 ──
    let finalQuestions = questions;
    let optionOrder;

    if (reused) {
      // 复用：用已持久化的 seed + option_order，不重洗
      optionOrder = storedOptionOrder;
    } else {
      // 新建：基于 seed 生成题序 + 选项序，持久化 option_order
      optionOrder = buildOptionOrder(questions, shuffleSeed);
      await pool.execute(
        `UPDATE exam_attempts SET option_order = ? WHERE id = ?`,
        [JSON.stringify(optionOrder), attemptId]
      );
    }

    // 应用题序乱序
    if (shuffleSeed && finalQuestions.length > 0) {
      finalQuestions = shuffleQuestions(finalQuestions, shuffleSeed);
    }

    // 应用选项乱序（每题）
    if (optionOrder && Object.keys(optionOrder).length > 0) {
      finalQuestions = finalQuestions.map((q) => {
        const perm = optionOrder[q.id] || optionOrder[String(q.id)];
        if (perm && q.options && q.options.length > 1) {
          return { ...q, options: applyOptionOrder(q.options, perm) };
        }
        return q;
      });
    }

    res.json({
      attemptId,
      deadline,
      reused,
      questions: finalQuestions,
      total_points: exam.total_points,
    });
  } catch (err) {
    log.error('开始考试错误:', err);
    res.status(500).json({ error: '开始考试失败' });
  }
});

/**
 * FR-106 交卷异步判题：为本次答卷中「有判题配置的编程题」建 judge_runs 并异步执行。
 * 非阻断；执行异常/无 docker 时该题 details 仍保持 needs_manual（回落人工），绝不误给分。
 */
async function enqueueProgrammingJudges(examId, attemptId, userId) {
  const [examRows] = await pool.execute('SELECT question_set FROM exams WHERE id = ?', [examId]);
  const qs = parseJsonSafe(examRows[0]?.question_set, []).map((x) => x.question_id);
  if (!qs.length) return;
  const ph = qs.map(() => '?').join(',');
  const [rows] = await pool.query(
    `SELECT q.id, jc.language, jc.time_limit_ms, jc.memory_limit_mb, jc.test_cases
     FROM questions q JOIN question_judge_configs jc ON jc.question_id = q.id
     WHERE q.id IN (${ph}) AND q.type = 'programming' AND q.deleted_at IS NULL`, qs);
  if (!rows.length) return;
  const [att] = await pool.execute('SELECT answers, org_id FROM exam_attempts WHERE id = ?', [attemptId]);
  if (!att.length) return;
  const answers = parseJsonSafe(att[0].answers, {});
  for (const r of rows) {
    const [ins] = await pool.execute(
      `INSERT INTO judge_runs (attempt_id, question_id, status, created_by, org_id) VALUES (?, ?, 'queued', ?, ?)`,
      [attemptId, r.id, userId, att[0].org_id ?? null]);
    runJudge(ins.insertId, attemptId, r, answers[r.id] ?? '', att[0].org_id ?? null).catch((e) => log.warn('[fr106] run 失败:', e.message));
  }
}

async function runJudge(runId, attemptId, cfg, code, orgId) {
  await pool.execute(`UPDATE judge_runs SET status='running', updated_at=NOW() WHERE id=?`, [runId]);
  await acquireSlot();
  let res;
  try {
    res = await getRunner().run({ code, language: cfg.language, testCases: parseJsonSafe(cfg.test_cases, []), timeLimitMs: cfg.time_limit_ms, memoryLimitMb: cfg.memory_limit_mb });
  } catch (e) {
    await pool.execute(`UPDATE judge_runs SET status='failed', log=?, updated_at=NOW() WHERE id=?`, [String(e.message || e).slice(0, 500), runId]);
    return; // 回落人工：该题 details 仍 needs_manual
  } finally { releaseSlot(); }
  await pool.execute(`UPDATE judge_runs SET status='done', verdict=?, passed=?, total=?, time_ms=?, updated_at=NOW() WHERE id=?`,
    [res.verdict, res.passed, res.total, res.time_ms ?? null, runId]);
  await writeJudgeScoreToAttempt(attemptId, cfg.id, res, orgId);
}

async function writeJudgeScoreToAttempt(attemptId, qid, res, orgId) {
  const wconn = await pool.getConnection();
  try {
    await wconn.beginTransaction();
    const [rows] = await wconn.execute('SELECT * FROM exam_attempts WHERE id = ? FOR UPDATE', [attemptId]);
    if (rows.length === 0) { await wconn.rollback(); return; }
    const attempt = rows[0];
    if (!['submitted', 'auto_submitted'].includes(attempt.status)) { await wconn.rollback(); return; }
    const details = parseJsonSafe(attempt.details, []);
    const item = details.find((d) => Number(d.question_id) === Number(qid));
    const pts = Number(item?.points) || 0;
    const earned = res.total > 0 ? Math.round((pts * res.passed) / res.total) : 0;
    const r = applyJudgeScore(details, qid, { earned, verdict: res.verdict, passed: res.passed, total: res.total });
    await wconn.execute('UPDATE exam_attempts SET details=?, score=?, correct_count=?, updated_at=NOW() WHERE id=?',
      [JSON.stringify(r.details), r.score, r.correctCount, attemptId]);
    await wconn.commit();
    if (r.changedToComplete) {
      const [ex] = await pool.execute('SELECT title FROM exams WHERE id=?', [attempt.exam_id]);
      createNotification(pool, {
        user_id: attempt.user_id, type: 'score_ready', title: `${ex[0]?.title || '考试'} 成绩已更新`,
        payload: { exam_id: attempt.exam_id, attempt_id: attemptId }, org_id: orgId,
      }).catch((e) => log.warn('[fr106] 通知失败:', e.message));
    }
  } catch (e) { try { await wconn.rollback(); } catch { /* ignore */ } log.error('[fr106] 判题回写错误:', e); }
  finally { wconn.release(); }
}

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

    // 有界收卷：本场其他过期 attempt（排除当前正在提交的 attempt）
    await sweepExpiredAttempts(examId, req.user.id, Number(attemptId), { batchSize: 5, maxRows: 5 });

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

    // FR-106：交卷后为「有判题配置的编程题」建 judge_runs 并异步判题（非阻断，失败回落人工）
    enqueueProgrammingJudges(examId, Number(attemptId), req.user.id).catch((e) => log.warn('[fr106] enqueue 失败:', e.message));

    // FR-501：考试提交 → 记录今日打卡（非阻断，失败仅告警）
    tickDay(pool, req.user.id).catch((e) => log.warn('[streak] tickDay(exam) 失败:', e.message));

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
    log.error('提交考试错误:', err);
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

    // 定向收卷：仅处理当前正在查看的这一份 attempt（避免触发全场扫描）
    await sweepSingleAttempt(attemptId);

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
    log.error('查看答卷错误:', err);
    res.status(500).json({ error: '查看答卷失败' });
  }
});

/** GET /api/exams/my-history — 我的历史成绩（全部 attempt + 每场考试 bestScores + is_best 标记） */
router.get('/my-history', authMiddleware, async (req, res) => {
  try {
    // 有界收卷：仅本用户过期 attempt（代价有界）
    await sweepExpiredAttempts(null, req.user.id, null, { batchSize: 10, maxRows: 20 });

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
    log.error('获取历史成绩错误:', err);
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

    // FR-204：不再在读路径同步全卷收卷；成绩新鲜度由后台调度器维护（≤ 1 tick），owner 需即时可调 POST /:id/sweep。
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
    log.error('考试分析错误:', err);
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

    // FR-204：不再同步全卷收卷；成绩新鲜度由后台调度器维护（≤ 1 tick），owner 需即时可调 POST /:id/sweep。

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
    log.error('获取答卷列表错误:', err);
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
    // owner 手动即时收卷本场：经分页模块、单次上限 500（超大场次剩余由后台调度器继续排空）
    const processed = await sweepExpiredAttempts(examId, null, null, { batchSize: 50, maxRows: 500 });
    res.json({ autoSubmitted: processed });
  } catch (err) {
    log.error('批量自动交卷错误:', err);
    res.status(500).json({ error: '批量自动交卷失败' });
  }
});

/**
 * FR-103：本卷人工题判分总览（仅 needs_manual 类型；仅已交卷 attempt）。
 * GET /api/exams/:id/grading
 */
router.get('/:id(\\d+)/grading', authMiddleware, async (req, res) => {
  try {
    const examId = Number(req.params.id);
    const [examRows] = await pool.execute('SELECT * FROM exams WHERE id = ?', [examId]);
    if (examRows.length === 0) return res.status(404).json({ error: '考试不存在' });
    const exam = examRows[0];
    if (!isOwner(exam, req.user.id, req.user.role)) return res.status(403).json({ error: '无权判分该考试' });

    const qSet = parseJsonSafe(exam.question_set, []);
    const ids = qSet.map((q) => q.question_id).filter((x) => x != null);
    if (ids.length === 0) return res.json({ questions: [] });
    const ph = ids.map(() => '?').join(',');
    const [qRows] = await pool.execute(
      `SELECT id, type, title, points FROM questions WHERE id IN (${ph}) AND type IN ('short_answer','programming')`,
      ids,
    );

    const [attRows] = await pool.execute(
      `SELECT id, details FROM exam_attempts WHERE exam_id = ? AND status IN ('submitted','auto_submitted')`,
      [examId],
    );

    const questions = qRows.map((q) => {
      const graded = attRows.filter((a) => {
        const d = parseJsonSafe(a.details, []).find((x) => Number(x.question_id) === Number(q.id));
        return d && d.needs_manual === false;
      }).length;
      return {
        question_id: q.id,
        type: q.type,
        title: q.title,
        points: Number(q.points) || 0,
        total_responses: attRows.length,
        graded_count: graded,
      };
    });
    res.json({ questions });
  } catch (err) {
    log.error('判分总览错误:', err);
    res.status(500).json({ error: '判分总览失败' });
  }
});

/**
 * FR-103：某人工题的所有已交卷作答（按 submitted_at 升序）。
 * GET /api/exams/:id/grading/:questionId
 */
router.get('/:id(\\d+)/grading/:questionId(\\d+)', authMiddleware, async (req, res) => {
  try {
    const examId = Number(req.params.id);
    const qid = Number(req.params.questionId);
    const [examRows] = await pool.execute('SELECT * FROM exams WHERE id = ?', [examId]);
    if (examRows.length === 0) return res.status(404).json({ error: '考试不存在' });
    const exam = examRows[0];
    if (!isOwner(exam, req.user.id, req.user.role)) return res.status(403).json({ error: '无权判分该考试' });

    const qSet = parseJsonSafe(exam.question_set, []).map((q) => q.question_id);
    if (!qSet.includes(qid)) return res.status(400).json({ error: '题目不属于该考试' });
    const [qRows] = await pool.execute(
      `SELECT id, type, title, answer, points, explanation FROM questions WHERE id = ? AND type IN ('short_answer','programming')`,
      [qid],
    );
    if (qRows.length === 0) return res.status(400).json({ error: '题目非人工题或不存在' });
    const q = qRows[0];

    const [attRows] = await pool.execute(
      `SELECT a.id AS attempt_id, a.user_id, a.submitted_at, a.details, u.username
       FROM exam_attempts a JOIN users u ON u.id = a.user_id
       WHERE a.exam_id = ? AND a.status IN ('submitted','auto_submitted')
       ORDER BY a.submitted_at ASC`,
      [examId],
    );

    const responses = attRows.map((a) => {
      const d = parseJsonSafe(a.details, []).find((x) => Number(x.question_id) === qid) || {};
      return {
        attempt_id: a.attempt_id,
        user_id: a.user_id,
        username: a.username,
        submitted_at: a.submitted_at,
        user_answer: d.user_answer ?? null,
        earned: Number(d.earned) || 0,
        graded: d.needs_manual === false,
      };
    });
    res.json({
      question: {
        question_id: q.id,
        type: q.type,
        title: q.title,
        points: Number(q.points) || 0,
        reference_answer: parseJsonSafe(q.answer, q.answer),
        explanation: q.explanation || '',
      },
      responses,
    });
  } catch (err) {
    log.error('题目作答列表错误:', err);
    res.status(500).json({ error: '获取作答失败' });
  }
});

/**
 * FR-103：批量给某人工题多份答卷回写分数（整批原子；事务 FOR UPDATE）。
 * POST /api/exams/:id/grading/:questionId  body: { scores:[{attempt_id,earned}] }
 */
router.post('/:id(\\d+)/grading/:questionId(\\d+)', authMiddleware, async (req, res) => {
  let conn = null;
  try {
    const examId = Number(req.params.id);
    const qid = Number(req.params.questionId);
    const scores = Array.isArray(req.body?.scores) ? req.body.scores : [];
    if (scores.length === 0) return res.status(400).json({ error: 'scores 不能为空' });

    const [examRows] = await pool.execute('SELECT * FROM exams WHERE id = ?', [examId]);
    if (examRows.length === 0) return res.status(404).json({ error: '考试不存在' });
    const exam = examRows[0];
    if (!isOwner(exam, req.user.id, req.user.role)) return res.status(403).json({ error: '无权判分该考试' });

    const qSet = parseJsonSafe(exam.question_set, []).map((q) => q.question_id);
    if (!qSet.includes(qid)) return res.status(400).json({ error: '题目不属于该考试' });
    const [qRows] = await pool.execute(`SELECT id, type FROM questions WHERE id = ? AND type IN ('short_answer','programming')`, [qid]);
    if (qRows.length === 0) return res.status(400).json({ error: '题目非人工题或不存在' });

    conn = await pool.getConnection();
    const updated = [];
    await conn.beginTransaction();
    for (const s of scores) {
      const attemptId = Number(s.attempt_id);
      const [rows] = await conn.execute('SELECT * FROM exam_attempts WHERE id = ? FOR UPDATE', [attemptId]);
      if (rows.length === 0 || rows[0].exam_id !== examId || !['submitted', 'auto_submitted'].includes(rows[0].status)) {
        await conn.rollback();
        return res.status(400).json({ error: `非法 attempt ${attemptId}` });
      }
      const details = parseJsonSafe(rows[0].details, []);
      const item = details.find((d) => Number(d.question_id) === qid);
      if (!item) {
        await conn.rollback();
        return res.status(400).json({ error: `attempt ${attemptId} 不含该题` });
      }
      const r = applyManualScore(details, qid, { earned: s.earned, gradedBy: req.user.id });
      await conn.execute(
        'UPDATE exam_attempts SET details = ?, score = ?, correct_count = ?, updated_at = NOW() WHERE id = ?',
        [JSON.stringify(r.details), r.score, r.correctCount, attemptId],
      );
      updated.push({ attempt_id: attemptId, score: r.score, user_id: rows[0].user_id, org_id: rows[0].org_id, complete: r.changedToComplete });
    }
    await conn.commit();

    // 判完翻转 → 站内通知（非阻断，事务外发送）
    for (const u of updated) {
      if (u.complete) {
        createNotification(pool, {
          user_id: u.user_id,
          type: 'score_ready',
          title: `${exam.title} 成绩已更新`,
          payload: { exam_id: examId, attempt_id: u.attempt_id },
          org_id: u.org_id,
        }).catch((e) => log.warn('[fr103] 通知失败:', e.message));
      }
    }
    res.json({ updated: updated.length, attempts: updated.map((u) => ({ attempt_id: u.attempt_id, score: u.score })) });
  } catch (err) {
    try {
      if (conn) await conn.rollback();
    } catch {}
    log.error('人工判分错误:', err);
    res.status(500).json({ error: '人工判分失败' });
  } finally {
    if (conn) conn.release();
  }
});

export default router;
