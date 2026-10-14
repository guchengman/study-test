// 分享落地页核心逻辑（可见性 + 抽样 + 预览 + 无状态判分）。
// 返回 { status, body }；任何响应体手工白名单构造，绝不含 answer/explanation。
import pool from '../db.js';
import { isAnswerCorrect } from '../utils/examScoring.generated.js';
import { signShareToken, verifyShareToken } from '../utils/shareToken.js';

const NOT_FOUND = { status: 404, body: { error: '链接不存在或已失效' } };
const previewCount = () => {
  const n = parseInt(process.env.SHARE_PREVIEW_COUNT, 10);
  return Number.isInteger(n) && n > 0 ? n : 5;
};

// 容错解析 JSON 列（mysql2 可能已解析为对象/数组，历史也可能仍是字符串）
function asJson(v) {
  if (v == null) return v;
  if (typeof v === 'string') { try { return JSON.parse(v); } catch { return v; } }
  return v;
}

async function resolvePublicSubject(db, code) {
  const [codes] = await db.query(
    "SELECT subject_id, expires_at FROM invite_codes WHERE code = ? AND type = 'subject' LIMIT 1",
    [code]
  );
  if (!codes.length) return null;
  const c = codes[0];
  if (c.expires_at && new Date(c.expires_at).getTime() < Date.now()) return null; // 码过期
  const [subs] = await db.query(
    'SELECT id, name, icon, welcome_title, welcome_desc, share_scope, created_by FROM subjects WHERE id = ? LIMIT 1',
    [c.subject_id]
  );
  if (!subs.length) return null;
  const s = subs[0];
  if (s.share_scope !== 'all') return null; // 非全员共享不可公开发现
  return s;
}

export async function buildPreview(db = pool, code) {
  if (!code || typeof code !== 'string') return NOT_FOUND;
  const subject = await resolvePublicSubject(db, code);
  if (!subject) return NOT_FOUND;

  const [types] = await db.query(
    'SELECT type, COUNT(*) c FROM questions WHERE subject_id = ? AND deleted_at IS NULL GROUP BY type',
    [subject.id]
  );
  const byType = {};
  let questionCount = 0;
  for (const t of types) { byType[t.type] = Number(t.c); questionCount += Number(t.c); }

  const [rows] = await db.query(
    "SELECT id, type, title, options, answer FROM questions WHERE subject_id = ? AND deleted_at IS NULL AND type IN ('single','multiple') ORDER BY RAND() LIMIT ?",
    [subject.id, previewCount()]
  );

  const questions = rows.map((r) => ({ id: r.id, type: r.type, title: r.title, options: asJson(r.options) ?? [] }));
  const qids = rows.map((r) => r.id);
  const quizToken = signShareToken({ code, qids });

  let creator = null;
  if (subject.created_by) {
    const [us] = await db.query('SELECT username FROM users WHERE id = ? LIMIT 1', [subject.created_by]);
    creator = us.length ? { displayName: us[0].username } : null;
  }

  return {
    status: 200,
    body: {
      subject: {
        name: subject.name, icon: subject.icon,
        welcomeTitle: subject.welcome_title, welcomeDesc: subject.welcome_desc,
        questionCount, byType,
      },
      creator,
      experience: { quizToken, questions },
    },
  };
}

export async function buildGrade(db = pool, token, answers) {
  let payload;
  try { payload = verifyShareToken(token); } catch { return { status: 400, body: { error: '体验会话无效或已过期' } }; }
  const qids = payload.qids; // 只信令牌内 id
  if (!qids.length) return { status: 400, body: { error: '体验会话无效' } };

  const [rows] = await db.query(
    'SELECT id, type, answer, options FROM questions WHERE id IN (?) AND deleted_at IS NULL',
    [qids]
  );
  const safeAnswers = answers && typeof answers === 'object' ? answers : {};
  const results = rows.map((r) => {
    const q = { type: r.type, answer: asJson(r.answer), options: asJson(r.options) };
    const correct = isAnswerCorrect(q, safeAnswers[String(r.id)] ?? safeAnswers[r.id]);
    return { qid: r.id, correct };
  });
  const total = results.length;
  const correct = results.filter((x) => x.correct).length;
  const scorePercent = total > 0 ? Math.round((correct / total) * 100) : 0;
  return { status: 200, body: { total, correct, scorePercent, results } };
}
