# M3 跨租户隔离 · 数据地基与开闸 运行手册

M3 = 存量迁移(WS-3) + 跨租户强隔离(WS-2)。本手册覆盖**第一段：零风险数据地基 + shadow 度量**。
真正的 enforce（按 org 强过滤读结果）属后续计划，本手册末尾给出其前置判据。

## 本阶段做了什么（地基，行为零变更）

- **目标表**：建 `departments`（班级/部门）与 `resource_acl`（跨租户授权），暂不接入任何读写。
- **师生分组**（迁移 030）：`teacher + 其 teacher_id 学生 → 同一 SCHOOL 组织 'class:{老师用户名}'`；
  老师入为 `content_author`、学生入为 `examinee`；老师创建的 subjects/questions/exams 的 `org_id`
  由老师 PERSONAL 组织**重指到 class 组织**。个人活动行（答题/收藏/错题）保持 PERSONAL。
- **shadow 开关** `ORG_ISOLATION_MODE`：
  - `off`（默认）：与现状逐字节一致，零旁路开销。
  - `shadow`：subjects/exams/questions 三个 list 读路径**旁路**算「按 `org_id IN 用户所属组织` 会隐藏哪些当前可见行」，命中则打 `[org-isolation:shadow] ... drift=N` 日志，**绝不改返回**。
  - `enforce`：本阶段**未实现**（读路径尚未应用 `buildOrgFilter`）。

判权可见单位是 `org_id IN (用户 org_members 全部组织)`，而非单一 currentOrg（一人可同时属 PERSONAL + class）。

## 部署注意（与 M2 同坑）

服务器 `deploy.yml` 每次部署用 Secrets **重新生成** `server/.env`，其中**不含** `ORG_ISOLATION_MODE`
→ 缺省即 `off`（安全）。要在服务器上开 `shadow` 观察 drift，须把
`ORG_ISOLATION_MODE=shadow` 加入 `deploy.yml` 的 "Update environment files" 段（或短期内不 push 时手改 `server/.env` + `pm2 restart study-server`），否则会被下次部署抹回 off。

## 灰度 / 开闸判据（后续 enforce 计划的入口）

1. 部署本阶段代码（默认 off），确认三 list 接口返回与现状一致。
2. 设 `ORG_ISOLATION_MODE=shadow`，观察 `[org-isolation:shadow]` 日志：
   - `drift` 应主要来自「靠 `subject_subscriptions` / `share_scope` 跨人共享」的行（这些尚未迁进 acl/组织）。
3. 跑 `cd server && node scripts/reconcile-org-isolation.cjs`：
   - `teachers_without_class=0`（分组完整）；
   - org_id NULL 仅剩历史孤儿/系统模板科目（人工确认归属）。
4. 把残留 drift 逐路由降到 0（迁移订阅/共享 → `resource_acl`，必要时把老师可见的活动行纳入 class）。
5. 测试库设 `enforce`，跑 `isolation.integration.mjs` + 手工回归 admin/teacher/student 三链路。
6. 生产翻 enforce：备份 `.env` → 改 enforce → `pm2 restart study-server --update-env`，观察 30 分钟。

## 回滚

- **行为回滚（首选）**：`ORG_ISOLATION_MODE` 改回 `off`（或 `shadow`），`pm2 restart study-server --update-env`，即时生效，不动数据。
- **数据回滚（如需撤销分组）**：手工执行 `server/migrations/rollback/030r_undo_teacher_class_grouping.sql`
  （把 class 内容 org_id 复原为老师 PERSONAL 组织，删除 class 组织，成员随外键 CASCADE 清除）。
  该脚本**不在自动迁移**里，仅供需要时手工跑。

## 已知边界（本计划不做）

- 不启用 enforce；读结果与现状完全一致。
- `resource_acl` 不填充；订阅/`share_scope` 跨组织共享仍走旧关系。
- `org_id` 仍为可空（不转非空）。
- 多组织上下文切换（一人多 org 的 currentOrg 选择）、token 携带 `org_id` 声明 → 后续。
- `GET /tags/question/:id` 越权 KNOWN-GAP（属行为变更，单独评审）→ enforce 计划修。
