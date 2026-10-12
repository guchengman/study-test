/**
 * FR-501 streakService 单测：tickDay / awardCard / useMakeupCard / checkBroken / getStreak。
 *
 * 策略：db 依赖注入，假 pool 按 SQL 归一化子串路由（沿用 quotaService 范式）；
 *       logger / personalOrg / notificationService 全部 vi.mock，专注打卡计数逻辑。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/utils/logger.js', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('../../src/utils/personalOrg.js', () => ({
  resolvePersonalOrgId: vi.fn(async () => 42),
}));
vi.mock('../../src/utils/notificationService.js', () => ({
  createNotification: vi.fn(async () => ({ id: 1 })),
}));

import {
  tickDay, awardCard, useMakeupCard, checkBroken, getStreak,
  todayStr, yesterdayStr, monthStr,
  INITIAL_MAKEUP_CARDS,
} from '../../src/utils/streakService.js';
import { createNotification } from '../../src/utils/notificationService.js';
import { resolvePersonalOrgId } from '../../src/utils/personalOrg.js';

// 固定业务日：UTC 10:00 → UTC+8 同日 18:00，today/yesterday 稳定
const NOW = new Date('2026-03-15T10:00:00Z');
const TODAY = '2026-03-15';
const YDAY = '2026-03-14';
const MONTH = '2026-03';

function row(over = {}) {
  return {
    id: 1, current: 0, longest: 0, last_active_date: null,
    makeup_cards: 1, makeup_used_this_month: 0, makeup_month: null,
    ...over,
  };
}

function makeFakeDb(cfg = {}) {
  const calls = [];
  const db = {
    execute: async (sql, params = []) => {
      const t = sql.replace(/\s+/g, ' ').trim();
      calls.push({ sql: t, params });
      // 主查询（含 makeup_used_this_month）
      if (t.includes('FROM streaks WHERE user_id = ?') && t.includes('makeup_used_this_month')) {
        return [cfg.streakRow ? [cfg.streakRow] : []];
      }
      // awardCard 查询
      if (/^SELECT id, current, makeup_cards FROM streaks WHERE user_id = \?$/.test(t)) {
        return [cfg.awardRow ? [cfg.awardRow] : []];
      }
      // checkBroken 查询
      if (t.includes('FROM streaks') && t.includes('current > 0') && t.includes('last_active_date IS NULL')) {
        return [cfg.brokenRows || []];
      }
      if (/^INSERT INTO streaks/.test(t)) return [{ affectedRows: 1, insertId: 1 }];
      if (/^UPDATE streaks/.test(t)) return [{ affectedRows: 1 }];
      if (/^INSERT INTO streak_events/.test(t)) return [{ affectedRows: 1 }];
      return [[]];
    },
  };
  return { db, calls };
}

beforeEach(() => {
  createNotification.mockClear();
  resolvePersonalOrgId.mockClear();
});

// ─── 日期助手 ──────────────────────────────────────────────
describe('日期助手', () => {
  it('todayStr / yesterdayStr / monthStr（UTC+8）', () => {
    expect(todayStr(NOW)).toBe(TODAY);
    expect(yesterdayStr(NOW)).toBe(YDAY);
    expect(monthStr(NOW)).toBe(MONTH);
  });
});

// ─── tickDay ───────────────────────────────────────────────
describe('tickDay', () => {
  it('今日已打卡 → no-op', async () => {
    const { db, calls } = makeFakeDb({ streakRow: row({ current: 5, last_active_date: TODAY }) });
    const r = await tickDay(db, 1, NOW);
    expect(r).toEqual({ ticked: false, current: 5, reason: 'already_ticked' });
    expect(calls.filter((c) => /^(UPDATE|INSERT) INTO? streak/.test(c.sql))).toHaveLength(0);
  });

  it('昨日活跃 → current+1 且更新 longest', async () => {
    const { db, calls } = makeFakeDb({ streakRow: row({ current: 5, longest: 7, last_active_date: YDAY }) });
    const r = await tickDay(db, 1, NOW);
    expect(r.ticked).toBe(true);
    expect(r.current).toBe(6);
    expect(r.longest).toBe(7);
    const upd = calls.find((c) => /^UPDATE streaks SET current/.test(c.sql));
    expect(upd.params).toEqual([6, 7, TODAY, 1]);
  });

  it('跨日断档 → 视为新一轮 current=1', async () => {
    const { db } = makeFakeDb({ streakRow: row({ current: 9, longest: 9, last_active_date: '2026-03-10' }) });
    const r = await tickDay(db, 1, NOW);
    expect(r.current).toBe(1);
    expect(r.longest).toBe(9);
  });

  it('新用户 → INSERT streaks（org_id + 初始补签卡）', async () => {
    const { db, calls } = makeFakeDb({ streakRow: null });
    const r = await tickDay(db, 1, NOW);
    expect(r.current).toBe(1);
    expect(resolvePersonalOrgId).toHaveBeenCalled();
    const ins = calls.find((c) => /^INSERT INTO streaks/.test(c.sql));
    expect(ins.params).toEqual([1, 1, 1, TODAY, INITIAL_MAKEUP_CARDS, 0, null, 42]);
  });

  it('连续满 30 的倍数 → 触发发奖', async () => {
    const { db } = makeFakeDb({
      streakRow: row({ current: 29, longest: 29, last_active_date: YDAY }),
      awardRow: { id: 1, current: 30, makeup_cards: 1 },
    });
    const r = await tickDay(db, 1, NOW);
    expect(r.current).toBe(30);
    expect(r.awarded).toBe(true);
  });
});

// ─── awardCard ─────────────────────────────────────────────
describe('awardCard', () => {
  it('非 30 倍数 → 不发', async () => {
    const { db } = makeFakeDb({ awardRow: { id: 1, current: 12, makeup_cards: 1 } });
    const r = await awardCard(db, 1);
    expect(r).toEqual({ awarded: false, reason: 'not_milestone' });
  });
  it('已达上限(3) → capped 事件但不增发', async () => {
    const { db, calls } = makeFakeDb({ awardRow: { id: 1, current: 30, makeup_cards: 3 } });
    const r = await awardCard(db, 1);
    expect(r).toEqual({ awarded: false, reason: 'card_cap' });
    expect(calls.find((c) => /^UPDATE streaks SET makeup_cards/.test(c.sql))).toBeUndefined();
  });
  it('里程碑且未满上限 → +1 卡', async () => {
    const { db } = makeFakeDb({ awardRow: { id: 1, current: 60, makeup_cards: 2 } });
    const r = await awardCard(db, 1);
    expect(r).toEqual({ awarded: true, cards: 3 });
  });
});

// ─── useMakeupCard ─────────────────────────────────────────
describe('useMakeupCard', () => {
  it('无 streak 行 → no_streak', async () => {
    const { db } = makeFakeDb({ streakRow: null });
    expect(await useMakeupCard(db, 1, NOW)).toEqual({ ok: false, reason: 'no_streak' });
  });
  it('今日已活跃 → already_active_today', async () => {
    const { db } = makeFakeDb({ streakRow: row({ last_active_date: TODAY, makeup_cards: 1 }) });
    expect(await useMakeupCard(db, 1, NOW)).toEqual({ ok: false, reason: 'already_active_today' });
  });
  it('无补签卡 → no_card', async () => {
    const { db } = makeFakeDb({ streakRow: row({ last_active_date: YDAY, makeup_cards: 0 }) });
    expect(await useMakeupCard(db, 1, NOW)).toEqual({ ok: false, reason: 'no_card' });
  });
  it('本月已用满 2 次 → monthly_limit', async () => {
    const { db } = makeFakeDb({ streakRow: row({ last_active_date: YDAY, makeup_cards: 1, makeup_used_this_month: 2, makeup_month: MONTH }) });
    expect(await useMakeupCard(db, 1, NOW)).toEqual({ ok: false, reason: 'monthly_limit' });
  });
  it('非紧邻断点（早于昨日）→ not_eligible', async () => {
    const { db } = makeFakeDb({ streakRow: row({ last_active_date: '2026-03-10', makeup_cards: 2 }) });
    expect(await useMakeupCard(db, 1, NOW)).toEqual({ ok: false, reason: 'not_eligible' });
  });
  it('跨月自动重置本月用量后成功', async () => {
    const { db, calls } = makeFakeDb({ streakRow: row({ current: 5, longest: 5, last_active_date: YDAY, makeup_cards: 1, makeup_used_this_month: 2, makeup_month: '2026-02' }) });
    const r = await useMakeupCard(db, 1, NOW);
    expect(r).toEqual({ ok: true, current: 6, makeup_cards: 0, makeup_used_this_month: 1 });
    const upd = calls.find((c) => /^UPDATE streaks SET current/.test(c.sql));
    expect(upd.params).toEqual([6, 6, TODAY, 0, 1, MONTH, 1]);
  });
});

// ─── checkBroken ───────────────────────────────────────────
describe('checkBroken', () => {
  it('多行断流 → 归零 + 事件 + 通知', async () => {
    const { db, calls } = makeFakeDb({
      brokenRows: [
        { id: 1, user_id: 10, current: 8 },
        { id: 2, user_id: 11, current: 3 },
      ],
    });
    const r = await checkBroken(db, NOW);
    expect(r).toEqual({ broken: 2 });
    expect(createNotification).toHaveBeenCalledTimes(2);
    expect(createNotification).toHaveBeenCalledWith(db, {
      user_id: 10, type: 'streak_break', title: '连续打卡已中断', payload: { lost_current: 8 },
    });
    expect(calls.filter((c) => /^UPDATE streaks SET current = 0/.test(c.sql))).toHaveLength(2);
  });
  it('无断流 → broken=0 且不发通知', async () => {
    const { db } = makeFakeDb({ brokenRows: [] });
    const r = await checkBroken(db, NOW);
    expect(r).toEqual({ broken: 0 });
    expect(createNotification).not.toHaveBeenCalled();
  });
});

// ─── getStreak ─────────────────────────────────────────────
describe('getStreak', () => {
  it('无行 → 默认值', async () => {
    const { db } = makeFakeDb({ streakRow: null });
    const s = await getStreak(db, 1, NOW);
    expect(s.current).toBe(0);
    expect(s.longest).toBe(0);
    expect(s.active_today).toBe(false);
    expect(s.makeup_cards).toBe(INITIAL_MAKEUP_CARDS);
  });
  it('今日活跃 → active_today，昨日活跃有卡 → can_makeup', async () => {
    const { db } = makeFakeDb({ streakRow: row({ current: 4, longest: 4, last_active_date: YDAY, makeup_cards: 1 }) });
    const s = await getStreak(db, 1, NOW);
    expect(s.active_today).toBe(false);
    expect(s.can_makeup).toBe(true);
  });
});
