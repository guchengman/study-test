import { Router } from 'express';
import pool from '../db.js';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();

// 获取科目列表 — 支持共享可见性
router.get('/', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const userRole = req.user.role;

    // 管理员：自己创建的 + 已订阅的（与其他用户逻辑一致，避免看到其他用户的科目）
    // 使用 DISTINCT 避免同一科目既创建又订阅时重复显示
    // 排除系统模板科目（is_system=1），只通过订阅显示
    if (userRole === 'admin') {
      const [rows] = await pool.execute(
        `SELECT DISTINCT s.*, u.username as creator_name,
                (SELECT COUNT(*) FROM questions WHERE subject_id = s.id) as question_count,
                (SELECT COUNT(*) FROM subject_subscriptions WHERE subject_id = s.id AND status = 'approved') as subscriber_count,
                CASE WHEN ss.id IS NOT NULL THEN 1 ELSE 0 END as is_subscribed,
                ss.status as subscription_status
         FROM subjects s
         LEFT JOIN subject_subscriptions ss ON ss.subject_id = s.id AND ss.user_id = ?
         LEFT JOIN users u ON s.created_by = u.id
         WHERE s.is_system != 1
           AND (s.created_by = ?
                OR (ss.id IS NOT NULL AND ss.status = 'approved'))
         ORDER BY s.created_at`,
        [userId, userId]
      );
      rows.forEach(r => {
        r.is_owner = (r.created_by === userId);
        r.is_shared = (r.share_scope && r.share_scope !== 'none') ? 1 : 0;
      });
      return res.json({ subjects: rows });
    }

    // 学生：自己创建的 + 已订阅的(含pending) + 老师共享给学生的
    if (userRole === 'student') {
      // 获取学生的 teacher_id
      const [userRows] = await pool.execute('SELECT teacher_id FROM users WHERE id = ?', [userId]);
      const teacherId = userRows.length > 0 ? userRows[0].teacher_id : null;

      let rows;
      if (teacherId) {
        // 有老师的学生：能看到老师共享的科目 + 自己的订阅（含待审核）
        // 排除系统模板科目（is_system=1）
        rows = await pool.execute(
          `SELECT DISTINCT s.*, u.username as creator_name,
                  (SELECT COUNT(*) FROM questions WHERE subject_id = s.id) as question_count,
                  (SELECT COUNT(*) FROM subject_subscriptions WHERE subject_id = s.id AND status = 'approved') as subscriber_count,
                  CASE WHEN ss.id IS NOT NULL THEN 1 ELSE 0 END as is_subscribed,
                  ss.status as subscription_status
           FROM subjects s
           LEFT JOIN subject_subscriptions ss ON ss.subject_id = s.id AND ss.user_id = ?
           LEFT JOIN users u ON s.created_by = u.id
           WHERE s.is_system != 1
              AND (s.created_by = ?
                   OR (ss.id IS NOT NULL AND ss.status IN ('approved', 'pending'))
                   OR (
                     s.share_scope = 'students'
                     AND s.created_by = ?
                     AND (
                       NOT EXISTS (SELECT 1 FROM subject_student_access sa WHERE sa.subject_id = s.id)
                       OR EXISTS (SELECT 1 FROM subject_student_access sa WHERE sa.subject_id = s.id AND sa.student_user_id = ?)
                     )
                   ))
           ORDER BY s.created_at`,
          [userId, userId, teacherId, userId]
        );
      } else {
        // 没有老师的独立用户：只能看到自己的 + 已订阅的（含待审核）
        // 排除系统模板科目（is_system=1）
        rows = await pool.execute(
          `SELECT DISTINCT s.*, u.username as creator_name,
                  (SELECT COUNT(*) FROM questions WHERE subject_id = s.id) as question_count,
                  (SELECT COUNT(*) FROM subject_subscriptions WHERE subject_id = s.id AND status = 'approved') as subscriber_count,
                  CASE WHEN ss.id IS NOT NULL THEN 1 ELSE 0 END as is_subscribed,
                  ss.status as subscription_status
           FROM subjects s
           LEFT JOIN subject_subscriptions ss ON ss.subject_id = s.id AND ss.user_id = ?
           LEFT JOIN users u ON s.created_by = u.id
           WHERE s.is_system != 1
              AND (s.created_by = ?
                   OR (ss.id IS NOT NULL AND ss.status IN ('approved', 'pending')))
           ORDER BY s.created_at`,
          [userId, userId]
        );
      }

      const result = rows[0];
      result.forEach(r => {
        r.is_owner = (r.created_by === userId);
        r.is_shared = (r.share_scope && r.share_scope !== 'none') ? 1 : 0;
      });
      return res.json({ subjects: result });
    }

    // 老师/独立用户：自己的 + 已订阅的共享科目
    // 排除系统模板科目（is_system=1）
    const [rows] = await pool.execute(
      `SELECT DISTINCT s.*, u.username as creator_name,
              (SELECT COUNT(*) FROM questions WHERE subject_id = s.id) as question_count,
              (SELECT COUNT(*) FROM subject_subscriptions WHERE subject_id = s.id AND status = 'approved') as subscriber_count,
              CASE WHEN ss.id IS NOT NULL THEN 1 ELSE 0 END as is_subscribed,
              ss.status as subscription_status
       FROM subjects s
       LEFT JOIN subject_subscriptions ss ON ss.subject_id = s.id AND ss.user_id = ?
       LEFT JOIN users u ON s.created_by = u.id
       WHERE s.is_system != 1
         AND (s.created_by = ? 
              OR (ss.id IS NOT NULL AND ss.status = 'approved'))
       ORDER BY s.created_at`,
      [userId, userId]
    );

    rows.forEach(r => {
      r.is_owner = (r.created_by === userId);
      r.is_shared = (r.share_scope && r.share_scope !== 'none') ? 1 : 0;
    });

    res.json({ subjects: rows });
  } catch (err) {
    console.error('获取科目列表错误:', err);
    res.status(500).json({ error: '获取科目列表失败' });
  }
});

// 创建科目 — 自动绑定当前用户
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { id, name, icon, welcome_title, welcome_desc, is_system = false, share_scope = 'none' } = req.body;
    if (!id || !name) {
      return res.status(400).json({ error: '科目ID和名称不能为空' });
    }
    if (typeof id !== 'string' || !/^[a-zA-Z0-9_\u4e00-\u9fa5]+$/.test(id)) {
      return res.status(400).json({ error: '科目ID只能包含字母、数字、下划线和中文' });
    }
    if (id.length > 50) {
      return res.status(400).json({ error: '科目ID长度不能超过50字符' });
    }
    if (typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).json({ error: '科目名称不能为空' });
    }
    if (name.length > 100) {
      return res.status(400).json({ error: '科目名称长度不能超过100字符' });
    }
    const validScopes = ['none', 'students', 'all'];
    if (!validScopes.includes(share_scope)) {
      return res.status(400).json({ error: '共享范围无效' });
    }

    // 检查科目ID是否已存在
    const [existingId] = await pool.execute(
      'SELECT id FROM subjects WHERE id = ?',
      [id]
    );
    if (existingId.length > 0) {
      return res.status(409).json({ error: `科目ID「${id}」已存在` });
    }

    const isShared = share_scope !== 'none' ? 1 : 0;

    await pool.execute(
      'INSERT INTO subjects (id, name, icon, welcome_title, welcome_desc, is_system, is_shared, share_scope, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [id, name, icon || '📚', welcome_title || '', welcome_desc || '', is_system ? 1 : 0, isShared, share_scope, req.user.id]
    );
    res.json({ id, message: '科目创建成功' });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: '科目ID已存在' });
    }
    console.error('创建科目错误:', err);
    res.status(500).json({ error: '科目创建失败' });
  }
});

// 更新科目 — 只能更新自己创建的（管理员也可以）
router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const { name, icon, welcome_title, welcome_desc, share_scope, student_ids } = req.body;

    // 权限校验 — 允许科目拥有者或管理员修改
    const [existing] = await pool.execute(
      'SELECT id, share_scope as current_scope, created_by FROM subjects WHERE id = ? AND (created_by = ? OR ?)',
      [req.params.id, req.user.id, req.user.role === 'admin' ? 1 : 0]
    );
    if (existing.length === 0) {
      return res.status(404).json({ error: '科目不存在或无权限' });
    }

    const effectiveShareScope = share_scope || 'none';
    const isShared = effectiveShareScope !== 'none' ? 1 : 0;

    // 动态构建 UPDATE 语句，只更新传入的字段（白名单字段，防止注入）
    const ALLOWED_UPDATE_FIELDS = ['name', 'icon', 'welcome_title', 'welcome_desc'];
    const updates = [];
    const params = [];
    for (const field of ALLOWED_UPDATE_FIELDS) {
      if (req.body[field] !== undefined) {
        updates.push(`${field} = ?`);
        params.push(req.body[field]);
      }
    }
    updates.push('is_shared = ?'); params.push(isShared);
    updates.push('share_scope = ?'); params.push(effectiveShareScope);
    params.push(req.params.id);

    await pool.execute(
      `UPDATE subjects SET ${updates.join(', ')} WHERE id = ?`,
      params
    );

    // 如果从共享改为非共享，删除所有订阅和邀请码
    if (existing[0].current_scope && existing[0].current_scope !== 'none' && effectiveShareScope === 'none') {
      await pool.execute('DELETE FROM subject_subscriptions WHERE subject_id = ?', [req.params.id]);
      await pool.execute("DELETE FROM invite_codes WHERE subject_id = ? AND type = 'subject'", [req.params.id]);
      await pool.execute('DELETE FROM subject_student_access WHERE subject_id = ?', [req.params.id]);
    }

    // 更新学生授权列表（仅 students 模式）
    if (effectiveShareScope === 'students' && Array.isArray(student_ids)) {
      // 先清除旧的
      await pool.execute('DELETE FROM subject_student_access WHERE subject_id = ?', [req.params.id]);
      // 如果不是全体（student_ids 非空且非 ['all']），则插入白名单
      if (student_ids.length > 0 && !(student_ids.length === 1 && student_ids[0] === 'all')) {
        const values = student_ids.map(sid => [req.params.id, sid]);
        const placeholders = values.map(() => '(?, ?)').join(',');
        const params = values.flat();
        await pool.execute(
          `INSERT INTO subject_student_access (subject_id, student_user_id) VALUES ${placeholders}`,
          params
        );
      }
      // 如果 student_ids 为空或 ['all']，不插入记录 = 全体学生可见
    }

    // 如果从 students 模式切换到其他模式，清除学生授权表
    if (existing[0].current_scope === 'students' && effectiveShareScope !== 'students') {
      await pool.execute('DELETE FROM subject_student_access WHERE subject_id = ?', [req.params.id]);
    }

    res.json({ message: '科目更新成功' });
  } catch (err) {
    console.error('更新科目错误:', err);
    res.status(500).json({ error: '科目更新失败' });
  }
});

// 获取科目的授权学生列表
router.get('/:id/students', authMiddleware, async (req, res) => {
  try {
    const [existing] = await pool.execute(
      'SELECT id, created_by, share_scope FROM subjects WHERE id = ?',
      [req.params.id]
    );
    if (existing.length === 0) {
      return res.status(404).json({ error: '科目不存在' });
    }
    if (existing[0].created_by !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: '无权限' });
    }

    const [accessRows] = await pool.execute(
      'SELECT student_user_id FROM subject_student_access WHERE subject_id = ?',
      [req.params.id]
    );

    // 返回授权学生 ID 列表，空列表表示全体学生
    res.json({
      shareScope: existing[0].share_scope,
      studentIds: accessRows.map(r => r.student_user_id),
      isAllStudents: accessRows.length === 0 // 没有白名单=全体
    });
  } catch (err) {
    console.error('获取科目学生列表错误:', err);
    res.status(500).json({ error: '获取失败' });
  }
});

// 删除科目 — 只能删除自己创建的（管理员也可以）
router.delete('/:id', authMiddleware, async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const [existing] = await pool.execute(
      'SELECT id, created_by FROM subjects WHERE id = ?',
      [req.params.id]
    );
    if (existing.length === 0) {
      return res.status(404).json({ error: '科目不存在' });
    }
    if (existing[0].created_by !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: '无权限删除此科目' });
    }

    await conn.beginTransaction();

    // 删除关联数据
    await conn.execute('DELETE FROM subject_subscriptions WHERE subject_id = ?', [req.params.id]);
    await conn.execute("DELETE FROM invite_codes WHERE subject_id = ? AND type = 'subject'", [req.params.id]);
    await conn.execute('DELETE FROM subject_student_access WHERE subject_id = ?', [req.params.id]);

    const [questions] = await conn.execute('SELECT id FROM questions WHERE subject_id = ?', [req.params.id]);
    if (questions.length > 0) {
      const qIds = questions.map(q => q.id);
      const placeholders = qIds.map(() => '?').join(',');
      await conn.execute(`DELETE FROM mistake_records WHERE question_id IN (${placeholders})`, qIds);
      await conn.execute(`DELETE FROM favorites WHERE question_id IN (${placeholders})`, qIds);
      await conn.execute('DELETE FROM questions WHERE subject_id = ?', [req.params.id]);
    }

    await conn.execute('DELETE FROM study_stats WHERE subject_id = ?', [req.params.id]);
    await conn.execute('DELETE FROM subjects WHERE id = ?', [req.params.id]);

    await conn.commit();
    res.json({ message: '科目及关联数据删除成功', deletedQuestions: questions.length });
  } catch (err) {
    await conn.rollback();
    console.error('删除科目错误:', err);
    res.status(500).json({ error: '科目删除失败' });
  } finally {
    conn.release();
  }
});

// 初始化课程（清空题库）
router.post('/:id/initialize', authMiddleware, async (req, res) => {
  try {
    const subjectId = req.params.id;
    const userId = req.user.id;
    const userRole = req.user.role;

    const [existing] = await pool.execute(
      'SELECT id, created_by, share_scope FROM subjects WHERE id = ?',
      [subjectId]
    );
    if (existing.length === 0) {
      return res.status(404).json({ error: '科目不存在' });
    }

    const subject = existing[0];
    if (subject.created_by !== userId && userRole !== 'admin') {
      return res.status(403).json({ error: '无权限初始化此科目' });
    }
    if (userRole === 'student' && subject.share_scope !== 'none') {
      return res.status(403).json({ error: '学生不能初始化共享科目' });
    }

    const [questions] = await pool.execute('SELECT id FROM questions WHERE subject_id = ?', [subjectId]);
    if (questions.length > 0) {
      const qIds = questions.map(q => q.id);
      const placeholders = qIds.map(() => '?').join(',');
      await pool.execute(`DELETE FROM mistake_records WHERE question_id IN (${placeholders})`, qIds);
      await pool.execute(`DELETE FROM favorites WHERE question_id IN (${placeholders})`, qIds);
      await pool.execute('DELETE FROM study_stats WHERE subject_id = ?', [subjectId]);
      await pool.execute('DELETE FROM questions WHERE subject_id = ?', [subjectId]);
    }

    res.json({ message: '科目已初始化，所有题目和练习记录已清空', deletedQuestions: questions.length });
  } catch (err) {
    console.error('初始化科目错误:', err);
    res.status(500).json({ error: '初始化科目失败' });
  }
});

// 加入共享科目（输入科目邀请码）
router.post('/join', authMiddleware, async (req, res) => {
  try {
    const { code } = req.body;
    if (!code) {
      return res.status(400).json({ error: '请输入邀请码' });
    }

    const [codes] = await pool.execute(
      `SELECT ic.*, s.name as subject_name, s.share_scope, s.created_by
       FROM invite_codes ic 
       JOIN subjects s ON ic.subject_id = s.id 
       WHERE ic.code = ? AND ic.type = 'subject' AND ic.expires_at > NOW()`,
      [code]
    );
    if (codes.length === 0) {
      return res.status(400).json({ error: '邀请码无效或已过期' });
    }

    const inviteCode = codes[0];
    // 校验使用上限
    if (inviteCode.max_uses && inviteCode.used_count >= inviteCode.max_uses) {
      return res.status(400).json({ error: '邀请码已达到使用上限' });
    }
    if (inviteCode.share_scope === 'none') {
      return res.status(400).json({ error: '该科目已关闭共享' });
    }
    if (inviteCode.created_by === req.user.id) {
      return res.status(400).json({ error: '不能订阅自己创建的科目' });
    }

    // 检查是否已订阅该科目（防止重复订阅）
    const [existingSub] = await pool.execute(
      'SELECT id FROM subject_subscriptions WHERE user_id = ? AND subject_id = ?',
      [req.user.id, inviteCode.subject_id]
    );
    if (existingSub.length > 0) {
      return res.status(409).json({ error: '您已加入该科目' });
    }

    // 如果邀请码 scope = 'students'，校验使用者必须是该老师的学生
    if (inviteCode.scope === 'students') {
      const [userRows] = await pool.execute('SELECT teacher_id FROM users WHERE id = ?', [req.user.id]);
      if (userRows.length === 0 || userRows[0].teacher_id !== inviteCode.created_by) {
        return res.status(403).json({ error: '此邀请码仅限该老师的学生使用' });
      }
    }

    const [existing] = await pool.execute(
      'SELECT id FROM subject_subscriptions WHERE user_id = ? AND subject_id = ?',
      [req.user.id, inviteCode.subject_id]
    );
    if (existing.length > 0) {
      return res.status(409).json({ error: '您已订阅该科目' });
    }

    // 判断是否需要审核：如果订阅者是该科目创建者的学生，需要审核
    const [userRows] = await pool.execute('SELECT teacher_id FROM users WHERE id = ?', [req.user.id]);
    const needsApproval = (userRows.length > 0 && userRows[0].teacher_id === inviteCode.created_by);
    const subStatus = needsApproval ? 'pending' : 'approved';

    await pool.execute(
      'INSERT INTO subject_subscriptions (user_id, subject_id, status) VALUES (?, ?, ?)',
      [req.user.id, inviteCode.subject_id, subStatus]
    );
    await pool.execute(
      'UPDATE invite_codes SET used_count = used_count + 1 WHERE id = ?',
      [inviteCode.id]
    );

    res.json({
      message: needsApproval ? '已申请加入共享科目，等待老师审核' : '已成功加入共享科目',
      subject: { id: inviteCode.subject_id, name: inviteCode.subject_name },
      status: subStatus
    });
  } catch (err) {
    console.error('加入共享科目错误:', err);
    res.status(500).json({ error: '加入共享科目失败' });
  }
});

// 退订共享科目
router.post('/:id/leave', authMiddleware, async (req, res) => {
  try {
    const [result] = await pool.execute(
      'DELETE FROM subject_subscriptions WHERE user_id = ? AND subject_id = ?',
      [req.user.id, req.params.id]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: '未订阅该科目' });
    }
    res.json({ message: '已退订共享科目' });
  } catch (err) {
    console.error('退订科目错误:', err);
    res.status(500).json({ error: '退订科目失败' });
  }
});

// 获取已订阅的共享科目列表（学生用，返回所有状态）
router.get('/subscribed', authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT s.*, ss.subscribed_at, ss.status as subscription_status, u.username as creator_name
       FROM subject_subscriptions ss
       JOIN subjects s ON ss.subject_id = s.id
       JOIN users u ON s.created_by = u.id
       WHERE ss.user_id = ?
       ORDER BY ss.subscribed_at DESC`,
      [req.user.id]
    );
    res.json({ subjects: rows });
  } catch (err) {
    console.error('获取订阅科目错误:', err);
    res.status(500).json({ error: '获取订阅科目失败' });
  }
});

// 获取待审核的科目订阅列表（科目创建者/老师使用）
router.get('/pending-subscriptions', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    // 查询当前用户创建的科目中，状态为 pending 的订阅
    const [rows] = await pool.execute(
      `SELECT ss.id as subscription_id, ss.subject_id, ss.user_id, ss.subscribed_at, ss.status,
              s.name as subject_name, s.icon as subject_icon,
              u.username, u.email
       FROM subject_subscriptions ss
       JOIN subjects s ON ss.subject_id = s.id
       JOIN users u ON ss.user_id = u.id
       WHERE s.created_by = ? AND ss.status = 'pending'
       ORDER BY ss.subscribed_at DESC`,
      [userId]
    );
    res.json({ subscriptions: rows });
  } catch (err) {
    console.error('获取待审核订阅错误:', err);
    res.status(500).json({ error: '获取待审核订阅失败' });
  }
});

// 审核通过科目订阅
router.put('/subscriptions/:id/approve', authMiddleware, async (req, res) => {
  try {
    const subscriptionId = req.params.id;
    const userId = req.user.id;

    // 验证：只有科目创建者可以审核
    const [subs] = await pool.execute(
      `SELECT ss.*, s.created_by FROM subject_subscriptions ss
       JOIN subjects s ON ss.subject_id = s.id
       WHERE ss.id = ?`,
      [subscriptionId]
    );
    if (subs.length === 0) {
      return res.status(404).json({ error: '订阅记录不存在' });
    }
    if (subs[0].created_by !== userId) {
      return res.status(403).json({ error: '无权审核此订阅' });
    }
    if (subs[0].status !== 'pending') {
      return res.status(400).json({ error: '该订阅已处理' });
    }

    await pool.execute(
      'UPDATE subject_subscriptions SET status = ? WHERE id = ?',
      ['approved', subscriptionId]
    );
    res.json({ message: '已通过审核' });
  } catch (err) {
    console.error('审核通过错误:', err);
    res.status(500).json({ error: '审核操作失败' });
  }
});

// 拒绝科目订阅
router.put('/subscriptions/:id/reject', authMiddleware, async (req, res) => {
  try {
    const subscriptionId = req.params.id;
    const userId = req.user.id;

    const [subs] = await pool.execute(
      `SELECT ss.*, s.created_by FROM subject_subscriptions ss
       JOIN subjects s ON ss.subject_id = s.id
       WHERE ss.id = ?`,
      [subscriptionId]
    );
    if (subs.length === 0) {
      return res.status(404).json({ error: '订阅记录不存在' });
    }
    if (subs[0].created_by !== userId) {
      return res.status(403).json({ error: '无权审核此订阅' });
    }
    if (subs[0].status !== 'pending') {
      return res.status(400).json({ error: '该订阅已处理' });
    }

    // 拒绝 = 直接删除订阅记录
    await pool.execute('DELETE FROM subject_subscriptions WHERE id = ?', [subscriptionId]);
    res.json({ message: '已拒绝该申请' });
  } catch (err) {
    console.error('拒绝订阅错误:', err);
    res.status(500).json({ error: '拒绝操作失败' });
  }
});

export default router;
