// ============================================================
// M2 角色权威层（PRD §5.2 角色映射 + §5.3 影子租户）
// ------------------------------------------------------------
// 把判权权威源从 users.role（全局、烤进 JWT）切换到 org_members.role
// （按当前操作组织解析）。三档开关 ROLE_AUTHORITY_SOURCE：
//   legacy —— 纯旧行为（回滚开关）
//   shadow —— 旧矩阵决策 + 新矩阵对账打差异日志（默认，零行为变更）
//   org    —— 新矩阵决策（对账干净后切换）
// 能力词表见 docs/superpowers/plans/2026-10-14-phase2-m2-role-authority.md；
// 改 cap 名必须同步两张矩阵、单测「等价性」用例与全部调用点。
// ============================================================

import pool from '../db.js';

/** 旧词表：users.role ∈ {admin,teacher,student,independent} */
export const LEGACY_ROLE_CAPS = {
  admin: ['platform.super', 'content.manage', 'student.manage', 'exam.manage_super', 'exam.manage_any', 'invite.manage'],
  teacher: ['content.manage', 'student.manage', 'exam.manage_any', 'invite.manage'],
  student: ['actor.examinee'],
  independent: ['actor.examinee'],
};

/** 新词表：org_members.role ∈ {platform_admin,org_admin,content_author,examinee,reader} */
export const ORG_ROLE_CAPS = {
  platform_admin: ['platform.super', 'content.manage', 'student.manage', 'exam.manage_super', 'exam.manage_any', 'invite.manage'],
  org_admin: ['content.manage', 'student.manage', 'exam.manage_any', 'invite.manage'],
  content_author: ['content.manage', 'student.manage', 'exam.manage_any', 'invite.manage'],
  examinee: ['actor.examinee'],
  reader: [],
};

export function capsForLegacyRole(role) {
  return new Set(LEGACY_ROLE_CAPS[role] || []);
}

export function capsForOrgRole(orgRole) {
  return new Set(ORG_ROLE_CAPS[orgRole] || []);
}

export function authoritySource() {
  const s = (process.env.ROLE_AUTHORITY_SOURCE || 'shadow').trim().toLowerCase();
  return s === 'legacy' || s === 'org' ? s : 'shadow';
}

function sameCaps(a, b) {
  if (a.size !== b.size) return false;
  for (const x of a) if (!b.has(x)) return false;
  return true;
}

/**
 * 依据开关算出生效能力集合。
 * shadow：用 legacy 决策，若 legacy 能力集 ≠ org 能力集则回调 onDrift（对账信号）。
 * @returns {Set<string>} 生效 caps
 */
export function computeCaps({ legacyRole, orgRole, onDrift }) {
  const src = authoritySource();
  const legacyCaps = capsForLegacyRole(legacyRole);
  const orgCaps = capsForOrgRole(orgRole);
  if (src === 'org') return orgCaps;
  if (src === 'legacy') return legacyCaps;
  // shadow：以 legacy 为准，仅记录漂移
  if (!sameCaps(legacyCaps, orgCaps) && onDrift) onDrift({ legacyRole, orgRole });
  return legacyCaps;
}

/** 漂移日志（限频交给调用侧，这里只发一条 warn）。 */
export function logAuthorityDrift(userId, info) {
  console.warn(
    `[role-authority:drift] user=${userId} legacy=${info.legacyRole} org=${info.orgRole} ` +
      `(mapUserRoleToOrg 与 org_members.role 不一致，M3 迁移前应对账清零)`
  );
}

/**
 * 取用户在「操作组织」内的 org_members.role。
 * 只换源阶段：操作组织 = 用户 PERSONAL 组织。
 * @returns {Promise<{orgId:number|null, orgRole:string|null}>}
 */
export async function loadOrgRole(db, userId) {
  const [rows] = await db.execute(
    `SELECT m.org_id, m.role FROM org_members m
     JOIN organizations o ON o.id = m.org_id AND o.type = 'PERSONAL'
     WHERE m.user_id = ? LIMIT 1`,
    [userId]
  );
  if (rows.length === 0) return { orgId: null, orgRole: null };
  return { orgId: rows[0].org_id, orgRole: rows[0].role };
}

/**
 * Express 中间件：在 authMiddleware 之后运行，把 req.orgId / req.caps 注入。
 * 不改动 req.user（JWT 里的 legacy role 保留，供 computeCaps 对账）。
 */
export function resolveAuthority(req, res, next) {
  if (!req.user) return next(); // 未鉴权路由直接放行
  (async () => {
    try {
      const { orgId, orgRole } = await loadOrgRole(pool, req.user.id);
      req.orgId = orgId;
      req.orgRole = orgRole;
      req.caps = computeCaps({
        legacyRole: req.user.role,
        orgRole,
        onDrift: (info) => logAuthorityDrift(req.user.id, info),
      });
      next();
    } catch (err) {
      // 权威层异常不得放大为 500：回退 legacy 决策，保证零行为变更
      console.warn('[role-authority] 解析失败，回退 legacy:', err.message);
      req.orgId = null;
      req.orgRole = null;
      req.caps = capsForLegacyRole(req.user.role);
      next();
    }
  })();
}

/** 同步判权（在已跑过 resolveAuthority 的 req 上）。 */
export function hasCapability(req, cap) {
  return !!(req.caps && req.caps.has(cap));
}

/** 路由守卫工厂：命中任一 cap 即放行。 */
export function requireCapability(...caps) {
  return (req, res, next) => {
    if (!caps.some((c) => hasCapability(req, c))) {
      return res.status(403).json({ error: '权限不足' });
    }
    next();
  };
}
