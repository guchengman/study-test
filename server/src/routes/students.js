import { Router } from 'express';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import pool from '../db.js';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();

// 获取待审核学生列表（老师）
router.get('/pending', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'teacher' && req.user.role !== 'admin') {
      return res.status(403).json({ error: '权限不足' });
    }
    const [rows] = await pool.execute(
      "SELECT id, username, email, phone, created_at FROM users WHERE teacher_id = ? AND status = 'pending'",
      [req.user.id]
    );
    res.json({ students: rows });
  } catch (err) {
    console.error('获取待审核学生错误:', err);
    res.status(500).json({ error: '获取待审核学生失败' });
  }
});

// 审核通过
router.put('/approve/:id', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'teacher' && req.user.role !== 'admin') {
      return res.status(403).json({ error: '权限不足' });
    }
    const [result] = await pool.execute(
      "UPDATE users SET status = 'active' WHERE id = ? AND teacher_id = ? AND status = 'pending'",
      [req.params.id, req.user.id]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: '学生不存在或无需审核' });
    }
    res.json({ message: '学生已通过审核' });
  } catch (err) {
    console.error('审核学生错误:', err);
    res.status(500).json({ error: '审核操作失败' });
  }
});

// 审核拒绝 → 变为独立用户
router.put('/reject/:id', authMiddleware, async (req, res) => {
  const conn = await pool.getConnection();
  try {
    if (req.user.role !== 'teacher' && req.user.role !== 'admin') {
      return res.status(403).json({ error: '权限不足' });
    }
    await conn.beginTransaction();
    const [result] = await conn.execute(
      "UPDATE users SET role = 'independent', teacher_id = NULL, status = 'active' WHERE id = ? AND teacher_id = ? AND status = 'pending'",
      [req.params.id, req.user.id]
    );
    if (result.affectedRows === 0) {
      await conn.rollback();
      return res.status(404).json({ error: '学生不存在或无需审核' });
    }
    // 清理该学生的科目订阅（转为独立用户后不再有老师关联）
    await conn.execute('DELETE FROM subject_subscriptions WHERE user_id = ?', [req.params.id]);
    await conn.commit();
    res.json({ message: '已拒绝该学生，已转为独立用户' });
  } catch (err) {
    await conn.rollback();
    console.error('拒绝学生错误:', err);
    res.status(500).json({ error: '拒绝操作失败' });
  } finally {
    conn.release();
  }
});

// 获取我的学生列表（老师）
router.get('/my', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'teacher' && req.user.role !== 'admin') {
      return res.status(403).json({ error: '权限不足' });
    }
    const [rows] = await pool.execute(
      "SELECT id, username, email, phone, status, created_at FROM users WHERE teacher_id = ? AND status = 'active'",
      [req.user.id]
    );
    res.json({ students: rows });
  } catch (err) {
    console.error('获取学生列表错误:', err);
    res.status(500).json({ error: '获取学生列表失败' });
  }
});

// 移除学生 → 变为独立用户
router.put('/remove/:id', authMiddleware, async (req, res) => {
  const conn = await pool.getConnection();
  try {
    if (req.user.role !== 'teacher' && req.user.role !== 'admin') {
      return res.status(403).json({ error: '权限不足' });
    }
    await conn.beginTransaction();
    const [result] = await conn.execute(
      "UPDATE users SET role = 'independent', teacher_id = NULL, status = 'active' WHERE id = ? AND teacher_id = ?",
      [req.params.id, req.user.id]
    );
    if (result.affectedRows === 0) {
      await conn.rollback();
      return res.status(404).json({ error: '学生不存在' });
    }
    // 清理该学生的科目订阅
    await conn.execute('DELETE FROM subject_subscriptions WHERE user_id = ?', [req.params.id]);
    await conn.commit();
    res.json({ message: '学生已移除，已转为独立用户' });
  } catch (err) {
    await conn.rollback();
    console.error('移除学生错误:', err);
    res.status(500).json({ error: '移除学生失败' });
  } finally {
    conn.release();
  }
});

// 重置学生密码（老师）
router.put('/reset-password/:id', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'teacher' && req.user.role !== 'admin') {
      return res.status(403).json({ error: '权限不足' });
    }
    // 验证是该老师的学生
    const [student] = await pool.execute(
      'SELECT id FROM users WHERE id = ? AND teacher_id = ?',
      [req.params.id, req.user.id]
    );
    if (student.length === 0) {
      return res.status(404).json({ error: '学生不存在或不属于您' });
    }

    const newPassword = crypto.randomBytes(6).toString('hex');
    const defaultHash = await bcrypt.hash(newPassword, 10);
    await pool.execute(
      'UPDATE users SET password_hash = ?, password_reset = 1 WHERE id = ?',
      [defaultHash, req.params.id]
    );
    res.json({ message: `密码已重置`, tempPassword: newPassword });
  } catch (err) {
    console.error('重置学生密码错误:', err);
    res.status(500).json({ error: '重置密码失败' });
  }
});

export default router;
