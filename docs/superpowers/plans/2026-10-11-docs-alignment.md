# 文档体系对齐代码现状 — 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 全套文档（6 份主文档）与当前 main 分支代码逐条核对对齐，历史一次性文档归档隔离，并建立 `docs/README.md` 索引页。

**Architecture:** 纯文档任务，不改业务代码。先逐模块通读代码产出《核对勘误表》（临时文件，不提交），再按勘误表修订主文档；归档用 `git mv` 保留历史；终检用 grep + `npm run lint` + `npm run build` 验证。

**Tech Stack:** Markdown、git（PowerShell 环境执行）、npm scripts（vite/tsc/vitest）、MySQL 迁移 SQL。

**设计依据:** `docs/superpowers/specs/2026-10-11-docs-alignment-design.md`

---

## 预备：策划期已核实的问题清单（修订时必须处理）

这些是写计划前已从代码中确认的过时点，各 Task 会引用。格式：**文档 | 原文 | 代码事实（证据）**。

| # | 文档 | 原文陈述 | 代码事实（证据路径） |
|---|---|---|---|
| K1 | CLAUDE.md §Database | "10 tables in 001~009" | 迁移已有 `server/migrations/010_exams.sql`（正式考试模块表），需读该文件确认新增表名/数量后更新表述 |
| K2 | CLAUDE.md §Backend | 路由列表缺 `ai.js`、`invite-codes.js` | `server/src/routes/` 实际 10 个文件：ai, auth, exams, invite-codes, practice, questions, students, subjects, sync, upload |
| K3 | CLAUDE.md / 开发文档 | 评分逻辑仅在 `src/utils/examScoring.ts` | 已重构为单一可信源 `src/shared/scoring/index.ts`（含 `__tests__/scoring.test.ts`、`scoring.edge.test.ts`），`scripts/build-scoring.mjs` 在 `prebuild`/`npm run sync:scoring` 时同步；需读码确认 `examScoring.ts` 现状（是否已改为 re-export） |
| K4 | README / 开发文档功能列表 | 导入仅 Word/PDF/CSV | 已支持 Excel 导入（依赖 `xlsx@0.18.5`），长列表虚拟化为 `react-window`；commit `84bda33` |
| K5 | 开发文档部署章节 | PM2 单 app 配置 | `ecosystem.config.cjs` 已改为可移植双-app 配置（commit `b2ac74b`），需读文件确认后改写 |
| K6 | 开发文档 OCR 相关 | 未提及超时保护 | OCR 已本地化资源 + 45s 超时（commit `b420849`、`1bc3a1a`），`npm run setup:tesseract` 拉取本地资产（`scripts/setup/tesseract-assets.mjs`） |
| K7 | 开发文档 | ImportModal 单文件 | 已拆分（commit `1749c6a`），需读 `src/components/` 确认拆分后的文件清单 |
| K8 | 根目录 | `PLAN-formula-support.md` 仍是"计划" | KaTeX + remark-math + rehype-katex 已上线（`package.json` 依赖 + commit `c3ade94`），计划文档应归档，结论并入开发文档 |

> 通读阶段（Task 1~8）若发现与上表冲突的细节，以实际代码为准并记入勘误表。

## 约定

- 勘误表工作文件：`docs/.errata-worksheet.md`，**不提交**，Task 16 删除。
- 勘误条目格式：`| 文档位置 | 原文陈述 | 代码事实 | 证据文件路径 | 动作(改/删/补) |`
- 无法从本地代码确认的陈述 → 动作列写 `待人工确认`，正文加 `（待核实）` 标注，不猜测。
- 命令在 PowerShell 中执行；git 命令跨平台一致。
- 每个 Task 结束提交一次；提交只 add 本 Task 涉及的文件，禁止 `git add .`（工作区可能有他人改动）。
- 不执行安装包打包（`electron:build` 不跑），终检只跑 `lint` + `build`。

---

## 阶段① 逐模块通读核对（产出勘误表）

### Task 1: 建立勘误表模板

**Files:**
- Create: `docs/.errata-worksheet.md`

- [ ] **Step 1: 写入模板**

```markdown
# 文档-代码核对勘误表（临时工作文件，完工后删除）
基准：2026-10-11 工作区代码

## 模块：（模块名）
| 文档位置 | 原文陈述 | 代码事实 | 证据文件路径 | 动作 |
|---|---|---|---|---|
```

- [ ] **Step 2: 确认文件未被 git 跟踪**

Run: `git status --short docs/.errata-worksheet.md`
Expected: `?? docs/.errata-worksheet.md`（未跟踪即可，不提交）

### Task 2: 前端核心通读（App/context/hooks/pages/components/services）

**Files:**
- Modify: `docs/.errata-worksheet.md`（追加"前端核心"节）
- Read: `src/App.tsx`、`src/context/AppContext.tsx`、`src/hooks/*.ts`（7 个）、`src/pages/*.tsx`（5 个）、`src/components/app/`、`src/components/`（13 文件+4 目录）、`src/services/api.ts`、`src/types.ts`

- [ ] **Step 1: 通读并核对以下陈述点**
  - 路由清单：`App.tsx` 中 React Router routes 是否为 `/`、`/exam`、`/result`、`/formal-exam`、`/exams/manage` 五条（对照 CLAUDE.md §Frontend structure、开发文档）
  - AppProvider 组合的 hook 数量与名称（CLAUDE.md 说 5 个：useAuth/useToast/useUIState/useQuestionBank/useExam，读 `AppContext.tsx` 验证；`src/hooks/` 有 7 个文件，确认哪些不属于 AppProvider）
  - `services/api.ts` 导出的 API 对象清单（CLAUDE.md 说 6 个具名导出，验证是否含 examsApi 等新增）
  - 组件目录结构与文档描述是否一致（WelcomeScreen/ExamScreen/ResultScreen/AppHeader 等）
  - 三视图状态机描述是否仍成立（welcome→exam→result 与正式考试视图并存关系）
- [ ] **Step 2: 每条差异写入勘误表**（含 K7 的 ImportModal 拆分后实际文件清单，需在本 Task 读 `src/components/` 时确认）
- [ ] **Step 3: 不提交**（勘误表不入库）

### Task 3: 评分引擎通读（单一可信源）

**Files:**
- Modify: `docs/.errata-worksheet.md`
- Read: `src/shared/scoring/index.ts`、`src/shared/scoring/__tests__/*.ts`、`src/utils/examScoring.ts`（若存在）、`scripts/build-scoring.mjs`、`server/src/` 内是否有对应评分实现（grep `isAnswerCorrect`）

- [ ] **Step 1: 核对 K3**：确认评分函数签名、三种题型（single/multiple/programming）判定规则与文档描述（选项字母/文本匹配、排序比较、空白与引号归一化）是否一致；确认前后端是否共用同一评分源（读 `build-scoring.mjs` 的同步目标路径）
- [ ] **Step 2: 勘误表记录**评分章节需要重写的准确表述（含官方同步命令 `npm run sync:scoring`、prebuild 钩子）
- [ ] **Step 3: 运行评分测试留证**

Run: `npx vitest run src/shared/scoring`
Expected: 全部 PASS（失败不阻塞文档任务，但须记入勘误表标注）

### Task 4: 后端路由/中间件通读

**Files:**
- Modify: `docs/.errata-worksheet.md`
- Read: `server/src/index.js`、`server/src/db.js`、`server/src/middleware/auth.js`、`server/src/routes/` 全部 10 个文件

- [ ] **Step 1: 核对 K2**：逐路由列出实际挂载路径与职责（ai.js、invite-codes.js 是文档缺失项，读码各写 1~2 句职责描述进勘误表，动作=补）
- [ ] **Step 2: 核对** CORS 白名单、静态托管、百度 OCR 代理等 `index.js` 陈述；`middleware/auth.js` 的 adminMiddleware 是否真的是"admin + teacher"
- [ ] **Step 3: 核对** exams.js 的端点清单与开发文档/exam-module 设计文档一致性（试卷 CRUD、开始/提交、历史与成绩分析）
- [ ] **Step 4: 勘误表记录**

### Task 5: 数据库迁移与表结构核对

**Files:**
- Modify: `docs/.errata-worksheet.md`
- Read: `server/migrations/001~010 全部 .sql`、`server/src/migrate.js`（确认 runner 行为描述）

- [ ] **Step 1: 核对 K1**：读 `010_exams.sql`，列出新增表（预期含 exams / exam_papers / exam_attempts 类表，以实际为准）及关键列
- [ ] **Step 2: 复核文档表格中 10 张初始表的列描述**是否仍与 001~009 一致（重点：users.role 枚举是否新增取值、subjects.share_scope 三值、mistake_records.consecutive_correct=3 规则）
- [ ] **Step 3: 勘误表记录**（数据表数量、新表条目、CLAUDE.md "001~009" 字样全部改 "001~010"）

### Task 6: 导入链路核对（Excel/PDF/Word/OCR/CSV）

**Files:**
- Modify: `docs/.errata-worksheet.md`
- Read: `src/components/` 中 Import 相关文件（K7 拆分结果）、grep `xlsx` 的解析入口、`public/sample_questions.csv`、OCR 相关（`setup:tesseract`、45s 超时常量）

- [ ] **Step 1: 核对 K4/K6/K8**：支持的文件类型清单（csv/xlsx/docx/pdf/图片）、Excel 导入的模板列、公式渲染（KaTeX）在题目中的启用状态（读 remark-math/rehype-katex 挂载点）、OCR 超时与本地资源逻辑
- [ ] **Step 2: 勘误表记录**（开发文档导入章节 + 使用说明的导入操作步骤都要补 Excel 与公式说明）

### Task 7: 多端封装核对

**Files:**
- Modify: `docs/.errata-worksheet.md`
- Read: `electron/main.cjs`、`chrome-extension/manifest.json`、`chrome-extension/README.md`、`capacitor.config.json`、`android/app/src/main/AndroidManifest.xml`（若存在，或 `android/app/src/` 结构）

- [ ] **Step 1: 核对** README §平台覆盖与 CLAUDE.md §Other targets：Electron 安全设置（nodeIntegration disabled / contextIsolation on）是否仍属实；chrome-extension 是否仍"加载即用"（有无 scoring.js 变化，注意 `scripts/build-scoring.mjs` 可能同步评分到扩展目录，须确认）；Capacitor 应用 id/名
- [ ] **Step 2: 勘误表记录**

### Task 8: 部署运维与配置文档核对

**Files:**
- Modify: `docs/.errata-worksheet.md`
- Read: `ecosystem.config.cjs`、`.github/workflows/deploy.yml`、`nginx-study-test.conf`、`scripts/setup/install.sh`（或 install.sh 实际位置）、`CONFIGURATION.md`、`INSTALL.md`、`.env.example`、`server/.env.example`、`vite.config.ts`（AI key define 注入）

- [ ] **Step 1: 核对 K5**：双-app PM2 配置（两个 app 名称、端口、职责），更新 INSTALL/开发文档部署章节的表述；deploy.yml 流程（npm ci → build → rsync → migrate → pm2 restart）是否仍属实
- [ ] **Step 2: 核对 CONFIGURATION.md 环境变量表**与 `.env.example`、代码中 `process.env` 实际读取项逐一对照（多退少补）；AI key 编译期注入与生产剥离的描述是否仍与 `vite.config.ts` 一致
- [ ] **Step 3: 核对 README 安装命令**：README 引用的 `curl … /install.sh` 路径在 GitHub 上是否有效以仓库文件为准（找不到 install.sh 则动作=改，指向 `scripts/setup/` 实际脚本名；无法远程验证则标 待人工确认）
- [ ] **Step 4: 勘误表记录**

---

## 阶段② 归档搬迁

### Task 9: 创建归档目录并 git mv 搬迁

**Files:**
- Create: `docs/archive/`、`docs/sop/`
- Move: 见下表（全部用 `git mv`）

- [ ] **Step 1: 搬迁一次性历史文档 → docs/archive/**

```powershell
mkdir docs/archive -Force
git mv docs/architecture-audit.md docs/archive/
git mv docs/module-consistency-audit.md docs/archive/
git mv docs/module-consistency-remediation-risk.md docs/archive/
git mv docs/second-batch-plan.md docs/archive/
git mv "docs/软件Bug测试报告.html" docs/archive/
git mv docs/bug-feedback-form.html docs/archive/
git mv "docs/Bug反馈表-实习生版.xlsx" docs/archive/
git mv 项目分析报告.md docs/archive/
git mv CODE_AUDIT_REPORT.md docs/archive/
git mv PLAN-formula-support.md docs/archive/
```
（K8 已确认公式功能上线，`PLAN-formula-support.md` 归档）

- [ ] **Step 2: 搬迁 SOP → docs/sop/**

```powershell
mkdir docs/sop -Force
git mv docs/agent-dispatch-fallback-sop.md docs/sop/
git mv docs/git-write-protection-sop.md docs/sop/
git mv docs/npm-install-sandbox-sop.md docs/sop/
```

- [ ] **Step 3: 每份归档文档头部追加一行归档说明**（archive 内的 10 份；sop 3 份不加）。`docs/archive/` 下 `.md` 在 H1 标题后插入：

```markdown
> 【已归档 2026-10-11】本文是一次性历史产物，内容可能过时。现行文档见 [docs/README.md](../README.md)。
```

`.html`/`.xlsx` 不插（html 可在 `<body>` 后加一条注释横幅，xlsx 跳过不改内容）。

- [ ] **Step 4: 提交**

```powershell
git add docs/archive docs/sop
git commit -m "docs: 归档一次性历史文档，SOP 移入 docs/sop"
```

### Task 10: 新建文档索引页

**Files:**
- Create: `docs/README.md`

- [ ] **Step 1: 写入索引页**，内容骨架（基准日期、一句话说明从各文档头部提取）：

```markdown
# 文档索引

> 更新：2026-10-11　状态标注：【现行】与代码同步维护 /【SOP】持续有效规范 /【归档】历史产物不再更新

## 现行文档
| 文档 | 受众 | 说明 | 基准 |
|---|---|---|---|
| [../README.md](../README.md) | 所有人 | 项目全景与快速上手 | 2026-10-11 |
| [../CLAUDE.md](../CLAUDE.md) | AI/开发者 | 架构约定与命令 | 2026-10-11 |
| [../CONFIGURATION.md](../CONFIGURATION.md) | 部署者 | 环境变量与 API Key | 2026-10-11 |
| [../INSTALL.md](../INSTALL.md) | 运维 | 部署流程 | 2026-10-11 |
| [开发文档.md](开发文档.md) | 开发/运维 | 架构、模块、数据模型详解 | 2026-10-11 |
| [用户使用说明.md](用户使用说明.md) | 用户/师生 | 功能操作说明 | 2026-10-11 |
| [exam-module/](exam-module/) | 开发 | 正式考试模块设计 | 设计期文档 |

## SOP
（agent-dispatch / git-write-protection / npm-install-sandbox 三行链接）

## 归档
（docs/archive/ 清单 + 归档时间）

## 阅读路径
- 新成员：README → CLAUDE.md → 开发文档
- 开发者日常：CLAUDE.md + 开发文档对应模块
- 运维部署：INSTALL → CONFIGURATION → 开发文档部署章节
- 用户/师生：用户使用说明
```

- [ ] **Step 2: 提交**

```powershell
git add docs/README.md
git commit -m "docs: 新增文档索引页 docs/README.md"
```

---

## 阶段③ 按勘误表修订 6 份主文档

### Task 11: 修订 docs/开发文档.md

**Files:**
- Modify: `docs/开发文档.md`（依据勘误表全部条目）

- [ ] **Step 1: 更新头部**：代码基准日期 → `核对于 2026-10-11`；配套文档行中归档文件的路径改为 `docs/archive/…`
- [ ] **Step 2: 按勘误表逐节修订**，至少覆盖 K1~K8：架构图补评分单一可信源；数据表章节补 010_exams 新表；导入章节补 Excel；OCR 补本地化+45s 超时；部署章节改双-app；新增/改写"正式考试与组卷管理"小节（引用 exam-module 设计文档并核对一致性）；公式渲染（KaTeX）从"计划"改为"已上线"
- [ ] **Step 3: 全文自查**：文档内出现的每个文件路径用 `Test-Path` 抽验存在；grep 确认无 `PLAN-formula-support`、`项目分析报告`（根目录旧路径）残留
- [ ] **Step 4: 提交** `git add docs/开发文档.md && git commit -m "docs: 开发文档对齐 2026-10 代码现状"`

### Task 12: 修订 docs/用户使用说明.md

**Files:**
- Modify: `docs/用户使用说明.md`

- [ ] **Step 1: 更新基准日期**；导入功能操作步骤补 Excel（支持格式、模板列、入口）；公式题目显示效果说明；正式考试/组卷管理如未覆盖则补操作章节（以 `ExamManagePage.tsx`、`FormalExamPage.tsx` 实际 UI 文案为准）
- [ ] **Step 2: 提交** `git commit -m "docs: 用户使用说明补 Excel 导入与正式考试操作"`

### Task 13: 修订 README.md / CLAUDE.md / CONFIGURATION.md / INSTALL.md

**Files:**
- Modify: `README.md`、`CLAUDE.md`、`CONFIGURATION.md`、`INSTALL.md`

- [ ] **Step 1: README**：功能列表补"Excel 导入、正式考试与组卷管理"；命令块与 `package.json` scripts 逐条对照（`npm test`、`npm run sync:scoring` 等如缺失则补）；目录结构块补 `docs/`、`src/shared/scoring`；本地开发步骤中迁移脚本编号 009→010
- [ ] **Step 2: CLAUDE.md**：K1（migrations 001~010 + 新表进表格）、K2（路由清单补 ai.js、invite-codes.js）、K3（评分单一可信源 + prebuild 同步约定：改评分必须改 `src/shared/scoring/index.ts` 并跑 `npm run sync:scoring` + 测试）、K5（ecosystem 双-app）；Other targets 中归档后路径
- [ ] **Step 3: CONFIGURATION.md / INSTALL.md**：按 Task 8 勘误条目修订（重点：双-app PM2、install.sh 路径、env 变量表增删）
- [ ] **Step 4: 提交** `git add README.md CLAUDE.md CONFIGURATION.md INSTALL.md && git commit -m "docs: 根目录主文档对齐代码现状"`

### Task 14: 核对 docs/exam-module/ 一致性

**Files:**
- Modify: `docs/exam-module/`（仅当发现不一致时小修）

- [ ] **Step 1: 对照** `docs/exam-module/system_design.md`、类图/时序图与 `server/src/routes/exams.js`、`src/pages/FormalExamPage.tsx` 实现：表名、端点、状态流转有差异的条目修订（在文档头部加"实现校准 2026-10-11"小节，设计原文保留）
- [ ] **Step 2: 如全部一致则跳过修改**；有修改则提交 `git commit -m "docs: exam-module 设计文档实现校准"`

---

## 阶段④ 终检与收尾

### Task 15: 全局残留检查与构建验证

- [ ] **Step 1: 过时引用 grep**

```powershell
rg -n "architecture-audit|module-consistency|second-batch-plan|009_add_help_read 之后无|examScoring.ts \(纯函数" README.md CLAUDE.md CONFIGURATION.md INSTALL.md docs/开发文档.md docs/用户使用说明.md docs/README.md
```
Expected: 无输出（有输出则回到对应 Task 修复后重跑）

- [ ] **Step 2: 移动路径引用检查**：对 6 份主文档 grep `docs/archive/`、`docs/sop/` 引用是否指向真实文件（`Test-Path` 逐一验证新增链接）
- [ ] **Step 3: 命令真实性检查**：文档中出现的每条 npm script 名与 `package.json` 对照（dev/build/preview/lint/test/electron:dev/electron:build/sync:scoring/setup:tesseract）；`cd server && npm run migrate` 与 `server/package.json` 对照
- [ ] **Step 4: 工程验证**

Run: `npm run lint` → Expected: 0 errors
Run: `npm run build` → Expected: vite build 成功
Run: `npx vitest run` → Expected: 全绿（既有测试不因文档任务被破坏）
（不执行 electron:build 打包）

- [ ] **Step 5: 验收标准逐条勾验**（设计文档 §6 五条），未完成项回补

### Task 16: 清理勘误表并收尾提交

- [ ] **Step 1: 删除临时文件** `Remove-Item docs/.errata-worksheet.md`（确认无 git 引用它：`git log --all -- docs/.errata-worksheet.md` 应为空）
- [ ] **Step 2: 若终检有修复产物，提交** `git add <修复文件> && git commit -m "docs: 终检修复"`；无则不提交
- [ ] **Step 3: 输出总结**：6 份文档基准日期、归档清单、索引页路径、勘误表处理统计（改 N / 删 M / 补 K / 待人工确认 X）

---

## 验收对照（设计文档 §6）

1. 基准日期统一更新 + 每处修改有勘误表证据 → Task 11~13
2. docs/README.md 三类状态 → Task 10
3. 无残留过时引用 → Task 15 Step 1~2
4. 归档正文不改动仅加头部说明 → Task 9 Step 3
5. 命令与实际一致 → Task 15 Step 3~4
