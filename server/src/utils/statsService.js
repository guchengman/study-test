/**
 * FR-301/302 学情/考情统计核心服务。
 *
 * 设计：
 *   - db 依赖注入（默认 pool），沿用 quota/storage/notification 可测范式。
 *   - 数据源：exam_attempts.details（逐题 is_correct / user_answer）、exams、question_tag_map（FR-108）。
 *     （现状库无 answer_records 表：练习逐题正确性以考试答卷明细为可信来源；time_spent 取答卷时长。）
 *   - computeDailyStats：纯函数（无 DB），输入已解析的 attempt 行 + 标签映射 → stats_daily 行；单测直接覆盖。
 *   - aggregateForDate：编排一次日聚合（读 attempts → 组标签 → UPSERT stats_daily）。
 *   - getTrend/getMastery：FR-301 趋势与标签掌握度；getExamAnalysisDeep：FR-302 得分分布/区分度/诱答（n≥minSample）。
 *   - getClassCompare：FR-302 班级横向（按 teacher_id 归集学员）。
 */
import pool from '../db.js';
import { parseJsonSafe } from './examSweep.js';
import { resolvePersonalOrgId } from './personalOrg.js';
import log from './logger.js';

/** 业务日切时区（UTC+8） */
const TZ_OFFSET_HOURS = 8;

/** 默认最少样本量：低于此值不产出区分度/诱答（FR-302 统计显著性护栏） */
export const MIN_SAMPLE = 50;

/** YYYY-MM-DD（按 UTC+8 归属） */
export function dateStrInTZ(now = new Date(), offsetHours = TZ_OFFSET_HOURS) {
  const shifted = new Date(now.getTime() + offsetHours * 3600 * 1000);
  return shifted.toISOString().slice(0, 10);
}

/** 昨日 YYYY-MM-DD（UTC+8） */
export function yesterdayStr(now = new Date()) {
  const d = new Date(now.getTime() - 24 * 3600 * 1000);
  return dateStrInTZ(d);
}

/**
 * 纯函数：由 attempt 行 + 标签映射聚合出某业务日的 stats_daily 行。
 * @param {Array<{user_id:number, exam_id:number, score:number, details:Array, started_at:*, submitted_at:*}>} attempts
 * @param {string} dateStr
 * @param {Map<number, number[]>} tagMap question_id → tag_id[]
 * @returns {Array<{user_id:number, date:string, metric:string, dim_key:string|null, value:number}>}
 */
export function computeDailyStats(attempts, dateStr, tagMap) {
  const acc = new Map(); // `${user}|${metric}|${dim}` -> value （dim '' 代表 NULL）
  const add = (user, metric, dim, v) => {
    const k = `${user}|${metric}|${dim == null ? '' : dim}`;
    acc.set(k, (acc.get(k) || 0) + v);
  };
  const examScoreMax = new Map(); // `${user}|${exam}` -> max score
  const timeSpent = new Map(); // user -> seconds

  for (const a of attempts) {
    const details = Array.isArray(a.details) ? a.details : [];
    for (const d of details) {
      if (d.is_correct === true || d.is_correct === false) {
        add(a.user_id, 'practiced', null, 1);
        if (d.is_correct === true) add(a.user_id, 'correct', null, 1);
        const tags = tagMap.get(Number(d.question_id)) || [];
        for (const t of tags) {
          add(a.user_id, 'practiced', t, 1);
          if (d.is_correct === true) add(a.user_id, 'correct', t, 1);
        }
      }
    }
    const sk = `${a.user_id}|${a.exam_id}`;
    examScoreMax.set(sk, Math.max(examScoreMax.get(sk) ?? -Infinity, Number(a.score) || 0));
    if (a.started_at && a.submitted_at) {
      const secs = Math.max(0, Math.floor((new Date(a.submitted_at) - new Date(a.started_at)) / 1000));
      timeSpent.set(a.user_id, (timeSpent.get(a.user_id) || 0) + secs);
    }
  }

  const rows = [];
  for (const [k, value] of acc) {
    const [user, metric, dim] = k.split('|');
    rows.push({ user_id: Number(user), date: dateStr, metric, dim_key: dim === '' ? null : dim, value });
  }
  for (const [k, value] of examScoreMax) {
    const [user, exam] = k.split('|');
    rows.push({ user_id: Number(user), date: dateStr, metric: 'exam_score', dim_key: String(exam), value });
  }
  for (const [user, secs] of timeSpent) {
    rows.push({ user_id: Number(user), date: dateStr, metric: 'time_spent', dim_key: null, value: secs });
  }
  return rows;
}

/** UPSERT 单行 stats_daily（同日重算取最新值，幂等）。 */
export async function upsertStat(db = pool, { org_id = null, user_id, date, metric, dim_key = null, value }) {
  await db.execute(
    `INSERT INTO stats_daily (org_id, user_id, date, metric, dim_key, value)
     VALUES (?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE value = VALUES(value), org_id = VALUES(org_id)`,
    [org_id, user_id, date, metric, dim_key, value]
  );
}

/**
 * 编排一次日聚合：读某业务日的已交卷 attempt → 组标签 → computeDailyStats → UPSERT。
 * @returns {Promise<{attempts:number, rows:number}>}
 */
export async function aggregateForDate(db = pool, dateStr) {
  const [attempts] = await db.execute(
    `SELECT id, user_id, exam_id, score, details, started_at, submitted_at
     FROM exam_attempts
     WHERE status IN ('submitted','auto_submitted') AND DATE(submitted_at) = ?`,
    [dateStr]
  );
  if (attempts.length === 0) return { attempts: 0, rows: 0 };

  // 收集涉及题目 → 批量取标签映射
  const qidSet = new Set();
  for (const a of attempts) {
    a.details = parseJsonSafe(a.details, []);
    for (const d of a.details) qidSet.add(Number(d.question_id));
  }
  const qids = [...qidSet].filter((x) => Number.isFinite(x));
  const tagMap = new Map();
  if (qids.length > 0) {
    const placeholders = qids.map(() => '?').join(',');
    const [tagRows] = await db.execute(
      `SELECT question_id, tag_id FROM question_tag_map WHERE question_id IN (${placeholders})`,
      qids
    );
    for (const t of tagRows) {
      const q = Number(t.question_id);
      if (!tagMap.has(q)) tagMap.set(q, []);
      tagMap.get(q).push(Number(t.tag_id));
    }
  }

  const rows = computeDailyStats(attempts, dateStr, tagMap);

  // 每用户解析一次 PERSONAL org
  const orgCache = new Map();
  for (const r of rows) {
    if (!orgCache.has(r.user_id)) {
      orgCache.set(r.user_id, await resolvePersonalOrgId(db, r.user_id));
    }
    await upsertStat(db, { ...r, org_id: orgCache.get(r.user_id) });
  }
  log.info({ msg: 'stats_agg_done', date: dateStr, attempts: attempts.length, rows: rows.length }, '学情日聚合完成');
  return { attempts: attempts.length, rows: rows.length };
}

/**
 * FR-301 趋势：某用户某指标按日序列（dim_key=NULL 总量口径）。
 */
export async function getTrend(db = pool, userId, { metric = 'practiced', days = 30 } = {}) {
  const [rows] = await db.execute(
    `SELECT DATE_FORMAT(date, '%Y-%m-%d') AS date, SUM(value) AS value
     FROM stats_daily
     WHERE user_id = ? AND metric = ? AND dim_key IS NULL AND date >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
     GROUP BY date ORDER BY date ASC`,
    [userId, metric, days]
  );
  return rows.map((r) => ({ date: String(r.date).slice(0, 10), value: Number(r.value) }));
}

/**
 * FR-301 标签掌握度：per tag_id 的 practiced/correct → mastery。
 */
export async function getMastery(db = pool, userId) {
  const [rows] = await db.execute(
    `SELECT dim_key AS tag_id,
            SUM(metric = 'practiced') AS practiced,
            SUM(metric = 'correct') AS correct
     FROM stats_daily
     WHERE user_id = ? AND metric IN ('practiced','correct') AND dim_key IS NOT NULL
     GROUP BY dim_key`,
    [userId]
  );
  const ids = rows.map((r) => Number(r.dim_key != null ? r.dim_key : r.tag_id)).filter(Number.isFinite);
  const nameMap = new Map();
  if (ids.length > 0) {
    const placeholders = ids.map(() => '?').join(',');
    const [tags] = await db.execute(
      `SELECT id, name FROM question_tags WHERE id IN (${placeholders})`, ids
    );
    for (const t of tags) nameMap.set(Number(t.id), t.name);
  }
  return rows.map((r) => {
    const tagId = Number(r.tag_id);
    const practiced = Number(r.practiced) || 0;
    const correct = Number(r.correct) || 0;
    return {
      tag_id: tagId,
      tag_name: nameMap.get(tagId) || `标签#${tagId}`,
      practiced,
      correct,
      mastery: practiced > 0 ? Math.round((correct / practiced) * 100) : 0,
    };
  });
}

/**
 * FR-302 深度考情：得分分布 + 区分度 + 诱答（n≥minSample 才产出区分度/诱答）。
 * 口径与 exams.js analysis 一致：每学生最高分 attempt。
 */
export async function getExamAnalysisDeep(db = pool, examId, { minSample = MIN_SAMPLE } = {}) {
  const [examRows] = await db.execute(
    'SELECT id, title, total_points, pass_score FROM exams WHERE id = ?',
    [examId]
  );
  if (examRows.length === 0) return null;
  const exam = examRows[0];
  const totalPoints = Number(exam.total_points) || 0;

  const [attempts] = await db.execute(
    `SELECT user_id, score, details FROM exam_attempts
     WHERE exam_id = ? AND status IN ('submitted','auto_submitted')
     ORDER BY user_id, score DESC, id DESC`,
    [examId]
  );
  const bestByUser = new Map();
  for (const a of attempts) {
    if (!bestByUser.has(a.user_id)) {
      bestByUser.set(a.user_id, { score: Number(a.score) || 0, details: parseJsonSafe(a.details, []) });
    }
  }
  const users = [...bestByUser.entries()]; // [userId, {score, details}]
  const n = users.length;

  // 得分分布（按满分百分比分档）
  const buckets = [
    { label: '0-59%', min: 0, max: 59.999 },
    { label: '60-69%', min: 60, max: 69.999 },
    { label: '70-79%', min: 70, max: 79.999 },
    { label: '80-89%', min: 80, max: 89.999 },
    { label: '90-100%', min: 90, max: 100.001 },
  ];
  const distribution = buckets.map((b) => ({ label: b.label, count: 0 }));
  for (const [, v] of bestByUser) {
    const pct = totalPoints > 0 ? (v.score / totalPoints) * 100 : 0;
    const idx = buckets.findIndex((b) => pct >= b.min && pct <= b.max);
    if (idx >= 0) distribution[idx].count += 1;
  }

  const result = {
    examId: Number(exam.id),
    title: exam.title,
    total_points: totalPoints,
    pass_score: exam.pass_score,
    referenceCount: n,
    distribution,
    sampleSize: n,
    minSample,
    sample_insufficient: n < minSample,
    discrimination: null,
    distractors: null,
  };

  // 区分度 + 诱答：样本不足则跳过（FR-302 统计显著性护栏）
  if (n < minSample) return result;

  // 高低分组（各取 27%，按分数排序）
  const sorted = [...bestByUser.entries()].sort((a, b) => b[1].score - a[1].score);
  const groupSize = Math.max(1, Math.floor(n * 0.27));
  const topGroup = sorted.slice(0, groupSize);
  const bottomGroup = sorted.slice(-groupSize);

  const rateByGroup = (group) => {
    const stat = new Map(); // qid -> {correct, total}
    for (const [, v] of group) {
      for (const d of v.details) {
        if (d.is_correct === true || d.is_correct === false) {
          const s = stat.get(d.question_id) || { correct: 0, total: 0 };
          s.total += 1;
          if (d.is_correct === true) s.correct += 1;
          stat.set(d.question_id, s);
        }
      }
    }
    return stat;
  };
  const topStat = rateByGroup(topGroup);
  const botStat = rateByGroup(bottomGroup);
  const qids = new Set([...topStat.keys(), ...botStat.keys()]);
  const discrimination = [];
  for (const qid of qids) {
    const t = topStat.get(qid);
    const b = botStat.get(qid);
    const topRate = t && t.total > 0 ? t.correct / t.total : 0;
    const botRate = b && b.total > 0 ? b.correct / b.total : 0;
    discrimination.push({
      question_id: Number(qid),
      topRate: Math.round(topRate * 1000) / 1000,
      bottomRate: Math.round(botRate * 1000) / 1000,
      discrimination: Math.round((topRate - botRate) * 1000) / 1000,
    });
  }
  result.discrimination = discrimination.sort((a, b) => a.discrimination - b.discrimination);

  // 诱答分布：每题在答错者中，各错误选项被选次数
  const distractorStat = new Map(); // qid -> { correctAnswer, picks: {opt:count} }
  for (const [, v] of bestByUser) {
    for (const d of v.details) {
      if (d.is_correct === false) {
        const ds = distractorStat.get(d.question_id) || { correctAnswer: d.correct_answer ?? null, picks: {} };
        const pick = d.user_answer == null ? '(空)' : String(d.user_answer);
        ds.picks[pick] = (ds.picks[pick] || 0) + 1;
        distractorStat.set(d.question_id, ds);
      }
    }
  }
  result.distractors = [...distractorStat.entries()].map(([qid, ds]) => ({
    question_id: Number(qid),
    correct_answer: ds.correctAnswer,
    wrong_picks: Object.entries(ds.picks)
      .map(([option, count]) => ({ option, count }))
      .sort((a, b) => b.count - a.count),
  }));

  return result;
}

/**
 * FR-302 班级横向：某教师名下学员的练习量/正确率对比。
 */
export async function getClassCompare(db = pool, teacherId) {
  const [rows] = await db.execute(
    `SELECT u.id AS user_id, u.username,
            COALESCE(SUM(CASE WHEN s.metric='practiced' AND s.dim_key IS NULL THEN s.value END), 0) AS practiced,
            COALESCE(SUM(CASE WHEN s.metric='correct' AND s.dim_key IS NULL THEN s.value END), 0) AS correct
     FROM users u
     LEFT JOIN stats_daily s ON s.user_id = u.id AND s.metric IN ('practiced','correct')
     WHERE u.teacher_id = ?
     GROUP BY u.id, u.username
     ORDER BY practiced DESC`,
    [teacherId]
  );
  return rows.map((r) => {
    const practiced = Number(r.practiced) || 0;
    const correct = Number(r.correct) || 0;
    return {
      user_id: Number(r.user_id),
      username: r.username,
      practiced,
      correct,
      accuracy: practiced > 0 ? Math.round((correct / practiced) * 100) : 0,
    };
  });
}
