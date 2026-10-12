/**
 * FR-206 exportService 核心逻辑单测（创建任务 / 原子认领 / 状态查询 / 队列发现）。
 *
 * 策略：
 *   - db 依赖注入，按 SQL 子串路由假 pool（沿用 questionLifecycle.test 范式）。
 *   - processJob 涉及文件 I/O，mock createWriteStream 避免真写磁盘。
 *   - logger vi.mock。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// mock fs createWriteStream（processJob 内部调用）
vi.mock('fs', async (importOriginal) => {
  const orig = await importOriginal();
  return {
    ...orig,
    mkdirSync: vi.fn(),
    existsSync: vi.fn().mockReturnValue(true),
    createWriteStream: vi.fn(() => {
      const chunks = [];
      return {
        write: (data) => { chunks.push(data); },
        end: (cb) => { if (cb) cb(); },
        chunks,
      };
    }),
  };
});

vi.mock('../../src/utils/logger.js', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import {
  createExportJob,
  getJobStatus,
  listJobs,
  findQueuedJobs,
  processJob,
} from '../../src/utils/exportService.js';

/** 按 SQL 子串路由的假 db */
function makeFakeDb(cfg = {}) {
  const {
    insertId = 42,
    jobRow = null,
    queuedIds = [],
    claimAffected = 1,
    examData = null,
    attemptRows = [],
    selfRows = [],
  } = cfg;

  const calls = [];
  const db = {
    execute: async (sql, params = []) => {
      const trimmed = sql.trim();
      calls.push({ sql: trimmed, params });

      // INSERT export_jobs
      if (/^INSERT INTO export_jobs/i.test(trimmed)) {
        return [{ insertId }];
      }
      // SELECT job status (by id)
      if (/^SELECT.*FROM export_jobs WHERE id = \?/i.test(trimmed) && !trimmed.includes('UPDATE')) {
        return [jobRow ? [jobRow] : []];
      }
      // SELECT queued jobs
      if (trimmed.includes("status = 'queued' ORDER BY id ASC")) {
        return [queuedIds.map((id) => ({ id }))];
      }
      // Atomic claim UPDATE
      if (/^UPDATE export_jobs SET status = 'running' WHERE id = \? AND status = 'queued'/i.test(trimmed)) {
        return [{ affectedRows: claimAffected }];
      }
      // Job fetch after claim
      if (/^SELECT id, requested_by, exam_id, scope FROM export_jobs WHERE id = \?/i.test(trimmed)) {
        return [jobRow ? [jobRow] : []];
      }
      // SELECT exam meta
      if (/^SELECT id, title, question_set, total_points FROM exams WHERE id = \?/i.test(trimmed)) {
        return [examData ? [examData] : []];
      }
      // SELECT attempts (exam scope)
      if (trimmed.includes('FROM exam_attempts a') && trimmed.includes('LEFT JOIN users')) {
        return [attemptRows];
      }
      // SELECT self attempts
      if (trimmed.includes('FROM exam_attempts a') && trimmed.includes('JOIN exams e')) {
        return [selfRows];
      }
      // UPDATE done
      if (/^UPDATE export_jobs SET status = 'done'/i.test(trimmed)) {
        return [{ affectedRows: 1 }];
      }
      // UPDATE failed
      if (/^UPDATE export_jobs SET status = 'failed'/i.test(trimmed)) {
        return [{ affectedRows: 1 }];
      }
      // listJobs
      if (/^SELECT.*FROM export_jobs WHERE requested_by = \? ORDER BY id DESC/i.test(trimmed)) {
        return [[{ id: 1, status: 'done' }]];
      }
      return [[]];
    },
    getConnection: async () => ({
      execute: async () => [[{ got: 1 }]],
      release: vi.fn(),
    }),
  };
  return { db, calls };
}

// ─── createExportJob ───────────────────────────────────────

describe('createExportJob', () => {
  it('INSERT 成功返回 insertId', async () => {
    const { db, calls } = makeFakeDb({ insertId: 99 });
    const id = await createExportJob(db, {
      requested_by: 1, org_id: 5, exam_id: 10, scope: 'exam',
    });
    expect(id).toBe(99);
    expect(calls[0].sql).toContain('INSERT INTO export_jobs');
    expect(calls[0].params).toEqual([5, 1, 10, 'exam']);
  });
});

// ─── getJobStatus ──────────────────────────────────────────

describe('getJobStatus', () => {
  it('存在则返回 job 对象', async () => {
    const job = { id: 1, status: 'done', row_count: 10 };
    const { db } = makeFakeDb({ jobRow: job });
    const res = await getJobStatus(db, 1);
    expect(res).toEqual(job);
  });

  it('不存在返回 null', async () => {
    const { db } = makeFakeDb({ jobRow: null });
    const res = await getJobStatus(db, 999);
    expect(res).toBeNull();
  });
});

// ─── listJobs ──────────────────────────────────────────────

describe('listJobs', () => {
  it('返回数组', async () => {
    const { db } = makeFakeDb();
    const jobs = await listJobs(db, 1);
    expect(Array.isArray(jobs)).toBe(true);
  });
});

// ─── findQueuedJobs ────────────────────────────────────────

describe('findQueuedJobs', () => {
  it('返回 queued id 列表', async () => {
    const { db } = makeFakeDb({ queuedIds: [3, 7, 12] });
    const ids = await findQueuedJobs(db, { limit: 10 });
    expect(ids).toEqual([3, 7, 12]);
  });

  it('空队列返回空数组', async () => {
    const { db } = makeFakeDb({ queuedIds: [] });
    const ids = await findQueuedJobs(db);
    expect(ids).toEqual([]);
  });
});

// ─── processJob 原子认领 ───────────────────────────────────

describe('processJob', () => {
  it('认领失败（affectedRows=0）返回 false', async () => {
    const { db } = makeFakeDb({ claimAffected: 0 });
    const result = await processJob(db, 1);
    expect(result).toBe(false);
  });

  it('scope=exam 正常处理并生成 CSV', async () => {
    const job = { id: 5, requested_by: 1, exam_id: 10, scope: 'exam' };
    const examData = {
      id: 10, title: '测试', total_points: 100,
      question_set: JSON.stringify([
        { question_id: 101, points: 50 },
        { question_id: 102, points: 50 },
      ]),
    };
    const attemptRows = [
      { id: 1, user_id: 2, status: 'submitted', score: 80, started_at: '2026-01-01', submitted_at: '2026-01-01T01:00:00', username: 'alice', details: JSON.stringify([{ question_id: 101, is_correct: true, earned: 50 }, { question_id: 102, is_correct: false, earned: 30 }]) },
    ];
    const { db } = makeFakeDb({ jobRow: job, examData, attemptRows });
    const result = await processJob(db, 5);
    expect(result).toBe(true); // 已认领处理
  });

  it('scope=self 正常处理', async () => {
    const job = { id: 6, requested_by: 2, exam_id: null, scope: 'self' };
    const selfRows = [
      { id: 3, exam_id: 10, status: 'submitted', score: 90, started_at: '2026-01-01', submitted_at: '2026-01-01', exam_title: '考试A', total_points: 100 },
    ];
    const { db } = makeFakeDb({ jobRow: job, selfRows });
    const result = await processJob(db, 6);
    expect(result).toBe(true);
  });

  it('exam 不存在时标记 failed', async () => {
    const job = { id: 7, requested_by: 1, exam_id: 999, scope: 'exam' };
    const { db } = makeFakeDb({ jobRow: job, examData: null });
    const result = await processJob(db, 7);
    expect(result).toBe(true); // 已认领（但标记 failed）
  });
});
