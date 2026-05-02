import { Router } from 'express';
import crypto from 'crypto';
import pool from '../db.js';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();

// 生成随机邀请码（6位大写字母+数字）
function generateCode() {
  return crypto.randomBytes(4).toString('hex').toUpperCase().slice(0, 6);
}

// 带重试的邀请码生成，防止唯一约束冲突
async function generateUniqueCode(conn) {
  const MAX_RETRIES = 5;
  for (let i = 0; i < MAX_RETRIES; i++) {
    const code = generateCode();
    const [existing] = await conn.execute('SELECT id FROM invite_codes WHERE code = ?', [code]);
    if (existing.length === 0) return code;
  }
  throw new Error('生成唯一邀请码失败，请重试');
}

// 获取自己的邀请码列表
router.get('/', authMiddleware, async (req, res) => {
  try {
    const { type } = req.query; // 'registration' | 'subject' | undefined(全部)
    let sql, params;
    // 管理员能看到所有邀请码
    if (req.user.role === 'admin') {
      sql = 'SELECT * FROM invite_codes WHERE 1=1';
      params = [];
    } else {
      sql = 'SELECT * FROM invite_codes WHERE creator_id = ?';
      params = [req.user.id];
    }

    if (type) {
      sql += ' AND type = ?';
      params.push(type);
    }
    sql += ' ORDER BY created_at DESC';

    const [rows] = await pool.execute(sql, params);

    // 补充科目名称
    const result = [];
    for (const row of rows) {
      const item = { ...row };
      if (row.subject_id) {
        const [subjects] = await pool.execute('SELECT name FROM subjects WHERE id = ?', [row.subject_id]);
        if (subjects.length > 0) item.subject_name = subjects[0].name;
      }
      result.push(item);
    }

    res.json({ codes: result });
  } catch (err) {
    console.error('获取邀请码列表错误:', err);
    res.status(500).json({ error: '获取邀请码列表失败' });
  }
});

// 生成邀请码
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { type, code: customCode, description = '', subjectId, scope = 'all', max_uses = 100 } = req.body;

    if (!['registration', 'subject'].includes(type)) {
      return res.status(400).json({ error: '邀请码类型无效' });
    }

    // 科目码需要指定科目
    if (type === 'subject' && !subjectId) {
      return res.status(400).json({ error: '科目邀请码必须指定科目' });
    }

    // 验证科目属于当前用户或管理员，且已开启共享
    if (type === 'subject') {
      const [subjects] = await pool.execute(
        'SELECT id, is_shared, share_scope, created_by FROM subjects WHERE id = ?',
        [subjectId]
      );
      if (subjects.length === 0) {
        return res.status(404).json({ error: '科目不存在' });
      }
      if (subjects[0].created_by !== req.user.id && req.user.role !== 'admin') {
        return res.status(403).json({ error: '无权限为此科目生成邀请码' });
      }
      if (subjects[0].share_scope === 'none') {
        return res.status(400).json({ error: '科目未开启共享' });
      }
      if (subjects[0].share_scope === 'students' && scope !== 'students' && scope !== 'all') {
        return res.status(400).json({ error: '邀请码范围无效' });
      }
      if (subjects[0].share_scope === 'all' && scope !== 'all') {
        return res.status(400).json({ error: '全员共享科目只能生成全员邀请码' });
      }
    }

    // 只有老师能生成注册码
    if (type === 'registration' && req.user.role !== 'teacher' && req.user.role !== 'admin') {
      return res.status(403).json({ error: '只有老师可以生成注册邀请码' });
    }

    // 邀请码：自定义 or 随机生成（带重试）
    let code;
    if (customCode) {
      const [existing] = await pool.execute('SELECT id FROM invite_codes WHERE code = ?', [customCode]);
      if (existing.length > 0) {
        return res.status(409).json({ error: '该邀请码已被使用' });
      }
      code = customCode;
    } else {
      code = await generateUniqueCode(pool);
    }

    // 确定邀请码 scope
    let effectiveScope = scope || 'all';
    if (type === 'registration') {
      effectiveScope = 'all';
    }

    // 校验 max_uses 合法性
    const maxUses = Math.max(1, Math.min(10000, parseInt(max_uses) || 100));

    // 7天后过期
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const [result] = await pool.execute(
      'INSERT INTO invite_codes (code, type, scope, creator_id, subject_id, description, expires_at, max_uses) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [code, type, effectiveScope, req.user.id, subjectId || null, description, expiresAt, maxUses]
    );

    res.json({
      id: result.insertId,
      code,
      type,
      scope: effectiveScope,
      subjectId,
      description,
      expiresAt,
      maxUses,
      message: '邀请码生成成功'
    });
  } catch (err) {
    console.error('生成邀请码错误:', err);
    res.status(500).json({ error: '生成邀请码失败' });
  }
});

// 删除邀请码
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    // 管理员可删除任何邀请码，普通用户只能删除自己的
    const condition = req.user.role === 'admin'
      ? 'WHERE id = ?'
      : 'WHERE id = ? AND creator_id = ?';
    const params = req.user.role === 'admin'
      ? [req.params.id]
      : [req.params.id, req.user.id];

    const [result] = await pool.execute(
      `DELETE FROM invite_codes ${condition}`,
      params
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: '邀请码不存在或无权限' });
    }
    res.json({ message: '邀请码已删除' });
  } catch (err) {
    console.error('删除邀请码错误:', err);
    res.status(500).json({ error: '删除邀请码失败' });
  }
});

export default router;
