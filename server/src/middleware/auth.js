import jwt from 'jsonwebtoken';

export function generateToken(user) {
  return jwt.sign(
    { id: user.id, username: user.username, role: user.role },
    process.env.JWT_SECRET || 'fallback_secret',
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
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback_secret');
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
