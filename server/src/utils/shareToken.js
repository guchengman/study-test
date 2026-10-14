// 分享体验卷的签名令牌：载荷只放 { code, qids }，不含任何答案。
// 密钥复用生产强制存在的 JWT_SECRET，禁止硬编码；缺失/过短即抛（与 index.js 启动校验一致）。
import jwt from 'jsonwebtoken';

function secret() {
  const s = process.env.JWT_SECRET;
  if (!s || String(s).trim().length < 16) {
    throw new Error('JWT_SECRET 未配置或过短，无法签发分享令牌');
  }
  return s;
}

export function signShareToken(payload, { expiresIn = '30m' } = {}) {
  return jwt.sign({ code: payload.code, qids: payload.qids }, secret(), { expiresIn });
}

export function verifyShareToken(token) {
  // 抛错即视为无效；调用方据此返回 400
  const p = jwt.verify(token, secret());
  return { code: p.code, qids: Array.isArray(p.qids) ? p.qids.map(Number) : [] };
}
