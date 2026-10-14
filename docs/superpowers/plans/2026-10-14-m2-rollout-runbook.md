# M2 角色权威切换 运行手册

把判权权威源从全局 `users.role`（烤进 JWT）切到 `org_members.role`（按操作组织解析），
通过能力层 + `ROLE_AUTHORITY_SOURCE` 开关实现零行为变更的灰度切换。

## 开关三档

- `legacy`：只用旧矩阵（`users.role`）决策。当前线上行为基线。
- `shadow`（默认）：用旧矩阵决策，同时算新矩阵（`org_members.role`）并对比，漂移打日志 `[role-authority:drift]`，不改变任何行为。
- `org`：以新矩阵（`org_members.role`）为准。

## 灰度顺序

1. 部署本计划代码，保持 `ROLE_AUTHORITY_SOURCE=shadow`，观察日志 `[role-authority:drift]` 是否出现。
2. 跑 `node scripts/reconcile-role-authority.cjs`，确认「漂移=0」。有漂移先补 `org_members`（或排查注册链路 `ensurePersonalOrg`）。
3. 测试库设 `ROLE_AUTHORITY_SOURCE=org`，跑全量 vitest（`cd server && npx vitest run`）+ 手工回归 admin/teacher/student 三条链路。
4. 生产 `pm2 restart study-server --update-env` 前先备份 `.env`；改 `org`；观察 30 分钟。

## 回滚

任一步异常：把 `ROLE_AUTHORITY_SOURCE` 改回 `legacy`（或 `shadow`），`pm2 restart study-server --update-env`，即时生效，无需回滚代码。

## 只换源阶段的已知边界

- 操作组织恒为个人 PERSONAL 组织；`org_admin`/`reader` 尚无人持有。
- 真实多租户隔离（跨 org 过滤）属 M3，本计划不引入 org 上下文选择。
- JWT 仍携带 legacy `role` 作对账/回滚兜底；彻底移除 `role` 待 org 稳定后单列。
