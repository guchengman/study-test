/**
 * 邮箱验证码服务单元测试（P0 安全修复的 CI 门禁）
 *
 * 不依赖 MySQL：用内存 FakePool 模拟 email_verifications 表的 5 种 SQL 行为，
 * 覆盖：CSPRNG 码格式、哈希稳定、60s 限频、旧码作废、错误计数、过期、一次性。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  generateCode,
  hashCode,
  createVerificationCode,
  consumeVerificationCode,
  CODE_TTL_MS,
  RESEND_INTERVAL_S,
  MAX_ATTEMPTS,
} from '../../src/utils/emailVerification.js';

/** 内存版 pool：按 SQL 前缀路由，行为与真实表一致 */
class FakePool {
  constructor() {
    this.rows = [];
    this.idSeq = 1;
  }
  async execute(sql, params) {
    const s = sql.replace(/\s+/g, ' ').trim();
    if (s.startsWith('SELECT created_at')) {
      const [email, purpose] = params;
      const m = this.rows
        .filter(r => r.email === email && r.purpose === purpose)
        .sort((a, b) => b.id - a.id);
      return [m.length ? [{ created_at: m[0].created_at }] : []];
    }
    if (s.startsWith('UPDATE email_verifications SET consumed = 1 WHERE email')) {
      const [email, purpose] = params;
      this.rows.forEach(r => {
        if (r.email === email && r.purpose === purpose && !r.consumed) r.consumed = 1;
      });
      return [{ affectedRows: 0 }];
    }
    if (s.startsWith('INSERT INTO email_verifications')) {
      const [email, purpose, code_hash, expires_at] = params;
      this.rows.push({
        id: this.idSeq++, email, purpose, code_hash, expires_at,
        attempts: 0, consumed: 0, created_at: new Date(),
      });
      return [{ insertId: this.idSeq - 1 }];
    }
    if (s.startsWith('SELECT id, code_hash, expires_at, attempts')) {
      const [email, purpose] = params;
      const m = this.rows
        .filter(r => r.email === email && r.purpose === purpose && !r.consumed)
        .sort((a, b) => b.id - a.id);
      return [m.length
        ? [{ id: m[0].id, code_hash: m[0].code_hash, expires_at: m[0].expires_at, attempts: m[0].attempts }]
        : []];
    }
    if (s.startsWith('UPDATE email_verifications SET consumed = 1 WHERE id')) {
      const r = this.rows.find(x => x.id === params[0]);
      if (r) r.consumed = 1;
      return [{}];
    }
    if (s.startsWith('UPDATE email_verifications SET attempts')) {
      const r = this.rows.find(x => x.id === params[0]);
      if (r) r.attempts += 1;
      return [{}];
    }
    throw new Error('FakePool 未处理的 SQL: ' + s);
  }
}

const EMAIL = 'user@example.com';
let pool;

beforeEach(() => {
  pool = new FakePool();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-11T08:00:00Z'));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('generateCode / hashCode', () => {
  it('生成 6 位数字码且分布无重复倾向', () => {
    const codes = new Set();
    for (let i = 0; i < 200; i++) {
      const c = generateCode();
      expect(c).toMatch(/^\d{6}$/);
      codes.add(c);
    }
    expect(codes.size).toBeGreaterThan(180);
  });

  it('hashCode 为 64 位 sha256 hex 且稳定', () => {
    const h1 = hashCode('123456');
    expect(h1).toMatch(/^[0-9a-f]{64}$/);
    expect(hashCode('123456')).toBe(h1);
    expect(hashCode('123457')).not.toBe(h1);
  });
});

describe('createVerificationCode', () => {
  it('非法 purpose 被拒绝', async () => {
    const r = await createVerificationCode(pool, EMAIL, 'bogus');
    expect(r).toEqual({ ok: false, reason: 'bad_purpose' });
  });

  it('首次创建成功并落库（只存哈希不存明文）', async () => {
    const r = await createVerificationCode(pool, EMAIL, 'register');
    expect(r.ok).toBe(true);
    expect(r.code).toMatch(/^\d{6}$/);
    expect(pool.rows).toHaveLength(1);
    expect(pool.rows[0].code_hash).toBe(hashCode(r.code));
    expect(JSON.stringify(pool.rows)).not.toContain(r.code); // 库内无明文
  });

  it(`${RESEND_INTERVAL_S}s 内重复申请被限频 too_soon`, async () => {
    await createVerificationCode(pool, EMAIL, 'register');
    const r2 = await createVerificationCode(pool, EMAIL, 'register');
    expect(r2).toEqual({ ok: false, reason: 'too_soon' });
  });

  it('超过重发间隔后新码作废旧码', async () => {
    const c1 = await createVerificationCode(pool, EMAIL, 'register');
    vi.advanceTimersByTime((RESEND_INTERVAL_S + 1) * 1000);
    const c2 = await createVerificationCode(pool, EMAIL, 'register');
    expect(c2.ok).toBe(true);
    expect(pool.rows.filter(r => !r.consumed)).toHaveLength(1); // 仅最新码存活
    const old = await consumeVerificationCode(pool, EMAIL, 'register', c1.code);
    expect(old.ok).toBe(false);
  });

  it('不同 purpose 互不影响', async () => {
    await createVerificationCode(pool, EMAIL, 'register');
    const r = await createVerificationCode(pool, EMAIL, 'reset');
    expect(r.ok).toBe(true); // register 刚发过，不应触发 reset 限频
  });
});

describe('consumeVerificationCode', () => {
  it('正确码校验通过且一次性消费', async () => {
    const c = await createVerificationCode(pool, EMAIL, 'register');
    expect((await consumeVerificationCode(pool, EMAIL, 'register', c.code)).ok).toBe(true);
    const again = await consumeVerificationCode(pool, EMAIL, 'register', c.code);
    expect(again).toEqual({ ok: false, reason: 'not_found' });
  });

  it('无记录时返回 not_found', async () => {
    expect(await consumeVerificationCode(pool, EMAIL, 'register', '123456'))
      .toEqual({ ok: false, reason: 'not_found' });
  });

  it(`连续错误 ${MAX_ATTEMPTS} 次后正确码也被作废（防暴力）`, async () => {
    const c = await createVerificationCode(pool, EMAIL, 'register');
    const wrong = c.code === '000000' ? '000001' : '000000';
    for (let i = 0; i < MAX_ATTEMPTS; i++) {
      const r = await consumeVerificationCode(pool, EMAIL, 'register', wrong);
      expect(r).toEqual({ ok: false, reason: 'wrong_code' });
    }
    const after = await consumeVerificationCode(pool, EMAIL, 'register', c.code);
    expect(after).toEqual({ ok: false, reason: 'too_many_attempts' });
  });

  it('超过 TTL 的码返回 expired 并被置 consumed', async () => {
    const c = await createVerificationCode(pool, EMAIL, 'register');
    vi.advanceTimersByTime(CODE_TTL_MS + 1000);
    const r = await consumeVerificationCode(pool, EMAIL, 'register', c.code);
    expect(r).toEqual({ ok: false, reason: 'expired' });
    expect(pool.rows[0].consumed).toBe(1);
  });
});
