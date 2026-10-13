# FR-106 编程题在线判题 — 设计规格（核心纵切 v1）

- 日期：2026-10-13
- 状态：已评审通过（待写入实现计划）
- 关联：PRD FR-106（编程题在线判题，复杂度 C）；FR-103（人工判分工作流，本设计复用其改分重算链路）；FR-110（判分单轨收敛，SSOT 前提）
- 范围裁定：**第一期仅 Python 单语言**；判题运行时 **Docker 每提交起容器**（部署环境确认可新增 Docker）。

## 1. 背景与目标

`programming` 题当前**不自动判分**：判分 SSOT `src/shared/scoring/index.ts` 的 `gradeQuestion()` 对 `type==='programming'` 返回 `{is_correct:null, earned:0, needs_manual:true}`；作答端已有 `<textarea>`（练习页「确认代码」用弱文本比较、考试页交卷后走人工判分）。FR-106 是在此基础上的**升级而非新建**：引入真正的代码执行与自动判分。

目标（第一期端到端最小闭环）：
1. 编程题可携带一组**样例测试用例**（输入 → 期望输出），Python 语言。
2. 练习页可「运行样例」，同步执行并展示逐用例通过/失败与实际输出。
3. 正式考试交卷后**异步判题**，自动回写每题 `earned` 与总分，全部完成发 `score_ready` 站内通知。
4. 判题失败/超时/环境不可用时**回落人工判分**（fail-closed，绝不自动误给分）。

非目标（延后增量2，见 §10）：多语言、CodeMirror 高亮编辑器、分布式队列/Redis、隐藏用例反作弊、判题结果缓存、复杂部分分策略。

## 2. 关键设计原则

- **SSOT 零侵入**：判题是服务端外部自动评分器，**不进 `src/shared/scoring`**（该模块零依赖、不引 DOM/Node API、无法 exec）。`gradeQuestion(programming)` 维持 `needs_manual` 作为默认口径。
- **复用 FR-103 重算链路**：判题结果写回 `exam_attempts.details`（JSON），走 `applyManualScore` 同款 `SELECT ... FOR UPDATE` 事务 + `score = Σdetails.earned` + `correct_count` 重算 + 发 `score_ready`，与人工改分同构。
- **questions 表零改动**：判题配置与判题运行分置两张新表，隔离 FR-106 影响面。
- **安全兜底优先**：判题器置于接口后；任何基础设施异常一律回落人工，不自动给分。

## 3. 数据模型

### 3.1 迁移 027 — `question_judge_configs`（判题配置，1:1 软引用）
- `question_id INT PRIMARY KEY`（软引用 `questions.id`，**不设 DB 外键**，与 FR-104/105 软引用策略一致）
- `language VARCHAR(32) NOT NULL DEFAULT 'python'`
- `time_limit_ms INT NOT NULL DEFAULT 2000`
- `memory_limit_mb INT NOT NULL DEFAULT 128`
- `starter_code LONGTEXT NULL`
- `test_cases JSON NOT NULL`（数组，元素 `{ "input": string, "expected_output": string, "is_sample": boolean }`）
- `created_by INT NOT NULL`（属主，用于隔离）
- `created_at / updated_at DATETIME`

### 3.2 迁移 028 — `judge_runs`（判题运行账本，异步状态 + 审计）
- `id INT AUTO_INCREMENT PRIMARY KEY`
- `attempt_id INT NOT NULL`（软引用 `exam_attempts.id`）
- `question_id INT NOT NULL`
- `status ENUM('queued','running','done','failed','skipped') NOT NULL DEFAULT 'queued'`
- `verdict VARCHAR(16) NULL`（`AC`/`WA`/`TLE`/`MLE`/`RE`/`CE`）
- `passed INT NULL`、`total INT NULL`
- `time_ms INT NULL`、`mem_kb INT NULL`
- `log TEXT NULL`（编译/运行错误摘要，仅属主/管理员可读）
- `created_at / updated_at DATETIME`
- 索引：`(attempt_id, question_id)`、`(status)`

> 分数真相仍以 `exam_attempts.details` 为准；`judge_runs` 只承载异步状态机与日志，便于重跑、审计与「判题中」进度展示。

## 4. 判题执行（Docker 强隔离）

服务端新增 `server/src/services/judgeService.js`，接口 `JudgeRunner`：
```
run({ code, language, testCases, timeLimitMs, memoryLimitMb }) ->
  { verdict, passed, total, perCase:[{index, ok, expected, actual, err}], time_ms, mem_kb, log }
```
实现 `DockerRunner`：以 `child_process` 起一次容器，**顺序跑完该题全部用例**（省 spawn 开销）：
```
docker run --rm \
  --network none \
  --memory {memoryLimitMb}m \
  --cpus 0.5 \
  --pids-limit 64 \
  --read-only --tmpfs /tmp:rw,size=16m \
  --user nobody \
  --stop-timeout {ceil(timeLimitMs/1000)+1} \
  -v {workdir}:/code:ro \
  python:3-slim \
  python /code/runner.py
```
- `workdir` 内写入提交代码 `solution.py` 与 `runner.py`（harness：读用例数组，逐个以 `input` 喂 stdin、捕获 stdout、按 `time_limit_ms` 限时、与 `expected_output` 比对）。
- **输出比对归一**：去除每行尾随空白与末尾空行后逐字符相等（第一期不做逐 token）。
- **双层超时**：容器 `--stop-timeout` + 服务端 wall-clock kill（`timeLimitMs*用例数 + 冷启裕量` 上限），超时记 `TLE`。
- 语言镜像固定 `python:3-slim`（第一期可 pin digest）。
- `StubRunner`：确定性假实现，供单测/集成在不依赖 Docker 的环境验证判分链路与状态机。

**回落策略（fail-closed）**：`docker` 不可用、镜像缺失、容器启动失败、未捕获基础设施异常 → `judge_runs.status='failed'/'skipped'`，该题保持 `needs_manual=true`，交由人工判分；**不因判题失败自动给分或判零**。

## 5. 判分集成与并发时机

### 5.1 练习页 — 同步「运行样例」
- 新端点 `POST /api/judge/practice`，body `{ question_id, code }`；`authMiddleware` + 限流。
- 仅取 `is_sample===true`（无样例则全部）用例同步执行，返回逐用例结果与 stdout；**不计分、不写 `exam_attempts`**。
- 取代现「确认代码」弱文本比较。

### 5.2 正式考试 — 异步判题 + 进程内并发闸
- 交卷 `POST /exams/:id/submit`：客观题照常在 `gradeAttempt` 内自动判分并写 `details`；`programming` 题**先按 `needs_manual` 落 `details`（earned=0）**，同时为每题建 `judge_runs(queued)` 并入**进程内信号量队列**（限 N 路并发，默认 N=2，配置项 `JUDGE_CONCURRENCY`）。
- 判题 worker 完成后：对该 attempt 开 `FOR UPDATE` 事务，用 `applyManualScore(details, qid, {earned, gradedBy:'judge'})` 写回 `earned = round(points * passed/total)`、`needs_manual=false`、附 `judge_status`，重算 `score`/`correct_count`；当该 attempt 全部 `judge_runs` 终态且无待人工项时，发 `score_ready` 通知（复用 FR-701/FR-103）。
- 学生交卷即刻返回，稍后见终分（与人工判分体验一致）。真实分布式队列/异步外置于增量2。

## 6. 前端

- **录入**：`QuestionForm`（题目管理页新建题目模态）增「编程题」配置区：语言（固定 Python，只读）、时限、内存、`starter_code`、样例用例列表（`{input, expected_output, is_sample}` 增删改）。`questionApi.create` 透传 `judge_config`。
- **导入**：`ImportModal`/`PreviewList` 支持简约定带样例用例（如以分隔符编码的用例列）；解析失败降级为「无样例的编程题（需人工判分）」，不阻断导入。
- **作答**：`ExamScreen`（练习）与 `FormalExamScreen`（考试）的 `programming` 分支保留 `<textarea>` 但增强（等宽字体、Tab 插空格、行数），新增「运行样例」按钮 + 逐用例结果面板（通过/失败、期望 vs 实际、错误摘要）；考试交卷态显示「判题中」并在完成后展示自动分（沿用现有成绩刷新/通知）。
- CodeMirror 语法高亮编辑器**不在第一期**（顾及 Electron/Android 包体与最小改动）。

## 7. 安全与多租户隔离

- 容器：`--network none` + `--read-only` + `--user nobody` + `--pids-limit` + `--memory`/`--cpus` 上限，收敛 RCE/资源滥用面；仅挂载临时只读工作目录。
- 端点：`authMiddleware` + 限流（`apiLimiter` 同款内存桶）；`/judge/practice` 与判题结果读取按 `created_by`/attempt 属主守卫。
- `question_judge_configs`/`judge_runs` 随题目/答卷属主隔离：**纳入跨租户隔离门禁**（B 不可见 A 的配置与判题日志）。
- 交卷风暴防护：进程内并发闸限制同时执行的容器数，超限排队，避免宿主被打爆。

## 8. 与既有判分/题型口径的一致性

- 题型枚举不变（`programming` 已存在）；`Question` 接口不新增判题字段（配置在独立表）。
- SSOT `gradeQuestion`/`isAnswerCorrect` 不改编程分支语义；自动分由判题服务经服务端写回，不共享到四端判分实现（Chrome 扩展不执行判题）。
- `analysis`/`my-history`/`bestScores` 实时读 `attempt.score`，判题回写后统计与取最高分自动生效，无需额外改动。

## 9. 测试与门禁（四重门可离线跑通）

- **单测**：`StubRunner` 驱动判分链路（状态机流转、`earned=round(points*passed/total)`、回落 `needs_manual`、输出归一比对纯函数）。
- **集成（`server/tests/integration_exam.mjs` 增段）**：建编程题带样例 → 练习运行样例 `AC` → 交卷 → 判题完成 → `score` 回写 + `score_ready`；基础设施异常场景 → 回落人工。
- **隔离（`server/tests/isolation.integration.mjs` 增段）**：B 读 A 的 `judge_runs`/配置 → 403/404。
- **Docker 可选真实执行**：独立用例检测 `docker` 可用则真跑、否则显式 `skip`，**不使门禁变红**。
- `tsc --noEmit`、root `vitest`、`npm run build` 照常通过。
- 每个 HTTP 门单独起 fresh server 规避限流；合并/推送前过 L3。

## 10. 延后清单（增量2）

1. 多语言运行时（Node/C++/Java/Go），配置已留 `language` 字段。
2. CodeMirror 6 语法高亮编辑器（含多端包体评估）。
3. 分布式判题队列（Redis/独立 worker），替代进程内信号量。
4. 隐藏用例与反作弊（`is_sample` 之外用例仅判分可见）；更细的**逐用例加权/子任务分**（各用例分值不同；v1 仅按通过用例数等比 `passed/total` 给分）。
5. 判题结果缓存与去重（相同代码+相同用例）。
6. 判题资源/配额治理接入 FR-606/FR-109 框架（按租户限并发与用量）。

## 11. 落点文件清单（预估）

- 迁移：`server/migrations/027_question_judge_configs.sql`、`028_judge_runs.sql`
- 后端：`server/src/services/judgeService.js`（接口 + DockerRunner + StubRunner + 并发闸）、`server/src/routes/judge.js`（练习端点 + 属主读取）、`questions.js`（建题/批量写 `judge_config`）、`exams.js`（交卷 enqueue 判题 + 复用 `applyManualScore` 回写）、`index.js`（挂载 `/api/judge`）
- 前端：`src/types.ts`、`src/services/api.ts`（`judgeApi`）、`src/services/api.mappers.ts`、`src/components/exam/QuestionForm.tsx`（用例编辑）、`src/components/app/ExamScreen.tsx`/`FormalExamScreen.tsx`（运行样例 + 结果面板）、`src/components/import/PreviewList.tsx`（导入带用例）
- 测试：`server/tests/integration_exam.mjs`、`server/tests/isolation.integration.mjs`、`src/services/__tests__/mappers.test.ts`
- 文档：开发文档路由表 + §8.3d 编程判题说明；PRD FR-106 交付状态

## 12. 风险与缓解

| 风险 | 缓解 |
|---|---|
| 部署机未装/无法用 Docker | 判题 fail-closed 回落人工；集成用 StubRunner 保证主链可测 |
| 交卷并发打爆宿主 | 进程内信号量限并发（默认 2），超限排队 |
| 恶意代码逃逸 | 禁网 + 只读 + 非 root + pids/memory/cpu 上限；镜像最小化 |
| 判题误判影响考试公正 | 按通过用例比例给分（`round(points*passed/total)`）+ 保留人工复核入口（判题写回 `gradedBy:'judge'` 可被教师改判覆盖，同 FR-103 幂等改判） |
| SSOT 漂移 | 判题完全外置于服务端，不碰 `src/shared/scoring` |
