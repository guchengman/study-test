// ============================================================
// S0 shadow schema 写入侧工具（PRD §5.3「写入即赋值、查询不过滤」）
// ------------------------------------------------------------
// Phase 0 租户数据面约定：
//   * 7 张核心表（questions/subjects/exams/exam_attempts/
//     mistake_records/favorites/study_stats）写入时赋 org_id，
//     所有读路径不加 org 过滤 —— 行为零变更，仅铺数据。
//   * 个人租户 derivation 规则与迁移 013/014 完全一致：
//     organizations UNIQUE(name) 且当前仅 PERSONAL，
//     name = 用户 username，经 org_members(user_id) 关联。
//   * resolve 返回 null 不阻断写入（shadow 列可空；历史遗留
//     无租户用户属容错场景，Phase 2 统一对账）。
// ============================================================

/** 角色映射 §5.2：users.role → org_members.role（注册建档与 013 回填同口径） */
export function mapUserRoleToOrg(userRole) {
  if (userRole === 'admin') return 'platform_admin';
  if (userRole === 'teacher') return 'content_author';
  return 'examinee';
}

/**
 * 为新注册用户建档 PERSONAL 租户 + 成员关系（与迁移 013 的存量回填同规则）。
 * 幂等（UNIQUE 键 + IGNORE）；失败仅告警不阻断注册主流程。
 * @param {import('mysql2/promise').Pool|import('mysql2/promise').PoolConnection} db
 */
export async function ensurePersonalOrg(db, userId, username, userRole) {
  try {
    await db.execute(
      `INSERT IGNORE INTO organizations (type, name) SELECT 'PERSONAL', ?`,
      [username]
    );
    await db.execute(
      `INSERT IGNORE INTO org_members (org_id, user_id, role)
       SELECT o.id, ?, ? FROM organizations o WHERE o.type = 'PERSONAL' AND o.name = ?`,
      [userId, mapUserRoleToOrg(userRole), username]
    );
  } catch (err) {
    // 组织建档是影子数据面，任何异常不得影响注册结果
    console.warn('[personalOrg] 个人租户建档失败(不阻断):', err.message);
  }
}

/**
 * 取用户的 PERSONAL 租户 id（单行小查询，写入路径调用）。
 * @returns {Promise<number|null>} 无租户时返回 null
 */
export async function resolvePersonalOrgId(db, userId) {
  try {
    const [rows] = await db.execute(
      `SELECT m.org_id FROM org_members m
       JOIN organizations o ON o.id = m.org_id AND o.type = 'PERSONAL'
       WHERE m.user_id = ? LIMIT 1`,
      [userId]
    );
    return rows.length > 0 ? rows[0].org_id : null;
  } catch {
    return null;
  }
}
