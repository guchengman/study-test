/**
 * FR-107 题目生命周期核心逻辑单测（回收站软删 / 版本历史 / 过期清理）。
 *
 * 策略：不依赖真实 db —— questionLifecycle 的每个函数都以首参 db（默认 pool）注入，
 * 这里传按 SQL 子串路由的假 pool，模拟快照 SELECT/INSERT/裁剪、考试引用判定、清理候选与删除。
 */
import { describe, it, expect, vi } from 'vitest';
import {
  rowToSnapshot,
  snapshotCurrentVersion,
  isReferencedByExam,
  purgeExpiredDeleted,
  MAX_VERSIONS,
} from '../../src/utils/questionLifecycle.js';

vi.mock('../../src/utils/logger.js', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

/** 构造按 SQL 子串路由的假 db，并记录调用。 */
function makeFakeDb(cfg = {}) {
  const {
    questionRow = null,        // SELECT ... FROM questions WHERE id 返回的行
    nextSeq = 1,               // SELECT COALESCE(MAX(seq),0)+1 返回
    examReferenced = false,    // JSON_CONTAINS 是否命中
    purgeCandidates = [],      // 清理候选 id 列表
  } = cfg;

  const calls = { selects: 0, inserts: [], deletes: [], execs: [] };
  const db = {
    execute: async (sql, params = []) => {
      calls.execs.push({ sql: sql.trim(), params });
      // 快照：读当前题目行
      if (/FROM questions WHERE id = \?/.test(sql) && /^SELECT/i.test(sql.trim())) {
        calls.selects += 1;
        return [questionRow ? [questionRow] : []];
      }
      // 版本序号
      if (sql.includes('COALESCE(MAX(seq), 0) + 1')) {
        return [[{ next: nextSeq }]];
      }
      // 裁剪 DELETE（question_versions）
      if (/^DELETE FROM question_versions/i.test(sql.trim())) {
        calls.deletes.push({ kind: 'versions', params });
        return [{ affectedRows: 0 }];
      }
      // 考试引用判定
      if (sql.includes('JSON_CONTAINS')) {
        return [examReferenced ? [{ id: 1 }] : []];
      }
      // 清理候选
      if (sql.includes('deleted_at IS NOT NULL') && sql.includes('DATE_SUB')) {
        return [purgeCandidates.map((id) => ({ id }))];
      }
      // 物理删 questions
      if (/^DELETE FROM questions WHERE id = \?/i.test(sql.trim())) {
        calls.deletes.push({ kind: 'question', params });
        return [{ affectedRows: 1 }];
      }
      // INSERT question_versions
      if (/^INSERT INTO question_versions/i.test(sql.trim())) {
        calls.inserts.push({ params });
        return [{ insertId: 1 }];
      }
      return [[]];
    },
    getConnection: async () => ({ execute: db.execute, release: () => {} }),
  };
  return { db, calls };
}

describe('rowToSnapshot', () => {
  it('JSON 字符串列（options/answer）解析为结构，code/explanation 缺省为 null', () => {
    const snap = rowToSnapshot({
      subject_id: 'math',
      type: 'single',
      title: 'T',
      code: undefined,
      options: '["A","B"]',
      answer: '["A"]',
      explanation: undefined,
      points: 2,
    });
    expect(snap).toEqual({
      subject_id: 'math',
      type: 'single',
      title: 'T',
      code: null,
      options: ['A', 'B'],
      answer: ['A'],
      explanation: null,
      points: 2,
    });
  });

  it('已解析为对象的列原样保留；非法 JSON 字符串保留原值', () => {
    const snap = rowToSnapshot({
      subject_id: 's', type: 'judge', title: 'x', code: 'c',
      options: { a: 1 }, answer: 'not-json', explanation: 'e', points: 1,
    });
    expect(snap.options).toEqual({ a: 1 });
    expect(snap.answer).toBe('not-json');
  });
});

describe('snapshotCurrentVersion', () => {
  it('当前行存在：写快照 + 返回 nextSeq + 触发裁剪', async () => {
    const row = { subject_id: 'math', type: 'single', title: '旧标题', code: null, options: '["A"]', answer: '["A"]', explanation: null, points: 1 };
    const { db, calls } = makeFakeDb({ questionRow: row, nextSeq: 5 });
    const seq = await snapshotCurrentVersion(db, 42, 7, 3);
    expect(seq).toBe(5);
    expect(calls.selects).toBe(1);
    expect(calls.inserts).toHaveLength(1);
    const [qid, sq, payload, orgId, createdBy] = calls.inserts[0].params;
    expect(qid).toBe(42);
    expect(sq).toBe(5);
    expect(JSON.parse(payload)).toEqual({ subject_id: 'math', type: 'single', title: '旧标题', code: null, options: ['A'], answer: ['A'], explanation: null, points: 1 });
    expect(orgId).toBe(3);
    expect(createdBy).toBe(7);
    // 裁剪调用带 MAX_VERSIONS
    const crop = calls.deletes.find((d) => d.kind === 'versions');
    expect(crop).toBeTruthy();
    expect(crop.params).toContain(MAX_VERSIONS);
  });

  it('当前行不存在：返回 null 且不写快照', async () => {
    const { db, calls } = makeFakeDb({ questionRow: null });
    const seq = await snapshotCurrentVersion(db, 99);
    expect(seq).toBeNull();
    expect(calls.inserts).toHaveLength(0);
  });
});

describe('isReferencedByExam', () => {
  it('命中返回 true，且以字符串传参', async () => {
    const { db, calls } = makeFakeDb({ examReferenced: true });
    expect(await isReferencedByExam(db, 8)).toBe(true);
    const jsonCall = calls.execs.find((c) => c.sql.includes('JSON_CONTAINS'));
    expect(jsonCall.params).toEqual(['8']);
  });
  it('未命中返回 false', async () => {
    const { db } = makeFakeDb({ examReferenced: false });
    expect(await isReferencedByExam(db, 8)).toBe(false);
  });
});

describe('purgeExpiredDeleted', () => {
  it('未引用的候选物理删；被考试引用的跳过', async () => {
    // 假 db：purge 内对每个候选调用 isReferencedByExam（JSON_CONTAINS）
    // 用闭包队列控制引用命中：1 未引用、2 引用、3 未引用
    const refQueue = [false, true, false];
    let refIdx = 0;
    const deletes = [];
    const db = {
      execute: async (sql, params = []) => {
        if (sql.includes('deleted_at IS NOT NULL') && sql.includes('DATE_SUB')) {
          return [[{ id: 1 }, { id: 2 }, { id: 3 }]];
        }
        if (sql.includes('JSON_CONTAINS')) {
          const hit = refQueue[refIdx++];
          return [hit ? [{ id: 1 }] : []];
        }
        if (/^DELETE FROM questions WHERE id = \?/i.test(sql.trim())) {
          deletes.push(params[0]);
          return [{ affectedRows: 1 }];
        }
        return [[]];
      },
    };
    const res = await purgeExpiredDeleted(db, { retentionDays: 30, batchSize: 100 });
    expect(res).toEqual({ deleted: 2, skipped: 1 });
    expect(deletes).toEqual([1, 3]);
  });

  it('无候选：deleted/skipped 均为 0', async () => {
    const { db } = makeFakeDb({ purgeCandidates: [] });
    const res = await purgeExpiredDeleted(db);
    expect(res).toEqual({ deleted: 0, skipped: 0 });
  });
});
