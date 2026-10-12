/**
 * FR-301/302 statsService 单测。
 * 覆盖：computeDailyStats 纯聚合、getTrend/getMastery、getExamAnalysisDeep（样本护栏）、getClassCompare。
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../src/utils/logger.js', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import {
  computeDailyStats, getTrend, getMastery, getExamAnalysisDeep, getClassCompare,
  dateStrInTZ, yesterdayStr, aggregateForDate,
} from '../../src/utils/statsService.js';

// ─── computeDailyStats（纯函数） ───────────────────────────
describe('computeDailyStats', () => {
  const mkAttempt = (over = {}) => ({
    user_id: 1, exam_id: 10, score: 80,
    started_at: '2026-03-01T02:00:00Z', submitted_at: '2026-03-01T02:10:00Z',
    details: [], ...over,
  });

  it('null-dim 总量 + 标签细分', () => {
    const attempts = [mkAttempt({
      details: [
        { question_id: 101, is_correct: true },
        { question_id: 102, is_correct: false },
      ],
    })];
    const tagMap = new Map([[101, [7]], [102, [7, 8]]]);
    const rows = computeDailyStats(attempts, '2026-03-01', tagMap);
    const find = (metric, dim) => rows.find((r) => r.metric === metric && String(r.dim_key) === String(dim));
    expect(find('practiced', null).value).toBe(2);
    expect(find('correct', null).value).toBe(1);
    expect(find('practiced', 7).value).toBe(2); // q101+q102 都挂标签7
    expect(find('correct', 7).value).toBe(1);
    expect(find('practiced', 8).value).toBe(1); // 仅 q102
  });

  it('编程题 is_correct=null 不计入', () => {
    const attempts = [mkAttempt({ details: [{ question_id: 1, is_correct: null }] })];
    const rows = computeDailyStats(attempts, '2026-03-01', new Map());
    expect(rows.find((r) => r.metric === 'practiced' && r.dim_key === null)).toBeUndefined();
  });

  it('exam_score 取当日该卷最高分', () => {
    const attempts = [
      mkAttempt({ exam_id: 10, score: 70 }),
      mkAttempt({ exam_id: 10, score: 95 }),
    ];
    const rows = computeDailyStats(attempts, '2026-03-01', new Map());
    const s = rows.find((r) => r.metric === 'exam_score' && r.dim_key === '10');
    expect(s.value).toBe(95);
  });

  it('time_spent 汇总当日答卷时长（秒）', () => {
    const attempts = [mkAttempt({ started_at: '2026-03-01T02:00:00Z', submitted_at: '2026-03-01T02:10:00Z' })];
    const rows = computeDailyStats(attempts, '2026-03-01', new Map());
    const t = rows.find((r) => r.metric === 'time_spent');
    expect(t.value).toBe(600);
  });

  it('dateStr/yesterdayStr 格式 YYYY-MM-DD', () => {
    expect(dateStrInTZ(new Date('2026-03-01T20:00:00Z'))).toBe('2026-03-02'); // +8h 跨日
    expect(yesterdayStr(new Date('2026-03-05T10:00:00Z')).length).toBe(10);
  });
});

// ─── 假 db（按 SQL 子串路由） ──────────────────────────────
function makeFakeDb(cfg = {}) {
  const calls = [];
  const db = {
    execute: async (sql, params = []) => {
      const t = sql.trim();
      calls.push({ sql: t, params });
      if (t.includes('started_at, submitted_at') && t.includes('FROM exam_attempts')) {
        return [cfg.attemptRows || []];
      }
      if (/^SELECT question_id, tag_id FROM question_tag_map/i.test(t)) {
        return [cfg.tagRows || []];
      }
      if (/SELECT m\.org_id FROM org_members/i.test(t)) {
        return [[{ org_id: 5 }]];
      }
      if (/^INSERT INTO stats_daily/i.test(t)) {
        return [{ affectedRows: 1 }];
      }
      if (/^SELECT DATE_FORMAT\(date/i.test(t)) {
        return [cfg.trendRows || []];
      }
      if (/^SELECT dim_key AS tag_id/i.test(t)) {
        return [cfg.masteryRows || []];
      }
      if (/^SELECT id, name FROM question_tags/i.test(t)) {
        return [cfg.tagNames || []];
      }
      if (/^SELECT id, title, total_points, pass_score FROM exams WHERE id = \?/i.test(t)) {
        return [cfg.examRow ? [cfg.examRow] : []];
      }
      if (t.includes('user_id, score, details') && t.includes('FROM exam_attempts')) {
        return [cfg.analysisAttempts || []];
      }
      if (/^SELECT u\.id AS user_id, u\.username/i.test(t)) {
        return [cfg.classRows || []];
      }
      return [[]];
    },
    getConnection: async () => ({ execute: async () => [[{ got: 1 }]], release: vi.fn() }),
  };
  return { db, calls };
}

// ─── getTrend / getMastery ─────────────────────────────────
describe('getTrend', () => {
  it('映射 date/value', async () => {
    const { db } = makeFakeDb({ trendRows: [{ date: '2026-03-01T00:00:00.000Z', value: 12 }] });
    const out = await getTrend(db, 1, { metric: 'practiced', days: 30 });
    expect(out[0]).toEqual({ date: '2026-03-01', value: 12 });
  });
});

describe('getMastery', () => {
  it('计算掌握度百分比 + 标签名', async () => {
    const { db } = makeFakeDb({
      masteryRows: [{ tag_id: '7', practiced: 10, correct: 6 }],
      tagNames: [{ id: 7, name: '牛顿定律' }],
    });
    const out = await getMastery(db, 1);
    expect(out[0]).toEqual({ tag_id: 7, tag_name: '牛顿定律', practiced: 10, correct: 6, mastery: 60 });
  });
  it('无数据 → 空数组', async () => {
    const { db } = makeFakeDb({ masteryRows: [] });
    expect(await getMastery(db, 1)).toEqual([]);
  });
});

// ─── aggregateForDate（编排） ──────────────────────────────
describe('aggregateForDate', () => {
  it('读 attempts + 标签 → UPSERT stats_daily', async () => {
    const attemptRows = [{
      id: 1, user_id: 1, exam_id: 10, score: 80,
      started_at: '2026-03-01T02:00:00Z', submitted_at: '2026-03-01T02:05:00Z',
      details: JSON.stringify([{ question_id: 101, is_correct: true }]),
    }];
    const { db, calls } = makeFakeDb({ attemptRows, tagRows: [{ question_id: 101, tag_id: 7 }] });
    const r = await aggregateForDate(db, '2026-03-01');
    expect(r.attempts).toBe(1);
    expect(r.rows).toBeGreaterThan(0);
    expect(calls.find((c) => /INSERT INTO stats_daily/i.test(c.sql))).toBeTruthy();
  });
  it('无 attempt → 不 UPSERT', async () => {
    const { db, calls } = makeFakeDb({ attemptRows: [] });
    const r = await aggregateForDate(db, '2026-03-01');
    expect(r).toEqual({ attempts: 0, rows: 0 });
    expect(calls.find((c) => /INSERT INTO stats_daily/i.test(c.sql))).toBeUndefined();
  });
});

// ─── getExamAnalysisDeep ───────────────────────────────────
function buildAttempts(count, correctPattern) {
  const rows = [];
  for (let i = 0; i < count; i++) {
    const isCorrect = correctPattern(i);
    rows.push({
      user_id: i,
      score: isCorrect ? 90 : 30,
      details: JSON.stringify([{ question_id: 1, is_correct: isCorrect, user_answer: isCorrect ? 'A' : 'B', correct_answer: 'A' }]),
    });
  }
  return rows;
}

describe('getExamAnalysisDeep', () => {
  const examRow = { id: 10, title: 'IT', total_points: 100, pass_score: 60 };

  it('样本不足：sample_insufficient=true，无区分度/诱答', async () => {
    const { db } = makeFakeDb({ examRow, analysisAttempts: buildAttempts(10, () => true) });
    const r = await getExamAnalysisDeep(db, 10, { minSample: 50 });
    expect(r.sample_insufficient).toBe(true);
    expect(r.discrimination).toBeNull();
    expect(r.distractors).toBeNull();
    expect(r.referenceCount).toBe(10);
    expect(r.distribution.find((d) => d.label === '90-100%').count).toBe(10);
  });

  it('样本充足：产出区分度与诱答', async () => {
    // 前 25 名高分(正确)，后 25 名低分(错误) → top rate 1, bottom rate 0 → 区分度 1
    const attempts = buildAttempts(50, (i) => i < 25);
    const { db } = makeFakeDb({ examRow, analysisAttempts: attempts });
    const r = await getExamAnalysisDeep(db, 10, { minSample: 50 });
    expect(r.sample_insufficient).toBe(false);
    const q = r.discrimination.find((x) => x.question_id === 1);
    expect(q.discrimination).toBeCloseTo(1, 3);
    const d = r.distractors.find((x) => x.question_id === 1);
    expect(d.wrong_picks.find((p) => p.option === 'B').count).toBe(25);
  });

  it('考试不存在 → null', async () => {
    const { db } = makeFakeDb({ examRow: null });
    expect(await getExamAnalysisDeep(db, 999)).toBeNull();
  });
});

// ─── getClassCompare ───────────────────────────────────────
describe('getClassCompare', () => {
  it('计算正确率', async () => {
    const { db } = makeFakeDb({
      classRows: [{ user_id: 2, username: 's1', practiced: 20, correct: 15 }],
    });
    const out = await getClassCompare(db, 1);
    expect(out[0]).toEqual({ user_id: 2, username: 's1', practiced: 20, correct: 15, accuracy: 75 });
  });
});
