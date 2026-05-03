import { Router } from 'express';
import bcrypt from 'bcryptjs';
import pool from '../db.js';
import { generateToken, authMiddleware } from '../middleware/auth.js';

const router = Router();

// 访问计数（公开接口，无需登录）
router.get('/visit', async (req, res) => {
  try {
    await pool.execute('UPDATE visit_counter SET count = count + 1 WHERE id = 1');
    const [rows] = await pool.execute('SELECT count FROM visit_counter WHERE id = 1');
    res.json({ count: rows[0].count });
  } catch (err) {
    res.json({ count: 0 });
  }
});

// 注册 — 支持三种角色
router.post('/register', async (req, res) => {
  try {
    const { username, password, email, role = 'independent', phone, inviteCode, teacherPhone } = req.body;

    // 基本验证
    if (!username || !password) {
      return res.status(400).json({ error: '用户名和密码不能为空' });
    }
    if (username.length < 3) {
      return res.status(400).json({ error: '用户名至少3个字符' });
    }
    if (!/^[a-zA-Z0-9_]+$/.test(username)) {
      return res.status(400).json({ error: '用户名只能包含字母、数字和下划线' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: '密码至少6位' });
    }

    // 角色验证
    const validRoles = ['teacher', 'student', 'independent'];
    if (!validRoles.includes(role)) {
      return res.status(400).json({ error: '无效的用户角色' });
    }

    // 老师必须填手机号
    if (role === 'teacher' && !phone) {
      return res.status(400).json({ error: '老师注册必须填写手机号' });
    }

    // 检查用户名
    const [existing] = await pool.execute(
      'SELECT id FROM users WHERE username = ?',
      [username]
    );
    if (existing.length > 0) {
      return res.status(409).json({ error: '用户名已被注册' });
    }

    // 检查手机号唯一性（如果提供）
    if (phone) {
      const [phoneExist] = await pool.execute('SELECT id FROM users WHERE phone = ?', [phone]);
      if (phoneExist.length > 0) {
        return res.status(409).json({ error: '该手机号已被注册' });
      }
    }

    const passwordHash = await bcrypt.hash(password, 10);
    let teacherId = null;
    let userStatus = 'active';
    let teacherName = null;

    // 学生注册逻辑
    if (role === 'student') {
      if (inviteCode) {
        // 方式1: 通过注册邀请码
        const [codes] = await pool.execute(
          "SELECT * FROM invite_codes WHERE code = ? AND type = 'registration' AND expires_at > NOW()",
          [inviteCode]
        );
        if (codes.length === 0) {
          return res.status(400).json({ error: '邀请码无效或已过期' });
        }
        // 校验使用上限
        if (codes[0].max_uses && codes[0].used_count >= codes[0].max_uses) {
          return res.status(400).json({ error: '邀请码已达到使用上限' });
        }
        teacherId = codes[0].creator_id;
        userStatus = 'active'; // 邀请码注册即时生效

        // 更新邀请码使用次数
        await pool.execute(
          'UPDATE invite_codes SET used_count = used_count + 1 WHERE id = ?',
          [codes[0].id]
        );

        // 获取老师名称
        const [teacher] = await pool.execute('SELECT username FROM users WHERE id = ?', [teacherId]);
        if (teacher.length > 0) teacherName = teacher[0].username;

      } else if (teacherPhone) {
        // 方式2: 通过老师手机号（需审核）
        const [teachers] = await pool.execute(
          "SELECT id, username FROM users WHERE phone = ? AND role = 'teacher'",
          [teacherPhone]
        );
        if (teachers.length === 0) {
          return res.status(400).json({ error: '未找到该手机号对应的老师' });
        }
        teacherId = teachers[0].id;
        teacherName = teachers[0].username;
        userStatus = 'pending'; // 需要老师审核

      } else {
        // 方式3: 暂不关联老师 → 独立用户
        // role 保持 student 但 teacher_id 为 null
        // 实际上按方案，暂不关联的应为 independent
      }
    }

    // 创建用户
    const effectiveRole = (role === 'student' && !teacherId) ? 'independent' : role;
    const [result] = await pool.execute(
      'INSERT INTO users (username, email, password_hash, role, teacher_id, phone, status) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [username, email || '', passwordHash, effectiveRole, teacherId, phone || null, userStatus]
    );

    // 为新用户自动创建默认科目（完全属于该用户）
    const newUserId = result.insertId;
    const defaultSubjects = [
      { id: `chinese_${newUserId}`, name: '语文考试', icon: '✍️', welcome_title: '笔下生花，文以载道', welcome_desc: '涵盖古诗词鉴赏、现代文阅读、文学常识与语言运用', systemId: 'chinese' },
      { id: `math_${newUserId}`, name: '数学考试', icon: '🧮', welcome_title: '以数启智，以理明思', welcome_desc: '从基础运算到逻辑推理，在数字间锤炼思维力量', systemId: 'math' },
      { id: `english_${newUserId}`, name: '英语考试', icon: '🌐', welcome_title: 'Language Opens the World', welcome_desc: '词汇、语法、阅读与写作，全方位提升英语能力', systemId: 'english' },
      { id: `python_${newUserId}`, name: 'Python 考试', icon: '💻', welcome_title: 'Code is Poetry, Logic is Power', welcome_desc: '从语法基础到函数进阶，用代码构建解决问题的能力', systemId: 'python' },
    ];
    for (const subj of defaultSubjects) {
      try {
        await pool.execute(
          'INSERT INTO subjects (id, name, icon, welcome_title, welcome_desc, is_system, is_shared, share_scope, created_by) VALUES (?, ?, ?, ?, ?, 0, 0, \'none\', ?)',
          [subj.id, subj.name, subj.icon, subj.welcome_title, subj.welcome_desc, newUserId]
        );

        // 从系统题库复制题目到新用户科目
        try {
          const [systemQuestions] = await pool.execute(
            'SELECT * FROM questions WHERE subject_id = ?',
            [subj.systemId]
          );
          for (const q of systemQuestions) {
            try {
              await pool.execute(
                `INSERT INTO questions (subject_id, type, title, code, options, answer, explanation, points, created_by)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                  subj.id,
                  q.type,
                  q.title,
                  q.code,
                  q.options,
                  q.answer,
                  q.explanation,
                  q.points,
                  newUserId
                ]
              );
            } catch (e) { /* 忽略单题复制失败 */ }
          }
          console.log(`从 ${subj.systemId} 复制 ${systemQuestions.length} 道题目到 ${subj.id}`);
        } catch (e) { console.warn('复制系统题库失败:', subj.systemId, e.message); }
      } catch (e) { console.warn('创建默认科目失败:', subj.name, e.message); }
    }

    const token = generateToken({
      id: newUserId,
      username,
      role: effectiveRole,
      teacher_id: teacherId,
      status: userStatus
    });

    res.json({
      token,
      user: {
        id: newUserId,
        username,
        email: email || '',
        role: effectiveRole,
        teacher_id: teacherId,
        teacher_name: teacherName,
        phone: phone || null,
        status: userStatus,
        passwordReset: false,
        help_read: 0,
      }
    });
  } catch (err) {
    console.error('注册错误:', err);
    res.status(500).json({ error: '注册失败' });
  }
});

// 登录
router.post('/login', async (req, res) => {
  try {
    console.log('Login attempt:', req.body);
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: '用户名和密码不能为空' });
    }

    const [rows] = await pool.execute(
      'SELECT id, username, email, password_hash, role, password_reset, teacher_id, phone, status, help_read FROM users WHERE username = ?',
      [username]
    );

    console.log('User found:', rows.length > 0 ? 'yes' : 'no');
    if (rows.length === 0) {
      return res.status(401).json({ error: '用户名或密码错误' });
    }

    const user = rows[0];
    console.log('Comparing password with hash:', user.password_hash.substring(0, 20) + '...');
    const valid = await bcrypt.compare(password, user.password_hash);
    console.log('Password valid:', valid);
    if (!valid) {
      return res.status(401).json({ error: '用户名或密码错误' });
    }

    // 获取老师名称
    let teacherName = null;
    if (user.teacher_id) {
      const [teacher] = await pool.execute('SELECT username FROM users WHERE id = ?', [user.teacher_id]);
      if (teacher.length > 0) teacherName = teacher[0].username;
    }

    const token = generateToken({
      id: user.id,
      username: user.username,
      role: user.role,
      teacher_id: user.teacher_id,
      status: user.status
    });

    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        teacher_id: user.teacher_id,
        teacher_name: teacherName,
        phone: user.phone,
        status: user.status,
        passwordReset: !!user.password_reset,
      }
    });
  } catch (err) {
    console.error('登录错误:', err);
    res.status(500).json({ error: '登录失败' });
  }
});

// 获取当前用户信息
router.get('/me', authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.execute(
      'SELECT id, username, email, role, teacher_id, phone, status, password_reset, created_at, help_read FROM users WHERE id = ?',
      [req.user.id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: '用户不存在' });
    }

    const user = rows[0];

    // 获取老师名称
    let teacherName = null;
    if (user.teacher_id) {
      const [teacher] = await pool.execute('SELECT username FROM users WHERE id = ?', [user.teacher_id]);
      if (teacher.length > 0) teacherName = teacher[0].username;
    }

    // 获取学生数量（老师角色）
    let studentCount = 0;
    if (user.role === 'teacher') {
      const [countResult] = await pool.execute(
        "SELECT COUNT(*) as count FROM users WHERE teacher_id = ? AND status = 'active'",
        [user.id]
      );
      studentCount = countResult[0].count;
    }

    res.json({
      user: {
        ...user,
        teacher_name: teacherName,
        student_count: studentCount,
        passwordReset: !!user.password_reset,
      }
    });
  } catch (err) {
    console.error('获取用户信息错误:', err);
    res.status(500).json({ error: '获取用户信息失败' });
  }
});

// 修改密码
router.put('/password', authMiddleware, async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body;
    if (!newPassword) {
      return res.status(400).json({ error: '请输入新密码' });
    }
    if (typeof newPassword !== 'string' || newPassword.length < 6) {
      return res.status(400).json({ error: '新密码至少6位' });
    }
    if (newPassword.length > 50) {
      return res.status(400).json({ error: '密码长度不能超过50位' });
    }

    if (oldPassword) {
      const [rows] = await pool.execute(
        'SELECT password_hash FROM users WHERE id = ?',
        [req.user.id]
      );
      const valid = await bcrypt.compare(oldPassword, rows[0].password_hash);
      if (!valid) {
        return res.status(401).json({ error: '原密码错误' });
      }
    }

    const hash = await bcrypt.hash(newPassword, 10);
    await pool.execute('UPDATE users SET password_hash = ?, password_reset = 0 WHERE id = ?', [hash, req.user.id]);
    res.json({ message: '密码修改成功' });
  } catch (err) {
    console.error('修改密码错误:', err);
    res.status(500).json({ error: '修改密码失败' });
  }
});

// 角色转换
router.post('/convert-role', authMiddleware, async (req, res) => {
  try {
    const { targetRole, phone, inviteCode, teacherPhone } = req.body;
    const userId = req.user.id;
    const currentRole = req.user.role;

    if (!['teacher', 'student', 'independent'].includes(targetRole)) {
      return res.status(400).json({ error: '无效的目标角色' });
    }

    // 不允许admin转换
    if (currentRole === 'admin') {
      return res.status(403).json({ error: '管理员不能转换角色' });
    }

    // 转为老师
    if (targetRole === 'teacher') {
      if (!phone) {
        return res.status(400).json({ error: '转为老师需要填写手机号' });
      }
      const [phoneExist] = await pool.execute('SELECT id FROM users WHERE phone = ? AND id != ?', [phone, userId]);
      if (phoneExist.length > 0) {
        return res.status(409).json({ error: '该手机号已被其他用户使用' });
      }
      await pool.execute(
        "UPDATE users SET role = 'teacher', phone = ?, teacher_id = NULL, status = 'active' WHERE id = ?",
        [phone, userId]
      );
    }

    // 转为学生
    if (targetRole === 'student') {
      let teacherId = null;
      let userStatus = 'active';

      if (inviteCode) {
        const [codes] = await pool.execute(
          "SELECT * FROM invite_codes WHERE code = ? AND type = 'registration' AND expires_at > NOW()",
          [inviteCode]
        );
        if (codes.length === 0) {
          return res.status(400).json({ error: '邀请码无效或已过期' });
        }
        // 校验使用上限
        if (codes[0].max_uses && codes[0].used_count >= codes[0].max_uses) {
          return res.status(400).json({ error: '邀请码已达到使用上限' });
        }
        teacherId = codes[0].creator_id;
        await pool.execute(
          'UPDATE invite_codes SET used_count = used_count + 1 WHERE id = ?',
          [codes[0].id]
        );
      } else if (teacherPhone) {
        const [teachers] = await pool.execute(
          "SELECT id FROM users WHERE phone = ? AND role = 'teacher'",
          [teacherPhone]
        );
        if (teachers.length === 0) {
          return res.status(400).json({ error: '未找到该手机号对应的老师' });
        }
        teacherId = teachers[0].id;
        userStatus = 'pending';
      } else {
        return res.status(400).json({ error: '转为学生需要提供邀请码或老师手机号' });
      }

      await pool.execute(
        "UPDATE users SET role = 'student', teacher_id = ?, status = ? WHERE id = ?",
        [teacherId, userStatus, userId]
      );
    }

    // 转为独立用户
    if (targetRole === 'independent') {
      await pool.execute(
        "UPDATE users SET role = 'independent', teacher_id = NULL, status = 'active' WHERE id = ?",
        [userId]
      );
    }

    // 返回新的用户信息
    const [updated] = await pool.execute(
      'SELECT id, username, email, role, teacher_id, phone, status, help_read FROM users WHERE id = ?',
      [userId]
    );
    const user = updated[0];

    let teacherName = null;
    if (user.teacher_id) {
      const [teacher] = await pool.execute('SELECT username FROM users WHERE id = ?', [user.teacher_id]);
      if (teacher.length > 0) teacherName = teacher[0].username;
    }

    const token = generateToken({
      id: user.id,
      username: user.username,
      role: user.role,
      teacher_id: user.teacher_id,
      status: user.status
    });

    res.json({
      token,
      user: { ...user, teacher_name: teacherName, passwordReset: false }
    });
  } catch (err) {
    console.error('角色转换错误:', err);
    res.status(500).json({ error: '角色转换失败' });
  }
});

// 绑定老师（已注册用户输入邀请码）
router.post('/bind-teacher', authMiddleware, async (req, res) => {
  try {
    const { inviteCode, teacherPhone } = req.body;
    const userId = req.user.id;

    let teacherId = null;
    let userStatus = 'active';

    if (inviteCode) {
      const [codes] = await pool.execute(
        "SELECT * FROM invite_codes WHERE code = ? AND type = 'registration' AND expires_at > NOW()",
        [inviteCode]
      );
      if (codes.length === 0) {
        return res.status(400).json({ error: '邀请码无效或已过期' });
      }
      // 校验使用上限
      if (codes[0].max_uses && codes[0].used_count >= codes[0].max_uses) {
        return res.status(400).json({ error: '邀请码已达到使用上限' });
      }
      teacherId = codes[0].creator_id;
      await pool.execute(
        'UPDATE invite_codes SET used_count = used_count + 1 WHERE id = ?',
        [codes[0].id]
      );
    } else if (teacherPhone) {
      const [teachers] = await pool.execute(
        "SELECT id FROM users WHERE phone = ? AND role = 'teacher'",
        [teacherPhone]
      );
      if (teachers.length === 0) {
        return res.status(400).json({ error: '未找到该手机号对应的老师' });
      }
      teacherId = teachers[0].id;
      userStatus = 'pending';
    } else {
      return res.status(400).json({ error: '请提供邀请码或老师手机号' });
    }

    await pool.execute(
      "UPDATE users SET role = 'student', teacher_id = ?, status = ? WHERE id = ?",
      [teacherId, userStatus, userId]
    );

    let teacherName = null;
    const [teacher] = await pool.execute('SELECT username FROM users WHERE id = ?', [teacherId]);
    if (teacher.length > 0) teacherName = teacher[0].username;

    const [updated] = await pool.execute(
      'SELECT id, username, email, role, teacher_id, phone, status, help_read FROM users WHERE id = ?',
      [userId]
    );

    const token = generateToken({
      id: updated[0].id,
      username: updated[0].username,
      role: updated[0].role,
      teacher_id: updated[0].teacher_id,
      status: updated[0].status
    });

    res.json({
      token,
      user: { ...updated[0], teacher_name: teacherName, passwordReset: false },
      message: userStatus === 'pending' ? '已提交申请，等待老师审核' : '已成功绑定老师'
    });
  } catch (err) {
    console.error('绑定老师错误:', err);
    res.status(500).json({ error: '绑定老师失败' });
  }
});

// 获取用户列表（管理员）
router.get('/list', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: '权限不足' });
    }
    const [rows] = await pool.execute(
      `SELECT u.id, u.username, u.email, u.role, u.teacher_id, u.phone, u.status, u.password_reset, u.created_at,
              t.username as teacher_name,
              (SELECT COUNT(*) FROM users s WHERE s.teacher_id = u.id) as student_count
       FROM users u
       LEFT JOIN users t ON u.teacher_id = t.id
       ORDER BY u.created_at DESC`
    );
    res.json({ users: rows });
  } catch (err) {
    console.error('获取用户列表错误:', err);
    res.status(500).json({ error: '获取用户列表失败' });
  }
});

// 获取老师的学生列表（管理员可用）
router.get('/teacher-students/:teacherId', authMiddleware, async (req, res) => {
  try {
    // 管理员可查任何老师，老师只能查自己
    if (req.user.role !== 'admin' && req.user.role !== 'teacher') {
      return res.status(403).json({ error: '权限不足' });
    }
    // 'me' 或 0 表示查自己的学生
    const teacherId = (req.params.teacherId === 'me' || req.params.teacherId === '0')
      ? req.user.id
      : parseInt(req.params.teacherId);
    // 老师只能查自己的
    if (req.user.role === 'teacher' && teacherId !== req.user.id) {
      return res.status(403).json({ error: '只能查看自己的学生' });
    }
    const [rows] = await pool.execute(
      `SELECT id, username, email, phone, status, created_at
       FROM users WHERE teacher_id = ?
       ORDER BY created_at DESC`,
      [teacherId]
    );
    res.json({ students: rows });
  } catch (err) {
    console.error('获取老师学生列表错误:', err);
    res.status(500).json({ error: '获取学生列表失败' });
  }
});

// 重置用户密码（管理员）
router.put('/reset-password', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: '权限不足' });
    }
    const { userId } = req.body;
    if (!userId) {
      return res.status(400).json({ error: '缺少用户ID' });
    }
    const defaultHash = await bcrypt.hash('123456', 10);
    await pool.execute('UPDATE users SET password_hash = ?, password_reset = 1 WHERE id = ?', [defaultHash, userId]);
    res.json({ message: '密码已重置' });
  } catch (err) {
    console.error('重置密码错误:', err);
    res.status(500).json({ error: '重置密码失败' });
  }
});

// 删除用户（管理员）
router.delete('/user/:id', authMiddleware, async (req, res) => {
  const conn = await pool.getConnection();
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: '权限不足' });
    }
    const userId = req.params.id;
    if (Number(userId) === req.user.id) {
      return res.status(400).json({ error: '不能删除自己的账号' });
    }

    // 检查用户是否有学生
    const [students] = await conn.execute('SELECT id FROM users WHERE teacher_id = ?', [userId]);
    if (students.length > 0) {
      // 将学生转为独立用户
      await conn.execute('UPDATE users SET role = ?, teacher_id = NULL WHERE teacher_id = ?', ['independent', userId]);
    }

    await conn.beginTransaction();

    // 获取用户创建的科目ID列表
    const [userSubjects] = await conn.execute('SELECT id FROM subjects WHERE created_by = ?', [userId]);
    const subjectIds = userSubjects.map(s => s.id);

    if (subjectIds.length > 0) {
      // 获取用户创建的题目ID列表
      const [userQuestions] = await conn.execute(
        `SELECT id FROM questions WHERE subject_id IN (${subjectIds.map(() => '?').join(',')}) AND created_by = ?`,
        [...subjectIds, userId]
      );
      const questionIds = userQuestions.map(q => q.id);

      if (questionIds.length > 0) {
        // 删除所有用户对这些题目的错题和收藏记录
        await conn.execute(
          `DELETE FROM mistake_records WHERE question_id IN (${questionIds.map(() => '?').join(',')})`,
          questionIds
        );
        await conn.execute(
          `DELETE FROM favorites WHERE question_id IN (${questionIds.map(() => '?').join(',')})`,
          questionIds
        );
        // 删除用户创建的题目
        await conn.execute(
          `DELETE FROM questions WHERE id IN (${questionIds.map(() => '?').join(',')})`,
          questionIds
        );
      }

      // 删除用户对这些科目的学习统计
      await conn.execute(
        `DELETE FROM study_stats WHERE subject_id IN (${subjectIds.map(() => '?').join(',')})`,
        subjectIds
      );
      // 删除这些科目的订阅记录
      await conn.execute(
        `DELETE FROM subject_subscriptions WHERE subject_id IN (${subjectIds.map(() => '?').join(',')})`,
        subjectIds
      );
      // 删除用户创建的科目
      await conn.execute(
        `DELETE FROM subjects WHERE id IN (${subjectIds.map(() => '?').join(',')})`,
        subjectIds
      );
    }

    // 删除用户自己的错题记录（他人科目的）
    await conn.execute('DELETE FROM mistake_records WHERE user_id = ?', [userId]);
    // 删除用户自己的收藏记录
    await conn.execute('DELETE FROM favorites WHERE user_id = ?', [userId]);
    // 删除用户自己的学习统计
    await conn.execute('DELETE FROM study_stats WHERE user_id = ?', [userId]);
    // 删除用户创建的邀请码（CASCADE已处理，但保险起见）
    await conn.execute('DELETE FROM invite_codes WHERE creator_id = ?', [userId]);
    // 删除用户的科目订阅
    await conn.execute('DELETE FROM subject_subscriptions WHERE user_id = ?', [userId]);

    // 最终删除用户
    const [result] = await conn.execute('DELETE FROM users WHERE id = ?', [userId]);
    if (result.affectedRows === 0) {
      await conn.rollback();
      return res.status(404).json({ error: '用户不存在' });
    }

    await conn.commit();
    res.json({ message: '用户已删除' });
  } catch (err) {
    await conn.rollback();
    console.error('删除用户错误:', err);
    res.status(500).json({ error: '删除用户失败: ' + err.message });
  } finally {
    conn.release();
  }
});

// ─── 用户AI设置 ──────────────────────────────────────────

// 获取用户AI设置
router.get('/settings', authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.execute(
      'SELECT settings_json FROM user_ai_settings WHERE user_id = ?',
      [req.user.id]
    );
    if (rows.length > 0) {
      try {
        const settings = JSON.parse(rows[0].settings_json);
        res.json({ settings });
      } catch {
        res.json({ settings: null });
      }
    } else {
      res.json({ settings: null });
    }
  } catch (err) {
    console.error('获取设置错误:', err);
    res.status(500).json({ error: '获取设置失败' });
  }
});

// 保存用户AI设置
router.put('/settings', authMiddleware, async (req, res) => {
  try {
    const { settings } = req.body;
    if (!settings) {
      return res.status(400).json({ error: '设置内容不能为空' });
    }
    await pool.execute(
      'INSERT INTO user_ai_settings (user_id, settings_json) VALUES (?, ?) ON DUPLICATE KEY UPDATE settings_json = VALUES(settings_json)',
      [req.user.id, JSON.stringify(settings)]
    );
    res.json({ message: '设置保存成功' });
  } catch (err) {
    console.error('保存设置错误:', err);
    res.status(500).json({ error: '保存设置失败' });
  }
});

// ─── 帮助手册阅读标记 ────────────────────────────────────

// 标记用户已阅读帮助手册
router.put('/help-read', authMiddleware, async (req, res) => {
  try {
    await pool.execute(
      'UPDATE users SET help_read = 1 WHERE id = ?',
      [req.user.id]
    );
    res.json({ message: 'ok' });
  } catch (err) {
    console.error('标记帮助阅读错误:', err);
    res.status(500).json({ error: '操作失败' });
  }
});

// ─── 用户自行注销账号 ────────────────────────────────────

router.delete('/account', authMiddleware, async (req, res) => {
  const userId = req.user.id;

  // 管理员不允许注销
  if (req.user.role === 'admin') {
    return res.status(403).json({ error: '管理员账号不可注销' });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // 如果用户是老师，先将学生转为独立用户
    if (req.user.role === 'teacher') {
      const [students] = await conn.execute('SELECT id FROM users WHERE teacher_id = ?', [userId]);
      if (students.length > 0) {
        await conn.execute(
          "UPDATE users SET role = 'independent', teacher_id = NULL WHERE teacher_id = ?",
          [userId]
        );
      }
    }

    // 获取用户创建的科目ID列表
    const [userSubjects] = await conn.execute('SELECT id FROM subjects WHERE created_by = ?', [userId]);
    const subjectIds = userSubjects.map(s => s.id);

    if (subjectIds.length > 0) {
      // 删除用户创建的题目
      const [userQuestions] = await conn.execute(
        `SELECT id FROM questions WHERE subject_id IN (${subjectIds.map(() => '?').join(',')}) AND created_by = ?`,
        [...subjectIds, userId]
      );
      const questionIds = userQuestions.map(q => q.id);
      if (questionIds.length > 0) {
        await conn.execute(
          `DELETE FROM questions WHERE id IN (${questionIds.map(() => '?').join(',')})`,
          questionIds
        );
      }
      // 删除这些科目的学习统计
      await conn.execute(
        `DELETE FROM study_stats WHERE subject_id IN (${subjectIds.map(() => '?').join(',')})`,
        subjectIds
      );
      // 删除这些科目的订阅记录
      await conn.execute(
        `DELETE FROM subject_subscriptions WHERE subject_id IN (${subjectIds.map(() => '?').join(',')})`,
        subjectIds
      );
      // 删除用户创建的科目
      await conn.execute(
        `DELETE FROM subjects WHERE id IN (${subjectIds.map(() => '?').join(',')})`,
        subjectIds
      );
    }

    // 删除用户个人数据
    await conn.execute('DELETE FROM user_ai_settings WHERE user_id = ?', [userId]);
    await conn.execute('DELETE FROM mistake_records WHERE user_id = ?', [userId]);
    await conn.execute('DELETE FROM favorites WHERE user_id = ?', [userId]);
    await conn.execute('DELETE FROM study_stats WHERE user_id = ?', [userId]);
    await conn.execute('DELETE FROM invite_codes WHERE creator_id = ?', [userId]);
    await conn.execute('DELETE FROM subject_subscriptions WHERE user_id = ?', [userId]);

    // 最终删除用户
    const [result] = await conn.execute('DELETE FROM users WHERE id = ?', [userId]);
    if (result.affectedRows === 0) {
      await conn.rollback();
      return res.status(404).json({ error: '用户不存在' });
    }

    await conn.commit();
    res.json({ message: '账号已注销' });
  } catch (err) {
    await conn.rollback();
    console.error('注销账号错误:', err);
    res.status(500).json({ error: '注销失败: ' + err.message });
  } finally {
    conn.release();
  }
});

export default router;
