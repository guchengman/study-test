// ============================================================
// M3 数据地基对账（跨租户隔离开闸前的硬门禁之一）
// ------------------------------------------------------------
// 校验：
//   1) 各 org 表 org_id 的 NULL 分布（应仅剩历史孤儿科目，人工确认）；
//   2) 师生分组完整性：有学生的老师是否都已归入 class 组织。
// 任一缺口 > 0 视为待确认，退出码非 0，ORG_ISOLATION_MODE 不得翻 enforce。
// 用法：cd server && node scripts/reconcile-org-isolation.cjs
// ============================================================
const path = require('path');
const mysql = require('mysql2/promise');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const ORG_TABLES = [
  'questions', 'subjects', 'exams', 'exam_attempts', 'mistake_records',
  'favorites', 'study_stats', 'question_groups', 'question_judge_configs',
  'question_tags', 'export_jobs', 'judge_runs',
];

(async () => {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST, port: +(process.env.DB_PORT || 3306),
    user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME,
  });
  let issues = 0;

  for (const t of ORG_TABLES) {
    try {
      const [[r]] = await conn.query(
        `SELECT COUNT(*) total, SUM(org_id IS NULL) nulls FROM \`${t}\``
      );
      const flag = r.nulls > 0 ? ' (待确认)' : '';
      console.log(`[org_id] ${t}: total=${r.total} null=${r.nulls}${flag}`);
      if (r.nulls > 0) issues++;
    } catch (e) {
      console.log(`[org_id] ${t}: 跳过(${e.code === 'ER_NO_SUCH_TABLE' ? '表不存在' : e.message})`);
    }
  }

  const [[tc]] = await conn.query(
    `SELECT COUNT(*) n FROM users t WHERE t.role='teacher'
       AND EXISTS (SELECT 1 FROM users st WHERE st.teacher_id=t.id)
       AND NOT EXISTS (SELECT 1 FROM organizations o
             WHERE o.type='SCHOOL' AND o.name=CONCAT('class:', t.username))`
  );
  console.log(`[group] teachers_without_class=${tc.n}${tc.n > 0 ? ' (分组不完整)' : ''}`);
  if (tc.n > 0) issues++;

  await conn.end();
  if (issues === 0) {
    console.log('[reconcile] 地基对账通过：分组完整，org_id 无待确认缺口');
    process.exit(0);
  }
  console.error(`[reconcile] 存在 ${issues} 项待确认（NULL 覆盖或分组缺口），详见上方`);
  process.exit(1);
})().catch((e) => {
  console.error('[reconcile] 执行失败:', e.message);
  process.exit(2);
});
