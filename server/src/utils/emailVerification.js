/**
 * 邮箱验证码服务（P0 安全修复：验证码生成/存储/校验全部在服务端完成）
 *
 * 设计要点：
 *  - 验证码用 crypto.randomInt（CSPRNG）生成，库中只存 sha256 哈希，不存明文
 *  - 一次性：校验成功即置 consumed=1；同 email+purpose 重复申请时旧码作废
 *  - 限频：60 秒内不允许重复发送（查最近一条 created_at）
 *  - 防暴力：连续错误 5 次作废该码
 *  - pool 作为参数注入，便于单元测试 mock
 */
import crypto from 'crypto';

export const CODE_TTL_MS = 5 * 60 * 1000;      // 有效期 5 分钟
export const RESEND_INTERVAL_S = 60;            // 重发间隔 60 秒
export const MAX_ATTEMPTS = 5;                  // 最大校验尝试次数
export const VALID_PURPOSES = ['register', 'reset'];

/** 生成 6 位数字验证码（CSPRNG） */
export function generateCode() {
  return String(crypto.randomInt(100000, 1000000));
}

/** 验证码哈希（sha256，无独立盐：验证码本身高熵短生命周期，一次性使用） */
export function hashCode(code) {
  return crypto.createHash('sha256').update(String(code)).digest('hex');
}

/**
 * 创建验证码记录（作废旧码 + 限频检查）
 * @returns {Promise<{ok:boolean, code?:string, reason?:string}>}
 *   reason: 'too_soon'=60s 内重复申请 | 'bad_purpose'
 */
export async function createVerificationCode(pool, email, purpose) {
  if (!VALID_PURPOSES.includes(purpose)) {
    return { ok: false, reason: 'bad_purpose' };
  }
  // 限频：最近一条记录在 RESEND_INTERVAL_S 内则拒绝
  const [recent] = await pool.execute(
    `SELECT created_at FROM email_verifications
     WHERE email = ? AND purpose = ?
     ORDER BY id DESC LIMIT 1`,
    [email, purpose]
  );
  if (recent.length > 0) {
    const ageSec = (Date.now() - new Date(recent[0].created_at).getTime()) / 1000;
    if (ageSec < RESEND_INTERVAL_S) {
      return { ok: false, reason: 'too_soon' };
    }
  }
  // 作废此前所有未使用的码（消费时以最新记录为准，旧记录直接标记 consumed 防止堆积校验）
  await pool.execute(
    `UPDATE email_verifications SET consumed = 1
     WHERE email = ? AND purpose = ? AND consumed = 0`,
    [email, purpose]
  );
  const code = generateCode();
  const expires = new Date(Date.now() + CODE_TTL_MS);
  await pool.execute(
    `INSERT INTO email_verifications (email, purpose, code_hash, expires_at)
     VALUES (?, ?, ?, ?)`,
    [email, purpose, hashCode(code), expires]
  );
  return { ok: true, code };
}

/**
 * 校验并消费验证码（一次性）
 * @returns {Promise<{ok:boolean, reason?:string}>}
 *   reason: 'not_found'=无有效码 | 'expired' | 'too_many_attempts' | 'wrong_code'
 */
export async function consumeVerificationCode(pool, email, purpose, code) {
  const [rows] = await pool.execute(
    `SELECT id, code_hash, expires_at, attempts FROM email_verifications
     WHERE email = ? AND purpose = ? AND consumed = 0
     ORDER BY id DESC LIMIT 1`,
    [email, purpose]
  );
  if (rows.length === 0) return { ok: false, reason: 'not_found' };
  const row = rows[0];
  if (new Date(row.expires_at).getTime() < Date.now()) {
    await pool.execute('UPDATE email_verifications SET consumed = 1 WHERE id = ?', [row.id]);
    return { ok: false, reason: 'expired' };
  }
  if (row.attempts >= MAX_ATTEMPTS) {
    await pool.execute('UPDATE email_verifications SET consumed = 1 WHERE id = ?', [row.id]);
    return { ok: false, reason: 'too_many_attempts' };
  }
  if (hashCode(code) !== row.code_hash) {
    await pool.execute('UPDATE email_verifications SET attempts = attempts + 1 WHERE id = ?', [row.id]);
    return { ok: false, reason: 'wrong_code' };
  }
  await pool.execute('UPDATE email_verifications SET consumed = 1 WHERE id = ?', [row.id]);
  return { ok: true };
}

/** 服务端 EmailJS 配置是否齐备（前端不再持有密钥） */
export function isEmailServiceConfigured() {
  return !!(process.env.EMAILJS_SERVICE_ID && process.env.EMAILJS_TEMPLATE_ID && process.env.EMAILJS_PUBLIC_KEY);
}

/**
 * 邮箱验证是否强制开启：
 *  - 生产环境：配置了密钥必须开启；未配置则拒绝服务并报错（防止静默放行）
 *  - 非生产：未配置密钥时自动关闭（开发体验），并打印一次告警
 */
let _warned = false;
export function isEmailVerificationEnforced() {
  if (isEmailServiceConfigured()) return true;
  if (process.env.NODE_ENV === 'production') return true; // 生产缺配置 → 发送时报错，不放行
  if (!_warned) {
    _warned = true;
    console.warn('[emailVerification] 开发环境未配置 EMAILJS_* 密钥，邮箱验证码校验临时跳过（生产环境强制启用）');
  }
  return false;
}

/**
 * 通过 EmailJS REST API 发送验证码邮件（服务端直连，密钥不出服务器）
 * @throws 发送失败时抛错（含 EmailJS 返回原因）
 */
export async function sendVerificationEmail(email, code, purpose) {
  const { EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, EMAILJS_PUBLIC_KEY } = process.env;
  if (!EMAILJS_SERVICE_ID || !EMAILJS_TEMPLATE_ID || !EMAILJS_PUBLIC_KEY) {
    const err = new Error('邮件服务未配置');
    err.code = 'EMAIL_NOT_CONFIGURED';
    throw err;
  }
  const expireTime = new Date(Date.now() + CODE_TTL_MS).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  const subject = purpose === 'register' ? '注册验证码' : '重置密码验证码';
  const resp = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      service_id: EMAILJS_SERVICE_ID,
      template_id: EMAILJS_TEMPLATE_ID,
      user_id: EMAILJS_PUBLIC_KEY,
      template_params: { to_email: email, passcode: code, time: expireTime, from_name: 'Study-test', subject },
    }),
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    const err = new Error(`邮件发送失败(${resp.status}): ${text.slice(0, 200)}`);
    err.code = 'EMAIL_SEND_FAILED';
    throw err;
  }
}
