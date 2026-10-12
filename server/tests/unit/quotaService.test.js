/**
 * FR-606 quotaService 单测：getOrgPlan / checkQuota / recordUsage / getPeriodKey / registerByoKey。
 *
 * 策略：db 依赖注入，假 pool 按 SQL 子串路由（沿用 storageUsage/notification 范式）；logger vi.mock。
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../src/utils/logger.js', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import {
  getOrgPlan, checkQuota, recordUsage, getPeriodKey,
  listQuotaUsage, getPerRequestLimit, registerByoKey, DEFAULT_PLAN,
} from '../../src/utils/quotaService.js';

/**
 * 假 db：
 *   cfg.plans   {orgId: plan}
 *   cfg.quotas  {'PLAN|resource': {limit, period}}
 *   cfg.usage   {'org|resource|periodKey': used}
 *   cfg.circuit {orgId: 0|1}
 */
function makeFakeDb(cfg = {}) {
  const plans = cfg.plans || {};
  const quotas = cfg.quotas || {};
  const usage = cfg.usage || {};
  const circuit = cfg.circuit || {};
  const calls = [];
  const db = {
    execute: async (sql, params = []) => {
      const t = sql.trim();
      calls.push({ sql: t, params });

      if (/^SELECT plan FROM organizations WHERE id = \?/i.test(t)) {
        const plan = plans[params[0]];
        return [plan != null ? [{ plan }] : []];
      }
      if (/^SELECT `limit`, period FROM quotas WHERE plan_code = \? AND resource_type = \?/i.test(t)) {
        const key = `${params[0]}|${params[1]}`;
        return [quotas[key] ? [quotas[key]] : []];
      }
      if (/^SELECT circuit_broken FROM storage_usage WHERE org_id = \?/i.test(t)) {
        const c = circuit[params[0]];
        return [c != null ? [{ circuit_broken: c }] : []];
      }
      if (/^SELECT used FROM quota_usage WHERE org_id = \? AND resource_type = \? AND period_key = \?/i.test(t)) {
        const key = `${params[0]}|${params[1]}|${params[2]}`;
        return [usage[key] != null ? [{ used: usage[key] }] : []];
      }
      if (/^INSERT INTO quota_usage/i.test(t)) {
        return [{ affectedRows: 1 }];
      }
      if (/^SELECT resource_type, period, `limit` FROM quotas WHERE plan_code = \?/i.test(t)) {
        const prefix = `${params[0]}|`;
        const rows = Object.entries(quotas)
          .filter(([k]) => k.startsWith(prefix))
          .map(([k, v]) => ({ resource_type: k.slice(prefix.length), period: v.period, limit: v.limit }));
        return [rows];
      }
      if (/^INSERT INTO byo_key_registry/i.test(t)) {
        return [{ affectedRows: 1 }];
      }
      if (/^SELECT id FROM byo_key_registry WHERE user_id = \? AND provider = \?/i.test(t)) {
        return [[{ id: 7 }]];
      }
      return [[]];
    },
  };
  return { db, calls };
}

// ─── getOrgPlan ────────────────────────────────────────────
describe('getOrgPlan', () => {
  it('返回大写 plan', async () => {
    const { db } = makeFakeDb({ plans: { 5: 'free' } });
    expect(await getOrgPlan(db, 5)).toBe('FREE');
  });
  it('无行回落 FREE', async () => {
    const { db } = makeFakeDb({});
    expect(await getOrgPlan(db, 99)).toBe(DEFAULT_PLAN);
  });
});

// ─── getPeriodKey ──────────────────────────────────────────
describe('getPeriodKey', () => {
  const now = new Date('2026-03-15T10:00:00Z');
  it('monthly → YYYY-MM（UTC+8）', () => {
    expect(getPeriodKey('monthly', now)).toBe('2026-03');
  });
  it('yearly → YYYY', () => {
    expect(getPeriodKey('yearly', now)).toBe('2026');
  });
  it('total/per_request → TOTAL', () => {
    expect(getPeriodKey('total', now)).toBe('TOTAL');
    expect(getPeriodKey('per_request', now)).toBe('TOTAL');
  });
});

// ─── checkQuota ────────────────────────────────────────────
describe('checkQuota', () => {
  it('limit=-1 无限放行', async () => {
    const { db } = makeFakeDb({
      plans: { 5: 'PRO' },
      quotas: { 'PRO|ai_calls': { limit: -1, period: 'monthly' } },
    });
    const r = await checkQuota(db, 5, 'ai_calls', 100);
    expect(r.allowed).toBe(true);
    expect(r.limit).toBe(-1);
  });

  it('未定义该资源 → unrestricted 放行', async () => {
    const { db } = makeFakeDb({ plans: { 5: 'FREE' }, quotas: {} });
    const r = await checkQuota(db, 5, 'unknown_res', 1);
    expect(r.allowed).toBe(true);
    expect(r.reason).toBe('unrestricted');
  });

  it('orgId=null → no_org 放行', async () => {
    const { db } = makeFakeDb({});
    const r = await checkQuota(db, null, 'exam_count', 1);
    expect(r.allowed).toBe(true);
    expect(r.reason).toBe('no_org');
  });

  it('per_request 未超 → 放行', async () => {
    const { db } = makeFakeDb({
      plans: { 5: 'FREE' },
      quotas: { 'FREE|export_rows': { limit: 5000, period: 'per_request' } },
    });
    const r = await checkQuota(db, 5, 'export_rows', 4000);
    expect(r.allowed).toBe(true);
  });

  it('per_request 超限 → 429', async () => {
    const { db } = makeFakeDb({
      plans: { 5: 'FREE' },
      quotas: { 'FREE|export_rows': { limit: 5000, period: 'per_request' } },
    });
    const r = await checkQuota(db, 5, 'export_rows', 6000);
    expect(r.allowed).toBe(false);
    expect(r.status).toBe(429);
    expect(r.reason).toBe('quota_exceeded');
  });

  it('monthly 累计未超 → 放行', async () => {
    const pk = getPeriodKey('monthly');
    const { db } = makeFakeDb({
      plans: { 5: 'FREE' },
      quotas: { 'FREE|ai_calls': { limit: 500, period: 'monthly' } },
      usage: { [`5|ai_calls|${pk}`]: 499 },
    });
    const r = await checkQuota(db, 5, 'ai_calls', 1);
    expect(r.allowed).toBe(true);
    expect(r.usage).toBe(499);
  });

  it('monthly 累计超限 → 429', async () => {
    const pk = getPeriodKey('monthly');
    const { db } = makeFakeDb({
      plans: { 5: 'FREE' },
      quotas: { 'FREE|ai_calls': { limit: 500, period: 'monthly' } },
      usage: { [`5|ai_calls|${pk}`]: 500 },
    });
    const r = await checkQuota(db, 5, 'ai_calls', 1);
    expect(r.allowed).toBe(false);
    expect(r.status).toBe(429);
  });

  it('upload_bytes 熔断 → 429 circuit_broken', async () => {
    const { db } = makeFakeDb({
      plans: { 5: 'FREE' },
      quotas: { 'FREE|upload_bytes': { limit: 5368709120, period: 'monthly' } },
      circuit: { 5: 1 },
    });
    const r = await checkQuota(db, 5, 'upload_bytes', 1024);
    expect(r.allowed).toBe(false);
    expect(r.reason).toBe('circuit_broken');
    expect(r.status).toBe(429);
  });

  it('upload_bytes 未熔断且未超 → 放行', async () => {
    const pk = getPeriodKey('monthly');
    const { db } = makeFakeDb({
      plans: { 5: 'FREE' },
      quotas: { 'FREE|upload_bytes': { limit: 1000000, period: 'monthly' } },
      circuit: { 5: 0 },
      usage: { [`5|upload_bytes|${pk}`]: 500000 },
    });
    const r = await checkQuota(db, 5, 'upload_bytes', 1000);
    expect(r.allowed).toBe(true);
  });
});

// ─── recordUsage ───────────────────────────────────────────
describe('recordUsage', () => {
  it('monthly → UPSERT quota_usage', async () => {
    const { db, calls } = makeFakeDb({
      plans: { 5: 'FREE' },
      quotas: { 'FREE|exam_count': { limit: 200, period: 'yearly' } },
    });
    const r = await recordUsage(db, 5, 'exam_count', 1);
    expect(r.recorded).toBe(true);
    const upsert = calls.find((c) => /INSERT INTO quota_usage/i.test(c.sql));
    expect(upsert).toBeTruthy();
    expect(upsert.params).toEqual([5, 'exam_count', getPeriodKey('yearly'), 1]);
  });

  it('per_request → 不记录', async () => {
    const { db, calls } = makeFakeDb({
      plans: { 5: 'FREE' },
      quotas: { 'FREE|export_rows': { limit: 5000, period: 'per_request' } },
    });
    const r = await recordUsage(db, 5, 'export_rows', 1);
    expect(r.recorded).toBe(false);
    expect(calls.find((c) => /INSERT INTO quota_usage/i.test(c.sql))).toBeUndefined();
  });

  it('无配额行 → 不记录', async () => {
    const { db } = makeFakeDb({ plans: { 5: 'FREE' }, quotas: {} });
    const r = await recordUsage(db, 5, 'mystery', 1);
    expect(r.recorded).toBe(false);
  });

  it('orgId=null → 不记录', async () => {
    const { db } = makeFakeDb({});
    const r = await recordUsage(db, null, 'exam_count', 1);
    expect(r.recorded).toBe(false);
  });
});

// ─── listQuotaUsage / getPerRequestLimit ───────────────────
describe('listQuotaUsage', () => {
  it('返回各资源快照，per_request usage=null', async () => {
    const pk = getPeriodKey('monthly');
    const { db } = makeFakeDb({
      plans: { 5: 'FREE' },
      quotas: {
        'FREE|ai_calls': { limit: 500, period: 'monthly' },
        'FREE|export_rows': { limit: 5000, period: 'per_request' },
      },
      usage: { [`5|ai_calls|${pk}`]: 42 },
    });
    const rows = await listQuotaUsage(db, 5);
    const ai = rows.find((r) => r.resource_type === 'ai_calls');
    const ex = rows.find((r) => r.resource_type === 'export_rows');
    expect(ai.usage).toBe(42);
    expect(ex.usage).toBeNull();
  });
});

describe('getPerRequestLimit', () => {
  it('有配额 → 返回 limit', async () => {
    const { db } = makeFakeDb({
      plans: { 5: 'FREE' },
      quotas: { 'FREE|export_rows': { limit: 3000, period: 'per_request' } },
    });
    expect(await getPerRequestLimit(db, 5, 'export_rows', 5000)).toBe(3000);
  });
  it('无 org → 回落 fallback', async () => {
    const { db } = makeFakeDb({});
    expect(await getPerRequestLimit(db, null, 'export_rows', 5000)).toBe(5000);
  });
});

// ─── registerByoKey ────────────────────────────────────────
describe('registerByoKey', () => {
  it('返回 sha256 指纹并 UPSERT', async () => {
    const { db, calls } = makeFakeDb({});
    const r = await registerByoKey(db, { user_id: 3, provider: 'gemini', key_preview: 'abc123' });
    expect(r.id).toBe(7);
    expect(r.key_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(calls.find((c) => /INSERT INTO byo_key_registry/i.test(c.sql))).toBeTruthy();
  });
});
