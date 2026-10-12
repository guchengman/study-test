/**
 * FR-606 配额核心服务（plans / quotas / quota_usage 读写与校验）。
 *
 * 设计：
 *   - db 依赖注入（默认 pool），沿用 storageUsage/notification 可测范式。
 *   - getOrgPlan：organizations.plan（013 已有列，UPPER 归一，缺省 FREE）。
 *   - checkQuota(db, orgId, resourceType, amount) → {allowed, reason?, usage, limit}
 *       · limit=-1 → 无限；
 *       · period=per_request → 单次量 amount 与 limit 比较，不累计；
 *       · upload_bytes → 额外读 storage_usage.circuit_broken，熔断则 429 拒绝；
 *       · 其余（monthly/yearly/total）→ 读 quota_usage 滚动计数比较。
 *   - recordUsage：对累计型 period UPSERT quota_usage.used += amount；per_request / 无配额行 → 不记录。
 *   - 所有 DB 异常向上抛，由调用方（路由）容错，避免配额基础设施故障阻断主流程时可控。
 */
import crypto from 'crypto';
import pool from '../db.js';

/** 组织无 plan 时的兜底计划 */
export const DEFAULT_PLAN = 'FREE';

/** 月/年滚动 key 的时区偏移：统一按 UTC+8 归属周期（业务日切） */
const PERIOD_TZ_OFFSET_HOURS = 8;

/**
 * 取租户的订阅计划 code（大写归一）。
 * @param {object} db
 * @param {number} orgId
 * @returns {Promise<string>}
 */
export async function getOrgPlan(db = pool, orgId) {
  const [rows] = await db.execute('SELECT plan FROM organizations WHERE id = ?', [orgId]);
  const plan = rows.length > 0 && rows[0].plan ? String(rows[0].plan).toUpperCase() : DEFAULT_PLAN;
  return plan || DEFAULT_PLAN;
}

/**
 * 取某计划某资源的配额定义。
 * @returns {Promise<{limit:number, period:string}|null>}
 */
export async function getQuota(db = pool, planCode, resourceType) {
  const [rows] = await db.execute(
    'SELECT `limit`, period FROM quotas WHERE plan_code = ? AND resource_type = ? LIMIT 1',
    [String(planCode).toUpperCase(), resourceType]
  );
  if (rows.length === 0) return null;
  return { limit: Number(rows[0].limit), period: rows[0].period };
}

/**
 * 依据 period 与当前时间（UTC+8）推导滚动 key。
 * @param {string} period
 * @param {Date} [now]
 * @returns {string} monthly=YYYY-MM / yearly=YYYY / 其它=TOTAL
 */
export function getPeriodKey(period, now = new Date()) {
  if (period === 'monthly' || period === 'yearly') {
    const shifted = new Date(now.getTime() + PERIOD_TZ_OFFSET_HOURS * 3600 * 1000);
    const y = shifted.getUTCFullYear();
    if (period === 'yearly') return String(y);
    const m = String(shifted.getUTCMonth() + 1).padStart(2, '0');
    return `${y}-${m}`;
  }
  return 'TOTAL';
}

/**
 * 读取某 org/resource/periodKey 的已用量。
 * @returns {Promise<number>}
 */
export async function getCurrentUsage(db = pool, orgId, resourceType, periodKey) {
  const [rows] = await db.execute(
    'SELECT used FROM quota_usage WHERE org_id = ? AND resource_type = ? AND period_key = ? LIMIT 1',
    [orgId, resourceType, periodKey]
  );
  return rows.length > 0 ? Number(rows[0].used) : 0;
}

/** 读存储熔断标记（storage_usage.circuit_broken）。 */
async function isCircuitBroken(db, orgId) {
  const [rows] = await db.execute(
    'SELECT circuit_broken FROM storage_usage WHERE org_id = ? LIMIT 1',
    [orgId]
  );
  return rows.length > 0 && Number(rows[0].circuit_broken) === 1;
}

/**
 * 校验某资源是否允许再消耗 amount。
 * @param {object} db
 * @param {number|null} orgId
 * @param {string} resourceType
 * @param {number} amount
 * @returns {Promise<{allowed:boolean, reason?:string, usage:number, limit:number|null, status?:number}>}
 */
export async function checkQuota(db = pool, orgId, resourceType, amount = 1) {
  // 无租户（历史容错）：不设限，交由主流程继续
  if (orgId == null) {
    return { allowed: true, reason: 'no_org', usage: 0, limit: null };
  }

  const plan = await getOrgPlan(db, orgId);
  const quota = await getQuota(db, plan, resourceType);

  // 该计划未定义此资源配额：默认放行
  if (!quota) {
    return { allowed: true, reason: 'unrestricted', usage: 0, limit: null };
  }

  const { limit, period } = quota;

  // 无限（仅付费）
  if (limit === -1) {
    return { allowed: true, usage: 0, limit: -1 };
  }

  // 单请求型（如 export_rows）：本次量与上限比较，不累计、不看熔断
  if (period === 'per_request') {
    const allowed = amount <= limit;
    return {
      allowed,
      reason: allowed ? undefined : 'quota_exceeded',
      usage: amount,
      limit,
      status: allowed ? undefined : 429,
    };
  }

  // 上传字节：熔断优先（存储扫描置位后拒绝上传）
  if (resourceType === 'upload_bytes' && (await isCircuitBroken(db, orgId))) {
    return { allowed: false, reason: 'circuit_broken', usage: 0, limit, status: 429 };
  }

  const periodKey = getPeriodKey(period);
  const usage = await getCurrentUsage(db, orgId, resourceType, periodKey);
  const allowed = usage + amount <= limit;
  return {
    allowed,
    reason: allowed ? undefined : 'quota_exceeded',
    usage,
    limit,
    status: allowed ? undefined : 429,
  };
}

/**
 * 记录一次消耗（仅累计型 period）。
 * @returns {Promise<{recorded:boolean, periodKey?:string}>}
 */
export async function recordUsage(db = pool, orgId, resourceType, amount = 1) {
  if (orgId == null) return { recorded: false };
  const plan = await getOrgPlan(db, orgId);
  const quota = await getQuota(db, plan, resourceType);
  if (!quota) return { recorded: false };
  // 单请求型不累计（本次量已在 checkQuota 比较）
  if (quota.period === 'per_request') return { recorded: false };
  const periodKey = getPeriodKey(quota.period);
  await db.execute(
    `INSERT INTO quota_usage (org_id, resource_type, period_key, used)
     VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE used = used + VALUES(used), updated_at = NOW()`,
    [orgId, resourceType, periodKey, amount]
  );
  return { recorded: true, periodKey };
}

/**
 * 某租户当前周期的配额用量快照（GET /usage 用）。
 * @returns {Promise<Array<{resource_type:string, period:string, limit:number, usage:number|null}>>}
 */
export async function listQuotaUsage(db = pool, orgId) {
  if (orgId == null) return [];
  const plan = await getOrgPlan(db, orgId);
  const [rows] = await db.execute(
    'SELECT resource_type, period, `limit` FROM quotas WHERE plan_code = ? ORDER BY resource_type',
    [plan]
  );
  const out = [];
  for (const r of rows) {
    const limit = Number(r.limit);
    let usage = null;
    if (r.period !== 'per_request') {
      usage = await getCurrentUsage(db, orgId, r.resource_type, getPeriodKey(r.period));
    }
    out.push({ resource_type: r.resource_type, period: r.period, limit, usage });
  }
  return out;
}

/**
 * 解析单请求导出行上限（供 exportService 读取，替代硬编码）。
 * @returns {Promise<number>} 无配额时回落 fallback
 */
export async function getPerRequestLimit(db = pool, orgId, resourceType, fallback) {
  if (orgId == null) return fallback;
  const plan = await getOrgPlan(db, orgId);
  const quota = await getQuota(db, plan, resourceType);
  return quota && Number.isFinite(quota.limit) ? quota.limit : fallback;
}

/**
 * BYO Key 登记：仅存 sha256 指纹（不落明文），UPSERT byo_key_registry。
 * @param {object} db
 * @param {{user_id:number, provider:string, key_preview?:string}} opts
 * @returns {Promise<{id:number, key_hash:string}>}
 */
export async function registerByoKey(db = pool, { user_id, provider, key_preview = '' }) {
  const hash = crypto.createHash('sha256').update(String(key_preview)).digest('hex');
  await db.execute(
    `INSERT INTO byo_key_registry (user_id, provider, key_hash, verified_at)
     VALUES (?, ?, ?, NOW())
     ON DUPLICATE KEY UPDATE key_hash = VALUES(key_hash), verified_at = NOW()`,
    [user_id, provider, hash]
  );
  const [rows] = await db.execute(
    'SELECT id FROM byo_key_registry WHERE user_id = ? AND provider = ? LIMIT 1',
    [user_id, provider]
  );
  return { id: rows.length > 0 ? rows[0].id : null, key_hash: hash };
}
