import { Router } from 'express';
import pool from '../db.js';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();

// 从 localStorage 迁移数据到云端
router.post('/migrate', authMiddleware, async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const { subjects, questions, mistakes, favorites, stats } = req.body;
    const userId = req.user.id;
    let migrated = { subjects: 0, questions: 0, mistakes: 0, favorites: 0, stats: 0 };

    await conn.beginTransaction();

    // 迁移科目
    if (Array.isArray(subjects)) {
      for (const s of subjects) {
        try {
          await conn.execute(
            'INSERT IGNORE INTO subjects (id, name, icon, is_system, created_by) VALUES (?, ?, ?, ?, ?)',
            [s.id, s.name, s.icon || '📚', s.is_system || false, userId]
          );
          migrated.subjects++;
        } catch {}
      }
    }

    // 迁移题目
    if (Array.isArray(questions)) {
      for (const q of questions) {
        try {
          const [result] = await conn.execute(
            `INSERT INTO questions (subject_id, type, title, code, options, answer, explanation, points, created_by)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              q.subject || q.subject_id,
              q.type || 'single',
              q.title,
              q.code || null,
              q.options ? JSON.stringify(q.options) : null,
              JSON.stringify(q.answer),
              q.explanation || null,
              q.points || 1,
              userId,
            ]
          );
          // 记录旧ID到新ID的映射
          migrated.questions++;
        } catch {}
      }
    }

    // 迁移错题
    if (Array.isArray(mistakes)) {
      for (const m of mistakes) {
        try {
          await conn.execute(
            `INSERT IGNORE INTO mistake_records (user_id, question_id, consecutive_correct)
             VALUES (?, ?, ?)`,
            [userId, m.questionId || m.question_id, m.consecutiveCorrect || m.consecutive_correct || 0]
          );
          migrated.mistakes++;
        } catch {}
      }
    }

    // 迁移收藏
    if (Array.isArray(favorites)) {
      for (const f of favorites) {
        try {
          const questionId = typeof f === 'number' ? f : (f.questionId || f.question_id);
          await conn.execute(
            'INSERT IGNORE INTO favorites (user_id, question_id) VALUES (?, ?)',
            [userId, questionId]
          );
          migrated.favorites++;
        } catch {}
      }
    }

    // 迁移统计
    if (Array.isArray(stats)) {
      for (const s of stats) {
        try {
          await conn.execute(
            `INSERT INTO study_stats (user_id, subject_id, total_practiced, total_correct, streak_days, last_study_at)
             VALUES (?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE
               total_practiced = VALUES(total_practiced),
               total_correct = VALUES(total_correct)`,
            [
              userId,
              s.subject_id || s.subjectId,
              s.total_practiced || 0,
              s.total_correct || 0,
              s.streak_days || 0,
              s.last_study_at || new Date(),
            ]
          );
          migrated.stats++;
        } catch {}
      }
    }

    await conn.commit();
    res.json({ migrated, message: '数据迁移完成' });
  } catch (err) {
    await conn.rollback();
    console.error('数据迁移错误:', err);
    res.status(500).json({ error: '数据迁移失败' });
  } finally {
    conn.release();
  }
});

// 下载用户所有数据（用于备份）
router.get('/export', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;

    const [subjects] = await pool.execute(
      'SELECT * FROM subjects WHERE created_by = ?',
      [userId]
    );
    const [questions] = await pool.execute(
      'SELECT * FROM questions WHERE created_by = ?',
      [userId]
    );
    const [mistakes] = await pool.execute(
      'SELECT * FROM mistake_records WHERE user_id = ?',
      [userId]
    );
    const [favorites] = await pool.execute(
      'SELECT * FROM favorites WHERE user_id = ?',
      [userId]
    );
    const [stats] = await pool.execute(
      'SELECT * FROM study_stats WHERE user_id = ?',
      [userId]
    );

    // 解析 JSON 字段
    questions.forEach(q => {
      try { q.options = JSON.parse(q.options); } catch {}
      try { q.answer = JSON.parse(q.answer); } catch {}
    });

    res.json({
      exported_at: new Date().toISOString(),
      data: { subjects, questions, mistakes, favorites, stats },
    });
  } catch (err) {
    console.error('导出数据错误:', err);
    res.status(500).json({ error: '导出数据失败' });
  }
});

export default router;
