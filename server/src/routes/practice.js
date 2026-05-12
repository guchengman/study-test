import { Router } from 'express';
import pool from '../db.js';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();

// === 错题 ===

// 获取错题列表 — 支持共享科目题目
router.get('/mistakes', authMiddleware, async (req, res) => {
  try {
    const { subject_id } = req.query;
    let sql = `
      SELECT m.*, q.subject_id, q.type, q.title, q.code, q.options, q.answer, q.explanation, q.points
      FROM mistake_records m
      JOIN questions q ON m.question_id = q.id
      WHERE m.user_id = ?
    `;
    const params = [req.user.id];
    if (subject_id) {
      sql += ' AND q.subject_id = ?';
      params.push(subject_id);
    }
    sql += ' ORDER BY m.updated_at DESC';
    const [rows] = await pool.execute(sql, params);
    rows.forEach(r => {
      try { r.options = JSON.parse(r.options); } catch {}
      try { r.answer = JSON.parse(r.answer); } catch {}
    });
    res.json({ mistakes: rows });
  } catch (err) {
    console.error('获取错题列表错误:', err);
    res.status(500).json({ error: '获取错题列表失败' });
  }
});

// 记录错题 / 更新错题状态 — 支持共享科目题目
router.post('/mistakes', authMiddleware, async (req, res) => {
  try {
    const { question_id, is_correct } = req.body;
    if (!question_id || typeof is_correct === 'undefined') {
      return res.status(400).json({ error: '题目ID和是否正确不能为空' });
    }
    // 验证题目对当前用户可见
    const [questionCheck] = await pool.execute(
      `SELECT id FROM questions q WHERE q.id = ? AND (
         q.created_by = ? 
         OR q.subject_id IN (SELECT ss.subject_id FROM subject_subscriptions ss WHERE ss.user_id = ? AND ss.status = 'approved')
         OR q.subject_id IN (SELECT s.id FROM subjects s WHERE s.share_scope = 'all' AND s.created_by IN (SELECT teacher_id FROM users WHERE id = ?))
         OR q.subject_id IN (SELECT s.id FROM subjects s WHERE s.share_scope = 'students' AND s.created_by IN (SELECT teacher_id FROM users WHERE id = ?)
           AND (NOT EXISTS (SELECT 1 FROM subject_student_access sa WHERE sa.subject_id = s.id) OR EXISTS (SELECT 1 FROM subject_student_access sa WHERE sa.subject_id = s.id AND sa.student_user_id = ?)))
      )`,
      [question_id, req.user.id, req.user.id, req.user.id, req.user.id, req.user.id]
    );
    if (questionCheck.length === 0) {
      return res.status(404).json({ error: '题目不存在或无权限' });
    }

    const [existing] = await pool.execute(
      'SELECT id, consecutive_correct FROM mistake_records WHERE user_id = ? AND question_id = ?',
      [req.user.id, question_id]
    );

    if (existing.length > 0) {
      const record = existing[0];
      if (is_correct) {
        const newCount = record.consecutive_correct + 1;
        if (newCount >= 3) {
          await pool.execute('DELETE FROM mistake_records WHERE id = ?', [record.id]);
          return res.json({ message: '已掌握，移出错题本', mastered: true });
        } else {
          await pool.execute(
            'UPDATE mistake_records SET consecutive_correct = ?, updated_at = NOW() WHERE id = ?',
            [newCount, record.id]
          );
          return res.json({ message: `连续正确 ${newCount}/3`, mastered: false });
        }
      } else {
        await pool.execute(
          'UPDATE mistake_records SET consecutive_correct = 0, updated_at = NOW() WHERE id = ?',
          [record.id]
        );
        return res.json({ message: '重置正确计数', mastered: false });
      }
    } else {
      if (!is_correct) {
        await pool.execute(
          'INSERT INTO mistake_records (user_id, question_id, consecutive_correct) VALUES (?, ?, 0)',
          [req.user.id, question_id]
        );
        return res.json({ message: '已加入错题本', mastered: false });
      }
      return res.json({ message: '答题正确', mastered: false });
    }
  } catch (err) {
    console.error('记录错题错误:', err);
    res.status(500).json({ error: '记录错题失败' });
  }
});

// 更新错题（连续正确次数）
router.put('/mistakes', authMiddleware, async (req, res) => {
  try {
    const { questionId, question_id, consecutiveCorrect, consecutive_correct } = req.body;
    const qid = questionId || question_id;
    const cc = consecutiveCorrect !== undefined ? consecutiveCorrect : (consecutive_correct || 0);
    if (!qid) {
      return res.status(400).json({ error: '题目ID不能为空' });
    }
    await pool.execute(
      'UPDATE mistake_records SET consecutive_correct = ?, updated_at = NOW() WHERE user_id = ? AND question_id = ?',
      [cc, req.user.id, qid]
    );
    res.json({ message: '错题记录已更新' });
  } catch (err) {
    console.error('更新错题错误:', err);
    res.status(500).json({ error: '更新错题失败' });
  }
});

// 添加错题 — 简化接口
router.post('/mistakes/add', authMiddleware, async (req, res) => {
  try {
    const { questionId, question_id } = req.body;
    const qid = questionId || question_id;
    if (!qid) {
      return res.status(400).json({ error: '题目ID不能为空' });
    }
    await pool.execute(
      'INSERT IGNORE INTO mistake_records (user_id, question_id, consecutive_correct) VALUES (?, ?, 0)',
      [req.user.id, qid]
    );
    res.json({ message: '已加入错题本' });
  } catch (err) {
    console.error('添加错题错误:', err);
    res.status(500).json({ error: '添加错题失败' });
  }
});

// 删除错题
router.delete('/mistakes/:question_id', authMiddleware, async (req, res) => {
  try {
    await pool.execute(
      'DELETE FROM mistake_records WHERE user_id = ? AND question_id = ?',
      [req.user.id, req.params.question_id]
    );
    res.json({ message: '已移出错题本' });
  } catch (err) {
    console.error('删除错题错误:', err);
    res.status(500).json({ error: '删除错题失败' });
  }
});

// === 收藏 ===

// 获取收藏列表 — 支持共享科目题目
router.get('/favorites', authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT f.created_at as favorited_at, q.*
       FROM favorites f
       JOIN questions q ON f.question_id = q.id
       WHERE f.user_id = ?
       ORDER BY f.created_at DESC`,
      [req.user.id]
    );
    rows.forEach(r => {
      try { r.options = JSON.parse(r.options); } catch {}
      try { r.answer = JSON.parse(r.answer); } catch {}
    });
    res.json({ favorites: rows });
  } catch (err) {
    console.error('获取收藏列表错误:', err);
    res.status(500).json({ error: '获取收藏列表失败' });
  }
});

// 添加收藏
router.post('/favorites', authMiddleware, async (req, res) => {
  try {
    const { question_id } = req.body;
    if (!question_id) {
      return res.status(400).json({ error: '题目ID不能为空' });
    }
    await pool.execute(
      'INSERT IGNORE INTO favorites (user_id, question_id) VALUES (?, ?)',
      [req.user.id, question_id]
    );
    res.json({ favorited: true, message: '已收藏' });
  } catch (err) {
    console.error('添加收藏错误:', err);
    res.status(500).json({ error: '添加收藏失败' });
  }
});

// 取消收藏
router.delete('/favorites/:question_id', authMiddleware, async (req, res) => {
  try {
    await pool.execute(
      'DELETE FROM favorites WHERE user_id = ? AND question_id = ?',
      [req.user.id, req.params.question_id]
    );
    res.json({ message: '已取消收藏' });
  } catch (err) {
    console.error('取消收藏错误:', err);
    res.status(500).json({ error: '取消收藏失败' });
  }
});

// === 学习统计 ===

router.get('/stats', authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.execute(
      'SELECT * FROM study_stats WHERE user_id = ?',
      [req.user.id]
    );
    res.json({ stats: rows });
  } catch (err) {
    console.error('获取统计错误:', err);
    res.status(500).json({ error: '获取统计数据失败' });
  }
});

router.post('/stats', authMiddleware, async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const { subject_id, correct, total } = req.body;
    if (!subject_id || typeof total === 'undefined') {
      return res.status(400).json({ error: '科目ID和总数不能为空' });
    }
    const totalNum = parseInt(total);
    const correctNum = parseInt(correct || 0);
    if (isNaN(totalNum) || totalNum < 0) {
      return res.status(400).json({ error: '总数必须为非负整数' });
    }
    if (isNaN(correctNum) || correctNum < 0 || correctNum > totalNum) {
      return res.status(400).json({ error: '正确数必须为0到总数之间的整数' });
    }

    await conn.beginTransaction();

    // 使用 SELECT ... FOR UPDATE 锁定行，防止并发竞态
    const [existing] = await conn.execute(
      'SELECT id, total_practiced, total_correct, streak_days, last_study_at FROM study_stats WHERE user_id = ? AND subject_id = ? FOR UPDATE',
      [req.user.id, subject_id]
    );

    if (existing.length > 0) {
      const s = existing[0];
      const newTotal = s.total_practiced + totalNum;
      const newCorrect = s.total_correct + correctNum;
      let streakDays = s.streak_days;

      if (s.last_study_at) {
        const last = new Date(s.last_study_at);
        const now = new Date();
        // 使用日历日期比较（而非24小时间隔）
        const lastDate = new Date(last.getFullYear(), last.getMonth(), last.getDate());
        const nowDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const diffDays = Math.round((nowDate - lastDate) / 86400000);
        if (diffDays === 1) {
          streakDays++;
        } else if (diffDays > 1) {
          streakDays = 1;
        }
      } else {
        streakDays = 1;
      }

      await conn.execute(
        'UPDATE study_stats SET total_practiced = ?, total_correct = ?, streak_days = ?, last_study_at = NOW() WHERE id = ?',
        [newTotal, newCorrect, streakDays, s.id]
      );
    } else {
      await conn.execute(
        'INSERT INTO study_stats (user_id, subject_id, total_practiced, total_correct, streak_days, last_study_at) VALUES (?, ?, ?, ?, 1, NOW())',
        [req.user.id, subject_id, totalNum, correctNum]
      );
    }

    await conn.commit();
    res.json({ message: '统计更新成功' });
  } catch (err) {
    await conn.rollback();
    console.error('更新统计错误:', err);
    res.status(500).json({ error: '更新统计失败' });
  } finally {
    conn.release();
  }
});

export default router;
