# Phase 2 / M1 — 跨租户隔离守门进 CI 阻断 · 设计文档

> 日期：2026-10-13
> 范围：Phase 2「租户化与角色重构」的**首个里程碑 M1**（隔离守门先行）。本里程碑**零行为变更**，只建立可执行、进 CI、能阻断部署的跨租户隔离安全网。
> 上游依据：`docs/Phase2-租户化与角色重构-立项评估.md`（WS-1~WS-4 / M1~M5）、`docs/产品需求文档-平台化演进.md`（PRD v0.3）。
> 下游：批准后转 `writing-plans` 出实施计划。

## 1. 背景与实测事实（代码为唯一事实来源）

Phase 2 整体为多子系统、5–8 周量级重构，无法在一份 spec 内完成，须拆成子项目分别走「spec → plan → 实现」。本轮只做 **M1**。以下三条实测事实修正了立项文档的假设，并决定了 M1 的打法：

1. **Token 无 `org_id`**：`server/src/middleware/auth.js` 签发 `{id, username, role, teacher_id, status}`。属主隔离不依赖 org claim，故 M1 **不动 token**；org 维度留待 WS-1 权威切换引入。
2. **当前是「个人租户 = 用户 1:1」世界**：`organizations` 仅有 `PERSONAL` 类型（`personalOrg.js` 建档规则、迁移 013/014）。Phase 0 只做「写入即赋值、查询不过滤」——读侧**尚未按 org 过滤**，今天的真实隐私边界是老 `user_id`/`created_by`（属主）过滤。故 M1 的隔离断言基线 = **冻结现有属主隔离**。
3. **CI 现状与桁架**：
   - runner 为 GitHub-hosted `ubuntu-latest`（`deploy.yml`），**支持 `services: mysql` 容器**。
   - `db.js` 连接参数全走 env（`DB_HOST/PORT/USER/PASSWORD/NAME`），测试库可注入。
   - 已存在端到端 HTTP 集成脚本 `server/tests/integration_exam.mjs`（26 节，`process.exit(failed?1:0)` 的 pass/fail 雏形），覆盖大量越权断言（exams/stats/exports/notifications 的 403/404、非 owner 教师 403）。**但它未被 CI 运行**：`vitest.config.mts` 只收 `tests/unit/**`；根目录 `*.mjs` 是手工脚本；且 DB 凭据/库名硬编码。
   - `server/` **无 ESLint**（`lint` 脚本只是前端 `tsc --noEmit`）。

## 2. 目标与非目标

**目标（M1 完成即达成）**
- G1：新增可独立运行的**跨租户隔离集成测试**，覆盖 7 张核心表的主读/写端点，断言「租户 B 无法读取/操作租户 A 的资源」。
- G2：该测试 + 现有 `integration_exam.mjs` 一起进入 CI，作为**阻断门禁**——任一失败则 deploy job 不执行。
- G3：集成测试的 DB 凭据/库名/端口**全参数化**，CI 用 service 容器凭据、本地用默认值，两者皆可跑。

**非目标（明确不做，留给后续 WS）**
- 读侧改为按 org 过滤（WS-2）。
- `users.role` → `org_members.role` 角色权威切换（WS-1）。
- 存量数据迁移与对账（WS-3）、DPA/灯塔客户（WS-4）。
- 引入 server 端 ESLint 或自定义规则（用真实集成测试作为更强门禁，避免新工具链）。
- app 工厂重构（抽出 `src/app.js` + supertest）——因采用「boot 真后端 + HTTP」路径，**不需要**。

## 3. 关键决策（已定案）

| 决策点 | 选择 | 理由 |
|---|---|---|
| 断言基线 | 冻结现有属主隔离，零行为变更 | 先建安全网，WS-2 改读侧时才有回归保护；符合「隔离守门先行」 |
| 运行方式 | Path X：CI 里 `boot 真后端 + 真实 HTTP`，复用现有集成桁架 | 最贴近生产、复用已验证的 `registerWithCode`/cleanup/HTTP 模式，改动最小、风险最低 |
| 脚本形态 | **新建独立文件** `server/tests/isolation.integration.mjs`（经用户确认） | 职责单一、门禁粒度清晰；不撑爆已 745 行的 `integration_exam.mjs` |
| 隔离桁架复用 | 抽公共 `server/tests/helpers/integrationHarness.mjs`（`api/check/registerWithCode` 等），两脚本共用 | 去重，避免两个脚本各写一份 fetch/断言/验证码逻辑 |
| CI DB | `services: mysql:5.7` | 与生产版本一致（MySQL 5.7 兼容约束），暴露 5.7-only 问题 |
| 门禁位置 | `deploy.yml` 新增 job `isolation-test`，`deploy` 加 `needs: isolation-test` | 隔离失败即阻断部署，不拖慢其它步骤并行度 |
| Token / org_id | 本轮不动 | 见 §1 事实 1 |

## 4. 架构与组件

### 4.1 `server/tests/helpers/integrationHarness.mjs`（新建，抽取复用）
从 `integration_exam.mjs` 抽出与用例无关的桁架，保持行为一致：
- `resolveDbConfig()`：全部走 env 回退，**不含任何硬编码凭据**——`host: EXAM_IT_DB_HOST||'localhost'`、`port: EXAM_IT_DB_PORT||3306`、`user: EXAM_IT_DB_USER||'studyapp'`、`password: EXAM_IT_DB_PASSWORD || process.env.DB_PASSWORD || ''`、`database: EXAM_IT_DB_NAME||'study_test'`。CI 注入 service 容器凭据；本地沿用 `server/.env` 的 `DB_PASSWORD`。现有脚本里硬编码的生产口令**必须删除**（脱敏）。
- `api(method, path, token, body)`、`check(name, cond, extra)`、`results` 汇总、`reportExit()`（`process.exit(failed?1:0)`）。
- `registerWithCode(db, payload)`：沿用现有「向 `email_verifications` 种 sha256(码) 再带码注册」的实现，兼容生产强制邮箱验证码。
- `import { tickDay, checkBroken }` 等按需保留在脚本内，不入桁架。
- `integration_exam.mjs` 改为 `import` 桁架（**纯重构，不改断言逻辑**），确保抽出后行为等价。

### 4.2 `server/tests/isolation.integration.mjs`（新建，核心交付物）
- 建**两个 PERSONAL 租户**：`it_iso_teacherA` / `it_iso_teacherB`，各带一个学员 `it_iso_stuA` / `it_iso_stuB`（学员分别挂到各自 teacher）。
- 分别种数据（题/科目/考试/答卷/错题/收藏/学习统计/标签），A、B 各一套、互不重叠，`org_id` 由 Phase 0 写入侧自动落。
- 对 **7 张核心表**逐一断言跨租户不可达（B 用 A 的资源 id 访问，期望 `404` 不可见 或 `403` 越权，与现有脚本口径一致）：

  | 表 | 覆盖端点（B → A 的资源） | 期望 |
  |---|---|---|
  | questions | `GET /questions/:idA`、A 的列表 | 404/403，且不泄漏正文 |
  | subjects | `GET /subjects`（不含 B）、A 专属科目详情 | 列表不含 A 私有；直取 404/403 |
  | exams | `GET /exams/:idA`、`/exams/:idA/attempts`、`/exams/:idA/analysis` | 403 |
  | exam_attempts | `GET /exams/attempts/:attemptIdA`（A 学员的答卷） | 404/403 |
  | mistake_records / favorites / study_stats | 经 practice/学员维度端点，B 学员访问 A 学员数据 | 404/空集 |
  | question_tags | `GET /tags`、题目标签读（A 的题） | 404/403/不含 |
- 每条 `check()` 命名带 `ISO` 前缀；`finally` 调本脚本 `cleanup()`（按 `it_iso_%` 前缀删）保持库整洁；`reportExit()`。
- **零生产代码改动**：脚本只读地验证现有端点行为；若某断言暴露真实越权（应 403/404 却 200），属**发现的既有缺陷**，单列报告、不在 M1 内修（改判分/权限属后续 WS）。

### 4.3 `.github/workflows/deploy.yml`（新增 job + needs）
- 新 job `isolation-test`（`runs-on: ubuntu-latest`，`services: mysql:5.7`，env 建库与账号）。
- steps：checkout → setup-node 20 → `cd server && npm ci`（+ 根 `npm ci` 供 scoring 产物，若集成链路涉及判分）→ `node src/migrate.js`（对 service 库跑全量迁移）→ 后台 `node src/index.js`（注入 `DB_*`/`JWT_SECRET`/`NODE_ENV=production`/必要 env）→ 轮询 `/api/health` 就绪 → `node server/tests/integration_exam.mjs` → `node server/tests/isolation.integration.mjs` → 停服。
- `deploy` job 增加 `needs: isolation-test`（原「Install and Build」内已有的 `npx vitest run`×2 保留为单元测试门禁；集成门禁独立成 job）。

## 5. 数据流与错误处理
- CI：server 连 service MySQL → 迁移建表 → 两脚本经 HTTP 打 server、并用 mysql2 直连**同一 service 库**做种子/清理。
- server 启动拉起 6 调度器 + 百度 OCR：OCR 无 key **已优雅降级**（返回 null 仅 warn，见 `index.js` L68-92）；调度器有 `GET_LOCK` 单例守卫，CI 单实例无冲突。
- 就绪判定靠 `/api/health`（L129）轮询；启动失败或 health 超时 → job fail → 阻断 deploy。
- 脚本 `finally` 必执行 `cleanup`；退出码非 0 即门禁失败。

## 6. 本地可运行性
- 复用四重门禁约定（server vitest / 根 vitest / `npm run lint` / 集成脚本）。
- 新增：本地跑隔离脚本需①后端已启动②可写测试库③env 覆盖。文档给出示例：
  `EXAM_IT_DB_HOST=... EXAM_IT_DB_PASSWORD=... node server/tests/isolation.integration.mjs`
- 不做安装包打包（遵循既有约定）。

## 7. 验收标准
1. `isolation.integration.mjs` 覆盖 §4.2 表中 7 张表，全绿退出 0；故意破坏一条属主过滤能在本地复现脚本失败（证明门禁有效，非空跑）。
2. `integration_exam.mjs` 抽取桁架后**回归全绿**（26 节断言数不变）。
3. CI：`isolation-test` job 在 PR/main push 触发并成功；deploy job 在其失败时被跳过（`needs` 生效）。
4. DB 凭据不再硬编码生产口令；本地默认值可跑通。
5. 零生产代码行为变更（读侧过滤/角色权威保持现状）。

## 8. 风险
- R1：CI 里 boot 全量 server（含调度器/OCR）作为黑盒，稳定性依赖 health 轮询与超时设置 → 用 timeout + 明确停服。
- R2：`integration_exam.mjs` 抽公共桁架属重构，回归风险 → 严格「只搬不改」，以断言数不变为验收线。
- R3：MySQL 5.7 service 镜像拉取/初始化慢 → job 设合理 timeout，health 探活带重试。
