# Study-Test（全科题库）实施方案

> 交付物对应计划 `study-test-app-analysis`，与 [`TECHNICAL_ANALYSIS.md`](TECHNICAL_ANALYSIS.md) 配套。
> 事实基准：**2026-10-13**。本文把技术分析中的「开放问题 + PRD v0.3 路线图」转成**分阶段、分优先级、可独立验证**的实施任务。
> 单一事实源原则：阶段划分与 FR 编号以 [`docs/产品需求文档-平台化演进.md`](docs/产品需求文档-平台化演进.md) v0.3 为准；本文只做「现状对齐 + 排序 + 落地任务」，不重定义需求。

---

## 0. 排序总原则

1. **越晚改越贵的优先**（权限/租户骨架 > 数据面补课 > 分析/AI 叠加 > 高负载按触发 > 商业化）。
2. **高负载改造按触发条件（S0–S5）而非时间驱动**——不做预防性过度设计。
3. **所有周期任务必须带单例锁**（现状已用 `GET_LOCK`），Phase 3 上 Redis 后改分布式锁。
4. **改判分只改 SSOT（`src/shared/scoring`），随后 `npm run sync:scoring`**，前后端/扩展三端产物同步。
5. 每个功能项交付走标准流程：子计划 → 后端数据面 → 前端 UI → 单测+集成 → L3 安全审查 → 推送触发 CI 部署；验收含「Lint 零错误 + root/server 测试不回归」。

---

## 1. 现状快照（截至 2026-10-13，相对 PRD 已前置完成的部分）

| 阶段 | 状态 | 关键证据 |
|---|---|---|
| **Phase 0** | ✅ 基本完成 | FR-110 判分单轨（手写副本已删）、FR-204 sweep 重构（分页+单例锁调度器）、S0 shadow schema（013 organizations/org_members、014 org_id、015 shuffle_seed/option_order）、题型 `judge/fill_in/short_answer` 已进类型与判分、FR-107 回收站(017)、FR-206 导出(018)、FR-202 乱序列 |
| **Phase 1** | ✅ 完整闭环 | FR-108 标签(019)、FR-301/302 学情/考情看板 + `stats_daily`(023)、FR-701/702 通知中心(020)+邮件、FR-606 配额框架(022)、FR-501 streak(024)、storage_usage(021) |
| **Phase 2** | ⏳ 仅地基 | organizations/org_members 表 + personalOrg 影子租户 + 角色映射；**未做**：查询权威切换、真实多租户、存量迁移、隔离测试进 CI、DPA/资质 |
| **Phase 3** | ❌ 未启动 | 无 Redis / OSS / 交卷队列 / 快照表（阈值触发） |
| **Phase 4** | ❌ 未启动 | 无判题沙箱 / 收费套餐 / 开放 API |

---

## 2. 在产技术债（快赢项，穿插交付，非专项）

> 均来自技术分析 §9.2–§9.4，成本低、可随功能迭代顺带偿还。

| 优先级 | 任务 | 落点 | 验收 |
|---|---|---|---|
| P1 | `ai.js` 内存限流迁共享存储（Redis 或过渡用 MySQL 计数表） | `server/src/routes/ai.js` | 多实例下限流仍生效；容量上限 + TTL 淘汰 |
| P1 | Chrome 扩展 host_permissions 去写死（多域名或构建注入） | `chrome-extension/manifest.json` | 本地/测试联调无需手改 |
| P2 | 前端 UI 一致性收敛：统一 `<AppModal>`/`<AppConfirm>` 底座，清除残留原生 `confirm/alert`，错误反馈统一 red 系 | `src/components/**`、`src/components/ui/` | 危险操作 100% 走 AppConfirm；无原生弹窗残留 |
| P2 | `AppContext` 巨型单例按域拆分（Auth/UI/Exam）或 selector 订阅，降重渲染 | `src/context/AppContext.tsx`、`useExam` | 单一 toast 变更不再触发全量重渲染 |
| P2 | 题库本地缓存（IndexedDB）评估，弱网只读兜底 | `src/hooks/useQuestionBank.ts` | 离线可读缓存，联网后增量同步 |

---

## 3. Phase 2：租户化与角色重构（**单独立项，风险最高**）

> 完整立项评估见 [`docs/Phase2-租户化与角色重构-立项评估.md`](docs/Phase2-租户化与角色重构-立项评估.md)。本节仅给纲要。

**目标**：把「影子租户 + org_id 只写不滤」推进到「查询层强制租户隔离 + 角色权威单点」，达成 PRD G4「跨租户数据泄露 = 0（自动化隔离测试守门）」。

四条主工作流：

1. **角色权威切换**：`isOwner()`/`access.js`/`subjects.js`/`students.js`/`sync.js` 全改为读 `org_members.role` + 空间归属；`users.role` 转 6 个月只读兼容，到期禁读，由 `org_members` 派生视图承接。**不允许「双权威并存且判定不一致」的中间态**。
2. **数据隔离实施**：封装 `withOrg(sql, orgId)` 统一查询助手 + ESLint 规则守门（禁止路由直接 `pool.execute` 访问租户可见数据）；三层 RBAC（platform/org/space）权限矩阵落地。
3. **存量数据迁移**：为存量科目/题库/考试回填非空 `org_id`；四条旧关系映射（`teacher_id`/`subject_subscriptions`/`subject_student_access`/`invite_codes.scope='students'`）+ `sync.js` 上行归属；迁移脚本全部带 dry-run + 行数对账。
4. **灯塔 + 合规（人工商务前置）**：企业内训灯塔（FR-603，部门形态优先）闭环；**DPA 文本模板 + 数据处理记录可导出**须在签约前就位；FR-703 微信通道作灯塔主投递通道前置（企业资质/备案）；跨租户隔离测试集进 CI 阻塞门禁。

**建议排期**：5–8 周；`S1 Redis` 列为本阶段前置候选（单场 1000 人可能提前踩到考试并发 > 300）。

---

## 4. Phase 3：高负载与体验纵深（按 §4.2 触发条件执行）

| 触发 | 任务 |
|---|---|
| DAU>2000 或考试并发>300（S1） | Redis：考试快照缓存、限流计数、分布式锁、草稿缓冲 |
| 交卷尖峰写失败/排队（S2，与 S5 worker 分离同批） | 交卷队列（起步 MySQL 队列表 `submission_events`）；判分/OCR CPU 密集任务出主进程 worker；`exam_attempts.status` ENUM 扩展 `scoring`（判分中） |
| 单库 CPU>60% 持续（S3） | 读写分离 + `answer_records` 按学期归档 |
| 单机内存/带宽瓶颈（S4） | 多实例 + Nginx upstream + 静态全量 CDN |
| 大文件/听力（随 FR-105） | FR-109 OSS 对象存储 + 按 MIME 分档限大小（重构 `upload.js` 单一 5MB 上限）+ 存量图片迁移；`storage_usage` 告警已在 Phase 1 |
| — | FR-208 试卷快照（含答案剔除白名单 + 发布管线递归断言，命中即发布失败，进 CI）；FR-203 断线续考（Web/Electron MVP）；FR-105 听力题；FR-604 家长/领导只读视图（含未成年人监护人同意链）；FR-502 排行榜；FR-505 共建题库审核流 |

---

## 5. Phase 4：差异化与商业（长周期）

- FR-106 编程判题服务（独立 worker + 沙箱：容器隔离/无网络/限时限内存/语言版本白名单，按不可信代码对待，上线前渗透测试）。**前置**：先把孤儿模块 `src/pythonLevel4.ts` 接入题库内容。
- FR-402/403/404 AI 变式 / 对话辅导 / 学习计划；FR-405 拍照建题按数据反馈定去留。
- 收费套餐上线（基于已就位的 FR-606 框架定义付费 plan + 支付接入）；⚠️ 零变更仅限「配额与套餐配置」，**订单/支付流水/发票/退款需新建表**。
- FR-801 分享落地页、FR-802 开放 API + Webhook、FR-803 扫码进场。

---

## 6. 里程碑与建议执行顺序

1. **立即可做（在产债快赢）**：§2 P1 两项（`ai.js` 限流过渡、扩展域名）+ P2 UI 一致性/Context 拆分穿插。
2. **主线（下一大块）**：§3 Phase 2 立项 → 角色权威切换 + 隔离测试进 CI 优先（越晚越贵），并行推进人工商务（DPA/企业资质）前置。
3. **按需触发**：§4 Phase 3 仅在监控指标踩线时启动，先上指标（prom-client `/metrics`、EmailJS 额度水位、单请求 sweep 条数告警）再决定 S 步。
4. **长尾**：§5 Phase 4。

---

## 7. 验收标准（对齐 PRD §8）

- 功能：各 Phase 项附单测/集成，CI 双门禁（root + server vitest）全绿；新增跨租户隔离测试集为阻塞门禁。
- 判分单源：仓内不存在手写判分副本（**已达成**），`scoringConsistency.test.js` 单轨断言且语料覆盖 `judge/fill_in/group` 新口径。
- 考试保密：快照答案剔除断言进发布管线与 CI（Phase 3）。
- 通知容量：断言「单场 1000 人考试产生邮件总数 ≤ 5 封」（站内默认投递 + 管理员日汇总）。
- 性能：Phase 3 完成后压测（k6/autocannon）验证 PRD §4.1 指标；Phase 0 已含「1000 人下 `GET /exams/:id/analysis` 不触发同步收卷」断言。
- 安全：P0 安全回归清单（上传白名单、验证码、限流、隔离）+ 「上传按 MIME 分档限大小」「配额拦截覆盖组织租户 AI 全路径」「组织租户 BYO 直连已禁用」三项断言。

---

## 8. 风险登记（摘自 PRD §7）

| # | 风险 | 等级 | 缓解 |
|---|---|:-:|---|
| R1 | 教育+企业双场景同时铺开范围失控 | 高 | 灯塔=企业内训（D1），Phase 2 集中部门形态最小闭环 |
| R2 | 权限重构存量迁移事故 | 高 | dry-run + 影子读验证 + 隔离测试门禁 + 6 个月兼容期 |
| R3 | 判题沙箱逃逸/资源耗尽 | 高 | 容器隔离无网络 + 资源硬限 + 渗透测试；否则宁缺毋滥 |
| R4 | EmailJS 免费额度撑不起通知量 | 高 | 通道分层：站内默认、邮件仅管理员汇总（1000 人=1 封）+ 额度水位告警 |
| R5 | 单机 MySQL 是租户化后第一堵墙 | 中 | §4.2 触发式演进，先上监控再决定 S 步 |
| R10 | 自带 AI Key 绕过配额 | 高→已定案 | D4 场景区分收口：组织租户强制代理 + checkQuota；个人 BYO 免责 + 台账 |
| R11 | 惰性 sweep 读路径写风暴 | 高→已解决 | FR-204 已从读路径移除，改分页 + 单例锁；保留 sweep>100 告警 |
