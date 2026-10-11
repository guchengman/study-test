# Study-test 架构与可维护性代码审核报告
> 【已归档 2026-10-11】本文是一次性历史产物，内容可能过时。现行文档见 [docs/README.md](../README.md) 索引。

> 审核维度：架构与可维护性（Architecture & Maintainability）
> 审查对象：`D:/github/Study-test`（截至 2025-07-26 工作区）
> 审查人：架构师（software-architect）

---

## 1. 整体架构评估

**一句话结论：模块边界与前后端职责划分清晰、API 客户端设计规范、多端复用同一 Web 构建产物（dist）的思路正确；但巨型文件（上帝文件）泛滥、判分逻辑在多端/多层被重复实现（含一份脱离版本控制的 Chrome 扩展 fork）、文档与代码严重背离、且几乎零自动化测试——整体“能跑但不健康”，可维护性随功能增长将持续恶化。**

### 架构关系图（各工程 / 多端）

```mermaid
flowchart TB
    subgraph Monorepo[Study-test 仓库（根 package.json 管理 Web 构建）]
        direction TB
        Web[Web SPA<br/>React19+TS+Vite+Tailwind<br/>src/ 50 文件 / 15341 行]
        Web -->|vite build| DIST[(dist/ 单一构建产物)]

        DIST --> Electron[Electron 桌面端<br/>electron/main.cjs<br/>loadFile dist/index.html]
        DIST --> Android[Android 端<br/>Capacitor (webDir=dist)<br/>同步进 android assets]
        DIST --> Nginx[生产部署<br/>Nginx + Express 托管静态<br/>server/src/index.js SPA 兜底]

        Server[后端服务<br/>Express + MySQL<br/>server/src 69 文件 / 4249 行<br/>独立 package.json]
        Web -->|/api 代理 :3100| Server
        Electron -.->|/api 相对路径(联调受限)| Server
        Android -->|/api 指向已部署服务| Server
        ChromeExt[Chrome 扩展<br/>chrome-extension/ 5 文件<br/>vanilla JS 独立实现]

        ChromeExt -->|直接 fetch API| Server
    end

    style ChromeExt stroke:#e74c3c,color:#e74c3c
    style DIST stroke:#27ae60,color:#27ae60
```

**关键解读（与任务书假设的修正）：**
- 任务书称 server/ “疑似 NestJS 类框架、约 2763 个文件”。实测：**server/ 实际是标准 Express 应用**，源码仅 **69 个文件 / 4249 行**；“2763/2962” 的体量几乎全部来自 `server/node_modules`（43M）。请勿以 NestJS 视角评估，它是纯函数式 Express + mysql2 连接池。
- **多端代码共享的真实状况**：Web / Electron / Android 三者共享**同一个 Vite `dist` 构建产物**（Capacitor `webDir:"dist"`、Electron `loadFile dist/index.html`），因此这三者是 100% 代码复用的，架构合理。
- **唯一的例外是 Chrome 扩展**：它是**完全独立的 vanilla-JS 实现**，不引用 `src/` 任何代码，自行 `fetch` 调用 API 并重新实现了登录/练习/判分逻辑——这是跨端一致性的最大隐患（详见 P0-2）。

---

## 2. 问题清单（按严重程度）

### P0 — 严重（影响可维护性根基 / 有用户侧正确性风险）

#### P0-1 巨型文件 / 组件（上帝文件）泛滥
| 文件 | 行数 | 问题 |
|---|---|---|
| `src/components/ImportModal.tsx` | **1710** | 单一弹窗承载文件选择/DOCX/PDF/MD/CSV/JSON/TXT 全部导入分支 + 公式进度 + 预览 |
| `src/components/LoginModal.tsx` | **1205** | 登录/注册/角色切换/绑定教师/找回密码全部塞进一个 Modal |
| `src/services/fileService.ts` | **1189** | 文件提取/解析/OCR 聚合，PLAN-formula-support.md 已明确要求拆分却基本未落地 |
| `src/components/app/AppLayout.tsx` | **1046** | 主布局 + 所有 Modal 挂载 + 页头/页脚编排 |
| `src/services/geminiService.ts` | **1042** | AI 题目解析 prompt + 多模型回退 + 解析器全在一起 |

- **影响范围**：单文件改动风险极高、易引发合并冲突、无法单元化测试、新人上手成本极大；任一需求变更都需在千行文件内“走钢丝”。
- **改进建议**：
  - `ImportModal.tsx` → 拆为 `ImportModal`(编排) + `DocxImportStep`/`PdfImportStep`/`MdImportStep` + `ImportPreview`(卡片式预览，PLAN 已规划)。
  - `LoginModal.tsx` → 拆为 `AuthModal` + `LoginForm`/`RegisterForm`/`ResetPasswordForm` 子组件。
  - `fileService.ts` → 按 PLAN 已抽出的 `formulaService.ts`/`mdParserService.ts` 继续下沉：`docxExtract.ts`/`pdfExtract.ts`/`ocr.ts`。
  - `AppLayout.tsx` → 仅保留布局与 `<Outlet/>`，各 Modal 用懒加载/独立挂载。
  - `geminiService.ts` → 分离 `prompts.ts`(SYSTEM/视觉 prompt) 与 `parser.ts`(文本→题目)。

#### P0-2 判分 / 答题正确性逻辑在 4 处重复，且 Chrome 扩展为脱离版本控制的 fork
判分逻辑目前至少有 **4 份实现**，口径极易漂移：
1. `src/utils/examScoring.ts` — 前端权威纯函数 `isAnswerCorrect`（正确范本）。
2. `src/hooks/useExam.ts` **内部又内联重复**：`checkProgrammingAnswer`(147-154 行) 与 `handleAnswerChange` 单选分支(131-132 行) 重新实现 normalize/比较，未调用 `isAnswerCorrect`。
3. `server/src/utils/examScoring.js` — 服务端权威判分（独立副本，预期存在但需与主应用同步）。
4. `chrome-extension/popup.js`(359-401 行) — **完全独立的 vanilla-JS 实现**，用 `keys=['A'..'F']` 映射重算正确选项。

- **影响范围**：Chrome 扩展是已发布的客户端，其判分逻辑与主应用无共享、无测试、无同步机制。一旦主应用/后端调整题型或判分口径（如编程题归一化规则），扩展端会**静默地给用户展示错误的对错判定**，属于用户侧正确性风险。
- **改进建议**：抽出一个与框架无关的 `scoring` 纯函数包（或复用 `examScoring.ts` 的编译产物），前端与扩展统一引用；扩展端建议改为直接加载主应用 Web（同 Electron/Capacitor 思路），彻底消除 fork。

---

### P1 — 重要（应优先治理）

#### P1-1 文档与代码严重背离（误导维护者）
- `CONFIGURATION.md` 通篇描述 **“Python Test application”**，指导使用 `.env.local` + **localStorage** 存密钥（第 3、11、15、22、73 行）；但实际项目是 React/Node，**密钥走 `server/.env`（运行时）或 `sessionStorage`（前端，见 `src/config/apiConfig.ts:42`）**。该文档明显是模板/AI 生成残留，**完全不适用于本项目**。
- `CLAUDE.md` 描述的路由清单（67-81 行）**缺失 `/api/exams`**，且未提及“正式考试/组卷”功能；`src/App.tsx` 已扩展为 5 条路由（含 `formal-exam`、`exams/manage`，20-24 行）。文档滞后于代码。
- **影响**：新接手者按文档操作会直接走偏（如去配 `.env.local`、找不存在的 Python 配置）。
- **建议**：删除/重写 `CONFIGURATION.md`；在 `CLAUDE.md` 补充 `exams` 路由与正式考试模块说明。

#### P1-2 AppContext 单例巨型 Context + useExam 过度耦合
- `src/context/AppContext.tsx` 将 5 个 hook（auth/toast/ui/questionBank/exam）的返回值**合并进一个 Context**（第 37 行 `{...auth, ...toast, ...ui, ...qb, ...exam}`）。任意子状态变化（如一次 toast 开关）都会触发所有消费组件重渲染。
- `useExam` 接收 **12 个参数**（`src/hooks/useExam.ts:6-19`），其中 `setConfirmingDeduplicate`/`setSearchQuery`/`setIsSearchOpen`/`setIsImportModalOpen` 等是**兄弟 hook（useUIState）的 setter**，通过 AppContext 层层下钻传入——典型紧耦合。
- **影响**：性能隐患 + 改一处牵连全局；难以单独测试 useExam。
- **建议**：Context 按域拆分（AuthContext / UIContext / ExamContext），或引入轻量状态库；useExam 不再接收 UI setter，改为直接消费 useUIState 或事件总线。

#### P1-3 前端根 package.json 依赖污染 / 版本不一致
- 根 `package.json` 的 `dependencies` 包含 **`express`(^4.21.2)** 与 **`multer`(^2.1.1)**——前端运行时并不需要 Express/服务器级上传中间件（疑似 Electron/历史遗留）。
- **前后端重复声明且版本错配**：`@google/genai` 在根与 server 各声明一份（均为 ^1.29.0 尚一致）；但 `uuid` 前端 `^14.0.0` vs 服务端 `^10.0.0`，语义版本差异大，存在行为漂移风险。
- **建议**：前端移除 `express`/`multer`；将 `@google/genai`/`uuid` 等共享依赖在两端对齐到同一版本，或以 workspace 管理。

#### P1-4 scripts/ 试错式脚本蔓延，绕开迁移系统直接动生产库
- `scripts/` 共 109 文件，其中 `scripts/db/fix/` 存在大量**近义重复/试错脚本**：`fix-questionbank.cjs`、`fix-questionbank2.cjs`、`replace-questionbank.cjs`、`final-replace.cjs`、`final-replace2.cjs`、`fix-duplicates.cjs`、`fix3.ps1`、`check_db.ps1/2/3.ps1`、`run_check.ps1/2.ps1`、`run_fix.ps1/2.ps1` 等。
- **影响**：这些脚本直接对生产 MySQL 做“手术”，说明历史上多次靠手工脚本修数据，**绕开了 `server/migrations/` 的受控迁移**，对数据完整性构成持续威胁，也极难审计“数据库当前到底处于哪个状态”。
- **建议**：清理 `scripts/db/fix/*` 历史试错脚本（归档到 `archive/` 并移出版本控制或明确标注只读）；所有结构/数据变更一律走迁移；保留的运维脚本需有owner与说明。

#### P1-5 API 层与领域层“双轨类型”，缺少显式映射层
- `src/services/api.ts` 定义了一套 **API DTO 类型**：`AuthUser`、`SubjectItem`、`QuestionItem`、`MistakeItem`、`FavoriteItem`、`StatsItem`（100-193 行），字段命名沿用后端 snake_case（如 `subject_id`、`createdAt` 混用、`points`）。
- `src/types.ts` 定义的是**领域模型**：`Subject`(14)、`Question`(141)、`MistakeRecord`(162) 等，camelCase。
- 两份类型**并行存在且字段口径不一致**（如 `QuestionItem.subject_id` vs 领域 `Question.subjectId`；`QuestionItem.points` 在领域 `Question` 中无对应），组件/ hook 消费时（如 `useExam` 用 `Question`、`questionApi` 返回 `QuestionItem`）隐含转换，易出错且无单一事实来源。
- **建议**：确立 `types.ts` 为领域单一事实来源；`api.ts` 仅做“网络形态”类型，并在 API 层统一提供 `toDomain()` 映射函数，消除隐式假设。

---

### P2 — 建议（可维护性优化）

#### P2-1 后端 index.js 职责过重 + 硬编码配置
- `server/src/index.js`：OCR 百度接口**内联实现**（113-132 行），应下沉为 `routes/ocr.js`；CORS 白名单（84-92 行）硬编码 `xiaoyue.shop`/`localhost` 域名，建议改由环境变量驱动；`dist` 路径用 `path.join(__dirname,'../../dist')`（135 行）相对推断较脆弱。
- `app.get('*', ...)`（159 行）在 **Express 4** 下可用，但若未来升级 Express 5，`*` 通配符语法将失效（需 `/*splat`）——是潜在升级地雷。

#### P2-2 useExam 内联重复 isAnswerCorrect
- `src/hooks/useExam.ts` 的 `checkProgrammingAnswer`(147-154) 与 `handleAnswerChange` 单选分支(131-132) 重新实现 normalize/比较，应统一调用 `isAnswerCorrect`（其 `checkMultipleAnswer` 已正确复用，见 156-162 行）。

#### P2-3 散落的 console.* 调试日志
- 前端 `console.*` 分布：`fileService.ts` 45 处、`geminiService.ts` 25 处、`ImportModal.tsx` 15 处、`useQuestionBank.ts` 4 处、`formulaService.ts` 2 处、`LoginModal.tsx` 2 处、`config/apiConfig.ts` 3 处（try/catch 内）。生产构建应统一收敛（如封装 `logger` 或在 build 中剔除）。

#### P2-4 计时器逻辑各自实现
- `useExam.ts`(47-52) 与 `useFormalExam.ts`(72-92) 各自实现 `setInterval` 计时（前者计 elapsed、后者计 countdown-to-deadline），可抽取共享 `useTimer`/`useCountdown` hook。

#### P2-5 仓库杂物与过期构建产物
- 根目录 `start-app - 副本.bat` 为 `start-app.bat` 的副本文件，应删除。
- `archive/` 目录提交了大量 `.bak` 备份文件：`App.tsx.bak`、`geminiService.ts.bak`、`HelpModal.tsx.bak`、`ImportModal.tsx.bak`、`questionBank.ts.backup` 及 `ImportModal-fix.md`——源码备份不应纳入版本控制（应加入 `.gitignore`）。
- `android/app/src/main/assets/public/assets/index-BSgo_ycT.js` 是一份**已提交到仓库的 stale 构建产物**（Capacitor `sync` 才会刷新），属二进制/构建物误提交。

#### P2-6 遗留/脆弱的工程配置
- `tsconfig.json:4` 启用 `experimentalDecorators: true` 但代码未使用任何装饰器（历史遗留）。
- `vite.config.ts` 的 `fix-html-paths` 插件用正则改写 `/assets/`→`./assets/`（24-25 行）以支持 Electron 相对路径，较脆弱；可改用 `base:'./'` + 构建时注入正确 publicPath 替代。

#### P2-7 Electron 联调体验
- `electron:dev` 脚本为 `electron .`（package.json:13），但 Electron 直接 `loadFile dist/index.html`（main.cjs:41），**需先 `vite build` 产出 dist**，且 dev 模式下 `/api` 走相对路径无法联调后端（3100）。建议在 `electron:dev` 中串联 build 或提供指向已部署服务/本地代理的说明。

---

## 3. 技术债清单（明确列举）

| # | 技术债 | 位置 | 风险 |
|---|---|---|---|
| TD-1 | 上帝文件 5 个（>1000 行） | ImportModal/LoginModal/fileService/AppLayout/geminiService | 维护/回归成本极高 |
| TD-2 | 判分逻辑 4 份实现，扩展端为独立 fork | examScoring.ts / useExam.ts / server examScoring.js / chrome-extension popup.js | 跨端正确性漂移 |
| TD-3 | 几乎零自动化测试；仅 1 个 server 单测，前端 0 测试，无 test runner | server/tests/examScoring.test.mjs；package.json 无 vitest/jest | 回归无防护网 |
| TD-4 | 试错式 DB 修复脚本库（约 30 个 .ps1/.cjs）绕开迁移 | scripts/db/fix/* | 数据完整性威胁 |
| TD-5 | API DTO 与领域模型双轨类型，无映射层 | api.ts vs types.ts | 隐式转换出错 |
| TD-6 | 文档背离：CONFIGURATION.md 描述 Python 项目；CLAUDE.md 缺 exams/正式考试 | CONFIGURATION.md / CLAUDE.md | 误导维护者 |
| TD-7 | PLAN-formula-support 的 fileService 拆分未真正落地（1185→1189 行） | fileService.ts | 计划执行打折 |
| TD-8 | 仓库杂物：`.bak` 备份、`副本.bat`、stale 构建产物 | archive/*、start-app - 副本.bat、android assets/index-*.js | 仓库噪音/误提交 |
| TD-9 | 前端依赖污染（express/multer）+ 共享依赖版本错配（uuid 14 vs 10） | 根 package.json | 体积/行为漂移 |
| TD-10 | 调试日志散落（fileService 45 处等） | 多处 | 生产环境噪音/信息泄露风险 |

---

## 4. 改进路线建议

### 短期（1–2 周，可落地动作）
1. **拆分上帝文件（按职责）**：优先 `ImportModal`→子步骤组件、`fileService`→`docx/pdf/ocr` 提取模块（落实 PLAN 计划）、`LoginModal`→表单子组件。每拆一个补一个单测。
2. **收敛判分逻辑**：前端统一调用 `examScoring.ts` 的 `isAnswerCorrect`（修 P2-2）；评估将 Chrome 扩展改为“加载主应用 Web”的可行性，至少把 `scoring` 抽成共享纯函数并复制到扩展侧并加注释同步点。
3. **修文档**：删除/重写 `CONFIGURATION.md`；`CLAUDE.md` 补 `exams` 路由与正式考试模块；把 `archive/*.bak`、`start-app - 副本.bat` 清理并加入 `.gitignore`。
4. **清理 scripts/db/fix 试错脚本**：移入 `archive/` 并标注“只读历史”，后续变更一律走迁移。

### 中期（1–3 月）
5. **补测试安全网**：前端引入 Vitest + Testing Library，覆盖 `examScoring`、`ImportModal` 解析分支、`useExam` 流程；后端引入 supertest 覆盖鉴权/权限/`exams` 评分。把现有 `server/tests/*.mjs` 验证脚本收敛为可重复测试套件。
6. **解耦 AppContext**：按域拆分 Context 或引入轻量状态库；`useExam` 不再接收兄弟 hook 的 setter。
7. **统一类型**：`types.ts` 为单一事实来源，API 层提供显式 `toDomain()` 映射，消除双轨类型。
8. **前端依赖瘦身与对齐**：移除 `express`/`multer`；对齐 `@google/genai`/`uuid` 前后端版本（建议用 workspace/pnpm）。
9. **后端配置外置**：CORS origins、OCR 路由（`routes/ocr.js`）由环境变量/独立路由管理；为 Express 5 升级预留（`app.get('*')` → `/*splat`）。

---

## 5. IS_PASS 风格总结

- **架构整体健康度**：⚠️ **中等偏下（不可持续健康）**。模块边界、API 客户端（`src/services/api.ts` 的 `ApiClient` + 按域 API 对象设计规范）、前后端职责划分均属良好；Web/Electron/Android 复用同一 dist 的多端策略正确。
- **是否 IS_PASS（可维护性维度）**：**IS_PASS = false**。项目当前可运行，但存在两个会随规模放大的“结构性债务”：(a) 上帝文件使单次改动风险与成本居高不下；(b) 判分逻辑多端/多份重复（尤其 Chrome 扩展 fork）带来静默正确性风险。叠加**几乎零自动化测试**，任何重构都缺乏安全网。
- **最大风险点（Top 3）**：
  1. **上帝文件**（ImportModal 1710 / LoginModal 1205 / fileService 1189 / AppLayout 1046 / geminiService 1042）——维护成本与回归风险的根因。
  2. **跨端判分逻辑重复 + Chrome 扩展独立 fork**——用户侧正确性漂移的隐患。
  3. **零测试 + 试错式 DB 脚本**——数据完整性与回归防护的双重缺口。
- **优先治理顺序**：先拆上帝文件 + 统一判分逻辑（消解正确性风险），再补测试安全网，最后做类型/依赖/配置收敛。
