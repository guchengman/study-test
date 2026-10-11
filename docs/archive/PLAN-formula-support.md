# 题库公式支持改造计划
> 【已归档 2026-10-11】本文是一次性历史产物，内容可能过时。现行文档见 [docs/README.md](../README.md) 索引。

## 目标

使系统能够将 Word/PDF 文档中的图片公式转化为 LaTeX 公式存储和展示，用户上传含公式的文档即可自动得到含 LaTeX 的题目。

---

## 审查记录 (Review Log)

### 🔍 审查 #1 — 架构与可行性审查

**审查人**: 系统架构审计  
**审查结论**: 计划可行但有 5 个关键问题需要修正

| # | 问题 | 严重度 | 说明 |
|---|---|---|---|
| 1 | **逐图调用 AI 成本过高** | 🔴 阻塞 | DOCX 可能含 20+ 公式图片，每张调一次 AI vision (含多模型回退)，耗时 2-5s/张，总耗时过长。且每次调模型都有 rate limit |
| 2 | **公式识别缺乏上下文** | 🟡 重要 | mammoth 提取的图片是孤立的 inline 图片。AI 不知道图片周围的文字，可能把公式图误判为普通图 |
| 3 | **标准化 MD 格式与 AI 生成格式不统一** | 🟡 重要 | AI 生成题的输出格式是 `单选题：\n题目标题\nA. ...`（无 `###` 头），而标准化 MD 用 `### 题型 \| 分值` 头。两者需要对齐 |
| 4 | **fileService.ts 已 1185 行** | 🟢 建议 | 新增逻辑应拆分到独立文件，避免进一步膨胀 |
| 5 | **Mathpix 作为更优选择未提及** | 🟢 建议 | 对于生产环境，Mathpix 的公式识别准确率远高于通用多模态 AI，应作为后端可选项 |

**决议**: 全部接受。修正后重新审查。

---

### 🔍 审查 #2 — 用户体验审查

**审查人**: 产品体验审计  
**审查结论**: 用户流程基本合理，但有 4 个体验问题需要改进

| # | 问题 | 严重度 | 说明 |
|---|---|---|---|
| 1 | **"公式识别"是阻塞步骤但用户不知道在等什么** | 🔴 阻塞 | 如果 DOCX 有 15 张公式图片，用户上传后可能要等 30-60s 没有任何反馈。需要实时显示进度 |
| 2 | **标准化 MD 格式文档缺失** | 🟡 重要 | 用户需要知道"标准化 MD 长什么样"，应该在界面上提供模板下载或示例 |
| 3 | **公式识别失败后的降级路径不清晰** | 🟡 重要 | 如果某张图片识别失败，用户得到的是原图链接还是空内容？UI 上是否告知用户哪些公式未能识别？ |
| 4 | **预览中的 LaTeX 渲染** | 🟢 建议 | ImportModal 目前的预览是 Question[] 表格，改成渲染 MarkdownRenderer 可能需要较大 UI 改动 |

**决议**: 全部接受。修正后重新审查。

---

### 🔍 审查 #3 — 实现细节与边界情况审查

**审查人**: 技术实现审计  
**审查结论**: 需要补充边界情况和错误处理

| # | 问题 | 严重度 | 说明 |
|---|---|---|---|
| 1 | **mammoth 提取的 inline 图片可能很小（如公式符号）** | 🟡 重要 | 如果图片太小（< 50px），AI 视觉识别准确率极低，需要提前过滤或跳过 |
| 2 | **DOCX 中部分公式可能已经是文本格式（而非图片）** | 🟢 建议 | mammoth 对部分 MathType 公式可能直接提取为文本，不需要识别 |
| 3 | **用户可能上传纯文字 DOCX（无公式），不应触发 AI 识别** | 🟡 重要 | 只有当 images.length > 0 时才显示"是否识别公式"的选项 |
| 4 | **服务端 GEMINI_API_KEY 可能未配置** | 🟡 重要 | 公式识别依赖 AI vision，如果服务端没配 key 且用户也没配个人 key，应该降级跳过而非报错 |
| 5 | **标准化 MD 解析需要严格的容错** | 🟡 重要 | 用户手动编写的 MD 可能格式不严格，解析器需要兼容变体（如 `分值=5`、`|分值:5|` 等） |
| 6 | **并发限制** | 🟢 建议 | AI vision 调用应控制并发数（比如同时最多 3 个请求），避免触发 API rate limit |

**决议**: 全部接受。修正后重新审查。

---

## 修正后的最终计划

基于三轮审查发现的 14 个问题，以下是修正后的实施计划。

---

## Phase 1 — 核心：DOCX 图片公式 → LaTeX 转换

### 架构调整（应对审查 #1 问题 1、4）

将公式识别逻辑从 `fileService.ts` 拆分到独立文件 `src/services/formulaService.ts`，职责清晰：

```
src/services/
├── formulaService.ts    # 新增：公式识别相关（imageToLatex、batchImageToLatex）
├── fileService.ts       # 已有：文件提取（不变，或精简）
├── geminiService.ts     # 已有：AI 题目解析
└── api.ts               # 已有：API 客户端
```

### 修改路线图（改进后）

```
用户上传 DOCX
  ↓
mammoth 提取 HTML + 图片列表
  ↓
自动检测图片数量，如果 >0，显示进度条 "正在识别公式..."
  ↓ (新增：批量并发识别，最多 3 并发)
for each 图片:
  └→ AI vision 判断是否为公式 → 返回 LaTeX
  ↓
用 LaTeX 替换原图标记（失败的原图保留为图片链接）
  ↓
文本进入 AI 解析 → 生成含 LaTeX 的 JSON 题目
  ↓
预览（LaTeX 已渲染） → 用户确认 → 入库
```

### 具体改动

**1.1 新建 `src/services/formulaService.ts`**

核心函数：

```typescript
// 单张图片识别为 LaTeX（复用现有 AI vision 能力）
async function imageToLatex(
  imageBase64: string, 
  context?: string  // 周围文本上下文，帮助 AI 判断
): Promise<{ isFormula: boolean; latex: string }>

// 批量识别（处理并发和限流）
async function batchImageToLatex(
  images: Array<{ data: string; context?: string }>,
  onProgress?: (current: number, total: number) => void
): Promise<Array<{ isFormula: boolean; latex: string; originalData?: string }>>

// 判断是否需要公式识别（过滤小图片等）
function shouldProcessImage(base64Length: number): boolean
```

**关键设计决策（应对审查 #1 问题 1）：**
- 并发上限 3 个请求（避免 rate limit）
- 每个图片单独调用 AI vision（因为上下文不同）
- 如果周围文本已包含类似 LaTeX 的内容，跳过识别
- 超时 15s/张，超时标记为"识别超时"（走图片降级）

**1.2 修改 `ImportModal.tsx` — DOCX 处理分支**

当前代码位置：第 182-208 行（`handleFileChange` 的 `.docx` 分支）

改动：
1. mammoth 提取后，检查 `images.length`
2. 如果 >0，显示新状态 `isConvertingFormula = true` + 进度
3. 调用 `batchImageToLatex`
4. 用结果替换原 HTML 中的 base64 引用
5. 失败的图片走原有上传逻辑

**1.3 新增开关：`convertFormulaEnabled`**

- 位置：ImportModal 中 OCR 模式选择附近
- 文案："自动识别公式 → LaTeX"
- 说明："将文档中的公式图片转为 LaTeX 格式（需 AI API Key）"
- 默认：开启
- 用户未配置任何 AI Key 时自动禁用并提示

**1.4 应对审查 #2 问题 1 — 进度反馈（公式识别时）**

新增状态显示区域（在文件处理进度条位置）：
```
📐 正在识别公式...  8/15 已完成  |  ✅ 6 成功  ⚠️ 2 失败
[████████░░░░░░░░░░░░] 53%
```

---

## Phase 2 — 优化 AI 视觉识别的公式输出质量

**2.1 新建 `formulaService.ts` 中的 AI 识别 prompt**

```text
你是一个专业的公式识别专家。请识别这张图片中的内容。

规则：
1. 如果是数学/物理/化学公式，输出纯 LaTeX 代码，不要加任何解释
2. 行内公式用 $...$，独立公式用 $$...$$
3. 化学式用标准 LaTeX：\ce{H2O}、\ce{CO2}
4. 如果不是公式而是普通图片（插图、照片、图标等），输出空字符串
5. 绝对不要输出除 LaTeX 代码外的任何文字
```

**2.2 改进 `AI_VISION_PROMPT`（全页识别用）**

在 `fileService.ts` 中现有的 `AI_VISION_PROMPT` 增加：
- 对每页中出现的公式图片，明确要求输出 LaTeX
- 如果页面包含化学结构式，使用 `\ce{}` 宏
- 表格用 Markdown 表格格式输出

**2.3 修改 `geminiService.ts` — SYSTEM_PROMPT**

在第 113-118 行（富文本格式要求段落）增加：
```
- 如果在解析时遇到 ![](url) 图片引用但该图片实际上是一个公式图片（由识别结果判断），应替换为对应的 LaTeX 代码
- 图片引用优先保留，不要丢弃
```

---

## Phase 3 — 标准化 MD 批量导入

### 格式规范统一（应对审查 #1 问题 3）

标准化 MD 采用兼容 AI 生成格式 + 扩展头部的格式：

```markdown
### 单选题 | 分值:5 | 难度:基础 | 知识点:二次函数
题干：已知 $$f(x)=ax^2+bx+c$$
下列说法正确的是？
A. 开口方向由b决定
B. 对称轴为 $x=-\dfrac{b}{2a}$
C. 一定存在零点
D. 函数单调递增
**答案：B**
解析：根据二次函数基础性质可得对称轴公式。
```

同时也兼容纯文本格式（无 `###` 头，用于 AI 生成场景）：

```
单选题：
已知 $$f(x)=ax^2+bx+c$$ 下列说法正确的是？
A. 选项A
B. 选项B
C. 选项C
D. 选项D
答案：B
```

**3.1 新建 `src/services/mdParserService.ts`**

```typescript
// 标准化 MD 解析（带 ### 头的严格格式）
function parseStandardizedMd(content: string): ParsedQuestion[]

// 宽松格式解析（兼容纯文本格式）
function parseRelaxedMd(content: string): ParsedQuestion[]

// 自动检测格式并选择解析器
function parseQuestionsFromMd(content: string): ParsedQuestion[]
```

正则策略（应对审查 #3 问题 5 — 格式容错）：
- 头部匹配：`###\s*(?<type>[^|]+?)\s*(?:\||：)\s*分值[:：]\s*(?<score>\d+)`
- 同时兼容 `分值=5`、`难度：困难`、`|分值:5` 三种变体
- 如果无 `###` 头，尝试纯文本格式匹配

**3.2 修改 `ImportModal.tsx`**

在文件上传分支中：
1. `.md` 文件上传后，先用 `parseQuestionsFromMd` 尝试解析
2. 如果成功解析出题目（≥1 道有效题），直接进入预览
3. 如果解析结果为 0，走原有逻辑（填充到提示词框 → AI 解析）

**3.3 模板下载功能（应对审查 #2 问题 2）**

在 ImportModal 中增加"下载模板"按钮：
- 导出一个示例 .md 文件
- 内容为标准化格式的 2-3 道示例题
- 让用户可以直接编辑后上传

---

## Phase 4 — 用户体验优化

### 整体用户流程

```
[打开导入弹窗]
    │
    ├─ 拖拽/选择文件 ─────────────────────────────┐
    │  (PDF / DOCX / MD / CSV / JSON / TXT)       │
    │                                              │
    ├─ PDF ──→ OCR 弹窗（扫描件检测）──→ AI 视觉/OCR ──┐
    │                                                  │
    ├─ DOCX ──→ mammoth 提取                          │
    │             ├─ 有图片且开关开启 ──→ 公式识别进度   │
    │             └─ 无图片或开关关闭 ──→ 直接下一步    │
    │                                                  │
    ├─ MD ────→ 尝试标准化解析                         │
    │             ├─ 成功匹配格式 ──→ 直接出预览        │
    │             └─ 不匹配 ──→ 填充到提示词框          │
    │                                                  │
    └─ CSV/JSON ──→ 直接解析 → 预览                    │
                                                       │
    [题目预览区] (含 LaTeX 渲染)                       │
         │                                              │
         └─ 确认 → 选择科目 → 导入数据库               │
                                                       │
    [也支持直接输入纯文本 → AI 生成题目 → 预览]
```

### 4.1 公式识别进度条（已涵盖在 Phase 1.4）

### 4.2 预览中渲染 LaTeX（应对审查 #2 问题 4）

ImportModal 现有的预览区域是表格形式，改为：
- 每道题用卡片显示
- 题干使用 `MarkdownRenderer` 渲染（自动渲染 LaTeX）
- 选项逐行显示
- 答案/解析展开显示

**注意**：此改动影响较大，Preview 区域代码复杂。建议作为独立子任务，先实现功能再美化。

### 4.3 错误处理与降级（应对审查 #2 问题 3、审查 #3 问题 1/4）

| 场景 | 处理方式 |
|---|---|
| 图片太小 (<100 bytes base64) | 跳过 AI 识别，走图片上传 |
| AI vision 调用失败 | 标记为"公式识别失败"，原图保留为图片链接 |
| 所有 AI key 均未配置 | 自动关闭公式识别开关，提示"配置 API Key 以启用公式识别" |
| 整篇文档无图片 | 不触发公式识别步骤 |
| 单张图片识别超时 (15s) | 跳过，原图保留 |
| 标准化 MD 格式不匹配 | 走 AI 解析兜底 |

---

## 实施顺序与依赖

```
Phase 1.1 (formulaService.ts 新建)
    │
    ├──→ Phase 1.2 (ImportModal DOCX 分支改造)
    │         │
    │         └──→ Phase 4.1 (进度条)
    │
    ├──→ Phase 2.1 (AI prompt 优化)
    │
    └──→ Phase 4.3 (错误处理)
    
Phase 3.1 (mdParserService.ts 新建)
    │
    ├──→ Phase 3.2 (ImportModal MD 分支改造)
    │
    └──→ Phase 3.3 (模板下载)
    
Phase 4.2 (预览渲染 LaTeX — 可并行)
```

**推荐实施批次：**
- **批次 A** (核心可用)：Phase 1.1 + 1.2 + 4.3 + 2.1 → DOCX 公式可识别
- **批次 B** (强化导入)：Phase 3.1 + 3.2 + 3.3 → 标准化 MD 可批量导入
- **批次 C** (体验优化)：Phase 4.1 + 4.2 → UI/UX 完善

---

## 文件变更清单（最终版）

| 文件 | 改动 | 批次 |
|---|---|---|
| `src/services/formulaService.ts` | **新建** — 公式识别核心逻辑 | A |
| `src/services/mdParserService.ts` | **新建** — 标准化 MD 解析 | B |
| `src/services/geminiService.ts` | SYSTEM_PROMPT 公式保留指令增强 | A |
| `src/components/ImportModal.tsx` | DOCX 公式识别、MD 直接解析、进度、开关 | A+B |
| `PLAN-formula-support.md` | 本计划文档 | - |

