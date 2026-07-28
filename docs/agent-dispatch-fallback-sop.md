# 子 Agent 派发回退 SOP（软件公司工作流）

> 背景：2026-07-26 第二批批次一实施时，`software-engineer` 子 agent 两次 0 秒失败（报 `is not available`），被迫回退 `general-purpose` 单 agent 串行跑完（~30min），且丢失了「转 QA 回归」这一质量关卡。本 SOP 固化「探测 + 单次失败即回退 + 显式工程师标准 + 大任务拆 chunk 并行」机制，避免再踩。

## 1. 适用范围
- 软件公司 expert 下所有需要派发 `software-*` 子 agent（architect / engineer / product-manager / qa-engineer）的场景。
- 任何长会话（> 10 轮）后首次派发子 agent，或上一轮同类子 agent 曾失败过的场景，**强制**走本 SOP。

## 2. 核心原则
- **单次失败即回退，禁止对原类型重试**：派发 `software-*` 后若返回 `is not available` / 0 秒空失败 / 无实质输出，立刻 fallback 到 `general-purpose`，**不要**再派同一 `software-*` 类型重试（重试只会空耗时间）。
- **回退不是降级**：`general-purpose` 同样能产出工程师级别代码，关键是 prompt 里**显式要求**对齐工程师标准。

## 3. 派发流程（主理人执行）

```
1. 准备任务说明（含完整前置上下文）
2. 尝试派发 software-<role>，name/subagent_type 严格一致
3. 判定结果：
   - 正常返回且有实质产出 → 采用，进入下一阶段
   - 0 秒失败 / is not available / 空产出 → 立即 fallback：
       a. 不重试 software-<role>
       b. 改用 general-purpose，prompt 套用 §4 模板
       c. 继续后续流程（含转 QA）
```

## 4. Fallback Prompt 模板（general-purpose 替代工程师时必含）

> 你现在是软件公司团队的**工程师**，请按以下标准执行：
> 1. 依据任务说明批量编写代码，遵循 Google 代码规范（优雅、可读、可扩展、高效）；
> 2. 全部文件写完后，执行**全局一致性审查**，在结尾明确给出 `IS_PASS: YES/NO`；
>    - 若 NO：修复后重新审查，最多 2 轮；
>    - 若 YES：生成代码摘要。
> 3. 完成后**不要自行收尾**，把代码摘要回传主理人，由主理人转 QA 工程师做回归验证。
> 4. 禁止跳过前序架构/任务列表的约束，最小变更原则。

（若 fallback 替代的是 architect/qa/pm，则把第 1–2 条替换为对应角色职责，但同样要求「产出后回传主理人、不自行终止流程」。）

## 5. 大任务拆 chunk 并行（解决单 agent 串行慢）
- 当任务 > 10 个文件或预计 > 10min 时，**拆成 3–5 个独立 chunk**（按模块/目录边界切，chunk 间依赖降到最低）。
- 多个 chunk 可**并行**派发多个 `general-purpose`（或可用的 `software-*`），而非单个 agent 串行 30min。
- 每个 chunk 末尾 agent 必须自报：`[chunk-N 完成] 文件清单 + IS_PASS + 遗留`。
- 所有 chunk 完成后，主理人汇总 → 统一转 QA 做全量回归。

## 6. 与标准 SOP 的衔接
- 本 SOP 是「团队成员调度」环节的补充，不替代产品经理→架构师→工程师→QA 的顺序流转。
- 任何 fallback 都不允许跳过质量关卡：工程师产出必须有 `IS_PASS: YES`；QA 回归必须做智能路由判定（Engineer/QA/NoOne）。

## 7. 自检清单（每次派发前过一遍）
- [ ] name 与 subagent_type 是否严格一致（不用中文名）？
- [ ] 任务说明是否含完整前置上下文？
- [ ] 若长会话/曾失败：是否准备好 fallback 到 general-purpose 的预案？
- [ ] 大任务是否拆成 ≤5 个 chunk？
- [ ] prompt 是否要求产出后回传主理人（不自行终止）？
