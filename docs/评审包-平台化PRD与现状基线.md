# 【评审包】Study-Test 平台化演进 PRD v0.2 + 现状事实基线

> 交付给外部 AI/评审者单人可读文档。结构：第一部分为评审指引；第二部分为 PRD 全文（v0.2，含三项已冻结决策）；第三部分为现状事实基线附录（脱敏，供逐条验证 PRD 假设）。
>
> **建议评审重点**：① §2 权限模型与租户隔离是否覆盖企业内训合规场景；② §4.3 考试尖峰方案与 A3/A8 所述现状（单行 JSON 答题记录、单机 MySQL）的差距评估是否成立；③ §6 Phase 排序（配额框架前置、租户化重构风险）；④ FR-109 OSS 容量治理参数（80%/95% 双阈值、单文件上限）是否合理；⑤ 判分双轨（附录 A5）下题型扩展 FR-101~104 的实施风险。
>
> 脱敏说明：文档不含任何密钥、凭据、真实服务器 IP 与域名；提交历史哈希为内部引用，评审无需访问。
>
> **版本状态（2026-10-12）**：本评审包是 PRD **v0.2 的外部评审快照**，正文（含内嵌 PRD 与附录）**不再随版本更新**。评审意见已逐条对照代码复核并落入 v0.3：现行 PRD 见 [产品需求文档-平台化演进.md](产品需求文档-平台化演进.md)，逐条 diff 与采纳依据见 [PRD-v0.3-修订说明.md](PRD-v0.3-修订说明.md)。

---
# 学习考试平台化产品需求文档（PRD）

| 项目 | 内容 |
|---|---|
| 文档版本 | v0.2（已纳入三项关键决策，见 §7.2） |
| 日期 | 2026-10-11 |
| 基线系统 | Study-Test 1.0（教师-学员在线题库考试系统） |
| 关联文档 | `docs/开发文档.md`、`docs/模块一致性审计`、P0-P2 整改记录（提交 e3bae5c..7d35c90） |

**修订记录**：v0.1 评审稿 → v0.2 冻结三项决策：①灯塔客户=企业内训；②全功能先免费、预留收费接口；③引入 OSS 对象存储 + 容量治理（限大小/阀值告警/超限熔断停传）。

---

## 1. 背景与愿景

### 1.1 现状

系统已具备完整的「导入 → 题库 → 练习/考试 → 判分 → 错题/收藏」闭环：

- 角色：平台管理员 / 老师 / 学生 / 独立用户（`UserRoleDomain`）
- 题型：单选、多选、编程（`QuestionType = 'single' | 'multiple' | 'programming'`）
- 内容导入：Excel / PDF / Word / OCR / 图片；公式（KaTeX）；AI 出题（多模型路由）
- 基建（2026-10 P0-P2 整改后）：验证码服务端化、EmailJS 密钥服务端持有、pino 结构化日志、判分单一可信源（SSOT）、CI 双门禁测试
- 部署形态：**单台阿里云服务器 + PM2 单实例 + MySQL 单库**，多端封装（Web / Electron / Android / Chrome 扩展）

### 1.2 愿景

从「单个老师给自家学生用的工具」演进为**同时服务两套场景的通用学习与考试评估平台**：

| 场景 | 组织形态 | 出题者 | 应试者 |
|---|---|---|---|
| 教育 | 学校 / 培训机构 / 个人教师 | 老师 | 学生 |
| 企业 | 企业 / 部门 | 培训管理者、业务专家 | 员工 |
| 个人 | 公共域（无组织） | 用户自建 | 用户自己 |

核心抽象：**一切「可拥有题库、考试与成员关系」的单位统一为租户（Organization）**。独立用户归属于系统自动创建的隐式个人租户，所有数据模型天然带租户维度，避免两套代码路径。

### 1.3 目标（可量化）

- G1：支撑机构/企业入驻，单租户内层级「组织 → 部门/班级 → 成员」；**首个灯塔场景为企业内训**（决策 D1，部门形态优先于班级形态）
- G2：题型覆盖主流考试形态（判断/填空/简答/材料题/听力/编程判题）
- G3：峰值承载：1 万日活、2000 并发应试、单场考试 1000 人在同一分钟交卷不雪崩
- G4：权限模型可审计：跨租户数据泄露 = 0（自动化隔离测试守门）

---

## 2. 用户角色与权限管理

### 2.1 角色体系（三层）

```
平台层    platform_admin（平台运营）
租户层    org_admin（机构/企业管理员）
空间层    space_admin（班级/部门/共享题库的管理员，由成员晋升）
内容角色  content_author（教师/培训管理者/出题人）——同一权限档，不同场景命名
应试角色  examinee（学生/员工/个人用户）——同一权限档
只读角色  reader（家长/企业领导/审计员）——按绑定关系授予
```

- 现有 `teacher` 映射为 `content_author`，`student`/`independent` 映射为 `examinee`，向后兼容不破坏现有账号。
- 一个账号可属于多个租户、担任多个空间的不同角色（如：某老师同时是 A 机构成员 + B 企业外部出题顾问）。

### 2.2 权限矩阵（核心动作 × 角色）

| 资源/动作 | platform_admin | org_admin | space_admin | content_author | examinee | reader |
|---|:-:|:-:|:-:|:-:|:-:|:-:|
| 平台运营面板、租户管理 | ✅ | — | — | — | — | — |
| 租户内成员增删/角色分配 | ✅ | ✅ | 本空间 | — | — | — |
| 题库创建/编辑 | ✅ | 全部 | 本空间 | 自己的+被授权协作 | 自己的（个人题库） | — |
| 题目删除 | 软删权 | 全部回收站 | 本空间回收站 | 自己的题目进回收站 | 自己的 | — |
| 考试创建/发布 | ✅ | 全部 | 本空间 | 自己的 | — | — |
| 强制收卷/成绩改分 | ✅ | ✅ | 本空间 | 本考试 | — | — |
| 判分（客观题自动 / 主观题人工） | ✅ | ✅ | ✅ | 自己考试的题 | — | — |
| 发起考试 | — | ✅ | ✅ | — | ✅（练习/被安排） | — |
| 作答/查自己成绩 | ✅ | ✅ | ✅ | ✅ | ✅ | — |
| 查看他人成绩明细 | — | 租户汇总 | 本空间汇总 | 本班/群明细 | — | 绑定对象明细 |
| 成绩/题库导出 | ✅ | ✅ | 本空间 | 自己的 | 个人数据（合规自助导出） | — |
| 题库设为「共享/公开」 | — | 租户级审批 | 空间级审批 | 作者申请 | — | — |

### 2.3 数据隔离与共享规则

1. **租户强隔离**：所有业务表携带 `org_id`；查询层强制注入租户过滤（MySQL VIEW 或应用层 QueryBuilder 约束，二选一，见 §6.2），并提供跨租户越权自动化测试集（列入 CI 门禁）。
2. **共享即显式授权**：题库/试卷共享通过「分享记录」（现有 `SubjectShareCode` 升级为 ACL 记录：资源 × 目标（租户/空间/人）× 权限档位（只读 / 可练习 / 可协作编辑））。
3. **家长/领导只读绑定**：reader 必须经被查看者（成年学生本人 / 员工）或其所属空间管理员的授权码绑定；绑定关系可视、可撤销。
4. **最小权限与审计**：所有写操作与导出行为落审计日志表（who / when / action / resource / org_id），pino 日志已结构化，可低成本接入。
5. **合规**：涉及未成年人（学生）与家长数据、企业员工行为数据，遵循《个人信息保护法》——采集告知、目的限定、可导出可删除（注销流程已有，需扩展到家长绑定解除、员工离职数据处置策略：默认成绩归租户，个人可带走副本）。

### 2.4 认证与账号

- 保持 JWT；增加 `token.org_id` 声明 + 租户切换端点（一人多租户时选择当前工作租户，避免重复登录）。
- 企业批量导入员工账号（Excel + 初始密码强制改密，复用现有 `password_reset` 机制）。
- 可选增强（P2 优先级）：手机验证码登录（验证码基建已在服务端，复用 purpose 扩展）。

---

## 3. 功能需求

优先级采用 MoSCoW：M=Must / S=Should / C=Could / W=Won't（本期不做）。

### M1 题型与内容基建

| 编号 | 功能 | 优先级 | 说明 |
|---|---|:-:|---|
| FR-101 | 判断题 | M | `QuestionType` 扩展 `judge`；判分接入 SSOT |
| FR-102 | 填空题（多空） | M | 逐空给分、可配置大小写/全半角归一、同义答案列表（逗号分隔备选），答案匹配走 SSOT |
| FR-103 | 简答题 | M | 按题配分、人工判分工作流（判分列表界面）、支持 AI 辅助评分建议（仅辅助，教师确认） |
| FR-104 | 材料题（一拖 N） | M | 题目新增 `group` 概念：共享材料（文本/音频/图片）+ 子题引用；导入格式支持「材料行 + 缩进子题」的 Excel 约定 |
| FR-105 | 听力题 | S | 题目挂音频，存储走 OSS 对象存储（见 FR-109）；上传白名单扩 mp3/m4a，走现有 MIME 双校验管线；播放次数可限制；播放地址用 OSS 签名 URL（时效性，防盗链） |
| FR-106 | 编程题在线判题 | C | 独立判题服务（沙箱容器、CPU/内存/墙钟限制、依赖白名单），判题走队列异步；pythonLevel4 内置题库为首个受益方 |
| FR-107 | 题目回收站与版本历史 | S | 软删 + 30 天自动清理；编辑留存最近 N 版，考试引用过的题目禁止物理删 |
| FR-108 | 知识点标签体系 | M | 标签树（科目 → 章节 → 知识点，租户可自定义），题目多标签；是 M3 全部分析功能的数据地基，必须最先落地 |
| FR-109 | OSS 对象存储与容量治理 | M | 决策 D3：① 音频/图片等大文件从磁盘直存迁至 OSS（阿里云同 VPC 内网上传，读走 CDN）；② 单文件上限：音频 20 MB / 图片 5 MB / 文档 50 MB（后台可配）；③ 租户存储配额（默认 5 GB/租户，随配额框架 FR-606 配置）；④ 用量监控：定时统计写 stats，达 80% 通知平台管理员+租户管理员（接 FR-701），达硬阀值（95%）熔断新增音频/大文件上传（429 + 明确文案，存量资源不受影响）；⑤ 后台面板：用量卡片 + 租户占用 Top N（接 FR-605） |

### M2 考试与练习增强

| 编号 | 功能 | 优先级 | 说明 |
|---|---|:-:|---|
| FR-201 | 按标签/难度智能组卷 | S | 配比抽题（知识点覆盖 × 难度分布）；双轴表（blueprint）视图核对 |
| FR-202 | 题目与选项乱序 | M | 每人题序/选项序个性化，防抄袭成本低、收益大 |
| FR-203 | 断线重连续考 | S | 客户端周期性草稿保存（localStorage + 增量同步），服务端以时间轴裁决剩余时长 |
| FR-204 | 定时自动交卷 | M | 现有 `auto_submitted` 状态已有，补服务端到点强制收卷（调度器） |
| FR-205 | 考试防作弊（基础） | C | 切屏/失焦计数上报（不做摄像头，隐私成本过高）；企业场景可选开启 |
| FR-206 | 成绩导出 | M | 考试结果 CSV/Excel（xlsx 前端已备），受权限矩阵导出口约束 |
| FR-207 | 互评（简答盲评） | C | 学生互批 + 教师抽检；先在企业内训场景灰度 |

### M3 数据洞察（学情/考情分析）

| 编号 | 功能 | 优先级 | 说明 |
|---|---|:-:|---|
| FR-301 | 个人学情面板 | M | 趋势曲线、知识点掌握雷达（依赖 FR-108）、预估分数区间 |
| FR-302 | 教师/管理者考情看板 | M | 每卷：得分率分布、每题区分度（对错两组得分差）、选项诱答有效性；班级：横向对比 |
| FR-303 | 错题间隔复习 | S | 错题表增加 `next_review_at`（1/2/4/7/15 天），「今日复习」入口；与 streak 联动 |
| FR-304 | 教学/培训周报 | C | 自动汇总 + AI 撰写讲评建议，导出 PDF/Word |
| FR-305 | 学员/员工预警 | S | N 天未练习、正确率骤降 → 提醒空间管理员（企业：直属主管） |

### M4 AI 教练（复用现有 ai.js 多模型路由）

| 编号 | 功能 | 优先级 | 说明 |
|---|---|:-:|---|
| FR-401 | 错题 AI 讲评 | M | 一键生成错因分析 + 知识点点拨；按题缓存结果控制成本 |
| FR-402 | 错题变式生成 | S | 同知识点换数字/情境/问法生成 3 题，作者确认后入个人练习池 |
| FR-403 | 对话式题目辅导 | C | 基于题目上下文的追问式讲解（会话隔离，按题建档） |
| FR-404 | 学习计划生成 | C | 按考期倒排 + 掌握度生成周计划，喂给 FR-303 复习队列 |
| FR-405 | 拍照直出题目 | W→C | 拍练习册照片 → OCR（管线已有）→ AI 结构化入库；依赖 OCR 质量评估后再定 |

### M5 激励与协作

| 编号 | 功能 | 优先级 | 说明 |
|---|---|:-:|---|
| FR-501 | Streak 连续打卡 | M | 练习天数计数 + 中断提醒 + 补签卡（低成本高留存） |
| FR-502 | 排行榜 | S | 班内/租户内：练习量、正确率、streak 三榜；可关闭（个人用户默认关） |
| FR-503 | 徽章成就 | C | 「首考满分」「百题斩」等，纯前端+一张发放表起步 |
| FR-504 | 题目讨论区 | C | 题下问答；作者/空间管理员可置顶与删除；沉淀内容资产 |
| FR-505 | 教师/专家共建题库 | S | 协作编辑权限档（见 §2.3）+ 题目审核流（提交→审→入库） |

### M6 组织与租户（本 PRD 的骨架功能）

| 编号 | 功能 | 优先级 | 说明 |
|---|---|:-:|---|
| FR-601 | 租户模型与入驻 | M | Organization（SCHOOL/ENTERPRISE/PERSONAL）、成员、部门/班级三层结构；个人用户自动落 PERSONAL 租户 |
| FR-602 | 角色与权限引擎 | M | §2 矩阵落地 + 跨租户隔离测试集；**存量数据迁移：为现有科目/题库/考试回填 org_id** |
| FR-603 | 企业管理场景 | M | **灯塔场景（决策 D1，优先于教育班级形态）**：员工批量导入、岗位/部门维度指派考试、入职合规考（一次性答题 + 签署记录） |
| FR-604 | 家长/领导只读视图 | S | reader 绑定链路（§2.3-3） |
| FR-605 | 平台运营面板 | S | 租户量/DAU/存储/失败登录聚合（数据源：pino 日志入库 + 业务表） |
| FR-606 | 订阅与配额框架 | M | 决策 D2：一期**全部功能免费**，但必须落地配额框架：`plans`（初始仅 FREE 档，限额宽松或无限）+ `quotas(resource_type, limit)` + `checkQuota(org_id, resource)` 统一拦截入口（上传/考试数/AI 次数均走此入口）；后期上线付费套餐只改配置不改表结构/代码路径；plan 字段预留于 organizations |

### M7 通知与触达

| 编号 | 功能 | 优先级 | 说明 |
|---|---|:-:|---|
| FR-701 | 通知中心（站内） | M | 统一通知表 + 未读角标；所有下游通道是它的投递器 |
| FR-702 | 邮件通道 | M | 复用服务端 EmailJS REST 链路（P0 已建），扩展考试发布/成绩/预警模板；注意 EmailJS 免费额度，需投递队列 + 合并策略 |
| FR-703 | 微信通道 | S | 服务号模板消息（教育/企业触达率远高于邮件）；依赖企业资质与备案，作为企业租户特性优先 |
| FR-704 | 短信通道（登录/预警） | W | 成本控制严格，仅企业版按量开通 |

### M8 开放与增长

| 编号 | 功能 | 优先级 | 说明 |
|---|---|:-:|---|
| FR-801 | 分享招生/内推链接 | S | 现有 inviteCode 包装成落地页（加入班级/企业），带二维码 |
| FR-802 | 开放 API + Webhook | C | 成绩/事件推送到学校与企业的既有系统；API Key 按租户签发、限流独立 |
| FR-803 | 扫码进场考试 | C | 教室场景：二维码即考试入口 + 简单身份核验 |

---

## 4. 非功能需求（高负载与可靠性重点）

### 4.1 容量目标

| 指标 | 目标 |
|---|---|
| 注册用户 | 10 万级 |
| 日活 | 1 万 |
| 峰值并发应试 | 2000 |
| 单场考试规模 | 1000 人，交卷窗口可聚集在同一分钟 |
| 读接口 P95 | < 300 ms（缓存命中 < 100 ms） |
| 交卷接口 P95 | < 800 ms（异步落库路径，见 4.3） |
| 可用性 | 99.5%（月不可用 < 3.6 h），计划内维护走 pm2 reload |

### 4.2 演进总原则

当前「单机 + 单 MySQL」在 500 DAU 内不会出问题；租户化/企业化后按**触发条件**分步演进，避免过度设计：

| 步骤 | 触发条件 | 动作 |
|---|---|---|
| S0 | 立即 | 应用保持无状态（已满足：JWT，无 session）；所有新表带 `org_id`；慢查询日志开起来 |
| S1 | DAU > 2000 或考试并发 > 300 | 引入 **Redis**：考试快照缓存、限流计数、分布式锁、会话级草稿缓冲 |
| S2 | 交卷尖峰出现写失败/排队 | 引入 **消息队列**（起步用 MySQL 队列表 + 轮询亦可，目标态 Redis Stream 或 RabbitMQ）：提交异步入库 |
| S3 | 单库 CPU > 60% 持续 | **读写分离**：答题流水表只读副本分流统计查询；按学期/年度**归档** answer_records |
| S4 | 单机内存/带宽瓶颈 | **多实例 + Nginx upstream** 负载均衡（PM2 cluster → 多机）；静态资源全量走 CDN |
| S5 | 判题/OCR/AI 长任务成热点 | 独立 worker 进程组（pm2 不同 app），与 API 进程隔离资源 |

### 4.3 考试尖峰模型（最关键设计）

一场 1000 人考试的「开考前 5 分钟聚集」与「交卷时刻聚集」是系统最恶劣负载，按事件分别削平：

1. **开考（读尖峰）**
   - 试卷发布即生成不可变**快照**（snapshot JSON，含题目乱序种子 per-user）；
   - 快照入 Redis + 客户端预取（发布后即可提前下载，考试页只校验开始时间）；
   - 题目正文含图片/音频的走 CDN，源站不出大流量。
2. **作答期间（写碎流）**
   - 客户端草稿存 localStorage，30–60 s 增量上报到草稿缓冲（Redis，带 TTL）；
   - 服务端不做逐题实时落 MySQL。
3. **交卷（写尖峰）**
   - 交卷请求只写「提交事件」进队列（幂等键：attempt_id），毫秒级返回排队号；
   - worker 消费队列：判分（SSOT 函数，CPU 密集）→ 成绩落库 → 触发通知（通知本身再进投递队列）；
   - 目标：1000 份/分钟的吞吐，成绩 5 分钟内全部可见（可接受的最终一致性，UI 显示「判分中」）。
4. **防踩踏**
   - 调度器对「到点自动收卷」分批错峰（按 attempt_id 哈希加 0–60 s 抖动）。

### 4.4 统计与热数据

- 排行榜/看板**禁止实时扫答题流水大表**：写路径同步维护预聚合表（`stats_daily`：org × user × 日 × 维度），看板只读聚合表；
- streak、预警等低频扫描走每日定时任务（夜间错峰）；
- 题目/知识点引用计数在删除校验路径上读，可接受。

### 4.5 安全与权限非功能

- 跨租户越权测试集为 **CI 阻塞门禁**（对齐现有双 vitest 门禁实践）；
- 所有列表 API 强制分页上限；导出走异步任务（防大查询打挂库）；
- 判题沙箱：容器隔离、无网络、只读 FS、限时限内存、语言版本白名单——按不可信代码对待；
- 上传管线沿用 P0 加固（MIME 双校验 + nosniff），新增音频类型走同一管线；
- 限流分层：网关层（IP 全局）→ 应用层（现有 express-rate-limit 按端点）→ 租户层（企业 API Key 配额）。

### 4.6 可观测性

- pino 结构化日志已就位：补 trace_id 贯穿（nginx → node → worker → 队列）；
- 指标：prom-client 暴露 /metrics（QPS、P95、队列深度、判分延迟、Redis 命中率），Grafana 单机起步；
- 告警底线：队列积压 > 5 min、健康检查连续失败、判分失败率 > 1%。

### 4.7 数据可靠性

- MySQL：每日全量备份 + binlog 增量（现有备份脚本扩展），备份异地（OSS）留存 30 天；
- 恢复演练每季度一次（备份不演练等于没有）；
- 答案提交事件队列持久化，服务重启不丢未消费提交。

---

## 5. 数据模型草案（新增/变更核心表）

```plaintext
plans                code(FREE|…预留), name, enabled
quotas               plan_code, resource_type(upload_bytes|audio_count|exam_count|ai_calls…), limit(-1=无限)
storage_usage        org_id, bytes_used, updated_at               -- 定时重算+增量事件维护，告警阀值判定源
organizations        id, type(SCHOOL|ENTERPRISE|PERSONAL), name, plan, created_at
org_members          id, org_id, user_id, role(org_admin|content_author|examinee|reader), dept_id, joined_at
departments          id, org_id, parent_id, name, kind(DEPT|CLASS|GRADE)   -- 部门或班级复用一表
resource_acl         id, resource_type(subject|exam|question_bank), resource_id,
                     grantee_type(org|dept|user), grantee_id, perm(READ|PRACTICE|EDIT)
question_tags        id, org_id(null=公共词表), name, parent_id            -- 标签树
question_tag_map     question_id, tag_id
tags 权限：题目删除改软删 deleted_at + question_versions(question_id, seq, payload)
exam_snapshots       exam_id, version, payload(JSON)                       -- 发布即生成，不可变
submission_events    id, attempt_id(uk 幂等), status(queued|scoring|done|failed), enqueued_at  -- 起步即队列表
draft_buffers        (Redis) attempt_id → 最近草稿, TTL 至考试结束后 24h
stats_daily          org_id, user_id, date, metric, value                   -- 预聚合
practice_reviews     question_id, user_id, next_review_at, stage            -- 间隔复习
streaks              user_id, current, longest, last_active_date, makeup_cards
notifications        id, user_id, type, payload, read_at
notification_deliveries id, notification_id, channel(email|wechat|site), status, retry_count
audit_logs           id, org_id, user_id, action, resource, detail, created_at
parent_links         id, student_user_id, reader_user_id, status(activated|revoked)
```

现有表统一迁移：`questions / subjects / exams / exam_attempts / practice_mistakes / favorites / users(经 org_members)` 回填 `org_id`（迁移脚本带 dry-run，走 `server/src/migrate.js` 体系）。存量 `server/uploads/` 文件迁 OSS：题目资源记录增加 `storage_key` 字段，旧记录保留磁盘路径回退读，新上传全部进 OSS。

---

## 6. 实施路线图

> 排序逻辑：**先改权限与租户骨架（越晚改迁移越贵）→ 再补题型数据面 → 分析与 AI 叠加 → 高负载改造按 S 步骤触发**。

### Phase 0：数据面补课（现有架构即可承载，2–4 周）
- FR-101/102/103 题型补齐（判分进 SSOT + 单测）
- FR-107 回收站与版本历史
- FR-206 成绩导出、FR-204 自动收卷、FR-202 乱序
- S0：新表全部带 org_id 的编码约定落地

### Phase 1：分析地基 + 触达（3–5 周）
- FR-108 知识点标签体系（含存量题目标签回填工具：AI 辅助 + 人工确认）
- FR-301/302 学情与考情看板（预聚合表 stats_daily）
- FR-701/702 通知中心 + 邮件模板（考试发布/成绩）
- **FR-606 配额框架前置落地**（决策 D2：全部免费但框架先就位，避免 Phase 3 OSS/AI 用量上来后补拦截层的返工）
- FR-501 streak（首个激励功能验证留存效果）

### Phase 2：租户化与角色重构（5–8 周，关键且风险最高）
- FR-601/602 组织模型 + 三层角色权限引擎 + 存量迁移
- 跨租户隔离测试集进 CI 门禁
- **FR-603 企业内训灯塔闭环（决策 D1：部门/岗位形态先行，教育班级形态后置为 departments.kind=CLASS 的自然延伸）**
- FR-605 平台面板初版（含存储用量卡片）
- FR-104 材料题 + FR-303 间隔复习 + FR-401 AI 讲评

### Phase 3：高负载与体验纵深（按 §4.2 触发条件执行）
- S1 Redis + 考试快照 → S2 交卷队列 →（按需）S3 读写分离 / S4 多实例 CDN
- **FR-109 OSS 对象存储与容量治理（与听力题同期引入，存量图片迁移一并完成）**
- FR-203 断线续考、FR-105 听力题、FR-604 家长/领导视图（企业侧对应「领导只读」优先）、FR-502 排行榜
- FR-703 微信通道（企业资质就绪后）、FR-505 共建题库审核流

### Phase 4：差异化与商业（长周期）
- FR-106 编程判题服务（独立 worker + 沙箱，先 Python 沙箱试点）
- FR-402/403/404 AI 变式/对话辅导/学习计划
- **收费套餐上线（决策 D2 后期项：基于 FR-606 框架定义付费 plan 与支付接入，零表结构变更）**、FR-801/802 分享落地页与开放 API
- FR-207 互评、FR-504 讨论区、FR-405 拍照建题按数据反馈决定去留

---

## 7. 风险与开放问题

| # | 风险 | 等级 | 缓解 |
|---|---|:-:|---|
| R1 | 范围失控：教育+企业双场景同时铺开导致哪边都不深 | 高 | 决策 D1 已定灯塔=企业内训：Phase 2 资源集中在部门形态最小闭环，教育班级形态仅保留模型兼容（departments.kind=CLASS），不在本期做深 |
| R2 | 权限重构引发存量数据迁移事故 | 高 | 迁移 dry-run + 影子读验证 + 隔离测试门禁；老角色映射保留 6 个月兼容期 |
| R3 | 判题沙箱安全（逃逸/资源耗尽/挖矿） | 高 | 容器隔离无网络、资源硬限、代码视为完全不可信；上线前渗透测试；否则宁缺毋滥 |
| R4 | EmailJS 免费额度撑不起通知量（月 200 封量级） | 中 | 通知合并策略（每日汇总）+ 队列限速；量大后切自建 SMTP/云邮件（接口已在服务端，一处替换） |
| R5 | 单机 MySQL 是租户化后的第一堵墙 | 中 | §4.2 触发式演进，不做预防性过度架构；先上监控指标再决定 S 步 |
| R6 | 家长/员工数据合规（PIPL：告知、最小化、可删除） | 中 | reader 绑定需授权链、导出与删除自助入口随 FR-604 同步交付；法务文本评审 |
| R7 | 学生默认开启排行榜的心理负效应 | 低 | 排行默认仅班内可见 + 租户开关；提供「只显示自己的百分位」模式 |
| R8 | OSS 引入后的成本失控与滥用（外部盗链、恶意上传塔费用） | 中 | 私有 bucket + 短效签名 URL；上传前置鉴权+配额拦截（FR-109 熔断）；CDN 用量设账单告警；Referer/签名双重限制防盗链 |
| R9 | 全免费策略下无营收约束，重度租户挤占资源 | 低→中 | FR-606 配额框架即使 FREE 档也设实际上限（存储/考试数/AI 次数），兼作未来套餐基线 |

### 7.2 已决策事项（2026-10-11 冻结）

| # | 决策 | 落地影响 |
|---|---|---|
| D1 | **首个灯塔客户 = 企业内训** | FR-603 升为 M；Phase 2 部门/岗位形态先行，班级形态后置；FR-604 企业侧「领导只读」优先于家长视图；微信通道（FR-703）对企业触达更重要，维持 S 但提前排期候选 |
| D2 | **先全部免费，保留收费接口，后期可收费** | FR-606 从 C 升为 M 并前置到 Phase 1；`plans/quotas/checkQuota` 框架先就位，FREE 档设实际上限（见 R9）；Phase 4 收费上线仅改配置+支付接入 |
| D3 | **引入 OSS 对象存储，控制文件大小，后台阀值告警，达阈停止音频上传** | 新增 FR-109（M）；FR-105 听力题存储改 OSS；数据模型增 `plans/quotas/storage_usage` 与 `storage_key` 字段；告警接 FR-701 通知中心、面板接 FR-605；阀值/上限参数后台可配；存量 uploads 迁移策略见 §5 |

---

## 8. 验收标准（整体）

- 功能：各 Phase 功能项附单测/集成测试，CI 双门禁（root vitest + server vitest）全绿；新增跨租户隔离测试集
- 性能：Phase 3 完成后以压测脚本验证 §4.1 指标（k6/autocannon 对开考、交卷两尖峰场景）
- 安全：P0 级安全回归清单（上传白名单、验证码、限流、隔离）作为发布前检查表
- 业务信号：streak/看板上线后 30 天对比练习留存基线（埋点：stats_daily 即数据源）

---

# 附录：现状事实基线（脱敏版）

> 本附录为 PRD 审核提供**可验证的现状事实**，全部取自当前代码库真实文件（2026-10-11）。
> 脱敏处理：服务器公网 IP → `<SERVER_IP>`；对外域名 → `<DOMAIN>`；所有密钥/密码值一律不包含（以 `***` 指代）。审核所需信息不依赖这些值。

## A1. 系统现状一句话

单租户教师-学员在线题库考试系统，已上线运行；2026-10 完成 P0-P2 安全/质量整改（11 项，提交 e3bae5c..7d35c90），具备 CI 测试门禁与结构化日志。**尚无组织/租户概念，尚无知识点标签，尚无软删除。**

## A2. 技术栈与关键依赖（实测自 package.json）

| 层 | 技术 |
|---|---|
| 前端 | React 19 + TypeScript + Vite 6 + Tailwind v4 + react-router-dom 7 |
| 重库（全部动态 import，红线约束） | xlsx 0.18（有书面豁免）、pdfjs-dist 6.4、mammoth 1.12、tesseract.js 5.1、katex、@google/genai |
| 服务端 | Express（ESM）+ mysql2 + bcrypt + jsonwebtoken + express-rate-limit + pino/pino-http |
| 测试 | vitest 双门禁：root（96 用例，10 文件）+ server（15 用例：验证码服务 11 + 判分一致性 4），均为 CI 阻塞步骤 |
| 进程/部署 | PM2（study-server）+ pm2-logrotate（10M×7 gzip）；GitHub Actions：npm ci → server vitest → root vitest → build → rsync dist/src/migrations → 写 server/.env（secrets 注入）→ migrate → pm2 reload → nginx conf 原子更新（失败回滚）→ 健康检查 |
| 多端 | Web SPA / Electron / Android(Capacitor) / Chrome 扩展（共享判分逻辑） |

## A3. 数据库现状（14 张表，实测自 server/migrations/001–011）

表清单：`users, subjects, questions, mistake_records, favorites, study_stats, invite_codes, subject_subscriptions, subject_student_access, user_ai_settings, visit_counter, exams, exam_attempts, email_verifications`

与 PRD 审核相关的关键字段事实：

```sql
-- users：角色为四值 ENUM，无租户外键（PRD FR-601/602 迁移起点）
role ENUM('admin','teacher','student','independent') DEFAULT 'student',
teacher_id INT,                    -- 现有「师-生」直连关系（将被 org_members 取代）
password_hash VARCHAR(255), password_reset TINYINT(1)

-- questions：type 为 VARCHAR 弱约束，答案/选项均 JSON（PRD FR-101~104 扩展点）
type VARCHAR(20) COMMENT 'single/multiple/programming',
options JSON, answer JSON, explanation TEXT, points INT DEFAULT 1,
created_by INT                     -- 归属人，无 org_id / 无标签 / 无 deleted_at（软删）

-- exams：题集内联 JSON，无快照表、无乱序、无按人个性化（PRD §4.3 快照设计的缺失现状）
question_set JSON COMMENT '[{question_id, points}]',
duration_minutes INT, start_time/end_time DATETIME, pass_score INT,
status ENUM('draft','published','closed')

-- exam_attempts：单行 JSON 存全卷答案（1000 人同卷 = 单行 UPDATE 热点，PRD 队列化改造对象）
answers JSON COMMENT '{"question_id": userAnswer}',
details JSON COMMENT '服务端判分明细（错题回顾数据源）',
status ENUM('in_progress','submitted','auto_submitted'),
deadline DATETIME COMMENT 'started_at + duration（服务端计时基准）'

-- email_verifications（011 新增）：服务端验证码，sha256 哈希、TTL/限频/尝试计数列
```

存储现状：题目图片等上传文件**磁盘直存** `server/uploads/user_<id>/`（单用户目录已 695 个文件），Nginx 静态映射 `/api/uploads` 带 nosniff/CSP 头——PRD FR-109 的迁移对象。

## A4. 服务端 API 现状（server/src/routes，10 个文件）

`auth.js`（985 行，含 /send-code、/reset-with-code、/register 服务端验证码校验）、`exams.js`、`practice.js`（mistakes/favorites/stats）、`questions.js`、`subjects.js`、`students.js`、`invite-codes.js`、`ai.js`（多模型路由，密钥走服务端 env + 用户自带 key）、`sync.js`（客户端数据迁移上行）、`upload.js`（MIME 双校验白名单，已移除 SVG）。

限流现状：express-rate-limit 分层已有 loginRegister 与 sendCode 两组（每 IP 15min×20），**尚无租户维度限流**。

## A5. 判分单一可信源（SSOT）现状

- SSOT 源：`src/shared/scoring/`，导出 `correctOptionIndices / isAnswerCorrect / gradeQuestion / scoreByIndices / formatTime / GradeResult`
- 服务端当前**双轨**：`server/src/utils/examScoring.js`（手写，exams.js 实际引用）+ `examScoring.generated.js`（SSOT 构建产物）
- 护栏：`server/tests/unit/scoringConsistency.test.js` 以 13 条语料锁定两轨行为一致（CI 门禁内）
- 审核要点：PRD FR-101~103 新增题型的判分必须同时进两轨或借此机会收敛单轨——一致性测试是当前唯一的防漂移机制

## A6. 前端类型现状（src/types.ts）

```ts
type QuestionType = 'single' | 'multiple' | 'programming';
type UserRoleDomain = 'admin' | 'teacher' | 'student' | 'independent';
type ExamStatus = 'draft' | 'published' | 'closed';
type AttemptStatus = 'in_progress' | 'submitted' | 'auto_submitted';
```

已实现且 PRD 引用的功能：错题本（`consecutiveCorrect` 连对机制）、收藏夹、科目分享码（SubjectShareCode）、邀请码（invite_codes 含 max_uses）、练习统计（study_stats）。
**未实现（PRD 提案为零基础）**：知识点标签、软删/回收站、考试快照、草稿缓冲、预聚合统计表、通知中心、组织/部门、支付/配额。

## A7. 安全与基建基线（P0-P2 整改完成项，PRD 所称「已就位基建」）

1. 验证码服务端化：CSPRNG 6 位、sha256 入库、5min TTL、60s 限频、5 次防爆破、一次性消费；EmailJS 密钥仅存 server/.env（CI secrets 注入），生产缺密钥强制拒绝、开发自动跳过；前端 bundle 已验证零密钥
2. 上传：SVG 移出白名单 + MIME 双校验 + nosniff/CSP 响应头
3. 依赖：生产依赖 critical/high 归零（xlsx 书面豁免见开发文档 §12）
4. 可观测：pino 结构化日志全量替换 console（105 处），4xx→warn/5xx→error，探活请求不记；pm2-logrotate 自动配置
5. CI：双 vitest 门禁 + lint（tsc --noEmit）零错误 + build；nginx conf 由 CI 原子同步（`nginx -t` 校验失败自动回滚）
6. 已知历史故障教训：gitignore 的构建资产（tesseract 语言包）未在 CI 重演 → rsync --delete 曾清掉线上文件，现已修复（PRD R5/运维风险的现实例证）

## A8. 容量与资源硬约束（审核 PRD §4 时的现实基线）

| 约束 | 现状值 | 影响 |
|---|---|---|
| 应用实例 | 单机 PM2 单实例 fork 模式 | CPU 密集判分与 API 服务抢核；PRD S5 的依据 |
| 邮件 | EmailJS 免费额度量级（约 200 封/月） | PRD R4 通知合并策略的依据 |
| 存储 | 单机磁盘直存，无 CDN 回源 | 音频类大文件立即触顶，PRD D3 决策动因 |
| 数据库 | 单 MySQL 实例，与业务同机 | exam_attempts 单行 JSON 并发 UPDATE 为交卷尖峰瓶颈 |
| 部署通道 | CI 全量 rsync dist/src（非镜像化） | 多实例化需先改造为共享存储/对象存储（PRD S4 前置） |

---

*本附录与《产品需求文档-平台化演进》v0.2 合并构成完整评审包；事实描述可由审核者对照代码库逐条验证（脱敏字段除外）。*

