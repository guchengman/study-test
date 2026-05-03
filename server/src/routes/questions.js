import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import pool from '../db.js';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();

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
        WHERE (q.created_by = ? 
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
        WHERE (q.created_by = ? 
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

    const [rows] = await pool.query(sql, params);
    rows.forEach(r => { r.is_owner = (r.created_by === userId); });

    res.json({ questions: rows, total, page: pageNum, limit: limitNum });
  } catch (err) {
    console.error('获取题目列表错误:', err);
    res.status(500).json({ error: '获取题目列表失败' });
  }
});

// 获取单个题目 — 支持共享题目
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const [rows] = await pool.execute(
      `SELECT q.* FROM questions q
       WHERE q.id = ? AND (
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
    res.json({ question: rows[0] });
  } catch (err) {
    console.error('获取题目错误:', err);
    res.status(500).json({ error: '获取题目失败' });
  }
});

const VALID_QUESTION_TYPES = ['single', 'multiple', 'programming'];

// 创建题目 — 自动绑定当前用户
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { subject_id, type, title, code, options, answer, explanation, points = 1 } = req.body;
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
        await pool.execute(
          'INSERT INTO subjects (id, name, icon, welcome_title, welcome_desc, is_system, is_shared, share_scope, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [subject_id, subject_id, '📚', '', '', 0, 0, 'none', req.user.id]
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
      `INSERT INTO questions (subject_id, type, title, code, options, answer, explanation, points, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [subject_id, type, title, code || null, options ? JSON.stringify(options) : null,
       JSON.stringify(answer), explanation || null, points, req.user.id]
    );
    res.json({ id: result.insertId, message: '题目创建成功' });
  } catch (err) {
    console.error('创建题目错误:', err);
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
    
    let [subjectCheck] = await pool.execute(
      'SELECT id, created_by FROM subjects WHERE id = ? AND (created_by = ? OR ?)',
      [effectiveSubjectId, req.user.id, req.user.role === 'admin' ? 1 : 0]
    );
    
    // 如果科目不存在，尝试自动创建它（使用科目ID作为名称）
    if (subjectCheck.length === 0) {
      try {
        await pool.execute(
          'INSERT INTO subjects (id, name, icon, welcome_title, welcome_desc, is_system, is_shared, share_scope, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [effectiveSubjectId, effectiveSubjectId, '📚', '', '', 0, 0, 'none', req.user.id]
        );
        subjectCheck = [{ id: effectiveSubjectId, created_by: req.user.id }];
      } catch (createErr) {
        // 如果创建失败（可能已存在或ID冲突），再次检查
        [subjectCheck] = await pool.execute(
          'SELECT id, created_by FROM subjects WHERE id = ?',
          [effectiveSubjectId]
        );
        if (subjectCheck.length === 0) {
          return res.status(403).json({ error: '科目不存在且无法自动创建，请先在系统中创建该科目' });
        }
      }
    }

    await conn.beginTransaction();
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
        `INSERT INTO questions (subject_id, type, title, code, options, answer, explanation, points, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [q.subject_id || subject_id, q.type || 'single', q.title,
         q.code || null, q.options ? JSON.stringify(q.options) : null,
         JSON.stringify(q.answer), q.explanation || null, q.points || 1, req.user.id]
      );
      results.push(result.insertId);
    }
    await conn.commit();
    res.json({ ids: results, count: results.length, message: `成功导入 ${results.length} 道题目` });
  } catch (err) {
    await conn.rollback();
    console.error('批量创建题目错误:', err);
    res.status(500).json({ error: '批量创建题目失败' });
  } finally {
    conn.release();
  }
});

// 更新题目 — 只能更新自己的
router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const { subject_id, type, title, code, options, answer, explanation, points } = req.body;
    if (type && !VALID_QUESTION_TYPES.includes(type)) {
      return res.status(400).json({ error: `题型无效，仅支持: ${VALID_QUESTION_TYPES.join(', ')}` });
    }
    if (title !== undefined && (typeof title !== 'string' || title.trim().length === 0)) {
      return res.status(400).json({ error: '标题不能为空' });
    }
    const [existing] = await pool.execute(
      'SELECT id FROM questions WHERE id = ? AND created_by = ?',
      [req.params.id, req.user.id]
    );
    if (existing.length === 0) {
      return res.status(404).json({ error: '题目不存在或无权限' });
    }
    await pool.execute(
      `UPDATE questions SET subject_id=?, type=?, title=?, code=?, options=?, answer=?, explanation=?, points=?, updated_at=NOW()
       WHERE id = ? AND created_by = ?`,
      [subject_id, type, title, code || null, options ? JSON.stringify(options) : null,
       JSON.stringify(answer), explanation || null, points || 1, req.params.id, req.user.id]
    );
    res.json({ message: '题目更新成功' });
  } catch (err) {
    console.error('更新题目错误:', err);
    res.status(500).json({ error: '题目更新失败' });
  }
});

// 删除题目 — 只能删除自己的
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const [result] = await pool.execute(
      'DELETE FROM questions WHERE id = ? AND created_by = ?',
      [req.params.id, req.user.id]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: '题目不存在或无权限' });
    }
    res.json({ message: '题目删除成功' });
  } catch (err) {
    console.error('删除题目错误:', err);
    res.status(500).json({ error: '题目删除失败' });
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
    console.error('生成分享码错误:', err);
    res.status(500).json({ error: '分享码生成失败' });
  }
});

// 通过分享码获取题目
router.get('/shared/:code', authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.execute('SELECT * FROM questions WHERE share_code = ?', [req.params.code]);
    if (rows.length === 0) {
      return res.status(404).json({ error: '分享码无效' });
    }
    res.json({ question: rows[0] });
  } catch (err) {
    console.error('获取分享题目错误:', err);
    res.status(500).json({ error: '获取分享题目失败' });
  }
});

export default router;
