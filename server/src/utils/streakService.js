/**
 * FR-501 Streak 连续打卡核心服务。
 *
 * 设计：
 *   - db 依赖注入（默认 pool），沿用 quota/storage/notification/stats 可测范式。
 *   - 业务日粒度：UTC+8 日历日（todayStr/yesterdayStr）；打卡以「最近活跃日」推进连续计数。
 *   - tickDay：练习/考试提交后调用；今天已打卡 no-op；昨天活跃则 +1；否则视为新一轮 =1。
 *     （跨日断流由 checkBroken 归零，故 tickDay 遇到陈旧 current 直接重置为 1 起算。）
 *   - awardCard：连续天数每满 AWARD_INTERVAL_DAYS(30) 的倍数发一张补签卡，上限 MAX_MAKEUP_CARDS(3)。
 *   - useMakeupCard：仅可补「昨日活跃、今日缺席」的紧邻断点，每月限 MONTHLY_MAKEUP_LIMIT(2) 次。
 *   - checkBroken：调度器遍历，活跃停留在昨日之前且仍计数者 → 归零 + break 事件 + streak_break 通知。
 *   - 遵循 S0：新建 streaks 行时 resolvePersonalOrgId 赋 org_id（可空、不阻断）。
 */
import pool from '../db.js';
import { resolvePersonalOrgId } from './personalOrg.js';
import { createNotification } from './notificationService.js';
import log from './logger.js';

/** 业务日切时区（UTC+8） */
const TZ_OFFSET_HOURS = 8;
/** 每连续多少天奖励一张补签卡 */
export const AWARD_INTERVAL_DAYS = 30;
/** 补签卡持有上限 */
export const MAX_MAKEUP_CARDS = 3;
/** 每月补签次数上限 */
export const MONTHLY_MAKEUP_LIMIT = 2;
/** 新用户的初始补签卡数 */
export const INITIAL_MAKEUP_CARDS = 1;

// ─── 日期助手（UTC+8 日历日） ──────────────────────────────
function ymd(d, offset = TZ_OFFSET_HOURS) {
  const shifted = new Date(d.getTime() + offset * 3600 * 1000);
  return shifted.toISOString().slice(0, 10);
}
/** 今日 YYYY-MM-DD（UTC+8） */
export function todayStr(now = new Date()) { return ymd(now); }
/** 昨日 YYYY-MM-DD（UTC+8） */
export function yesterdayStr(now = new Date()) { return ymd(new Date(now.getTime() - 24 * 3600 * 1000)); }
/** 本月 YYYY-MM（UTC+8） */
export function monthStr(now = new Date()) { return ymd(now).slice(0, 7); }

const SELECT_STREAK_COLS =
  `SELECT id, current, longest, DATE_FORMAT(last_active_date, '%Y-%m-%d') AS last_active_date,
          makeup_cards, makeup_used_this_month, makeup_month
   FROM streaks WHERE user_id = ?`;

// ─── 打卡 ──────────────────────────────────────────────────
/**
 * 记录一次活跃（练习/考试提交后调用）。
 * @returns {Promise<{ticked:boolean, current:number, longest?:number, awarded?:boolean, reason?:string}>}
 */
export async function tickDay(db = pool, userId, now = new Date()) {
  const today = todayStr(now);
  const yday = yesterdayStr(now);
  const [rows] = await db.execute(SELECT_STREAK_COLS, [userId]);
  const s = rows[0];
  const isNew = !s;

  if (!isNew && s.last_active_date === today) {
    return { ticked: false, current: Number(s.current), reason: 'already_ticked' };
  }

  const prevCurrent = isNew ? 0 : Number(s.current) || 0;
  const prevLongest = isNew ? 0 : Number(s.longest) || 0;
  const lastActive = isNew ? null : s.last_active_date;
  const newCurrent = lastActive === yday ? prevCurrent + 1 : 1;
  const newLongest = Math.max(prevLongest, newCurrent);

  if (isNew) {
    const orgId = await resolvePersonalOrgId(db, userId);
    await db.execute(
      `INSERT INTO streaks (user_id, current, longest, last_active_date, makeup_cards, makeup_used_this_month, makeup_month, org_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [userId, newCurrent, newLongest, today, INITIAL_MAKEUP_CARDS, 0, null, orgId]
    );
  } else {
    await db.execute(
      'UPDATE streaks SET current = ?, longest = ?, last_active_date = ? WHERE id = ?',
      [newCurrent, newLongest, today, s.id]
    );
  }
  await db.execute(
    "INSERT INTO streak_events (user_id, event, detail) VALUES (?, 'tick', ?)",
    [userId, JSON.stringify({ current: newCurrent, date: today })]
  );

  let awarded = false;
  if (newCurrent > 0 && newCurrent % AWARD_INTERVAL_DAYS === 0) {
    awarded = (await awardCard(db, userId)).awarded;
  }
  return { ticked: true, current: newCurrent, longest: newLongest, awarded };
}

// ─── 奖励补签卡 ────────────────────────────────────────────
/** 连续天数达 30 的倍数时发一张补签卡（上限 3）。 */
export async function awardCard(db = pool, userId) {
  const [rows] = await db.execute('SELECT id, current, makeup_cards FROM streaks WHERE user_id = ?', [userId]);
  if (rows.length === 0) return { awarded: false, reason: 'no_streak' };
  const s = rows[0];
  const current = Number(s.current) || 0;
  if (!(current > 0 && current % AWARD_INTERVAL_DAYS === 0)) {
    return { awarded: false, reason: 'not_milestone' };
  }
  const cards = Number(s.makeup_cards) || 0;
  if (cards >= MAX_MAKEUP_CARDS) {
    await db.execute(
      "INSERT INTO streak_events (user_id, event, detail) VALUES (?, 'award_card', ?)",
      [userId, JSON.stringify({ capped: true, cards })]
    );
    return { awarded: false, reason: 'card_cap' };
  }
  const newCards = cards + 1;
  await db.execute('UPDATE streaks SET makeup_cards = ? WHERE id = ?', [newCards, s.id]);
  await db.execute(
    "INSERT INTO streak_events (user_id, event, detail) VALUES (?, 'award_card', ?)",
    [userId, JSON.stringify({ cards: newCards })]
  );
  return { awarded: true, cards: newCards };
}

// ─── 使用补签卡 ────────────────────────────────────────────
/**
 * 补签：仅可修复「昨日活跃、今日尚未打卡」的紧邻断点；不改变 last_active 之前的历史。
 * 前置：有 streak 行 & 未今日活跃 & 有卡 & 本月用量 < 2 & last_active === 昨日。
 */
export async function useMakeupCard(db = pool, userId, now = new Date()) {
  const today = todayStr(now);
  const yday = yesterdayStr(now);
  const month = monthStr(now);
  const [rows] = await db.execute(SELECT_STREAK_COLS, [userId]);
  if (rows.length === 0) return { ok: false, reason: 'no_streak' };
  const s = rows[0];

  if (s.last_active_date === today) return { ok: false, reason: 'already_active_today' };
  if (Number(s.makeup_cards) <= 0) return { ok: false, reason: 'no_card' };

  // 跨月重置本月用量
  let used = Number(s.makeup_used_this_month) || 0;
  if (s.makeup_month !== month) used = 0;
  if (used >= MONTHLY_MAKEUP_LIMIT) return { ok: false, reason: 'monthly_limit' };

  // 仅紧邻断点可补（活跃停留在昨日）
  if (s.last_active_date !== yday) return { ok: false, reason: 'not_eligible' };

  const newCurrent = (Number(s.current) || 0) + 1;
  const newLongest = Math.max(Number(s.longest) || 0, newCurrent);
  const newCards = Number(s.makeup_cards) - 1;
  await db.execute(
    `UPDATE streaks SET current = ?, longest = ?, last_active_date = ?, makeup_cards = ?, makeup_used_this_month = ?, makeup_month = ?
     WHERE id = ?`,
    [newCurrent, newLongest, today, newCards, used + 1, month, s.id]
  );
  await db.execute(
    "INSERT INTO streak_events (user_id, event, detail) VALUES (?, 'makeup', ?)",
    [userId, JSON.stringify({ current: newCurrent, date: today, cards_left: newCards })]
  );
  return { ok: true, current: newCurrent, makeup_cards: newCards, makeup_used_this_month: used + 1 };
}

// ─── 断流检测（调度器调用） ────────────────────────────────
/**
 * 遍历仍计数但活跃停留在昨日之前的 streak 行：归零 + break 事件 + streak_break 通知。
 * @returns {Promise<{broken:number}>}
 */
export async function checkBroken(db = pool, now = new Date()) {
  const yday = yesterdayStr(now);
  const [rows] = await db.execute(
    `SELECT id, user_id, current FROM streaks
     WHERE current > 0 AND (last_active_date IS NULL OR last_active_date < ?)`,
    [yday]
  );
  let broken = 0;
  for (const s of rows) {
    const lost = Number(s.current) || 0;
    await db.execute('UPDATE streaks SET current = 0 WHERE id = ?', [s.id]);
    await db.execute(
      "INSERT INTO streak_events (user_id, event, detail) VALUES (?, 'break', ?)",
      [s.user_id, JSON.stringify({ lost_current: lost })]
    );
    await createNotification(db, {
      user_id: s.user_id, type: 'streak_break', title: '连续打卡已中断', payload: { lost_current: lost },
    });
    broken += 1;
  }
  if (broken > 0) log.info({ msg: 'streak_break_check', broken }, '连续打卡断流处理完成');
  return { broken };
}

// ─── 查询状态 ──────────────────────────────────────────────
/** 读取某用户 streak 状态（无行返回默认值）。 */
export async function getStreak(db = pool, userId, now = new Date()) {
  const today = todayStr(now);
  const [rows] = await db.execute(SELECT_STREAK_COLS, [userId]);
  const s = rows[0] || {
    current: 0, longest: 0, last_active_date: null,
    makeup_cards: INITIAL_MAKEUP_CARDS, makeup_used_this_month: 0, makeup_month: null,
  };
  const current = Number(s.current) || 0;
  return {
    current,
    longest: Number(s.longest) || 0,
    last_active_date: s.last_active_date ?? null,
    active_today: s.last_active_date === today,
    can_makeup: current >= 0 && s.last_active_date === yesterdayStr(now) && Number(s.makeup_cards) > 0,
    makeup_cards: Number(s.makeup_cards) || 0,
    makeup_used_this_month: Number(s.makeup_used_this_month) || 0,
    makeup_month: s.makeup_month ?? null,
  };
}
