// ============================================================
// 集成测试公共桁架（与具体用例无关，供 integration_exam / isolation 等复用）
// 凭据全部走 env 回退，禁止硬编码生产口令。
// 本地自动加载 server/.env（dotenv 不覆盖已存在的 process.env，故 CI 显式 env 优先）。
// ============================================================
import crypto from 'crypto';
import path from 'path';
import { existsSync } from 'fs';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.resolve(__dirname, '../../.env');
if (existsSync(envPath)) dotenv.config({ path: envPath });

// 默认 127.0.0.1（规避 Windows/Node17+ 下 localhost→::1 而 server 仅绑 IPv4 的 ECONNREFUSED）
const BASE = process.env.EXAM_IT_BASE || 'http://127.0.0.1:3100/api';

/**
 * 测试库连接配置：CI 注入 service 容器凭据；本地沿用 server/.env 的 DB_*。
 * 破坏性清理护栏：库名不含 test/ci 时拒绝执行，防止误连生产库被 cleanup 物理删除；
 * 确需在其它库跑时显式设 EXAM_IT_ALLOW_UNSAFE_DB=1。
 */
export function resolveDbConfig() {
  const cfg = {
    host: process.env.EXAM_IT_DB_HOST || process.env.DB_HOST || 'localhost',
    port: Number(process.env.EXAM_IT_DB_PORT || process.env.DB_PORT || 3306),
    user: process.env.EXAM_IT_DB_USER || process.env.DB_USER || 'studyapp',
    password: process.env.EXAM_IT_DB_PASSWORD || process.env.DB_PASSWORD || '',
    database: process.env.EXAM_IT_DB_NAME || process.env.DB_NAME || 'study_test',
  };
  if (!/test|ci/i.test(cfg.database) && !process.env.EXAM_IT_ALLOW_UNSAFE_DB) {
    throw new Error(`[integrationHarness] 拒绝在非测试库执行破坏性清理: ${cfg.host}/${cfg.database}（确需请设 EXAM_IT_ALLOW_UNSAFE_DB=1）`);
  }
  return cfg;
}

export const API_BASE = BASE;

export const results = [];
export function check(name, cond, extra) {
  results.push({ name, ok: !!cond });
  console.log(`${cond ? '✅' : '❌'} ${name}${extra !== undefined ? '  ' + JSON.stringify(extra) : ''}`);
}

/** pass/fail 门禁：任一未通过即 exit 1（供 CI 阻断） */
export function reportExit() {
  const failed = results.filter((x) => !x.ok);
  console.log(`\n==== 集成联调结论：${results.length - failed.length}/${results.length} 通过 ====`);
  process.exit(failed.length ? 1 : 0);
}

export async function api(method, path, token, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch { /* ignore */ }
  return { status: res.status, data };
}

/**
 * 注册（兼容邮箱验证码强校验）：生产 register 必须带 6 位验证码，
 * 集成测试无法收邮件，故直接向 email_verifications 种 sha256(码) 哈希再带码注册。
 * 未强制校验的环境会忽略种入的码，两种情况皆兼容。
 */
export async function registerWithCode(db, payload, code = '654321') {
  // 种码表在极简 CI 库可能不存在；失败仅告警，不带码也能注册的环境不受影响。
  try {
    await db.execute(
      "UPDATE email_verifications SET consumed = 1 WHERE email = ? AND purpose = 'register' AND consumed = 0",
      [payload.email]
    );
    await db.execute(
      "INSERT INTO email_verifications (email, purpose, code_hash, expires_at) VALUES (?, 'register', ?, DATE_ADD(NOW(), INTERVAL 5 MINUTE))",
      [payload.email, crypto.createHash('sha256').update(code).digest('hex')]
    );
  } catch (e) {
    console.warn('[registerWithCode] 种邮箱验证码失败（忽略，继续尝试注册）:', e.code || e.message);
  }
  return api('POST', '/auth/register', null, { ...payload, emailCode: code });
}

/** 便捷：断言资源对调用方不可达（越权口径 403/404） */
export function checkBlocked(name, res) {
  check(name, res.status === 403 || res.status === 404, res.status);
}
