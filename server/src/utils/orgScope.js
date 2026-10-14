// server/src/utils/orgScope.js
// M3 数据地基：org 读过滤的开关与谓词构建（纯函数，零 DB）。
// 权威源=org_members：某用户可见的数据 = 其所属全部组织的并集。
//   （一人可属多组织：个人 PERSONAL + 所在班级/企业），故过滤单位是 `org_id IN (用户组织集合)`，
//   而非单一 currentOrg。

export function orgIsolationMode() {
  const s = (process.env.ORG_ISOLATION_MODE || 'off').trim().toLowerCase();
  return s === 'shadow' || s === 'enforce' ? s : 'off';
}

/** 构建 org 过滤片段。alias=表别名；orgIds=用户所属组织 id 数组。 */
export function buildOrgFilter(alias, orgIds) {
  const ids = [...new Set((orgIds || []).map((n) => Number(n)).filter((n) => Number.isInteger(n)))].sort(
    (a, b) => a - b
  );
  if (ids.length === 0) return { clause: ' AND 1=0', params: [] };
  return { clause: ` AND ${alias}.org_id IN (${ids.map(() => '?').join(',')})`, params: ids };
}
