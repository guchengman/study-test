# 文档索引

> 更新：2026-10-13　状态标注：**【现行】**与代码同步维护 / **【SOP】**持续有效的工作规范 / **【归档】**一次性历史产物，不再更新

## 现行文档

| 文档 | 受众 | 说明 | 代码基准 |
|---|---|---|---|
| [../README.md](../README.md) | 所有人 | 项目全景、功能列表、快速上手 | 2026-10-11 |
| [../CLAUDE.md](../CLAUDE.md) | AI 助手 / 开发者 | 架构约定、命令、关键惯例 | 2026-10-11 |
| [../CONFIGURATION.md](../CONFIGURATION.md) | 部署者 | 环境变量与 API Key 配置 | 2026-10-11 |
| [../INSTALL.md](../INSTALL.md) | 运维 | 部署流程 | 2026-10-11 |
| [开发文档.md](开发文档.md) | 开发 / 运维 | 架构、模块、数据模型、部署详解 | 2026-10-11 |
| [用户使用说明.md](用户使用说明.md) | 用户 / 师生 | 功能操作说明 | 2026-10-11 |
| [exam-module/](exam-module/) | 开发 | 正式考试模块设计（系统文档 + 类图 + 时序图） | 设计期文档，实现校准见文内 |
| [产品需求文档-平台化演进.md](产品需求文档-平台化演进.md) | 产品 / 开发 / 管理层 | 平台化（多租户）演进 PRD，**v0.3**（已纳入外部评审 26 项复核结论与 3 项代码侧新发现） | v0.3 修订时逐项对照过代码，2026-10-12 |
| [PRD-v0.3-修订说明.md](PRD-v0.3-修订说明.md) | 产品 / 评审者 | v0.2 → v0.3 **逐条 diff 与采纳/驳回依据**（含可复现的核验方法与待决策 D4） | 2026-10-12 |
| [附录-现状事实基线.md](附录-现状事实基线.md) | 评审者 / 开发 | A1–A8 脱敏现状事实（表结构、路由、判分双轨、容量硬约束），供逐条验证 PRD 假设 | 2026-10-11（注意：其中「判分双轨 / 无 org 维度」等已被后续整改收敛，最新事实以根目录 TECHNICAL_ANALYSIS.md 为准） |
| [../TECHNICAL_ANALYSIS.md](../TECHNICAL_ANALYSIS.md) | 开发 / 架构 / 管理层 | 全科题库技术分析：架构/数据流/数据模型/权限/判分 SSOT + P0–P3 问题清单（逐条标注已解决/仍开放） | 2026-10-13 代码实测 |
| [../IMPLEMENTATION_PLAN.md](../IMPLEMENTATION_PLAN.md) | 开发 / 管理层 | 实施方案：Phase 0–4 排期与在产技术债，与 PRD v0.3 FR 编号对齐 | 2026-10-13 |
| [Phase2-租户化与角色重构-立项评估.md](Phase2-租户化与角色重构-立项评估.md) | 开发 / 管理层 / 法务 | Phase 2 单独立项：角色权威切换 + 跨租户隔离进 CI + 存量迁移 + DPA/灯塔 | 2026-10-13 代码实测 |

## 快照（冻结于某次评审，不再更新）

| 文档 | 说明 |
|---|---|
| [评审包-平台化PRD与现状基线.md](评审包-平台化PRD与现状基线.md) | PRD **v0.2** 外部评审包（指引 + 内嵌 PRD 全文 + 附录），保留评审可追溯性；现行版本见上方 PRD v0.3 与修订说明 |

## SOP（持续有效）

| 文档 | 说明 |
|---|---|
| [sop/agent-dispatch-fallback-sop.md](sop/agent-dispatch-fallback-sop.md) | Agent 派发回退 SOP |
| [sop/git-write-protection-sop.md](sop/git-write-protection-sop.md) | Git 写保护 SOP |
| [sop/npm-install-sandbox-sop.md](sop/npm-install-sandbox-sop.md) | npm 安装沙箱 SOP |

## 归档（历史产物，不再更新）

`archive/` 下文档为一次性审计/计划/测试产物，归档于 2026-10-11，仅供追溯，不代表当前实现：

- `architecture-audit.md` — 架构与可维护性审核报告（2026-07）
- `module-consistency-audit.md` / `module-consistency-remediation-risk.md` — 模块一致性审计与整改风险评估
- `second-batch-plan.md` — 第二批整改计划
- `项目分析报告.md` / `CODE_AUDIT_REPORT.md` — 早期应用与代码分析报告
- `PLAN-formula-support.md` — 公式识别改造计划（功能已上线，结论并入开发文档）
- `软件Bug测试报告.html` / `bug-feedback-form.html` / `Bug反馈表-实习生版.xlsx` — 测试资产

## 阅读路径

- **新成员**：README → CLAUDE.md → 开发文档
- **开发者日常**：CLAUDE.md + 开发文档对应模块章节
- **运维部署**：INSTALL → CONFIGURATION → 开发文档部署章节
- **用户 / 师生**：用户使用说明
- **架构 / 管理层 / 规划下一步**：../TECHNICAL_ANALYSIS.md（现状与问题清单）→ ../IMPLEMENTATION_PLAN.md（排期）→ Phase2-租户化与角色重构-立项评估.md（下一大块）
