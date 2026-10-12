/**
 * FR-107 题目生命周期核心逻辑（回收站软删 + 版本历史 + 过期清理）。
 *
 * 设计：
 *   - db 依赖注入（默认 pool），便于单测 mock（沿用 utils/examSweep.js 的可测范式）。
 *   - 版本快照 payload 自成一体的 JSON，回退时按 create/update 的序列化口径写回 questions。
 *   - 「考试引用过的题目禁止物理删」：以 JSON_CONTAINS + $[*].question_id 抽取判定（MySQL 5.7/8.0 兼容）。
 */
import pool from '../db.js';

/** 快照/回退涉及的可编辑字段（与 questions 列对齐） */
export const SNAPSHOT_FIELDS = ['subject_id', 'type', 'title', 'code', 'options', 'answer', 'explanation', 'points'];

/** 版本保留上限：超出则丢弃最旧（PRD「留存最近 N 版」，取 20） */
export const MAX_VERSIONS = 20;

/** JSON 列取值归一：mysql2 已解析则原样，字符串则尝试 JSON.parse，否则原样。 */
function normalizeJsonValue(v) {
  if (v === null || v === undefined) return v;
  if (typeof v === 'object') return v;
  if (typeof v === 'string') {
    try { return JSON.parse(v); } catch { return v; }
  }
  return v;
}

/** 把一行 questions 记录转为版本快照对象（JSON 列解析为 JS 结构）。 */
export function rowToSnapshot(row) {
  return {
    subject_id: row.subject_id,
    type: row.type,
    title: row.title,
    code: row.code ?? null,
    options: normalizeJsonValue(row.options),
    answer: normalizeJsonValue(row.answer),
    explanation: row.explanation ?? null,
    points: row.points,
  };
}

/**
 * 编辑前快照当前行到 question_versions，并做版本数裁剪。
 * 返回新快照的 seq（无当前行则返回 null，不快照）。
 */
export async function snapshotCurrentVersion(db = pool, questionId, userId = null, orgId = null) {
  const [rows] = await db.execute(
    `SELECT subject_id, type, title, code, options, answer, explanation, points
     FROM questions WHERE id = ?`,
    [questionId]
  );
  if (rows.length === 0) return null;

  const snapshot = rowToSnapshot(rows[0]);
  const [seqRows] = await db.execute(
    'SELECT COALESCE(MAX(seq), 0) + 1 AS next FROM question_versions WHERE question_id = ?',
    [questionId]
  );
  const nextSeq = Number(seqRows[0].next) || 1;

  await db.execute(
    `INSERT INTO question_versions (question_id, seq, payload, org_id, created_by)
     VALUES (?, ?, ?, ?, ?)`,
    [questionId, nextSeq, JSON.stringify(snapshot), orgId ?? null, userId ?? null]
  );

  // 裁剪：仅保留最近 MAX_VERSIONS 版（seq 最大的若干条）
  await db.execute(
    `DELETE FROM question_versions
     WHERE question_id = ?
       AND seq <= (SELECT * FROM (SELECT COALESCE(MAX(seq), 0) - ? FROM question_versions WHERE question_id = ?) t)`,
    [questionId, MAX_VERSIONS, questionId]
  );

  return nextSeq;
}

/** 该题是否被任一试卷（exams.question_set）引用。用于「禁止物理删」。 */
export async function isReferencedByExam(db = pool, questionId) {
  const [rows] = await db.execute(
    `SELECT id FROM exams
     WHERE JSON_CONTAINS(JSON_EXTRACT(question_set, '$[*].question_id'), CAST(? AS JSON))
     LIMIT 1`,
    [String(questionId)]
  );
  return rows.length > 0;
}

/**
 * 清理过期软删题目：deleted_at 非空且早于 now - retentionDays，且未被考试引用者，物理删除。
 * （question_versions 由 FK ON DELETE CASCADE 自动级联清理。）
 * @returns {{ deleted: number, skipped: number }}
 */
export async function purgeExpiredDeleted(db = pool, { retentionDays = 30, batchSize = 100 } = {}) {
  const [candidates] = await db.execute(
    `SELECT id FROM questions
     WHERE deleted_at IS NOT NULL AND deleted_at < DATE_SUB(NOW(), INTERVAL ? DAY)
     ORDER BY deleted_at ASC LIMIT ?`,
    [retentionDays, batchSize]
  );

  let deleted = 0;
  let skipped = 0;
  for (const row of candidates) {
    const referenced = await isReferencedByExam(db, row.id);
    if (referenced) { skipped += 1; continue; } // 考试引用过 → 禁止物理删，保留待人工处理
    await db.execute('DELETE FROM questions WHERE id = ?', [row.id]);
    deleted += 1;
  }
  return { deleted, skipped };
}
