// ============================================================
// M2 角色权威对账（切换 org 源前的硬门禁）
// ------------------------------------------------------------
// 校验：每个用户在其 PERSONAL 组织内的 org_members.role，是否等于
//       mapUserRoleToOrg(users.role)。漂移>0 时退出码非 0，
//       ROLE_AUTHORITY_SOURCE 不得翻到 org。
// 用法：cd server && node scripts/reconcile-role-authority.cjs
// ============================================================
const path = require('path');
const mysql = require('mysql2/promise');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

// §5.2 角色映射（与 src/utils/personalOrg.js mapUserRoleToOrg 同口径，改动须同步）
const EXPECT = { admin: 'platform_admin', teacher: 'content_author' };
const expectedOrgRole = (legacyRole) => EXPECT[legacyRole] || 'examinee';

(async () => {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });
  const [rows] = await conn.query(`
    SELECT u.id, u.username, u.role AS legacy_role, m.role AS org_role
    FROM users u
    JOIN organizations o ON o.type = 'PERSONAL' AND o.name = u.username
    LEFT JOIN org_members m ON m.user_id = u.id AND m.org_id = o.id
  `);
  const drift = rows.filter((r) => (r.org_role || null) !== expectedOrgRole(r.legacy_role));
  console.log(`[reconcile] 用户总数=${rows.length} 漂移=${drift.length}`);
  drift.slice(0, 50).forEach((r) =>
    console.log(
      `  user#${r.id} ${r.username}: legacy=${r.legacy_role} org=${r.org_role || 'NULL'} 期望=${expectedOrgRole(r.legacy_role)}`
    )
  );
  await conn.end();
  if (drift.length === 0) {
    console.log('[reconcile] 漂移=0，可安全切换 ROLE_AUTHORITY_SOURCE=org');
    process.exit(0);
  }
  console.error('[reconcile] 存在漂移，禁止切换 org 源，请先补 org_members 或排查注册链路');
  process.exit(1);
})().catch((e) => {
  console.error('[reconcile] 执行失败:', e.message);
  process.exit(2);
});
