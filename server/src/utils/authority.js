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
