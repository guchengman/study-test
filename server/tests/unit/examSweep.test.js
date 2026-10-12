/**
 * FR-204 自动交卷（sweep）分页收卷逻辑单测。
 *
 * 策略：不 mock db.js（mysql2 createPool 惰性连接、无副作用），
 * 通过 sweepExpiredAttempts / sweepSingleAttempt 的 opts.db 依赖注入假 pool，
 * 假 pool 按 SQL 子串路由，模拟候选计数、分页取出、FOR UPDATE 重查与 UPDATE 落库。
 * logger 用 vi.mock 捕获告警断言。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { sweepExpiredAttempts, sweepSingleAttempt, parseJsonSafe } from '../../src/utils/examSweep.js';
import log from '../../src/utils/logger.js';

vi.mock('../../src/utils/logger.js', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

/**
 * 构造假 db。
 * @param {Object} cfg
 * @param {number} cfg.candidates        COUNT(*) 返回的过期候选总数
 * @param {Array<number>} cfg.ids        分页 collect 依次吐出的 attempt id 队列
 * @param {string} cfg.statusAtSubmit   FOR UPDATE 重查返回的 status（默认 in_progress）
 * @param {boolean} cfg.singleHit       sweepSingleAttempt 定向探针是否命中
 */
function makeFakeDb(cfg = {}) {
  const {
    candidates = 0,
    ids = [],
    statusAtSubmit = 'in_progress',
    singleHit = true,
  } = cfg;

  const calls = { collect: [], updates: [], getConnection: 0, commit: 0, rollback: 0, release: 0 };
  let queue = [...ids];

  const conn = {
    beginTransaction: vi.fn(),
    commit: async () => { calls.commit += 1; },
    rollback: async () => { calls.rollback += 1; },
    release: () => { calls.release += 1; },
    execute: async (sql, params) => {
      if (sql.includes('FOR UPDATE')) {
        if (statusAtSubmit === null) return [[]]; // attempt 不存在
        return [[{ status: statusAtSubmit, answers: '{}', exam_id: 7 }]];
      }
      if (sql.includes('SELECT question_set FROM exams')) {
        return [[{ question_set: '[]' }]]; // 空题集：gradeAttempt 无需查 questions
      }
      if (/^UPDATE/.test(sql.trim())) {
        calls.updates.push({ id: params[params.length - 1], status: sql.includes("status = 'auto_submitted'") ? 'auto_submitted' : '?' });
        return [{ affectedRows: 1 }];
      }
      return [[]];
    },
  };

  const db = {
    execute: async (sql, params) => {
      if (sql.includes('COUNT(*)')) {
        return [[{ c: candidates }]];
      }
      if (sql.includes('SELECT a.id FROM exam_attempts')) {
        const limit = params[params.length - 1];
        const page = queue.splice(0, limit);
        calls.collect.push(limit);
        return [page.map((id) => ({ id }))];
      }
      if (sql.includes('SELECT id FROM exam_attempts WHERE id = ?')) {
        return [singleHit ? [{ id: params[0] }] : []];
      }
      return [[]];
    },
    getConnection: async () => {
      calls.getConnection += 1;
      return conn;
    },
  };

  return { db, calls, conn };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('sweepExpiredAttempts 分页', () => {
  it('候选 120、batchSize=50 → 分 3 页（50/50/20）全部收卷', async () => {
    const ids = Array.from({ length: 120 }, (_, i) => i + 1);
    const { db, calls } = makeFakeDb({ candidates: 120, ids });

    const processed = await sweepExpiredAttempts(null, null, null, { db, batchSize: 50, maxRows: 200 });

    expect(processed).toBe(120);
    expect(calls.collect).toEqual([50, 50, 20]);
    expect(calls.updates.length).toBe(120);
    expect(calls.updates.every((u) => u.status === 'auto_submitted')).toBe(true);
  });

  it('单次调用 maxRows 截断生效：候选充足时只取一页 50 条', async () => {
    const ids = Array.from({ length: 300 }, (_, i) => i + 1);
    const { db, calls } = makeFakeDb({ candidates: 300, ids });

    const processed = await sweepExpiredAttempts(null, null, null, { db, batchSize: 50, maxRows: 50 });

    expect(processed).toBe(50);
    expect(calls.collect).toEqual([50]); // budget=50 耗尽，仅 1 次查询
  });

  it('无候选时不发起分页查询', async () => {
    const { db, calls } = makeFakeDb({ candidates: 0, ids: [] });
    const processed = await sweepExpiredAttempts(1, 2, null, { db });
    expect(processed).toBe(0);
    expect(calls.collect.length).toBe(0);
  });
});

describe('sweepExpiredAttempts 幂等', () => {
  it('FOR UPDATE 重查 status≠in_progress → 不 UPDATE、不计入 processed', async () => {
    const { db, calls } = makeFakeDb({ candidates: 3, ids: [1, 2, 3], statusAtSubmit: 'submitted' });

    const processed = await sweepExpiredAttempts(null, null, null, { db, batchSize: 50, maxRows: 200 });

    expect(processed).toBe(0);
    expect(calls.updates.length).toBe(0);
    // 每条仍走事务但只 commit 回滚路径不触发；连接必须归还
    expect(calls.getConnection).toBe(3);
    expect(calls.release).toBe(3);
  });

  it('FOR UPDATE 重查行不存在（并发删除）→ 同样跳过', async () => {
    const { db, calls } = makeFakeDb({ candidates: 1, ids: [9], statusAtSubmit: null });
    const processed = await sweepExpiredAttempts(null, null, null, { db });
    expect(processed).toBe(0);
    expect(calls.updates.length).toBe(0);
  });
});

describe('sweepExpiredAttempts 积压告警（PRD R11）', () => {
  it('候选数 > 100 时 log.warn 一次', async () => {
    const { db } = makeFakeDb({ candidates: 150, ids: [1] });
    await sweepExpiredAttempts(null, null, null, { db, maxRows: 1 });
    expect(log.warn).toHaveBeenCalledTimes(1);
    const payload = log.warn.mock.calls[0][0];
    expect(payload.msg).toBe('exam_sweep_backlog');
    expect(payload.candidateCount).toBe(150);
  });

  it('候选数 ≤ 100 不告警', async () => {
    const { db } = makeFakeDb({ candidates: 100, ids: [] });
    await sweepExpiredAttempts(null, null, null, { db });
    expect(log.warn).not.toHaveBeenCalled();
  });
});

describe('sweepSingleAttempt 定向收卷', () => {
  it('探针命中（in_progress 且过期）→ 仅收目标 attempt', async () => {
    const { db, calls } = makeFakeDb({ singleHit: true });

    const done = await sweepSingleAttempt(42, { db });

    expect(done).toBe(true);
    expect(calls.updates).toEqual([{ id: 42, status: 'auto_submitted' }]);
    expect(calls.collect.length).toBe(0); // 不触发全卷分页扫描
  });

  it('探针未命中（已提交/未过期）→ 直接返回 false 且不开事务', async () => {
    const { db, calls } = makeFakeDb({ singleHit: false });

    const done = await sweepSingleAttempt(42, { db });

    expect(done).toBe(false);
    expect(calls.getConnection).toBe(0);
    expect(calls.updates.length).toBe(0);
  });
});

describe('parseJsonSafe', () => {
  it('字符串/对象/非法 JSON/null 兼容', () => {
    expect(parseJsonSafe('[1,2]', [])).toEqual([1, 2]);
    expect(parseJsonSafe({ a: 1 }, null)).toEqual({ a: 1 });
    expect(parseJsonSafe('not-json', 'fb')).toBe('fb');
    expect(parseJsonSafe(null, 'fb')).toBe('fb');
  });
});
