import jwt from 'jsonwebtoken';

/** 开发环境可用占位密钥；生产环境由 index.js 启动前校验 JWT_SECRET，此处不应落到占位 */
export function getJwtSecret() {
  const s = process.env.JWT_SECRET;
  if (s && String(s).trim().length > 0) return String(s).trim();
  if (process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET is not configured');
  }
  return 'development-only-insecure-jwt-secret-change-me';
}

export function generateToken(user) {
  return jwt.sign(
    { id: user.id, username: user.username, role: user.role, teacher_id: user.teacher_id, status: user.status },
    getJwtSecret(),
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
}

export function authMiddleware(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: '未登录' });
  }

  try {
    const token = header.split(' ')[1];
    const decoded = jwt.verify(token, getJwtSecret());
    if (decoded.status && decoded.status !== 'active') {
      return res.status(403).json({ error: '账号审核中，请等待老师审核通过' });
    }
    req.user = decoded;
    next();
  } catch {
    return res.status(401).json({ error: '登录已过期，请重新登录' });
  }
}

export function adminMiddleware(req, res, next) {
  if (req.user.role !== 'admin' && req.user.role !== 'teacher') {
    return res.status(403).json({ error: '权限不足' });
  }
  next();
}
