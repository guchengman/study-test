// server/src/utils/orgIsolationShadow.js
// M3 数据地基：org 隔离 shadow 旁路比对器。
//   * 只读、只打日志，绝不修改调用方数据或响应。
//   * mode=off → isShadowActive()=false → 调用点直接 return，零开销/零变更。
//   * mode=enforce → 也不走这里（由过滤读路径在后续计划直接应用 buildOrgFilter）。
import pool from '../db.js';
import { orgIsolationMode } from './orgScope.js';
import log from './logger.js';

export function isShadowActive() {
  return orgIsolationMode() === 'shadow';
}

/** 用户所属全部组织 id（org_members 权威）。失败返回 []（调用方据此判空，不影响主流程）。 */
export async function loadUserOrgIds(db, userId) {
  try {
    const [rows] = await db.execute(
      'SELECT org_id FROM org_members WHERE user_id = ?',
      [userId]
    );
    return rows.map((r) => r.org_id);
  } catch {
    return [];
  }
}

/** 纯函数：给定当前可见 rows 与用户组织集合，算「按 org 过滤会隐藏什么」。 */
export function shadowCompare(rows, orgIds) {
  const set = new Set((orgIds || []).map(Number));
  const kept = [];
  const wouldHide = [];
  const missingOrg = [];
  for (const r of rows || []) {
    if (r.org_id === null || r.org_id === undefined) {
      missingOrg.push({ id: r.id });
    } else if (set.has(Number(r.org_id))) {
      kept.push(r.id);
    } else {
      wouldHide.push({ id: r.id, org_id: r.org_id });
    }
  }
  return { kept, wouldHide, missingOrg, drift: wouldHide.length + missingOrg.length };
}

function logShadow(userId, table, res) {
  if (res.drift === 0) return;
  const preview = res.wouldHide.slice(0, 10).map((x) => x.id).join(',');
  log.warn(
    `[org-isolation:shadow] user=${userId} table=${table} drift=${res.drift} ` +
      `wouldHide=${res.wouldHide.length} missingOrg=${res.missingOrg.length} hideIds=[${preview}]`
  );
}

/**
 * 在 shadow 模式下旁路比对并打日志；非 shadow 直接 return。调用方拿到结果后忽略即可——
 * 本函数不返回业务数据、不改 rows。
 */
export async function maybeShadowCheckByOrg(req, rows, table) {
  if (!isShadowActive() || !Array.isArray(rows)) return;
  const orgIds = await loadUserOrgIds(pool, req.user.id);
  logShadow(req.user.id, table, shadowCompare(rows, orgIds));
}
