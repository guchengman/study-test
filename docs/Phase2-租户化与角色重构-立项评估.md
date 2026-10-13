# Phase 2 立项评估：多租户化与角色权威重构

> 立项编号：PHASE-2-TENANCY
> 事实基准：**2026-10-13**；需求以 [`docs/产品需求文档-平台化演进.md`](产品需求文档-平台化演进.md) v0.3（§2 / §5.2 / §5.3 / §6 Phase 2）为准。
> 配套：[`../TECHNICAL_ANALYSIS.md`](../TECHNICAL_ANALYSIS.md) §5/§9.2、[`../IMPLEMENTATION_PLAN.md`](../IMPLEMENTATION_PLAN.md) §3。
> 结论先行：**这是全项目风险最高、越晚改越贵的一块，建议单独立项，5–8 周，角色权威切换 + 隔离测试进 CI 为第一优先**。

---

## 1. 背景与当前地基

平台化把「一切可拥有题库/考试/成员关系的单位」统一抽象为 **Organization（租户）**。Phase 0 已以 **shadow schema** 形式铺好地基，且**不改变任何查询行为**：

- `013_organizations.sql`：建 `organizations`（type 含 `PERSONAL`）+ `org_members`（org_id/user_id/role）。
- `014_add_org_id.sql`：`questions/subjects/exams/exam_attempts/mistake_records/favorites/study_stats` 加**可空 `org_id`**，写入即赋值、查询不过滤。
- `server/src/utils/personalOrg.js`：`resolvePersonalOrgId/ensurePersonalOrg` 为每个用户幂等建 PERSONAL 影子租户，`sync.js` 等写入路径已带 org 维度。

**但当前隔离仍是「单租户语义」**：`org_id` 只写不滤，权限判定直接读 `users.role` 与 `created_by`，无查询层租户约束，无跨租户越权测试。Phase 2 就是把这层地基变成真正的多租户强隔离。

---

## 2. 目标与非目标

**目标（对齐 PRD G1/G4）**
- G4：跨租户数据泄露 = **0**，由自动化隔离测试守门并进 CI 阻塞门禁。
- 角色权威单点化：`org_members.role` 为目标态唯一权威。
- 三层 RBAC（platform / org / space）权限矩阵落地，支持一人多租户多角色。
- 企业内训灯塔（部门/岗位形态）最小闭环可签约。

**非目标（本阶段不做）**
- 不做高负载改造（Redis/队列/OSS 属 Phase 3，按阈值触发；S1 Redis 仅作本阶段「前置候选」）。
- 不做班级形态深做（教育班级仅保留 `departments.kind=CLASS` 模型兼容）。
- 不引入法定电子签名（FR-603 签署记录 v1 仅「确认记录」）。

---

## 3. 范围拆解（四条主工作流）

### WS-1 角色权威切换（最高优先，改造点最分散）

**现状散落判定点（实测）**：

| 文件 | 现状判定 | 目标 |
|---|---|---|
| `server/src/utils/access.js` | `canManageSubject`: `u.role IN ('admin','teacher')` | 改读 `org_members.role` + 空间归属 |
| `server/src/routes/exams.js` | `isOwner`: `role === 'admin' \|\| created_by === userId`（已收紧，teacher 需为创建者） | 同租户内 `org_admin/content_author` + 空间判定 |
| `server/src/routes/stats.js` | `isOwner` + 班级对比 `role IN admin/teacher` | 同上 |
| `server/src/routes/exports.js` | `isOwner`: `role admin/teacher \|\| created_by` | 同上 |
| `server/src/routes/subjects.js` | 多处 `req.user.role === 'admin'`、`created_by` 比对 | 同上 |

**要求**：全部替换为 `org_members.role` + 空间归属判定，`users.role` 转 6 个月只读兼容期，到期禁读、由 `org_members` 派生视图承接存量调用方。**严禁出现「双权威并存且判定结果不一致」的中间态**。

### WS-2 数据隔离实施（查询层强约束）

- 选型（PRD §5.1）：**应用层 QueryBuilder 约束**，不用 MySQL VIEW（现有全裸 SQL，VIEW 改动面更大、写路径受限、单库无性能收益）。
- 封装 `withOrg(sql, orgId)` 统一查询助手；列表/详情类 SQL 必须走它；**ESLint 自定义规则**禁止路由直接 `pool.execute` 访问租户可见数据（与现有 `tsc --noEmit` 门禁共存）。
- 隔离测试集：逐路由枚举资源 ID 型参数，断言异租户访问返回 403/404；同批覆盖「未发布快照拉取」「`POST /sync/migrate` 租户归属」。

### WS-3 存量数据迁移（四条旧关系 → 新模型）

不止 `teacher_id`，共四条（PRD §5.2）：

| 现有载体 | 目标落点 | 兼容处理 |
|---|---|---|
| `users.role`（ENUM 4 值） | `org_members.role`（admin→platform_admin、teacher→content_author、student/independent→examinee） | 6 个月只读兼容，禁读后派生视图承接 |
| `users.teacher_id`（师生直连/单师制） | `org_members` + `departments.kind=CLASS`（无法从数据推班级名，默认建「默认班」，后续人工拆分） | `teacher_id IS NULL` 的 independent → 自动 PERSONAL 租户 |
| `subject_subscriptions` | `resource_acl`（resource=subject, grantee=user, perm=PRACTICE） | 保留 pending 语义，不静默提权 |
| `subject_student_access` | `resource_acl`（grantee=user, perm=READ/PRACTICE） | 与上表合并去重，取最高 perm |
| `invite_codes.scope='students'`（读 `teacher_id` 比对） | 改比对 `org_members` 同租户 + `resource_acl` | 必须同步改 `subjects.js`，否则旧邀请码失效 |
| `sync.js` 上行数据 | 写入取 `token.org_id`（创建者当前工作租户） | 与「多次参考取最高分」商定冲突处理 |

**约束**：所有迁移脚本带 **dry-run + 行数对账 + 影子读验证**；`org_id` 由可空转非空只在 Phase 2 补历史数据时发生。

### WS-4 灯塔 + 合规（含人工商务前置，非纯技术）

- **FR-603 企业内训灯塔**（决策 D1，部门形态优先）：员工批量导入、岗位/部门指派考试、入职合规考。
- **DPA（数据处理协议）文本模板**：处理目的/范围/期限、子处理者清单（含阿里云 OSS 与邮件服务）、跨境传输声明、删除与返还义务 —— **签约前必须就位**。企业为处理者/控制者、平台为受托处理方。
- **FR-703 微信通道**前置至此（企业资质 + 备案）：企业员工触达以微信为主，灯塔上线前应先跑通模板消息，否则「成绩发不出」会被归因平台不可靠。
- **FR-605 平台运营面板初版**（租户量/DAU/存储/失败登录聚合 + 存储用量卡片 + 邮件额度水位）。
- token 扩展 `org_id` 声明 + 租户切换端点（一人多租户避免重复登录）。

---

## 4. 里程碑拆分（建议顺序，每段可独立验证）

| 里程碑 | 内容 | 退出标准 |
|---|---|---|
| M1 隔离守门先行 | `withOrg` 助手 + ESLint 规则 + 跨租户越权测试集（先红后绿）进 CI | 测试集覆盖现有 17 路由关键资源参数；CI 阻塞生效 |
| M2 角色权威切换 | WS-1 全部判定点切 `org_members.role`，`users.role` 只读兼容 | 无任何代码路径产生「双权威不一致」；相关单测全绿 |
| M3 存量迁移 | WS-3 四条关系映射 + org_id 转非空 + sync 归属 | dry-run 对账差异=0；影子读一致 |
| M4 灯塔最小闭环 | 企业部门形态 + 批量导入 + 指派考试 + 面板初版 | 灯塔场景端到端可演示 |
| M5 合规与通道（并行/前置） | DPA 文本 + 数据处理记录导出 + 微信通道 | 签约前 DPA 就位；微信模板消息跑通 |

> M5 的人工商务（DPA 法务、企业资质/备案、微信开放平台审核）是关键路径上的**非代码阻塞**，应与 M1–M3 并行启动，避免技术做完等商务。

> **M1 状态（2026-10-13 已交付安全网部分）**：跨租户越权集成测试集已落地为 `server/tests/isolation.integration.mjs`（覆盖 questions/subjects/exams/exam_attempts/mistake_records/favorites/study_stats/question_tags 八类资源，现 33 断言）并接入 CI——`deploy.yml` 新增 `isolation-test` job（`mysql:5.7` service + boot 真后端），`deploy` 经 `needs: isolation-test` **被阻断**。本轮严格 **零生产行为变更**（冻结现有属主隔离作基线）。原 M1 拟包含的 `withOrg` 查询层助手与 ESLint 规则，经决策归入 **WS-2**（属查询层强约束与生产改动，与安全网关注重不同）。新发现一处读侧缺口 `GET /tags/question/:id` 未校验题目归属，已记为 KNOWN-GAP 软告警、留待 WS-2 修复。详见 [`superpowers/specs/2026-10-13-phase2-m1-isolation-gate-design.md`](superpowers/specs/2026-10-13-phase2-m1-isolation-gate-design.md) 与 [`superpowers/plans/2026-10-13-phase2-m1-isolation-gate.md`](superpowers/plans/2026-10-13-phase2-m1-isolation-gate.md)。

---

## 5. 风险与缓解（对齐 PRD R1/R2/R6）

| 风险 | 等级 | 缓解 |
|---|:-:|---|
| 权限重构引发存量迁移事故 | 高 | dry-run + 影子读验证 + 隔离测试门禁 + 6 个月兼容期；迁移分批可回滚 |
| 双权威中间态判定不一致 | 高 | M2 一次性切换 + ESLint 守门 + 派生视图承接，禁止长期并存 |
| 范围失控（教育+企业同时铺深） | 高 | 灯塔=企业内训，班级形态仅留兼容不做深 |
| 人工商务前置拖期（DPA/资质/微信） | 中 | M5 与 M1–M3 并行，技术不等商务、商务不阻塞技术守门项 |
| 单机承接灯塔 1000 人踩到考试并发 > 300 | 中 | S1 Redis 列为前置候选，监控触发即启动 |

---

## 6. 验收门禁（并入 CI 阻塞）

- 跨租户越权自动化测试集为 **CI 阻塞门禁**（对齐现有双 vitest 门禁）。
- 断言：`users.role` 已无判定读取（除兼容视图外）；`withOrg` 覆盖所有租户可见查询；ESLint 规则生效。
- 存量迁移：`org_id` 非空约束上线后，历史数据对账差异 = 0；`invite_codes.scope='students'` 旧码在新模型下仍可用。
- 灯塔：企业部门维度指派考试端到端跑通；DPA 与数据处理记录导出可用。

---

## 7. 工作量与前置

- **估算**：5–8 周（纯技术里程碑 M1–M4）；M5 商务前置并行、周期取决于法务与平台审核。
- **开工前置**：确认灯塔客户意向与签约时间窗；DPA 模板起草启动；Redis 是否纳入本阶段（若预判单场 ≥1000 人则提前）。
- **建议**：先做 M1（隔离守门 + 测试集），因为它既是安全底线又是后续所有改造的回归防护网；M2 紧随其后，避免判定点在功能迭代中继续扩散。
