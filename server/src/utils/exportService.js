/**
 * FR-206 成绩导出核心服务（异步任务：取行 → CSV 生成 → 原子认领处理）。
 *
 * 设计：
 *   - db 依赖注入（默认 pool），沿用 examSweep/questionLifecycle 可测范式。
 *   - scope='exam'：owner 导出单场全体成绩（含逐题得分列）。
 *   - scope='self'：学生自助导出本人历次成绩汇总（不含逐题列——跨场题序不统一）。
 *   - 产物 CSV 带 UTF-8 BOM（Excel 可直开），落 server/exports/ 目录。
 *   - 原子认领：UPDATE SET status='running' WHERE id=? AND status='queued'；affectedRows=1 才处理。
 *   - 单次 5000 行上限（PRD 防大查询打挂库）。
 */
import pool from '../db.js';
import path from 'path';
import { mkdirSync, createWriteStream } from 'fs';
import { fileURLToPath } from 'url';
import { parseJsonSafe } from './examSweep.js';
import { getPerRequestLimit } from './quotaService.js';
import log from './logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXPORTS_DIR = path.resolve(__dirname, '../../exports');

/** 单次导出最大行数（PRD 护栏；FR-606 落地后作为无配额时的默认上限） */
const MAX_EXPORT_ROWS = 5000;

/** 确保 exports 目录存在 */
function ensureDir() {
  if (!mkdirSync(EXPORTS_DIR, { recursive: true })) {
    // mkdirSync with recursive returns undefined on success or the first path created
  }
}

// ─── 创建任务 ───────────────────────────────────────────────

/**
 * 创建导出任务（入队）。
 * @param {Object} db
 * @param {{ requested_by: number, org_id: number|null, exam_id: number|null, scope: 'exam'|'self' }} opts
 * @returns {Promise<number>} job id
 */
export async function createExportJob(db = pool, { requested_by, org_id = null, exam_id = null, scope }) {
  const [result] = await db.execute(
    `INSERT INTO export_jobs (org_id, requested_by, exam_id, scope, format, status)
     VALUES (?, ?, ?, ?, 'csv', 'queued')`,
    [org_id, requested_by, exam_id, scope]
  );
  return result.insertId;
}

// ─── 查询辅助 ───────────────────────────────────────────────

/**
 * 获取 job 状态。
 */
export async function getJobStatus(db = pool, jobId) {
  const [rows] = await db.execute(
    'SELECT id, org_id, requested_by, exam_id, scope, format, status, row_count, file_path, error, created_at, completed_at FROM export_jobs WHERE id = ?',
    [jobId]
  );
  return rows[0] ?? null;
}

/**
 * 获取某用户发起的 jobs 列表（最近 20 条）。
 */
export async function listJobs(db = pool, userId, { limit = 20 } = {}) {
  const [rows] = await db.execute(
    `SELECT id, exam_id, scope, status, row_count, file_path, error, created_at, completed_at
     FROM export_jobs WHERE requested_by = ? ORDER BY id DESC LIMIT ?`,
    [userId, String(limit)]
  );
  return rows;
}

// ─── 取数据行 ──────────────────────────────────────────────

/**
 * scope='exam'：取本场全体 attempt 行 + 逐题得分列。
 * @returns {{ headers: string[], rows: string[][] }}
 */
async function fetchExamRows(db, examId, rowLimit = MAX_EXPORT_ROWS) {
  // 取考试元数据（题序）
  const [examRows] = await db.execute(
    'SELECT id, title, question_set, total_points FROM exams WHERE id = ?',
    [examId]
  );
  if (examRows.length === 0) throw new Error(`考试 ${examId} 不存在`);
  const exam = examRows[0];
  const questionSet = parseJsonSafe(exam.question_set, []);
  const questionIds = questionSet.map((q) => q.question_id);
  const questionPoints = Object.fromEntries(questionSet.map((q) => [q.question_id, q.points]));

  // 取答卷（限制行数）
  const [attempts] = await db.execute(
    `SELECT a.id, a.user_id, a.status, a.score, a.details, a.started_at, a.submitted_at, u.username
     FROM exam_attempts a
     LEFT JOIN users u ON a.user_id = u.id
     WHERE a.exam_id = ?
     ORDER BY a.user_id, a.id
     LIMIT ?`,
    [examId, String(rowLimit)]
  );

  // 构建表头
  const baseHeaders = ['用户名', '状态', '得分', '满分', '开始时间', '提交时间'];
  const perQHeaders = questionIds.map((qid, idx) => `第${idx + 1}题(${qid})`);
  const headers = [...baseHeaders, ...perQHeaders];

  // 构建数据行
  const rows = attempts.map((a) => {
    const details = parseJsonSafe(a.details, []);
    const detailMap = Object.fromEntries(details.map((d) => [d.question_id, d]));
    const base = [
      a.username || `user_${a.user_id}`,
      a.status,
      String(a.score ?? 0),
      String(exam.total_points),
      a.started_at ? new Date(a.started_at).toISOString() : '',
      a.submitted_at ? new Date(a.submitted_at).toISOString() : '',
    ];
    const perQ = questionIds.map((qid) => {
      const d = detailMap[qid];
      if (!d) return '';
      return `${d.earned ?? 0}/${questionPoints[qid] ?? '?'}`;
    });
    return [...base, ...perQ];
  });

  return { headers, rows };
}

/**
 * scope='self'：取本人历次成绩汇总。
 */
async function fetchSelfRows(db, userId, rowLimit = MAX_EXPORT_ROWS) {
  const [attempts] = await db.execute(
    `SELECT a.id, a.exam_id, a.status, a.score, a.started_at, a.submitted_at,
            e.title AS exam_title, e.total_points
     FROM exam_attempts a
     JOIN exams e ON a.exam_id = e.id
     WHERE a.user_id = ?
     ORDER BY a.id DESC
     LIMIT ?`,
    [userId, String(rowLimit)]
  );

  const headers = ['考试标题', '状态', '得分', '满分', '开始时间', '提交时间'];
  const rows = attempts.map((a) => [
    a.exam_title || `exam_${a.exam_id}`,
    a.status,
    String(a.score ?? 0),
    String(a.total_points ?? ''),
    a.started_at ? new Date(a.started_at).toISOString() : '',
    a.submitted_at ? new Date(a.submitted_at).toISOString() : '',
  ]);

  return { headers, rows };
}

// ─── CSV 生成 ──────────────────────────────────────────────

/** CSV 字段转义：含逗号/双引号/换行则加双引号包裹 */
function escapeCsv(val) {
  const s = String(val ?? '');
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/**
 * 生成 CSV 文件到磁盘。
 * @returns {{ filePath: string, rowCount: number }}
 */
async function generateCsv({ headers, rows }, jobId) {
  ensureDir();
  const fileName = `export_${jobId}.csv`;
  const filePath = path.join(EXPORTS_DIR, fileName);

  const stream = createWriteStream(filePath, { encoding: 'utf8' });
  // UTF-8 BOM
  stream.write('\uFEFF');
  // Header
  stream.write(headers.map(escapeCsv).join(',') + '\r\n');
  // Rows
  for (const row of rows) {
    stream.write(row.map(escapeCsv).join(',') + '\r\n');
  }
  // Finish
  await new Promise((resolve, reject) => {
    stream.end((err) => { if (err) reject(err); else resolve(); });
  });

  return { filePath, rowCount: rows.length };
}

// ─── 原子认领处理 ─────────────────────────────────────────

/**
 * 处理一个 queued 状态的 job（原子认领 → 取数据 → 生成 CSV → 更新 done/failed）。
 * @param {number} jobId
 * @returns {Promise<boolean>} true = 成功认领并处理；false = 未被认领（已被其他进程取走）
 */
export async function processJob(db = pool, jobId) {
  // 原子认领
  const [claim] = await db.execute(
    `UPDATE export_jobs SET status = 'running' WHERE id = ? AND status = 'queued'`,
    [jobId]
  );
  if (claim.affectedRows === 0) return false;

  try {
    // 取 job 信息
    const [jobs] = await db.execute(
      'SELECT id, requested_by, exam_id, scope, org_id FROM export_jobs WHERE id = ?',
      [jobId]
    );
    if (jobs.length === 0) throw new Error('job 不存在（认领后消失？）');
    const job = jobs[0];

    // FR-606：从 quotas 解析本租户单请求导出行上限（无配额时回落 MAX_EXPORT_ROWS）
    const rowLimit = await getPerRequestLimit(db, job.org_id, 'export_rows', MAX_EXPORT_ROWS);

    // 取数据
    let data;
    if (job.scope === 'exam') {
      data = await fetchExamRows(db, job.exam_id, rowLimit);
    } else {
      data = await fetchSelfRows(db, job.requested_by, rowLimit);
    }

    // 生成 CSV
    const { rowCount } = await generateCsv(data, jobId);

    // 更新 done
    const relativePath = `exports/export_${jobId}.csv`;
    await db.execute(
      `UPDATE export_jobs SET status = 'done', row_count = ?, file_path = ?, completed_at = NOW()
       WHERE id = ?`,
      [rowCount, relativePath, jobId]
    );
    return true;
  } catch (err) {
    log.error(`[exportService] job ${jobId} 处理失败:`, err.message);
    await db.execute(
      `UPDATE export_jobs SET status = 'failed', error = ? WHERE id = ?`,
      [err.message.slice(0, 500), jobId]
    );
    return true; // 已认领、处理完毕（虽失败但状态已更新）
  }
}

/**
 * 查询所有 queued 状态的 job id（供调度器兜底轮询）。
 */
export async function findQueuedJobs(db = pool, { limit = 10 } = {}) {
  const [rows] = await db.execute(
    `SELECT id FROM export_jobs WHERE status = 'queued' ORDER BY id ASC LIMIT ?`,
    [String(limit)]
  );
  return rows.map((r) => r.id);
}

/** 导出目录绝对路径（routes 下载用） */
export { EXPORTS_DIR };
