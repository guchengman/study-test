# 第二批大型重构实施规划（架构师分解）
> 【已归档 2026-10-11】本文是一次性历史产物，内容可能过时。现行文档见 [docs/README.md](../README.md) 索引。

> 规划人：架构师 高见远（software-architect）
> 输入：全仓库代码审核（`CODE_AUDIT_REPORT.md`、`docs/architecture-audit.md`）+ 第一批已落地整改
> 范围：消除结构性技术债（5 上帝文件拆分、strict、路由分割、判分统一、AppContext 解耦、双轨类型映射）
> 读者：工程师 寇豆码（实施）、QA 严过关（回归）
> 本规划**只做分解与决策，不改任何代码**。

---

## 0. 现状基线：第一批已落地 vs 第二批待做

### 0.1 第一批（已落地，本批必须兼容，禁止回退）

| 审核项 | 状态 | 当前证据 |
|---|---|---|
| **A1** 硬编码 PaddleOCR 密钥 | ✅ 已修 | `ImportModal.tsx:124` 现为 `localStorage.getItem('paddle_ocr_api_key') \|\| import.meta.env.VITE_PADDLEOCR_API_KEY \|\| ''`，硬编码 `'97f310b23...'` 默认值已删除 |
| **B2** mammoth/pdfjs 静态引入 | ✅ 已修 | `fileService.ts:10 loadPdfjs()`、`fileService.ts:19 loadMammoth()` 改为函数内 `await import()`；文件由 1189→**1208 行**（新增 2 个动态加载 helper） |
| **B4** core-js/regenerator 全量 polyfill | ✅ 已修（导入侧） | `src/main.tsx` 已**无** `import 'core-js/stable'` / `import 'regenerator-runtime/runtime'` |
| **B3** chunkSizeWarningLimit 抬高 | ✅ 已修 | `vite.config.ts:76` 现为 `chunkSizeWarningLimit: 500` |
| **P1-3** 前端依赖污染（express/multer） | ✅ 已修 | 根 `package.json` `dependencies` 已无 `express`/`multer` |

### 0.2 第二批待做（6 大项，详见第 2 节）

| 项 | 内容 | 行数证据 |
|---|---|---|
| R1 | 5 个上帝文件拆分（每项先补单测） | ImportModal 1710 / LoginModal 1205 / fileService 1208 / AppLayout 1046 / geminiService 1042 |
| R2 | tsconfig 开 strict，清 ~95 处 `any` | `tsconfig.json` 零 strict；`api.ts:53,78-86` 等多处 `any` |
| R3 | 路由级代码分割（React.lazy + manualChunks） | `src/App.tsx:9-13` 全部静态 import；`vite.config.ts:79-85` manualChunks 仅 vendor 切分 |
| R4 | 判分逻辑统一（含 Chrome 扩展决策） | 4 份实现：examScoring.ts / useExam.ts:131-132,150-151 / server examScoring.js / popup.js:359-401 |
| R5 | AppContext 解耦 + useExam 组合 hook | `AppContext.tsx:8-12` 5 hook 合并；`useExam.ts:6-19` 12 参数 |
| R6 | API/领域双轨类型映射（toDomain 层） | `api.ts:102-193` DTO 与 `types.ts:141` 领域类型字段口径不一致 |

### 0.3 与第一批次的冲突点（重点！实施前必读，详细见第 7 节）

1. **fileService.ts 已被第一批改过**：动态 `loadPdfjs()/loadMammoth()` 必须**保留**，拆分时下沉到 `docxExtract.ts`/`pdfExtract.ts`/`ocr.ts` 内部，严禁恢复 `import mammoth from 'mammoth'` 静态引入。
2. **ImportModal.tsx 密钥已清除**：拆出的 `PaddleOcrSettings` 子组件必须继续读 `import.meta.env.VITE_PADDLEOCR_API_KEY`，**禁止**重新硬编码默认值。
3. **vite.config.ts 已设 500 上限 + vendor 切分**：本批扩展 manualChunks 时不得删除现有 vendor 块、不得把阈值调回 2000。
4. **main.tsx 已去 polyfill**：本批不得重新引入；`core-js`/`regenerator-runtime` 现在是无用依赖，可在收尾清理时从 `package.json` 移除。
5. **package.json 已无 express/multer**：本批新增依赖（vitest、@testing-library/react、zustand 等）不得误加回这两个包，且 `@google/genai` 前后端需对齐版本。

---

## 1. 总体目标与原则

- **安全网优先**：任何上帝文件拆分前，必须先以 Vitest 建立单测（见第 5 节），保证"拆分前后行为不变"。
- **小步可验证**：每个上帝文件 = 先补单测（红）→ 抽纯函数/子组件 → 跑测试（绿）→ 删冗余。
- **类型先行**：开启 strict 后，先修被拆分文件的 `any`，让拆分产生的小文件天然带正确类型。
- **不改外部契约**：后端 `/api/*` 响应结构、Chrome 扩展对后端的调用方式均不动；只统一"判分计算"这一纯函数。
- **禁止回归**：每完成一项，跑 `tsc --noEmit` + `npm run build` + 相关单测 + 手测关键路径。

---

## 2. 六大重构项详述

每个子项含：**目标 / 涉及文件 / 拆分子模块清单（建议文件名 + 行号） / 实施顺序 / 依赖 / 风险点 / 验证方式**。

### R1 — 5 个上帝文件拆分

#### R1-1 `ImportModal.tsx`（1710 行 → 编排 + 子组件）

- **目标**：拆为"编排壳 + 6 个子组件/模块"，每拆一个补一个单测。
- **涉及文件**：`src/components/ImportModal.tsx`（主体）、新建 `src/components/import/` 目录。
- **子模块清单（建议文件名 + 当前行号锚点）**：

| 新建文件 | 职责 | 抽取自当前行号 |
|---|---|---|
| `import/FileDropzone.tsx` | 拖拽/选择文件区 + 格式提示 | `ImportModal.tsx` 主 `return` 内文件输入区（约 850–1015，需工程师按现状校准） |
| `import/ImportTabs.tsx` | "文件导入 / AI 粘贴解析" 双 Tab 切换 | 约 1016–1097（AI 模型选择 + 粘贴框 + "开始 AI 解析"按钮） |
| `import/PreviewList.tsx` | 解析结果卡片预览 + 重新解析/确认导入 | 1097–1246（"解析结果预览(N道题)"、确认导入 1110/1246） |
| `import/SubjectPicker.tsx` | 目标科目选择（受控组件） | 1188–1246（"请选择要导入的目标科目"段） |
| `import/OcrDialog.tsx` | OCR 进度/结果弹窗 | 1430–1604（`{showOcrDialog && (...)}`） |
| `import/PaddleOcrSettings.tsx` | PaddleOCR Key 设置面板 | 1605–1687（`{showPaddleOcrSettings && (...)}`），**保留** `VITE_PADDLEOCR_API_KEY` 读取，禁止硬编码 |
| `import/useImportFlow.ts` | 主流程 hook：handleFile / 各格式分支 / OCR 调度 | 172–533（handleFile + PDF/DOCX/TXT/MD/CSV/JSON 分支 + OCR handlers） |
| `import/subjectName.ts` | `getSubjectDisplayName` / `getSubjectDisplayNameById` 查表合一 | 646–668（消除审计示例 3 的重复） |
| `import/questionConvert.ts` | `ParsedQuestion → Question` 的**单一** `toQuestion()` | 消除审计示例 2 的 3 处重复映射（当前约 310–387 一带，行号随版本漂移，需 grep `toQuestion`/`as any` 定位） |
| `import/useImageOcr.ts` | 图片上传→OCR 的**单一** hook | 消除审计示例 1 的 3 处复制（旧 224–292，需 grep "图片上传"定位） |

- **实施顺序**：`useImportFlow`(纯逻辑) → `subjectName`/`questionConvert`/`useImageOcr`(纯函数) → `FileDropzone`/`ImportTabs`/`PreviewList`/`SubjectPicker`(展示) → `OcrDialog`/`PaddleOcrSettings`(对话框) → `ImportModal` 退化为编排壳（仅持状态 + 组合子组件）。
- **依赖**：R2（该文件 `any` 先清）、安全网单测（第 5 节 T4a）。
- **风险点**：① 状态提升错误导致子组件拿不到最新 `allSubjects`/`currentSubjectId`；② 误把密钥硬编码回 `PaddleOcrSettings`；③ 3 处重复映射合并时漏掉某分支的字段。
- **验证方式**：`ImportModal` 单测覆盖 6 种格式解析 + OCR 分支；`tsc --noEmit` 通过；手测一次完整导入（PDF+OCR、DOCX、CSV、JSON、MD、AI 粘贴）与旧包行为对比（导出题目数一致）。

#### R1-2 `LoginModal.tsx`（1205 行 → AuthModal + 4 表单）

- **目标**：拆登录/注册/找回密码/设置密码 4 个表单子组件，壳负责 modal 外观与键盘陷阱。
- **涉及文件**：`src/components/LoginModal.tsx`（新建 `src/components/auth/`）。
- **子模块清单**：

| 新建文件 | 职责 | 抽取自行号 |
|---|---|---|
| `auth/AuthModal.tsx` | modal 外壳 + 键盘陷阱（`keydown` 监听统一 `AbortController`/`useEffect` 清理，修审计 A10）+ 按 `mode` 分发 | 22–134（状态+开关+监听）、1163–1200（主 return + mode 分发 1197–1200） |
| `auth/LoginForm.tsx` | 登录表单 + `handleLogin` | 300–319、726–861 |
| `auth/RegisterForm.tsx` | 注册表单（含验证码两步 `regStep`）+ `handleSendRegCode`/`handleCompleteReg` | 185–298、400–690 |
| `auth/ForgotPasswordForm.tsx` | 找回密码 + `handleResetPassword` | 361–400、897–~1048 |
| `auth/SetupPasswordForm.tsx` | 设置密码 + `handleSetupPassword` | 326–341、1049–~1162 |
| `auth/useAuthForms.ts`（可选） | 共享表单状态/校验 | 36–72 |

- **实施顺序**：`AuthModal` 壳（含键盘陷阱修复）→ 4 个 `Form` 子组件 → 主 `LoginModal` 变为薄封装或删除（调用方改 `AuthModal`）。
- **依赖**：R2、安全网单测。
- **风险点**：键盘陷阱清理分支不全（审计 A10）；注册两步状态 `regStep` 提升后回退逻辑错位（原 131–134 的恢复逻辑）。
- **验证方式**：单测覆盖 4 个 mode 的提交校验与成功/失败分支；手测"注册→收码→完成""登录失败""找回密码""首次登录设密码"四条链路。

#### R1-3 `fileService.ts`（1208 行 → 提取模块，**保留动态 import**）

- **目标**：按职责下沉为 `docx`/`pdf`/`ocr`/`csv`/`md` 提取模块 + 共享类型。
- **涉及文件**：`src/services/fileService.ts`（新建 `src/services/extract/`）。
- **子模块清单（行号锚点来自当前文件）**：

| 新建文件 | 职责 | 抽取自行号 |
|---|---|---|
| `extract/docxExtract.ts` | `extractTextFromDocx`(246) / `extractHtmlFromDocx`(258) / `extractTextFromDoc`(316) | 246–317 |
| `extract/pdfExtract.ts` | `extractTextFromPDF`(23) / `checkIfPDfIsScanned`(234) / `tryExtractPdfText`(979) / `parsePdfSmartOCR`(1007) | 23–119, 234–245, 979–1038（**保留 `loadPdfjs()` 下沉到此**） |
| `extract/ocr.ts` | `extractTextFromPDFWithOCR`(165) / `extractTextFromPDFWithPaddleOCR`(429) / `onlineOCR`(651) / `baiduOnlineOCR`(627) / `getOcrApiUrl`(619) / tesseract `initTesseract`(120) / `extractPageImage`(148) | 120–233, 419–678 |
| `extract/aiVision.ts` | `AI_VISION_PROMPT`(679) / `callGeminiVision`(701) / `callOpenAIVision`(721) / `callServerGeminiVision`(757) / `getModelVisionConfig`(788) / `isRateLimitError`(809) / `recognizePageWithAI`(815) / `parsePdfWithAIVision`(896) | 679–978 |
| `extract/csvExtract.ts` | `parseCSV`(1039) | 1039–1208 |
| `extract/mdExtract.ts` | `extractTextFromMd`(310) / `extractTextFromTxt`(275) | 275–315 |
| `extract/types.ts` | `ParsedQuestion`(349) / `PaddleOCRResult`(361) / `OCRPrunedResult`(387) + 共享 `loadMammoth()`(19) | 349–418（**`loadMammoth()` 下沉为共享 helper**） |
| `extract/imageUtil.ts` | `canvasToBase64`(367) / `fileToBase64`(372) / `extractTextFromOcrResults`(395) | 367–426 |

- **实施顺序**：`types.ts`(共享类型+`loadMammoth`/`loadPdfjs`) → `docxExtract`/`mdExtract`/`csvExtract`(纯文本，低风险) → `pdfExtract`(动态 pdfjs) → `ocr.ts`(动态 + tesseract) → `aiVision.ts`(最复杂) → `fileService.ts` 退化为 re-export 薄壳（保持现有导出签名不变，避免调用方 `ImportModal` 改动）。
- **依赖**：R2（清 14 处 `any`、45 处 console）、安全网单测（第 5 节 T5a）。**硬依赖第一批的动态 import 已就位**。
- **风险点**：① **最危险——恢复静态 `import mammoth`/`pdfjs`**，会令 B2 回退、主包再次膨胀；② `fileService.ts` 导出签名变化导致 `ImportModal.tsx:5` 与 `geminiService` 调用失败；③ `loadMammoth`/`loadPdfjs` 在多个新模块重复定义（应提到 `extract/types.ts` 共享）。
- **验证方式**：`fileService.ts` 单测覆盖 docx/pdf/ocr/csv/md 解析；`tsc --noEmit`；`npm run build` 后检查 `pdfjs-dist` 仍在独立 async chunk（非主包）；手测一次扫描件 PDF 的 OCR 链路。

#### R1-4 `AppLayout.tsx`（1046 行 → 布局 + 内联 Modal 外提）

- **目标**：仅保留布局 + `<Outlet/>`，把 3 个内联 Modal 提为独立组件；替换 2 处 `window.location.reload()`。
- **涉及文件**：`src/components/app/AppLayout.tsx`（已有独立 Modal：`JoinSubjectModal`/`StudentManagementModal`/`StudentSelectorModal`/`RoleSwitchModal`/`HelpModal`/`ConfirmModal` 见 28–32 行 import）。
- **子模块清单（行号锚点）**：

| 新建/调整文件 | 职责 | 抽取自行号 |
|---|---|---|
| `app/ChangePasswordModal.tsx` | 改密弹窗 | 320–373（`{ctx.showChangePasswordModal && (...)}`） |
| `app/InitModal.tsx` | 初始化科目弹窗 | 366–484（`{ctx.showInitModal && (...)}`） |
| `app/SubjectManageModal.tsx` | 科目管理（新增/编辑/删除/分享） | 484–704（`{ctx.showSubjectModal && (...)}`） |
| `app/AppLayout.tsx`（精简） | 仅布局 + 路由 `<Outlet/>` + 以 `<Suspense>` 懒挂载各 Modal | 40–~710 整体瘦身 |

- **实施顺序**：提 `ChangePasswordModal` → `InitModal` → `SubjectManageModal` → 精简 `AppLayout` → **替换 reload**（见下）。
- **依赖**：R2、R5（上下文解耦，因这些 Modal 大量用 `ctx.setXxx`）。
- **风险点（A6）**：`AppLayout.tsx:132`（`onJoined` 后 `window.location.reload()`）与 `:595`（某操作后 `reload()`）会破坏 SPA 状态机与 Context；改为"重新拉取数据 / 状态回滚"而非整页刷新。
- **验证方式**：单测覆盖 3 个 Modal 的开/关与关键操作；手测"加入科目后不白屏、数据刷新""初始化科目""科目管理增删改"；确认全仓库 `grep -rn "window.location.reload" src/` 归零。

#### R1-5 `geminiService.ts`（1042 行 → 请求/重试/降级/解析分离）

- **目标**：拆 prompt/parser/请求-重试 三块；修本地 `interface Question` 遮蔽领域类型的 bug。
- **涉及文件**：`src/services/geminiService.ts`（新建 `src/services/gemini/`）。
- **子模块清单（行号锚点）**：

| 新建文件 | 职责 | 抽取自行号 |
|---|---|---|
| `gemini/prompts.ts` | `SYSTEM_PROMPT`(95) / `GENERATE_PROMPT`(136) / 本地 `interface Question`(123) **→ 直接 `import type { Question } from '../../types'` 消除遮蔽** | 95–253 |
| `gemini/parser.ts` | `repairTruncatedJSON`(254) / 文本→题目结构化 | 254–441 |
| `gemini/request.ts` | `getGeminiKey`(11) / `getAIInstance`(21) / `runGeminiGenerateContent`(34) / `buildRequestBody`(442) / `callOpenAICompatible`(457) / `getSettings`(633) / `getMimeType`(916) / `waitForFileProcessing`(931) | 11–94, 442–632, 916–947 |
| `gemini/retry.ts` | 多模型回退 + 限流识别 `isRateLimitError`(809) | 809–895（与 request 配合） |
| `gemini/index.ts` | `parseQuestionsWithAI`(639) / `generateQuestionsFromPrompt`(825) / `parseQuestionsWithFile`(948) 编排 | 639–915, 948–1042 |

- **实施顺序**：`prompts.ts`(修类型遮蔽) → `parser.ts` → `request.ts` + `retry.ts` → `index.ts` 编排 → `geminiService.ts` 退化为 re-export。
- **依赖**：R2（清 9 处 `any`、25 处 console→logger）、安全网单测。
- **风险点**：① 本地 `interface Question`(123) 遮蔽导入的 `Question`，拆分时若直接复用会类型错配；② `repairTruncatedJSON` 的 `any[]` 返回值（254 行）需在 strict 下给具体类型。
- **验证方式**：单测覆盖 `repairTruncatedJSON`（截断 JSON 修复）与 `parseQuestionsWithAI` 的 mock 回退；`tsc --noEmit`；手测一次 AI 解析题目。

### R2 — tsconfig 开启 strict

- **目标**：开启严格模式，消除 ~95 处 `any`，让后续拆分天然带类型。
- **涉及文件**：`tsconfig.json`（加 strict 块）；`api.ts`(6 处)、`useQuestionBank.ts`(5)、`fileService.ts`(14)、`geminiService.ts`(9)、`ImportModal.tsx`(16)、`useAuth.ts`(15)、`AppLayout.tsx`(4) 等。
- **实施顺序**：
  1. `tsconfig.json` 增加：`"strict": true`、`"noUnusedLocals": true`、`"noUnusedParameters": true`、`"noImplicitAny": true`；保留 `experimentalDecorators`（历史遗留，当前无使用，可顺手删）。
  2. 跑 `npx tsc --noEmit` 收集真实错误清单（审计的 ~95 是旧估算，以实际为准）。
  3. **按文件分波修复**，与被拆分文件配对（先修 `api.ts`/`useQuestionBank.ts`/`useAuth.ts` 这些也是其他重构依赖的文件）。
  4. `any` 替换策略：API 响应 → 定义 `ApiResponse<T>`；OCR/解析结果 → `unknown` + 类型守卫；禁止新增 `as any`（eslint 可加 `no-explicit-any`）。
- **依赖**：无（可最先做，但建议与安全网 T0 同步启动）。
- **风险点**：一次性全开 strict 会产生大量报错，需分批；`api.ts:53` `let data: any` 与 `:78-86` 的 `body?: any` 是重点。
- **验证方式**：`tsc --noEmit` 零错误；`grep -rn ": any\|as any\|<any>" src/ | wc -l` 归零（或仅剩有注释豁免处）。

### R3 — 路由级代码分割（详见第 4 节 deliverable #4）

- **目标**：主包 < 500KB，首屏仅加载必要代码。
- **实施顺序**：先页面 lazy（`App.tsx`）→ 再 Modal/Markdown lazy（依赖 R1 拆出的组件）→ 调 manualChunks。
- **依赖**：R1（拆出的组件才能稳定 lazy）。
- **验证方式**：`npm run build` 后 `ls -la dist/assets/` 确认主 `index-*.js < 500KB`；`grep -rn "React.lazy" src/` 覆盖 pages + ImportModal + LoginModal + MarkdownRenderer。

### R4 — 判分逻辑统一（详见第 3 节 deliverable #3）

- **目标**：4 份判分实现收敛为 1 个 SSoT 纯函数包，前端/服务端/扩展统一引用。
- **依赖**：安全网 T0（共享测试夹具）。
- **验证方式**：`src/shared/scoring/__tests__/scoring.test.ts` 全绿；服务端复用同一夹具；扩展 `popup.js:359-401` 改为调用共享 `scoreByIndices`。

### R5 — AppContext 解耦 + useExam 组合 hook

- **目标**：拆巨型 Context 为按域细粒度（或引 Zustand），`useExam` 不再接收 12 个参数（其中 5 个是 UIState setter）。
- **涉及文件**：`src/context/AppContext.tsx:8-12`（intersection 合并）、`src/hooks/useExam.ts:6-19`（12 参数）、`src/hooks/useUIState.ts`（94 行）。
- **方案**：
  - **推荐：按域拆分 Context**（`AuthCtx` / `ExamCtx` / `UIStateCtx` / `ToastCtx` / `QuestionBankCtx`），各 Provider 独立，消费者按需订阅，降低重渲染（审计 A8）。
  - `useExam` 改为**组合 hook**：内部直接 `useUIState()` 拿 `setSearchQuery` 等，不再由 `AppProvider` 逐参数下钻传入（现 `AppContext.tsx:29-33`）。`AppProvider` 退化为组合各 Provider。
  - *备选*：引 Zustand（store 切片），代价是新增依赖与学习成本，且需迁移 5 个 hook 的状态——本批**不推荐**引入，除非拆分 Context 后重渲染仍不达标。
- **实施顺序**：建 `AuthCtx` → `UIStateCtx` → `QuestionBankCtx` → `ExamCtx`(内部 `useExam` 自取 UIState) → 删除 `AppContext` 合并 → 更新所有 `useAppContext()` 调用点（grep 约有 N 处）。
- **依赖**：R6（类型映射，因 `useExam` 用 `Question`）、R1-4（AppLayout 用 ctx）。
- **风险点**：调用点众多（`useAppContext()` 散落全仓），改 Context 结构易漏；`useExam` 依赖 `useQuestionBank` 输出（现 `AppContext.tsx:20`），拆分后要保证 Provider 嵌套顺序。
- **验证方式**：全仓 `grep -rn "useAppContext" src/` 调用点无类型报错；手测练习/考试全流程（含搜索、导入弹窗开关）无状态丢失；React DevTools 确认单一 toast 变更不再触发整树重渲染。

### R6 — API/领域双轨类型映射

- **目标**：`types.ts` 为领域 SSoT；`api.ts` DTO 仅作网络形态，并在边界提供 `toDomain()`。
- **涉及文件**：`src/types.ts`（领域：`Subject:14`/`Question:141`/`MistakeRecord:162`，以及 184–365 的 exam 契约类型——后者本就是 snake_case 后端镜像，注释标注为"API contract mirror"）、`src/services/api.ts:102-193`（DTO：`AuthUser`/`SubjectItem`/`QuestionItem`/`MistakeItem`/`FavoriteItem`/`StatsItem`）。
- **具体字段口径不一致（必须靠 toDomain 消除）**：

| DTO（api.ts） | 领域（types.ts） | 映射动作 |
|---|---|---|
| `QuestionItem.subject_id: string`(175) | `Question.subject: SubjectId`(143) | 直接 |
| `QuestionItem.createdAt/updatedAt` | `Question` 无此字段 | 丢弃或补 `createdAt?` |
| `QuestionItem.userId` | `Question` 无 | 丢弃（或补 `createdBy?`） |
| `SubjectItem.isSystem`(150) | `Subject.isCustom`(20) | **反向**：`isCustom: !item.isSystem` |
| `SubjectItem.createdAt` | `Subject` 无 | 丢弃 |
| `AuthUser`(102) | 领域 `User`（types.ts **缺失**，需补 `User` 接口） | 新建 `User` + `authUserToUser` |
| `MistakeItem`(191) | `MistakeRecord`(162) | `questionId`/`consecutiveCorrect` 直接，去 `createdAt/updatedAt` |

- **映射层落点**：新建 `src/services/api.mappers.ts`，导出 `subjectItemToSubject` / `questionItemToQuestion` / `authUserToUser` / `mistakeItemToMistakeRecord` / `favoriteItemToFavorite` / `statsItemToStats`；在 `useQuestionBank` 调用 `questionApi.listAll` 的边界做一次映射（消费方统一用领域类型）。
- **依赖**：R2（strict 下写精确类型）。
- **风险点**：`Question` 缺 `createdBy` 与 `userId` 落点不一致（审计示例 2 的 `toQuestion` 用了 `createdBy: currentUser.id`）；`User` 接口需在 `types.ts` 补。
- **验证方式**：mapper 单测（每个 DTO→领域一对一样例）；`grep -rn "QuestionItem\|SubjectItem" src/hooks src/components` 调用点改吃领域类型；`tsc --noEmit` 通过。

---

## 3. Deliverable #3 — 判分逻辑统一 + Chrome 扩展：方案决策

### 3.1 现状（4 份实现，口径已漂移）

| # | 位置 | 实现 | 风险 |
|---|---|---|---|
| 1 | `src/utils/examScoring.ts:6` | `isAnswerCorrect`（**权威范本**，single/multiple/programming 全覆盖，含 A-Z→选项文本回退） | 基准 |
| 2 | `src/hooks/useExam.ts:131-132,150-151` | **内联重实现** `normalize`/比较，未调用 `isAnswerCorrect` | 漂移（P2-2） |
| 3 | `server/src/utils/examScoring.js:21` | 忠实移植版 + `gradeQuestion`（编程题 `needs_manual`） | 需同步 |
| 4 | `chrome-extension/popup.js:359-401` | **独立 vanilla 实现**：仅 `keys=['A'..'F']` 字母→index 映射，**无** A-Z→选项文本回退、无 programming normalize | **静默错判风险最高** |

### 3.2 决策：抽"框架无关 scoring 共享模块"（in-repo TS 源 + 构建生成 JS）

**采用方案**：在 `src/shared/scoring/` 建单一事实来源（纯函数、零 React/Node 依赖），通过构建脚本生成 `server/src/utils/examScoring.generated.js`（ESM，匹配服务端现有 import 形状）与 `chrome-extension/scoring.js`（IIFE，挂 `window.StudyScoring`，兼容 MV2/MV3），三端统一引用。**不**采用"扩展端加载主应用 Web"，**不**采用"纯手工复制无同步"。

**理由与代价**：

| 方案 | 可行性 | 代价 | 结论 |
|---|---|---|---|
| A. 抽共享 scoring 包（推荐） | 高 | 中：新增 `src/shared/scoring/` + 构建脚本 `scripts/build-scoring.mjs`（用 esbuild，已是 vite 传递依赖）+ CI 同步校验 | **采用** |
| B. 扩展端加载主应用 Web（同 Electron/Capacitor） | 低 | 高：扩展价值在"轻量弹窗 + 直连任意后端/离线"，嵌完整 SPA 需后端、破坏 UX；等于重写扩展 | **否决** |
| C. 手工复制模块不自动化 | 中 | 高：3 份副本必然再次漂移（正是当前病根） | **否决** |

**具体落地（给工程师的可执行动作）**：
1. 建 `src/shared/scoring/index.ts`，导出：`isAnswerCorrect`(移植 examScoring.ts)、`gradeQuestion`(移植 server 版，供服务端)、`formatTime`、`scoreByIndices(question, selectedIndices:number[]):boolean`（为扩展 popup.js:359-401 提供"答案字母→选项 index"的完整鲁棒实现，取代其脆弱逻辑）。
2. 建 `scripts/build-scoring.mjs`：`esbuild` 打包 `index.ts` → `server/src/utils/examScoring.generated.js`(format=esm) 与 `chrome-extension/scoring.js`(format=iife, globalName=StudyScoring)；在 `package.json` 加 `"sync:scoring": "node scripts/build-scoring.mjs"` 并挂 `prebuild`。
3. `useExam.ts`：`handleAnswerChange`(131-132) 与 `checkProgrammingAnswer`(150-151) 改为调用 `isAnswerCorrect`（修 P2-2），删除内联 `normalize`。
4. `chrome-extension/popup.js:359-401`：引入 `scoring.js`，`submitAnswer` 中 `correctIndices` 计算改为 `scoreByIndices(q, selectedIndices)`（保留扩展原有"选项点击/进度条"UI，只换判分内核）。
5. `server/src/utils/examScoring.js`：改为由生成文件覆盖（保留 `gradeQuestion` 语义一致）；或保留手写版但加注释"与 src/shared/scoring 同步，禁止手改"。
6. **共享测试夹具**：`src/shared/scoring/__tests__/scoring.test.ts` + `fixtures.ts`，覆盖：single(文本判等 / A-Z 标签回退)、multiple(排序 / 标签映射)、programming(normalize)、扩展 index 用例；服务端用同一夹具的 JS 移植版跑一遍，扩展引用同夹具。

**代价小结**：约 0.5–1 人日建模块+脚本，换来对 3 端判分口径的永久锁定 + 回归防护。

---

## 4. Deliverable #4 — 路由级代码分割：manualChunks + React.lazy 落点清单

### 4.1 当前状态
- `src/App.tsx:9-13`：5 个 page + `AppLayout` 全部**静态** import（零 lazy）。
- `vite.config.ts:79-85` manualChunks 仅：`vendor-react`/`vendor-motion`/`vendor-lucide`/`vendor-pdf`/`vendor-ai`。
- `chunkSizeWarningLimit: 500`（已正确）。

### 4.2 React.lazy 落点清单

| 当前静态引用 | 改为 | 落点（Suspense 包裹位置） | Fallback |
|---|---|---|---|
| `App.tsx:9` `HomePage` | `React.lazy(() => import('@/pages/HomePage'))` | `App.tsx` `<Route index>` | `<PageSkeleton/>` |
| `App.tsx:10` `ExamPage` | `React.lazy(...pages/ExamPage)` | `exam` 路由 | 同上 |
| `App.tsx:11` `ResultPage` | `React.lazy(...pages/ResultPage)` | `result` 路由 | 同上 |
| `App.tsx:12` `FormalExamPage` | `React.lazy(...pages/FormalExamPage)` | `formal-exam` 路由 | 同上 |
| `App.tsx:13` `ExamManagePage` | `React.lazy(...pages/ExamManagePage)` | `exams/manage` 路由 | 同上 |
| `AppLayout.tsx:25` `ImportModal` | `React.lazy(...ImportModal)`（R1-1 拆后） | `AppLayout` 内 `{isImportModalOpen && (<Suspense><ImportModal/></Suspense>)}` | `<ModalSkeleton/>` |
| `AppLayout.tsx:26` `LoginModal` | `React.lazy(...LoginModal)`（R1-2 拆后） | `AppLayout` 内 `<Suspense>` | 同上 |
| `MarkdownRenderer`（react-markdown 重型） | `React.lazy(...MarkdownRenderer)` | 使用处 | 同上 |

> 注：`AppLayout` 本身作为布局壳建议**保持静态**（首屏必需）；其内部 Modal 与页面走 lazy。

### 4.3 manualChunks 调整（在现有 5 个 vendor 块基础上新增）

```ts
manualChunks: {
  'vendor-react': ['react', 'react-dom'],
  'vendor-motion': ['motion'],
  'vendor-lucide': ['lucide-react'],
  'vendor-pdf': ['pdfjs-dist'],          // 仅被 fileService 动态 import，保持 async chunk
  'vendor-ai': ['@google/genai'],
  'vendor-katex': ['katex', 'rehype-katex', 'remark-math'], // 由 MarkdownRenderer 拉入
  'vendor-md': ['react-markdown'],
}
```
- **关键约束**：① 不删除现有 vendor 块；② 不把 `chunkSizeWarningLimit` 调回 2000；③ `vendor-pdf` 必须确认全仓无静态 `import 'pdfjs-dist'`（R1-3 保留动态 import 即满足）；④ katex/md 经 lazy 的 `MarkdownRenderer` 间接引用，不会进主包。

### 4.4 目标与验证
- 主包 `dist/assets/index-*.js` **< 500KB**（当前 1.7MB，靠拆 pages+modals+动态重型库压下来）。
- 验证：`npm run build` → `du -h dist/assets/index-*.js`；`grep -rn "React.lazy" src/ | wc -l` ≥ 7（5 页 + 2 Modal，Markdown 另计）。

---

## 5. Deliverable #6 — "先补单测再拆"：各上帝文件单测覆盖点

> 前置：先完成 T0（引入 Vitest + @testing-library/react + jsdom）。项目当前**零测试工具**（根 `package.json` 无 vitest/jest，仅 `server/tests/examScoring.test.mjs` 存在），必须新建。

### 5.1 ImportModal（T4a，拆前安全网）
- `useImportFlow`：6 种格式分支（PDF/DOCX/TXT/MD/CSV/JSON）各一个用例，mock `fileService` 导出，断言产出 `ParsedQuestion[]` 数量与字段。
- `questionConvert.toQuestion`：single/multiple/programming 三种 `ParsedQuestion→Question` 映射，断言 `subjectId`/`type`/`answer`/`points` 默认值。
- `subjectName`：同名查表、按 id 查表、未知 id 兜底。
- `useImageOcr`：3 类图片上传路径（mock `onlineOCR`/`extractTextFromPDFWithPaddleOCR`）断言回调结果一致（验证示例 1 合并后无行为差）。

### 5.2 LoginModal（T6a）
- 4 个 Form 各自：空校验、格式校验、成功/失败分支（mock `authApi`）。
- `AuthModal` 键盘陷阱：`keydown` Esc 关闭 + 卸载后监听移除（修 A10）。

### 5.3 fileService（T5a）
- `docxExtract.extractTextFromDocx`：喂 mock `.docx` ArrayBuffer，断言返回文本非空。
- `pdfExtract.extractTextFromPDF`：断言**触发动态 `import('pdfjs-dist')`**（spy import），非静态。
- `ocr.extractTextFromPDFWithPaddleOCR`：mock `fetch`，断言请求体含 base64 与 key。
- `csvExtract.parseCSV`：标准/带引号/多行字段用例。
- `aiVision.parsePdfWithAIVision`：mock `callServerGeminiVision`，断言截断修复后 JSON 解析。

### 5.4 AppLayout（T7a）
- 3 个内联 Modal 开/关与关键操作（用 `render` + `fireEvent`）。
- **A6 回归用例**：触发"加入科目"等原 `reload()` 路径（132/595），断言**无** `window.location.reload` 调用（spy `window.location.reload`），且数据经回拉/回滚刷新。

### 5.5 geminiService（T9a）
- `parser.repairTruncatedJSON`：截断 JSON、残缺数组、嵌套截断各一例，断言 `recovered` 数。
- `parseQuestionsWithAI`：mock `runGeminiGenerateContent` 返回多模型回退序列，断言最终解析结果。
- `isRateLimitError`：429/限流体各种形态。

### 5.6 共享 scoring（R4 安全网，跨端）
- 见第 3.2 节 `scoring.test.ts` + `fixtures.ts`：single/multiple/programming/扩展 index 全覆盖；服务端 + 扩展复用同一夹具。

---

## 6. Deliverable #2 — 有序实施任务列表（按依赖，标注并行/串行）

> 任务粒度：基础/T0-T1 串行打底；上帝文件拆分 T4/T5/T6/T9 互相独立可并行；T7/T8 有依赖需靠后；T10/T11 收尾。

| ID | 任务 | 依赖 | 并行/串行 | 级别 |
|---|---|---|---|---|
| **T0** | 引入 Vitest + @testing-library/react + jsdom + `src/test/setup.ts`；加 `test`/`test:run` script | 无 | 最先（串行） | S |
| **T1** | tsconfig 开 strict + `tsc --noEmit` + 按文件清 ~95 处 `any`（先 api/useQuestionBank/useAuth） | T0 | 串行（与 T0 紧接） | M |
| **T2** | R6 双轨类型：types.ts SSoT + `api.mappers.ts` toDomain + useQuestionBank 边界映射 | T1 | 并行于 T3 | M |
| **T3** | R4 判分统一：shared/scoring + build-scoring.mjs + 改 useExam/popup.js + 共享夹具 | T0 | 并行于 T2 | M |
| **T4** | R1-1 ImportModal 拆分（先 T4a 单测，再拆 6 子组件） | T1, T0 | **并行** T5/T6/T9 | L |
| **T5** | R1-3 fileService 拆分（先 T5a 单测，再拆 7 模块，**保留动态 import**） | T1, T0 | **并行** T4/T6/T9 | L |
| **T6** | R1-2 LoginModal 拆分（先单测，再 AuthModal+4 Form） | T1, T0 | **并行** T4/T5/T9 | M |
| **T9** | R1-5 geminiService 拆分（先单测，再 prompts/parser/request/retry） | T1, T0 | **并行** T4/T5/T6 | M |
| **T7** | R1-4 AppLayout 拆分（提 3 Modal + 替换 A6 reload） | T1, T0,（部分 T8） | 并行于 T9；T8 前 | M |
| **T8** | R5 AppContext 解耦（按域 Context + useExam 组合 hook） | T2, T7 | 串行（靠后） | L |
| **T10** | R3 路由分割：React.lazy 页面（T10a，独立早期）+ Modal/Markdown lazy + manualChunks 调整 | T4,T5,T6,T9（Modal lazy） | T10a 独立；其余并行收尾 | M |
| **T11** | 收尾清理：移除无用 core-js/regenerator deps、console→logger 封装、补 CONFIGURATION.md/CLAUDE.md | 全部 | 最后（串行） | S |

**依赖图**：`T0 → T1 → {T2 ∥ T3} → {T4 ∥ T5 ∥ T6 ∥ T9} → T7 → T8 → T10 → T11`；T10a（页面 lazy）可提前到 T1 之后独立做。

---

## 7. Deliverable #5 — 与第一批次已改动文件的冲突点明细（实施规避）

| 冲突文件 | 第一批已做 | 第二批动作 | 规避要点（红线） |
|---|---|---|---|
| `src/services/fileService.ts` | B2：新增 `loadPdfjs()`(10)/`loadMammoth()`(19) 动态 import；行数 1189→1208 | R1-3 拆分为 `extract/*` | **① 动态 import 必须下沉到 `extract/*` 内，严禁恢复 `import mammoth from 'mammoth'`/`import * as pdfjsLib from 'pdfjs-dist'`**；② `loadMammoth`/`loadPdfjs` 提到 `extract/types.ts` 共享，勿重复定义；③ `fileService.ts` 导出签名保持不变（re-export 壳），避免 `ImportModal.tsx:5`、`geminiService` 调用失败 |
| `src/components/ImportModal.tsx` | A1：`:124` 密钥改为 `import.meta.env.VITE_PADDLEOCR_API_KEY \|\| ''` | R1-1 拆 `PaddleOcrSettings` | **禁止**在子组件重新硬编码 `'97f310b...'` 默认值；保留 `localStorage` 仅存用户自有 key（`:1685`）；`import.meta.env.VITE_PADDLEOCR_API_KEY` 读取逻辑随子组件带走 |
| `vite.config.ts` | B3：`chunkSizeWarningLimit:500`；manualChunks 5 个 vendor 块 | R3 扩展 manualChunks | 保留现有 5 块与 500 上限；**不得**删除 `vendor-pdf`、不得把阈值调回 2000；新增 `vendor-katex`/`vendor-md` 时确认无静态引用把它们拉进主包 |
| `src/main.tsx` | B4：删除 core-js/regenerator 导入 | （无新增） | **不得**重新引入这两行；收尾 T11 可从 `package.json` 移除 `core-js`/`regenerator-runtime`（已无引用） |
| 根 `package.json` | P1-3：移除 `express`/`multer` | T0/T8 新增 vitest/@testing-library/zustand(可选) | **不得**误加回 `express`/`multer`；`@google/genai` 前后端对齐 `^1.29.0`；新增 devDeps 走 devDependencies |
| `src/context/AppContext.tsx` | 第一批未动（仍 5 hook 合并） | R5 解耦 | 解耦时**保留 `useAppContext` 导出名或提供兼容别名**，避免全仓 `useAppContext()` 调用点一次性全改导致大冲突；建议分域 Provider 过渡期双导出 |

---

## 8. Deliverable #7 — 工作量估算与分批建议

### 8.1 每项级别

| 项 | 级别 | 说明 |
|---|---|---|
| T0 测试脚手架 | S | 引入依赖 + setup，半天 |
| T1 strict+清 any | M | 分批修 ~95 处，1–2 天 |
| T2 双轨映射 | M | 6 个 mapper + 边界，1 天 |
| T3 判分统一 | M | 模块+脚本+扩展改造，1 天 |
| T4 ImportModal 拆 | L | 10 子模块 + 单测，2–3 天 |
| T5 fileService 拆 | L | 7 模块 + 保动态 import + 单测，2–3 天 |
| T6 LoginModal 拆 | M | 5 子模块 + 单测，1–2 天 |
| T7 AppLayout 拆 | M | 3 Modal + A6 reload，1–2 天 |
| T8 AppContext 解耦 | L | 5 Context + useExam 组合，2–3 天 |
| T9 geminiService 拆 | M | 4 模块 + 修类型遮蔽，1–2 天 |
| T10 路由分割 | M | lazy + manualChunks，1 天 |
| T11 收尾清理 | S | 依赖移除 + 文档，半天 |

### 8.2 建议分批（与审核建议一致，并照顾冲突规避）

**批次一（啃最相关、互相独立、且含第一批已改文件的两块）**
- T0 → T1（重点先修 `api.ts`/`useQuestionBank`/`useAuth`/`fileService`/`ImportModal` 的类型）
- T2（双轨映射，ImportModal 用到 `QuestionItem→Question`）
- T3（判分统一，独立低风险高价值）
- **T4 ImportModal 拆分** + **T5 fileService 拆分**（二者强相关——都围绕"文件导入/OCR"，且 fileService 已被第一批改过，须本批内同步处理以避免二次冲突）
- T10a（页面 React.lazy，可早期独立启动）

**批次二（剩余上帝文件 + 上下文解耦 + 收尾）**
- T6 LoginModal 拆分
- T7 AppLayout 拆分（含 A6 reload 替换）
- T9 geminiService 拆分
- T8 AppContext 解耦（含 useExam 组合 hook，依赖 T2/T7）
- T10b（Modal/Markdown lazy + manualChunks 终调）
- T11 收尾清理

> 批次一与批次二之间以"全量 `tsc --noEmit` + `npm run build` + 关键路径手测 + 单测绿"为里程碑门禁，由 QA 严把关回归验证后再进批次二。

---

## 9. 风险总表与回归验证门禁

### 9.1 跨任务风险
- **R-1（最高）fileService 动态 import 回退**：拆 R1-3 时误静态引入 mammoth/pdfjs → 主包再次 1.7MB。门禁：`grep -rn "import mammoth\|from 'pdfjs-dist'" src/services/extract/`（应只在函数内 `await import`）；build 后 pdfjs 仍在 async chunk。
- **R-2 密钥回硬编码**：R1-1 子组件误加默认值。门禁：`grep -rn "97f310b" src/` 必须零命中。
- **R-3 判分口径漂移**：R4 后三端仍不一致。门禁：共享 `scoring.test.ts` 三端同跑绿；扩展 `popup.js` 不再自写 correctIndices。
- **R-4 Context 调用点遗漏**：R5 改 `useAppContext` 结构后散落调用报错。门禁：`grep -rn "useAppContext" src/` 全过 `tsc`。
- **R-5 双轨映射丢字段**：R6 后 `Question.userId`/`createdBy` 不一致。门禁：mapper 单测覆盖 + 手测导入后题目归属正确。

### 9.2 回归验证门禁（每完成一项必跑）
1. `npx tsc --noEmit` 零错误
2. `npm run build` 成功且主包 < 500KB
3. `npm run test:run`（Vitest）相关用例全绿
4. 关键路径手测（导入/登录/练习/考试/科目管理）行为与原包一致
5. `grep` 红线检查（见 9.1）零命中

---

## 10. 验收清单（交给 QA 严过关）

- [ ] `tsc --noEmit` 零错误；`grep ": any\|as any" src/` 归零
- [ ] 5 个上帝文件均 ≤ 400 行，且各有对应单测文件
- [ ] `src/shared/scoring` 为判分 SSoT；`useExam.ts` 无内联 normalize；`popup.js:359-401` 调共享 `scoreByIndices`
- [ ] `AppContext` 已按域拆分或引状态库；`useExam` 参数 ≤ 4
- [ ] `api.mappers.ts` 存在；组件/hook 消费领域类型，无 `QuestionItem`/`SubjectItem` 直用
- [ ] `React.lazy` 覆盖 5 页 + ImportModal + LoginModal + MarkdownRenderer；主包 < 500KB
- [ ] `fileService` 无静态 mammoth/pdfjs；`grep "97f310b" src/` 零命中
- [ ] `window.location.reload` 在 src/ 归零
- [ ] core-js/regenerator 从 package.json 移除（如确认无引用）
- [ ] CONFIGURATION.md/CLAUDE.md 与代码一致
