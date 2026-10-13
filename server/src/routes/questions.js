import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import pool from '../db.js';
import { authMiddleware } from '../middleware/auth.js';
import { apiLimiter } from '../middleware/rateLimit.js';
import { resolvePersonalOrgId } from '../utils/personalOrg.js';
import { snapshotCurrentVersion, isReferencedByExam } from '../utils/questionLifecycle.js';
import log from '../utils/logger.js';

const router = Router();

// 统一限流（15 分钟 / 每 IP 300 次）
router.use(apiLimiter);

// 获取题目列表 — 支持共享题目可见性
router.get('/', authMiddleware, async (req, res) => {
  try {
    const { subject_id, type, page = 1, limit = 50 } = req.query;
    const userId = req.user.id;

    // Determine teacher_id for student users to see shared subject questions
    let teacherId = null;
    if (req.user.role === 'student') {
      const [userRows] = await pool.execute('SELECT teacher_id FROM users WHERE id = ?', [userId]);
      teacherId = userRows.length > 0 ? userRows[0].teacher_id : null;
    }

    let sql;
    let params;
    if (teacherId) {
      sql = `
        SELECT q.* FROM questions q
        WHERE q.deleted_at IS NULL AND (q.created_by = ? 
           OR q.subject_id IN (SELECT ss.subject_id FROM subject_subscriptions ss WHERE ss.user_id = ? AND ss.status = 'approved')
           OR q.subject_id IN (
             SELECT s.id FROM subjects s WHERE s.created_by = ? AND s.share_scope = 'all'
           )
           OR q.subject_id IN (
             SELECT s.id FROM subjects s WHERE s.created_by = ? AND s.share_scope = 'students'
             AND (
               NOT EXISTS (SELECT 1 FROM subject_student_access sa WHERE sa.subject_id = s.id)
               OR EXISTS (SELECT 1 FROM subject_student_access sa WHERE sa.subject_id = s.id AND sa.student_user_id = ?)
             )
           )
        )`;
      params = [userId, userId, teacherId, teacherId, userId];
    } else {
      sql = `
        SELECT q.* FROM questions q
        WHERE q.deleted_at IS NULL AND (q.created_by = ? 
           OR q.subject_id IN (SELECT ss.subject_id FROM subject_subscriptions ss WHERE ss.user_id = ? AND ss.status = 'approved')
        )`;
      params = [userId, userId];
    }

    if (subject_id) {
      sql += ' AND q.subject_id = ?';
      params.push(subject_id);
    }
    if (type) {
      sql += ' AND q.type = ?';
      params.push(type);
    }

    const [countResult] = await pool.execute(
      sql.replace('SELECT q.*', 'SELECT COUNT(*) as total'),
      params
    );
    const total = countResult[0].total;

    const limitNum = Math.max(1, Math.min(200, parseInt(limit) || 50));
    const pageNum = Math.max(1, parseInt(page) || 1);
    const offsetNum = (pageNum - 1) * limitNum;
    sql += ` ORDER BY q.created_at DESC LIMIT ${limitNum} OFFSET ${offsetNum}`;

    const [rows] = await pool.execute(sql, params);
    rows.forEach(r => { r.is_owner = (r.created_by === userId); });

    res.json({ questions: rows, total, page: pageNum, limit: limitNum });
  } catch (err) {
    log.error('获取题目列表错误:', err);
    res.status(500).json({ error: '获取题目列表失败' });
  }
});

// 获取单个题目 — 支持共享题目（限数字 id，避免吞噬 /recycle 等字面量路由）
router.get('/:id(\\d+)', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const [rows] = await pool.execute(
      `SELECT q.* FROM questions q
       WHERE q.id = ? AND q.deleted_at IS NULL AND (
         q.created_by = ? 
         OR q.subject_id IN (SELECT ss.subject_id FROM subject_subscriptions ss WHERE ss.user_id = ? AND ss.status = 'approved')
         OR q.subject_id IN (SELECT s.id FROM subjects s WHERE s.share_scope = 'all' AND s.created_by IN (SELECT teacher_id FROM users WHERE id = ?))
         OR q.subject_id IN (SELECT s.id FROM subjects s WHERE s.share_scope = 'students' AND s.created_by IN (SELECT teacher_id FROM users WHERE id = ?)
           AND (NOT EXISTS (SELECT 1 FROM subject_student_access sa WHERE sa.subject_id = s.id) OR EXISTS (SELECT 1 FROM subject_student_access sa WHERE sa.subject_id = s.id AND sa.student_user_id = ?)))
       )`,
      [req.params.id, userId, userId, userId, userId, userId]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: '题目不存在或无权限' });
    }
    rows[0].is_owner = (rows[0].created_by === userId);
    // FR-106：属主守卫内带出判题配置（027）；test_cases 为 JSON 列，mysql2 已解析为对象，字符串时兜底 parse
    const [jcRows] = await pool.execute('SELECT language, time_limit_ms, memory_limit_mb, starter_code, test_cases FROM question_judge_configs WHERE question_id = ?', [rows[0].id]);
    if (jcRows.length) {
      const tc = typeof jcRows[0].test_cases === 'string' ? JSON.parse(jcRows[0].test_cases || '[]') : (jcRows[0].test_cases || []);
      rows[0].judge_config = { ...jcRows[0], test_cases: tc };
    } else {
      rows[0].judge_config = null;
    }
    res.json({ question: rows[0] });
  } catch (err) {
    log.error('获取题目错误:', err);
    res.status(500).json({ error: '获取题目失败' });
  }
});

const VALID_QUESTION_TYPES = ['single', 'multiple', 'programming', 'judge', 'fill_in', 'short_answer'];

// 创建题目 — 自动绑定当前用户
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { subject_id, type, title, code, options, answer, explanation, points = 1, audio_url, judge_config } = req.body;
    if (!subject_id || !type || !title || !answer) {
      return res.status(400).json({ error: '科目、题型、标题和答案不能为空' });
    }
    if (!VALID_QUESTION_TYPES.includes(type)) {
      return res.status(400).json({ error: `题型无效，仅支持: ${VALID_QUESTION_TYPES.join(', ')}` });
    }
    if (typeof title !== 'string' || title.trim().length === 0) {
      return res.status(400).json({ error: '标题不能为空' });
    }
    if (title.length > 2000) {
      return res.status(400).json({ error: '标题长度不能超过2000字符' });
    }
    
    let [subjectCheck] = await pool.execute(
      'SELECT id, created_by FROM subjects WHERE id = ? AND (created_by = ? OR ?)',
      [subject_id, req.user.id, req.user.role === 'admin' ? 1 : 0]
    );
    
    // 如果科目不存在，尝试自动创建它
    if (subjectCheck.length === 0) {
      try {
        const autoName = typeof subject_id === 'string' ? subject_id.replace(/^custom_/, '').replace(/_/g, ' ') : String(subject_id);
        await pool.execute(
          'INSERT INTO subjects (id, name, icon, welcome_title, welcome_desc, is_system, is_shared, share_scope, created_by, org_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [subject_id, autoName, '📚', '', '', 0, 0, 'none', req.user.id, await resolvePersonalOrgId(pool, req.user.id)]
        );
        subjectCheck = [{ id: subject_id, created_by: req.user.id }];
      } catch (createErr) {
        // 如果创建失败，再次检查
        [subjectCheck] = await pool.execute(
          'SELECT id, created_by FROM subjects WHERE id = ?',
          [subject_id]
        );
        if (subjectCheck.length === 0) {
          return res.status(403).json({ error: '科目不存在且无法自动创建' });
        }
      }
    }
    
    const [result] = await pool.execute(
      `INSERT INTO questions (subject_id, type, title, code, options, answer, explanation, points, audio_url, created_by, org_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [subject_id, type, title, code || null, options ? JSON.stringify(options) : null,
       JSON.stringify(answer), explanation || null, points, audio_url || null, req.user.id, await resolvePersonalOrgId(pool, req.user.id)]
    );
    // FR-106：编程题判题配置写 027 表（软引用，无 FK）
    if (type === 'programming' && judge_config && Array.isArray(judge_config.test_cases)) {
      await pool.execute(
        `INSERT INTO question_judge_configs (question_id, language, time_limit_ms, memory_limit_mb, starter_code, test_cases, created_by, org_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [result.insertId, judge_config.language || 'python', Number(judge_config.time_limit_ms) || 2000,
         Number(judge_config.memory_limit_mb) || 128, judge_config.starter_code || null,
         JSON.stringify(judge_config.test_cases), req.user.id, await resolvePersonalOrgId(pool, req.user.id)]
      );
    }
    res.json({ id: result.insertId, message: '题目创建成功' });
  } catch (err) {
    log.error('创建题目错误:', err);
    res.status(500).json({ error: '创建题目失败' });
  }
});

// 批量创建题目
router.post('/batch', authMiddleware, async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const { questions, subject_id } = req.body;
    if (!Array.isArray(questions) || questions.length === 0) {
      return res.status(400).json({ error: '题目列表不能为空' });
    }

    // 校验科目归属：确保目标科目属于当前用户
    const effectiveSubjectId = subject_id || (questions[0] && questions[0].subject_id);
    if (!effectiveSubjectId) {
      return res.status(400).json({ error: '必须指定科目' });
    }
    
    let [subjectCheck] = await conn.execute(
      'SELECT id, created_by FROM subjects WHERE id = ? AND (created_by = ? OR ?)',
      [effectiveSubjectId, req.user.id, req.user.role === 'admin' ? 1 : 0]
    );

    // 如果科目不存在，尝试自动创建它
    if (subjectCheck.length === 0) {
      try {
        const autoName = typeof effectiveSubjectId === 'string' ? effectiveSubjectId.replace(/^custom_/, '').replace(/_/g, ' ') : String(effectiveSubjectId);
        await conn.execute(
          'INSERT INTO subjects (id, name, icon, welcome_title, welcome_desc, is_system, is_shared, share_scope, created_by, org_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [effectiveSubjectId, autoName, '📚', '', '', 0, 0, 'none', req.user.id, await resolvePersonalOrgId(conn, req.user.id)]
        );
        subjectCheck = [{ id: effectiveSubjectId, created_by: req.user.id }];
      } catch (createErr) {
        // 如果创建失败（可能已存在或ID冲突），再次检查
        [subjectCheck] = await conn.execute(
          'SELECT id, created_by FROM subjects WHERE id = ?',
          [effectiveSubjectId]
        );
        if (subjectCheck.length === 0) {
          return res.status(403).json({ error: '科目不存在且无法自动创建，请先在系统中创建该科目' });
        }
      }
    }

    await conn.beginTransaction();
    // S0 shadow：批量导入同一用户，租户只解析一次，循环内复用
    const batchOrgId = await resolvePersonalOrgId(conn, req.user.id);
    const results = [];
    for (const q of questions) {
      // 校验每道题的基本字段
      if (!q.title || !q.answer) {
        await conn.rollback();
        return res.status(400).json({ error: `第 ${results.length + 1} 道题缺少标题或答案` });
      }
      const qType = q.type || 'single';
      if (!VALID_QUESTION_TYPES.includes(qType)) {
        await conn.rollback();
        return res.status(400).json({ error: `第 ${results.length + 1} 道题题型无效` });
      }
      const [result] = await conn.execute(
        `INSERT INTO questions (subject_id, type, title, code, options, answer, explanation, points, audio_url, created_by, org_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [q.subject_id || subject_id, q.type || 'single', q.title,
         q.code || null, q.options ? JSON.stringify(q.options) : null,
         JSON.stringify(q.answer), q.explanation || null, q.points || 1, q.audio_url || null, req.user.id, batchOrgId]
      );
      // FR-106：批量建编程题带 judge_config → 写 027（同事务，幂等 upsert）
      if (qType === 'programming' && q.judge_config && Array.isArray(q.judge_config.test_cases)) {
        await conn.execute(
          `INSERT INTO question_judge_configs (question_id, language, time_limit_ms, memory_limit_mb, starter_code, test_cases, created_by, org_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE language=VALUES(language), time_limit_ms=VALUES(time_limit_ms), memory_limit_mb=VALUES(memory_limit_mb),
             starter_code=VALUES(starter_code), test_cases=VALUES(test_cases), updated_at=NOW()`,
          [result.insertId, q.judge_config.language || 'python', Number(q.judge_config.time_limit_ms) || 2000,
           Number(q.judge_config.memory_limit_mb) || 128, q.judge_config.starter_code || null,
           JSON.stringify(q.judge_config.test_cases), req.user.id, batchOrgId]
        );
      }
      results.push(result.insertId);
    }
    await conn.commit();
    res.json({ ids: results, count: results.length, message: `成功导入 ${results.length} 道题目` });
  } catch (err) {
    await conn.rollback();
    log.error('批量创建题目错误:', err);
    res.status(500).json({ error: '批量创建题目失败' });
  } finally {
    conn.release();
  }
});

// 更新题目 — 只能更新自己的
router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const { subject_id, type, title, code, options, answer, explanation, points, audio_url, judge_config } = req.body;
    if (type && !VALID_QUESTION_TYPES.includes(type)) {
      return res.status(400).json({ error: `题型无效，仅支持: ${VALID_QUESTION_TYPES.join(', ')}` });
    }
    if (title !== undefined && (typeof title !== 'string' || title.trim().length === 0)) {
      return res.status(400).json({ error: '标题不能为空' });
    }
    const [existing] = await pool.execute(
      'SELECT id FROM questions WHERE id = ? AND created_by = ? AND deleted_at IS NULL',
      [req.params.id, req.user.id]
    );
    if (existing.length === 0) {
      return res.status(404).json({ error: '题目不存在或无权限' });
    }
    // FR-107 版本历史：编辑前把「当前内容」快照为一版，再应用更新
    const orgId = await resolvePersonalOrgId(pool, req.user.id);
    await snapshotCurrentVersion(pool, req.params.id, req.user.id, orgId);
    await pool.execute(
      `UPDATE questions SET subject_id=?, type=?, title=?, code=?, options=?, answer=?, explanation=?, points=?, audio_url=?, updated_at=NOW()
       WHERE id = ? AND created_by = ?`,
      [subject_id, type, title, code || null, options ? JSON.stringify(options) : null,
       JSON.stringify(answer), explanation || null, points || 1, audio_url ?? null, req.params.id, req.user.id]
    );
    // FR-106：更新判题配置（有则 upsert，显式 null 则清空）
    if (judge_config && Array.isArray(judge_config.test_cases)) {
      await pool.execute(
        `INSERT INTO question_judge_configs (question_id, language, time_limit_ms, memory_limit_mb, starter_code, test_cases, created_by, org_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE language=VALUES(language), time_limit_ms=VALUES(time_limit_ms), memory_limit_mb=VALUES(memory_limit_mb),
           starter_code=VALUES(starter_code), test_cases=VALUES(test_cases), updated_at=NOW()`,
        [req.params.id, judge_config.language || 'python', Number(judge_config.time_limit_ms) || 2000,
         Number(judge_config.memory_limit_mb) || 128, judge_config.starter_code || null, JSON.stringify(judge_config.test_cases), req.user.id, orgId]
      );
    } else if (judge_config === null) {
      await pool.execute('DELETE FROM question_judge_configs WHERE question_id = ?', [req.params.id]);
    }
    res.json({ message: '题目更新成功' });
  } catch (err) {
    log.error('更新题目错误:', err);
    res.status(500).json({ error: '题目更新失败' });
  }
});

// 删除题目（FR-107 软删）— 只能删自己的，管理员可删任意；改为置 deleted_at 进回收站，不再物理删
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const isAdmin = req.user.role === 'admin' ? 1 : 0;
    const [result] = await pool.execute(
      'UPDATE questions SET deleted_at = NOW() WHERE id = ? AND deleted_at IS NULL AND (created_by = ? OR ? = 1)',
      [req.params.id, req.user.id, isAdmin]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: '题目不存在、已删除或无权限' });
    }
    res.json({ message: '题目已移入回收站' });
  } catch (err) {
    log.error('软删除题目错误:', err);
    res.status(500).json({ error: '题目删除失败' });
  }
});

// 回收站列表 — 当前用户名下已软删题目（管理员看全部软删）
router.get('/recycle', authMiddleware, async (req, res) => {
  try {
    const { page = 1, limit = 50 } = req.query;
    const isAdmin = req.user.role === 'admin' ? 1 : 0;
    const where = isAdmin ? 'deleted_at IS NOT NULL' : 'deleted_at IS NOT NULL AND created_by = ?';
    const params = isAdmin ? [] : [req.user.id];

    const [countRows] = await pool.execute(`SELECT COUNT(*) AS total FROM questions WHERE ${where}`, params);
    const total = countRows[0].total;
    const limitNum = Math.max(1, Math.min(200, parseInt(limit) || 50));
    const pageNum = Math.max(1, parseInt(page) || 1);
    const offsetNum = (pageNum - 1) * limitNum;
    const [rows] = await pool.execute(
      `SELECT * FROM questions WHERE ${where} ORDER BY deleted_at DESC LIMIT ${limitNum} OFFSET ${offsetNum}`,
      params
    );
    res.json({ questions: rows, total, page: pageNum, limit: limitNum });
  } catch (err) {
    log.error('回收站列表错误:', err);
    res.status(500).json({ error: '获取回收站失败' });
  }
});

// 从回收站恢复题目
router.post('/:id/restore', authMiddleware, async (req, res) => {
  try {
    const isAdmin = req.user.role === 'admin' ? 1 : 0;
    const [result] = await pool.execute(
      'UPDATE questions SET deleted_at = NULL WHERE id = ? AND deleted_at IS NOT NULL AND (created_by = ? OR ? = 1)',
      [req.params.id, req.user.id, isAdmin]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: '回收站中无此题目或无权限' });
    }
    res.json({ message: '题目已恢复' });
  } catch (err) {
    log.error('恢复题目错误:', err);
    res.status(500).json({ error: '题目恢复失败' });
  }
});

// 彻底删除（物理删）— 考试引用过的题目禁止
router.delete('/:id/permanent', authMiddleware, async (req, res) => {
  try {
    const isAdmin = req.user.role === 'admin' ? 1 : 0;
    const [rows] = await pool.execute(
      'SELECT id, created_by FROM questions WHERE id = ? AND (created_by = ? OR ? = 1)',
      [req.params.id, req.user.id, isAdmin]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: '题目不存在或无权限' });
    }
    if (await isReferencedByExam(pool, req.params.id)) {
      return res.status(409).json({ error: '该题目被考试引用，禁止彻底删除（PRD FR-107）' });
    }
    // question_versions 随 FK ON DELETE CASCADE 自动清理
    await pool.execute('DELETE FROM questions WHERE id = ?', [req.params.id]);
    res.json({ message: '题目已彻底删除' });
  } catch (err) {
    log.error('彻底删除题目错误:', err);
    res.status(500).json({ error: '彻底删除失败' });
  }
});

// 版本历史列表（元信息 + payload，seq 降序）
router.get('/:id/versions', authMiddleware, async (req, res) => {
  try {
    const isAdmin = req.user.role === 'admin' ? 1 : 0;
    const [own] = await pool.execute(
      'SELECT id FROM questions WHERE id = ? AND (created_by = ? OR ? = 1)',
      [req.params.id, req.user.id, isAdmin]
    );
    if (own.length === 0) {
      return res.status(404).json({ error: '题目不存在或无权限' });
    }
    const [rows] = await pool.execute(
      'SELECT seq, payload, created_by, created_at FROM question_versions WHERE question_id = ? ORDER BY seq DESC',
      [req.params.id]
    );
    res.json({ versions: rows });
  } catch (err) {
    log.error('获取版本历史错误:', err);
    res.status(500).json({ error: '获取版本历史失败' });
  }
});

// 回退到指定版本：先把当前内容快照为新版本，再用目标版本 payload 覆盖当前行
router.post('/:id/versions/:seq/revert', authMiddleware, async (req, res) => {
  try {
    const isAdmin = req.user.role === 'admin' ? 1 : 0;
    const [own] = await pool.execute(
      'SELECT id FROM questions WHERE id = ? AND deleted_at IS NULL AND (created_by = ? OR ? = 1)',
      [req.params.id, req.user.id, isAdmin]
    );
    if (own.length === 0) {
      return res.status(404).json({ error: '题目不存在、已删除或无权限' });
    }
    const [vRows] = await pool.execute(
      'SELECT payload FROM question_versions WHERE question_id = ? AND seq = ?',
      [req.params.id, req.params.seq]
    );
    if (vRows.length === 0) {
      return res.status(404).json({ error: '版本不存在' });
    }
    const snap = typeof vRows[0].payload === 'string' ? JSON.parse(vRows[0].payload) : vRows[0].payload;
    // 回退前保留当前版本
    const orgId = await resolvePersonalOrgId(pool, req.user.id);
    await snapshotCurrentVersion(pool, req.params.id, req.user.id, orgId);
    await pool.execute(
      `UPDATE questions SET subject_id=?, type=?, title=?, code=?, options=?, answer=?, explanation=?, points=?, updated_at=NOW()
       WHERE id = ?`,
      [
        snap.subject_id, snap.type, snap.title, snap.code ?? null,
        snap.options != null ? JSON.stringify(snap.options) : null,
        snap.answer != null ? JSON.stringify(snap.answer) : null,
        snap.explanation ?? null, snap.points ?? 1,
        req.params.id,
      ]
    );
    res.json({ message: `已回退到版本 #${req.params.seq}` });
  } catch (err) {
    log.error('回退版本错误:', err);
    res.status(500).json({ error: '回退版本失败' });
  }
});

// 生成分享码
router.post('/:id/share', authMiddleware, async (req, res) => {
  try {
    const shareCode = uuidv4().split('-')[0];
    const [result] = await pool.execute(
      'UPDATE questions SET share_code = ? WHERE id = ? AND created_by = ?',
      [shareCode, req.params.id, req.user.id]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: '题目不存在或无权限' });
    }
    res.json({ shareCode, message: '分享码生成成功' });
  } catch (err) {
    log.error('生成分享码错误:', err);
    res.status(500).json({ error: '分享码生成失败' });
  }
});

// 通过分享码获取题目
router.get('/shared/:code', authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.execute('SELECT * FROM questions WHERE share_code = ? AND deleted_at IS NULL', [req.params.code]);
    if (rows.length === 0) {
      return res.status(404).json({ error: '分享码无效' });
    }
    res.json({ question: rows[0] });
  } catch (err) {
    log.error('获取分享题目错误:', err);
    res.status(500).json({ error: '获取分享题目失败' });
  }
});

export default router;
