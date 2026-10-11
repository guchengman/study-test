# Study-test（全科题库）前端 · 操作习惯一致性审计与整改说明
> 【已归档 2026-10-11】本文是一次性历史产物，内容可能过时。现行文档见 [docs/README.md](../README.md) 索引。

> 审计人：高见远（软件架构师）
> 审计范围：React 19 + TypeScript + Vite 6 + Tailwind v4 + react-router v7 + lucide-react 全部业务模块
> 维度：弹窗模式 / 确认操作 / 按钮位 / Loading / 错误反馈 / 表单校验 / 导航返回 / 空状态 / 状态同步 / 图标视觉
> 说明：以下所有结论均基于实际读取的源码，并标注 `文件:行号` 证据；未读取的文件已在本文档末尾“核实边界”中标注。

---

## 一、模块清单与边界

| 模块 | 职责 | 关键文件 |
|---|---|---|
| 首页/题库入口 | 科目切换、练习/考试模式入口、空状态引导 | `src/pages/HomePage.tsx`、`src/components/app/WelcomeScreen.tsx`、`src/components/app/AppHeader.tsx`、`src/components/app/AppLayout.tsx` |
| 练习答题 | 随机/错题/全量/收藏练习、即时反馈、剔题/去重/导出 | `src/pages/ExamPage.tsx`、`src/components/app/ExamScreen.tsx`、`src/hooks/useExam.ts` |
| 正式考试 | 限时考试、交卷、成绩与错题回顾 | `src/pages/FormalExamPage.tsx`、`src/components/app/FormalExamScreen.tsx`、`src/hooks/useFormalExam.ts`、`src/components/app/FormalResultScreen.tsx`、`src/hooks/useBackPrevention.ts` |
| 练习成绩 | 练习结果、逐题解析 | `src/pages/ResultPage.tsx`、`src/components/app/ResultScreen.tsx` |
| 题目导入 | PDF/Word/MD/CSV/OCR/AI 解析、预览、确认导入 | `src/components/ImportModal.tsx`、`src/components/import/*`、`src/services/extract/*` |
| 科目/学生管理 | 科目增删改/共享、邀请码、学生管理、选择共享学生 | `src/components/JoinSubjectModal.tsx`、`SubjectShareCode.tsx`、`StudentManagementModal.tsx`、`StudentSelectorModal.tsx` |
| 设置/账户 | API 设置、登录注册、角色切换、帮助、修改密码 | `src/components/SettingsModal.tsx`、`LoginModal.tsx`、`RoleSwitchModal.tsx`、`HelpModal.tsx`、`src/hooks/useAuth.ts` |
| 通用组件 | 确认弹窗、Markdown、Toast、UI 状态、全局 Context | `src/components/ConfirmModal.tsx`、`MarkdownEditor.tsx`、`MarkdownRenderer.tsx`、`src/hooks/useToast.ts`、`useUIState.ts`、`src/context/AppContext.tsx` |

---

## 二、一致性审计维度总表

| # | 维度 | 现状是否一致 | 典型差异（证据指向） |
|---|---|---|---|
| 1 | 弹窗/Modal 模式 | **不一致（严重）** | 无统一底座：overlay 类名/圆角/动画/点击遮罩关闭/z-index 各不相同；LoginModal 用 CSS 类 + 内联样式，自成体系（见 §三 IC-1） |
| 2 | 确认操作 | **不一致（严重）** | 删用户走 ConfirmModal，但删科目用自定义红渐变弹窗、退订/清除 Key 用原生 confirm、学生管理删/移除/重置密码无确认（IC-2） |
| 3 | 按钮与操作位 | **不一致** | 主操作色 blue/indigo/emerald/purple/rose 混用；“完成/确定/确认/提交”文案不统一；退出页“取消”为蓝主操作（IC-4、IC-5） |
| 4 | Loading 状态 | **不一致** | 按钮内 Loader2 + disabled、居中 Loader2、原生 CSS 圆点 spinner（FormalExam/FormalResult）、全屏进度遮罩 四种并存（IC-6） |
| 5 | 错误与反馈 | **不一致** | Toast vs 行内；错误用 red 系 vs rose 系；ImportTabs 错误误用 Info 图标；StudentManagement 自实现 toast 不走全局（IC-7） |
| 6 | 表单与校验 | **不一致** | LoginModal 内联 inputStyle；聚焦环 蓝/靛 不一；修改密码输入无 focus 色；无统一必填高亮（IC-8） |
| 7 | 导航与返回 | **不一致** | useBackPrevention 仅 AppLayout 全局拦截，文案“离开应用页面”对考试页不区分；练习页内返回无确认、浏览器返回有确认；正式考试另有 ConfirmModal 退出——两条路径并存（IC-9） |
| 8 | 空状态/空数据 | **不一致** | 纯文字 py-4 / py-6 / 图标卡片 / inline 并存（IC-10） |
| 9 | 状态同步 | **不一致** | AppContext 聚合 hooks，但 StudentManagement 自维护 toast；modal 状态在 useUIState 内混用 boolean 与 object；localStorage 散落（IC-11） |
| 10 | 图标与视觉语言 | **部分一致** | ConfirmModal 定义了 危险=rose/警告=amber/信息=blue，但主操作色出现 purple/green/indigo/rose，未形成“红=危险/绿=成功”全局纪律；X 关闭按钮外观零散（IC-4、IC-12） |

---

## 三、具体差异发现（核心）

> 每条给出 `文件:行号` 证据、现状 A vs 现状 B、影响（用户认知 / 维护成本）。

### IC-1　弹窗底座未统一封装（维度 1，P0）
- **证据**：
  - `ConfirmModal.tsx:58-66` overlay=`bg-black/40 backdrop-blur-sm z-[1001]`，`rounded-3xl`，CSS keyframe `modalSlideIn`，点击遮罩关闭（`onClick={onCancel}` 行60），卡片 `stopPropagation`（行64）。
  - `ImportModal.tsx:673` overlay=`bg-slate-900/60 backdrop-blur-sm z-50`，`rounded-3xl`，motion，**无**点击遮罩关闭，仅 X 关闭。
  - `JoinSubjectModal.tsx:46`、`StudentManagementModal.tsx:95`、`SettingsModal.tsx:306`、`RoleSwitchModal.tsx:101`、`HelpModal.tsx:823` 均为 overlay=`bg-slate-900/60 backdrop-blur-sm z-50` + `rounded-2xl` + motion，**均无**点击遮罩关闭。
  - `StudentSelectorModal.tsx:75` overlay=`bg-black/50 z-[100] p-4`（**无** backdrop-blur），**有**点击遮罩关闭（`onClick={saving?undefined:onClose}`），**无** motion。
  - `LoginModal.tsx:1174` 使用 `.modal-overlay`/`.modal-content` 类（`src/index.css:4-24`），有点击关闭、ESC（行84-91）、焦点陷阱（行94-112）；输入/按钮用内联 `style`（行386-395、551-568）硬编码 hex。
  - `AppLayout.tsx` 内联弹窗：用户管理 `bg-black/50 backdrop-blur-sm z-50`（行168）、修改密码（行332）、系统初始化（行378）、科目管理（行496）、科目删除 `AnimatePresence`+`bg-black/50 backdrop-blur-sm z-[100]`+点击关闭（行955-957）、退出应用 `bg-black/50 backdrop-blur-sm z-[1001]`（行1030）。
  - `import/*`：`OcrDialog.tsx:31` overlay=`bg-black/50 backdrop-blur-sm z-50`；`PaddleOcrSettings.tsx:30`=`bg-black/50 backdrop-blur-sm z-[60]`；`SubjectPicker.tsx:42`=`bg-slate-900/60 backdrop-blur-sm z-50`。
- **现状 A vs B**：A = 用 `.modal-overlay`/`.modal-content` + 内联样式 + 点击关闭 + ESC + 焦点陷阱（LoginModal）；B = 用 Tailwind 手写 overlay/card + motion + 无点击关闭（其余多数）；C = 自定义红渐变弹窗、z-index 与圆角各异（AppLayout 科目删除）。
- **影响**：① 每个新增弹窗都重复实现遮罩/动画/滚动锁，维护成本高；② 点击遮罩是否关闭、圆角 2xl/3xl、z-index（z-50 / z-[60] / z-[100] / z-[1001]）不一致，用户行为预期割裂；③ 嵌套弹窗 z-index 缺乏统一规则（OcrDialog z-50 与父 ImportModal z-50 同层，PaddleOcrSettings 用 z-[60] 临时补位），易叠加错乱。

### IC-2　危险/关键操作未统一走 ConfirmModal（维度 2，P0）
- **证据**：
  - 已统一：删除用户 / 注销账号 / 退出登录 走 ConfirmModal（`AppLayout.tsx:235-283`）。
  - 删除科目：**自定义**红渐变弹窗，非 ConfirmModal（`AppLayout.tsx:948-1026`）。
  - 退订科目：原生 `confirm()`（`AppLayout.tsx:603`）。
  - 清除所有 API Key：原生 `confirm()`（`SettingsModal.tsx:416`）。
  - 学生管理：删除邀请码 / 移除学生 / 重置密码 **直接执行，无确认**（`StudentManagementModal.tsx:54,69,74`）。
  - 练习剔题 / 去重 / 仅客观题：行内 yes/no（`ExamScreen.tsx:206-244,281-305`）。
  - 正式考试结束 / 退出：已走 ConfirmModal（✅ `FormalExamScreen.tsx:245-271`）。
- **现状 A vs B**：A = 危险操作用 ConfirmModal 二次确认；B = 同样危险（删科目、删邀请码、移除学生、重置密码）却无确认或用原生弹窗。
- **影响**：① 高危误操作风险（删科目/移除学生/重置密码无二次确认）；② 与已建立的 ConfirmModal 规范割裂，用户无法形成“弹窗=危险确认”的稳定预期。

### IC-3　原生 alert()/confirm() 用于错误与确认（维度 2/5，P1）
- **证据**：`SubjectShareCode.tsx:45` `alert('生成邀请码失败...')`；`StudentSelectorModal.tsx:66` `alert('保存失败...')`；`AppLayout.tsx:603` `confirm(...)`；`SettingsModal.tsx:416` `confirm(...)`。
- **影响**：原生弹窗样式与产品完全割裂，移动端体验差，且违背“统一 Modal”目标；无法受主题/动画控制。

### IC-4　主操作按钮颜色语义不统一（维度 3/10，P1）
- **证据**：
  - 蓝 `blue-600`：JoinSubject(77)、Settings(435)、AppLayout 修改密码(368)/初始化(485)/科目保存(937)、ResultScreen(65)、FormalResultScreen(195)、ImportTabs AI 解析(395)。
  - 靛蓝 `indigo-600`：StudentSelector(139)、RoleSwitch(312)、WelcomeScreen import(304)、ImportModal 导入入口(129)。
  - 翠绿 `emerald-600`：SubjectShareCode 生成(79)、WelcomeScreen 随机(156)、PreviewList 确认导入(37)、ExamScreen 提交(612)。
  - 紫 `purple-600`：ImportModal 展开“完成”(800)、ImportTabs 生成题目(315)。
  - 玫红/红：AppLayout 科目删除(593,1018)、ExamScreen 剔除(294)。
  - **同一 ImportModal 内部**即出现 蓝(解析)/紫(生成、完成)/绿(确认导入) 三色主操作，且展开“完成”在行800 为紫、行851 为蓝并存。
- **影响**：用户无法建立“主操作=某色”的稳定心智模型；尤其“确认导入”用绿、其余确认用蓝，语义混乱。

### IC-5　确认/提交按钮文案不统一（维度 3，P2）
- **证据**：ConfirmModal 默认确认文案=`确定`（`ConfirmModal.tsx:19`）；但科目用“确认删除/确认切换/确认初始化/确认修改”（`AppLayout.tsx:241,971,1018`；`RoleSwitch.tsx:315`；`AppLayout.tsx:485,937`）；Import 用“完成”（`ImportModal.tsx:802,852`）；PreviewList 用“确认导入”(37)；登录/注册用“注册/登录/重置密码”。
- **额外**：`AppLayout.tsx:1039-1051` 退出应用弹窗中“取消”为蓝色主操作、“退出”为灰色副操作，**语义反转**（其余弹窗“取消”均为中性副操作）。
- **影响**：文案无规范，认知负担；取消/确认的主次关系在个别弹窗被反转。

### IC-6　Loading 状态无统一组件（维度 4，P1）
- **证据**：
  - 按钮内 `Loader2 animate-spin` + disabled：JoinSubject(78)、StudentManagement(135)、Settings(437)、RoleSwitch(314)、AppLayout 修改密码(369)、ImportTabs(317,397)。
  - 居中 `Loader2` + “加载中...”：Settings(373-377)、StudentManagement(125)。
  - **原生 CSS 圆点 spinner**：`FormalExamScreen.tsx:238`、`FormalResultScreen.tsx:126`（`<span className="w-4 h-4 border-2 border-slate-300 border-t-blue-500 rounded-full animate-spin" />`）。
  - 全屏进度遮罩：ImportModal OCR(`ImportModal.tsx:595-669`)。
- **影响**：至少两套 spinner 实现（lucide Loader2 vs 原生 CSS 圆点），加载态位置/风格不统一，新增异步操作时易各自发挥。

### IC-7　错误与反馈通道不统一（维度 5，P1）
- **证据**：
  - 全局 Toast：`AppLayout.tsx:93-106` `bg-slate-800` + CheckCircle2 emerald。
  - **StudentManagement 自实现 toast**：`StudentManagementModal.tsx:21-23`（本地 `toast`/`showToast`）+ 行211 渲染，视觉与全局不同且**不走 context**。
  - 行内错误 red 系：JoinSubject `bg-red-50 text-red-500`(67)、Settings `bg-red-50 border-red-100 text-red-600`(405)、RoleSwitch `bg-red-50 border-red-100 text-red-600`(290)。
  - 行内错误 rose 系：ImportTabs `bg-rose-50 border-rose-200 text-rose-700`(403-408) **且误用 Info 图标**（语义错误）、ExamScreen 确认条 `bg-rose-50`(285)、FormalResultScreen `text-rose-500`(130)。
  - 原生 alert：SubjectShareCode(45)、StudentSelector(66)。
- **影响**：① 错误用 red 还是 rose 不统一；② 成功反馈既有全局 Toast 又有行内绿、又有本地 toast；③ 部分模块绕过全局 Toast，提示位置/样式不一致；④ 错误误用 Info 图标误导用户。

### IC-8　表单输入样式/聚焦环/校验不统一（维度 6，P1）
- **证据**：
  - LoginModal 用内联 `inputStyle`（`LoginModal.tsx:386-395`）：`1px solid #e2e8f0`、`borderRadius:10px`、无 Tailwind 类；错误框内联 hex；`required` + 手动校验（行187-237 等）。
  - 其余：JoinSubject/Settings `border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500`(JoinSubject:65; Settings:142,263,284)。
  - RoleSwitch 聚焦环为靛蓝 `focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500`(211,255,269)。
  - 科目编辑 `border-2 border-slate-200 focus:border-blue-500`(AppLayout:817,865,876)。
  - **修改密码输入 `bg-slate-50 border rounded-xl text-sm`（AppLayout:340,344,348）无 focus:border 颜色**，聚焦态不可见。
- **影响**：聚焦态颜色（蓝/靛）与有无聚焦环不一致；LoginModal 是孤立样式体系；无统一必填高亮/错误图标规范，校验体验零散。

### IC-9　导航/返回/离开考试未统一（维度 7，P0/P1）
- **证据**：
  - `useBackPrevention` 仅在 `AppLayout.tsx:51` 全局拦截 `popstate`，渲染通用“退出应用”弹窗（行1029-1054）：文案“点击返回将离开应用页面”，按钮“取消”(蓝主)/“退出”(灰副)，语义反转；且**对所有页面（含考试）一律相同**。
  - 练习 `ExamScreen.tsx:163-169` 页内“返回上一级”→ `setStatus('welcome')` **直接返回，无确认**；但浏览器返回触发上述通用确认 → 页内 vs 浏览器返回行为不一致。
  - 正式考试 `FormalExamScreen.tsx:259-271` 页内“退出”→ ConfirmModal “退出考试”(warning，“已作答内容会自动保留”)；`245-257` “结束考试”→ ConfirmModal danger。该弹窗与全局 popstate 通用弹窗**并存**，两套“退出”文案/严重度不同。
  - 练习（随机/错题等）回首页无确认，正式考试需确认 → 两类考试返回策略不一致。
- **影响**：① 考试中断/离开路径认知不一致；② 练习可无确认直接丢进度，正式考试需确认，存在数据丢失风险与体验割裂；③ 通用弹窗“取消=蓝主/退出=灰副”语义反转，易点错。

### IC-10　空状态展示不统一（维度 8，P2）
- **证据**：StudentManagementModal 列表空 `text-center text-sm text-slate-400 py-4`(139,160,173,186)；StudentSelectorModal 空 `text-sm text-slate-400 text-center py-6`(89-90)；ImportTabs 历史空 图标+文字卡片(300-306)；FormalResultScreen 错题空 `text-slate-500 text-sm py-6 text-center`(132-135)；ExamScreen 空题库 图标卡+按钮(111-139)；FormalExamScreen 空卷 文字+按钮(63-76)。
- **影响**：纯文字 py-4/py-6、图标卡片、inline 三种并存，间距与风格不统一，弱空状态缺乏统一的引导行动点。

### IC-11　模块间状态共享方式不统一（维度 9，P2）
- **证据**：
  - AppContext 已聚合 useAuth/useToast/useUIState/useQuestionBank/useExam（`AppContext.tsx:8-12`），全局 Toast 走 context（`setShowToast`）。
  - 但 StudentManagementModal 自维护 `toast`/`showToast`（`StudentManagementModal.tsx:21-23`），未用 context。
  - modal 可见性：多数用 useUIState 的 boolean（`isImportModalOpen` 等，`useUIState.ts:20-54`）；但 `studentSelectorSubject` 用对象(:54)、`subjectToDelete` 用对象(:41)、`userActionConfirm` 用对象(:50)——同一 useUIState 内混用 boolean 与 object 两种范式。
  - localStorage 散落：ImportModal(`last_selected_model`/prompt history/paddle keys，行49,73,78,102)、useAuth(验证码，行162-164)、ImportTabs(`localStorage.setItem('last_selected_model')` 行347)、`localStorage.getItem('ai_settings')`(ImportTabs:337)。无统一存储封装。
- **影响**：刷新后部分状态来源不透明；modal 状态两种范式增加心智负担；StudentManagement 的 toast 不走全局通道，提示位置/样式不一致；localStorage key 散落难维护。

### IC-12　关闭按钮(X)与图标视觉语言零散（维度 10，P2）
- **证据**：X 按钮多数 `p-1.5 hover:bg-slate-100 rounded-lg text-slate-400`（JoinSubject:54、Settings:331、RoleSwitch:122、HelpModal:840、AppLayout:175,385,507）；ImportModal/Settings header 用 `p-2 hover:bg-slate-100 rounded-full`（ImportModal:696）；LoginModal X 为绝对定位内联样式（`LoginModal.tsx:1184-1203`）。
- **影响**：关闭手势外观（rounded-lg vs rounded-full、p-1.5 vs p-2）零散；图标语义色（见 IC-4）未形成“红=危险/绿=成功”全局纪律。

---

## 四、整改建议（Standard Pattern）

> 目标：以“**统一底座 + 少量语义组件 + 约定**”收敛差异。所有弹窗/确认/反馈/表单/加载/空状态均复用同一套底座。

| 编号 | 整改项 | 建议统一规范 | 优先级 |
|---|---|---|---|
| P-1 | 统一 Modal 底座 | 封装 `<AppModal open onClose title {children}>`：overlay 统一 `bg-slate-900/60 backdrop-blur-sm`、统一 z 层级（基础 `z-50`，嵌套 `z-[60]` 递增）、`rounded-2xl`、统一进入动画、点击遮罩关闭 + ESC + 焦点陷阱、滚动锁。所有现有弹窗改为包裹 AppModal，删除各自重复实现；LoginModal 弃用 `.modal-overlay`/`.modal-content` 与内联样式（IC-1、IC-12） | P0 |
| P-2 | 统一危险/关键确认 | 升级 `ConfirmModal` 为 `<AppConfirm type=info|warning|danger>`，作为**唯一**确认通道。迁移：科目删除、退订科目、清除 API Key、学生管理 删邀请码/移除学生/重置密码、练习剔题/去重/仅客观题，全部走 AppConfirm；删除所有 `confirm()`/`alert()`（IC-2、IC-3） | P0 |
| P-3 | 统一返回/离开（尤其考试） | `useBackPrevention` 场景化：区分“练习”与“正式考试”文案与严重度，且与页内返回逻辑共用同一确认组件；练习页内“返回首页”也须经确认（或显式丢弃进度），消除页内 vs 浏览器返回差异；收敛全局“退出应用”弹窗的按钮主次（取消=中性副，离开=危险主）（IC-9） | P0 |
| P-4 | 统一主操作按钮 | 封装 `<PrimaryButton>`/`<DangerButton>`/`<SuccessButton>`，全局语义 token：primary=`blue-600`、danger=`rose-600`、success=`emerald-600`；导入流的“确认导入”改 blue 或 success 统一；禁止在业务里散写 purple/indigo 作主操作色（IC-4、IC-12） | P1 |
| P-5 | 统一 Loading | 封装 `<Spinner size>`（基于 lucide `Loader2` 标准版）+ 三种用法：按钮内（Loader2 + disabled）、行内（居中 Loader2 + 文案）、全屏遮罩（进度条）。替换 FormalExam/FormalResult 的原生 CSS 圆点 spinner 与各处 inline 实现（IC-6） | P1 |
| P-6 | 统一错误/成功反馈 | 行内错误/成功封装 `<InlineError>`/`<InlineSuccess>`，**统一用 red 系**（禁用 rose 混用），错误用 `AlertTriangle` 不用 `Info`；所有成功/结果提示统一走 context Toast（迁移 StudentManagement 本地 toast）（IC-7） | P1 |
| P-7 | 统一表单与校验 | 封装 `<TextField>`：聚焦环统一 `focus:border-blue-500 focus:ring-1 focus:ring-blue-500`；补齐修改密码输入的 focus 色；LoginModal 改为 Tailwind 体系；定义必填/错误高亮规范（红框 + 行内错误 + 图标）（IC-8） | P1 |
| P-8 | 统一按钮文案 | 约定：确认=“确定/确认”（危险操作为“确认删除/确认移除”等明确动词）；取消=“取消”；主操作禁用“完成”这类模糊词（Import 展开统一为“保存”）。取消恒为中性副操作（IC-5） | P2 |
| P-9 | 统一空状态 | 封装 `<EmptyState icon title action?>`，统一间距（如 `py-8`）、图标灰阶与可选操作按钮（IC-10） | P2 |
| P-10 | 统一状态共享 | modal 可见性统一为 boolean 或统一为对象（二选一并全量改造 useUIState）；成功反馈一律用 context Toast，禁止组件自维护 toast；封装 `storageGet/storageSet` 收敛 localStorage key（IC-11） | P2 |

---

## 五、整改落地任务清单（按依赖顺序）

> 依赖说明：T1 是其余所有任务的基础（底座/语义组件）；T2–T7 各自独立改造一类交互，仅依赖 T1；T8 收尾规范化与状态治理。

| 任务 | 文件级改动 | 依赖 | 工作量 |
|---|---|---|---|
| **T1** 建立统一 UI 底座（`AppModal`/`AppConfirm`/`Spinner`/`InlineError`/`InlineSuccess`/`TextField`/`EmptyState`/`PrimaryButton` 等） | 新增 `src/components/ui/AppModal.tsx`、`AppConfirm.tsx`、`Spinner.tsx`、`Field.tsx`、`Feedback.tsx`、`EmptyState.tsx`、`Button.tsx`；`src/context/AppContext.tsx` 注入统一反馈方法 | — | L |
| **T2** 全量弹窗包裹 AppModal，删除重复底座 | `ImportModal.tsx`、`JoinSubjectModal.tsx`、`StudentManagementModal.tsx`、`StudentSelectorModal.tsx`、`SettingsModal.tsx`、`LoginModal.tsx`（弃用 `index.css:4-24` 类与内联样式）、`RoleSwitchModal.tsx`、`HelpModal.tsx`、`AppLayout.tsx`（内联弹窗）、`import/OcrDialog.tsx`、`PaddleOcrSettings.tsx`、`SubjectPicker.tsx` | T1 | L |
| **T3** 危险/关键操作统一走 AppConfirm，清除原生 confirm/alert | `AppLayout.tsx`（科目删除 948-1026、退订 603）、`SettingsModal.tsx:416`、`StudentManagementModal.tsx:54,69,74`、`ExamScreen.tsx:206-305` | T1 | L |
| **T4** 主操作按钮与语义色统一 | 上述全部含按钮的组件；重点 `ImportModal.tsx:800,851`、`ImportTabs.tsx:315,395`、`PreviewList.tsx:37`、`StudentSelectorModal.tsx`、`RoleSwitchModal.tsx`、`SubjectShareCode.tsx`、`WelcomeScreen.tsx` | T1 | M |
| **T5** Loading/错误/成功反馈统一 | 新增 Spinner/Feedback 组件；改造 `FormalExamScreen.tsx:238`、`FormalResultScreen.tsx:126`、`ImportTabs.tsx:403`、`JoinSubjectModal.tsx:67`、`SettingsModal.tsx:405`、`RoleSwitchModal.tsx:290`、`StudentManagementModal.tsx:21-23,211`（本地 toast 迁全局）、`SubjectShareCode.tsx:45`、`StudentSelectorModal.tsx:66` | T1 | M |
| **T6** 表单输入与校验统一 | 新增 TextField；改造 `LoginModal.tsx:386-395` 等内联输入、`AppLayout.tsx:340,344,348`（补 focus 环）、`JoinSubjectModal.tsx`、`SettingsModal.tsx`、`RoleSwitchModal.tsx` | T1 | L |
| **T7** 导航/返回/考试中断统一 | `useBackPrevention.ts`、`AppLayout.tsx:1029-1054`（场景化文案+按钮主次）、`ExamScreen.tsx:163-169`（页内返回加确认）、`FormalExamScreen.tsx`（与全局一致） | T1 | M |
| **T8** 空状态与状态共享规范化 | 新增 EmptyState；改造 `StudentManagementModal.tsx`、`StudentSelectorModal.tsx`、`ImportTabs.tsx:300`、`FormalResultScreen.tsx:132`、`ExamScreen.tsx:111`、`FormalExamScreen.tsx:63`；治理 `useUIState.ts`（modal 状态范式统一）、`StudentManagementModal.tsx` toast、`localStorage` 散落点收敛 | T1,T3 | M |

---

## 六、待确认事项（需产品/用户拍板）

1. **确认弹窗默认聚焦哪个按钮？** 删除/危险用 `ConfirmModal` 后，默认聚焦“取消”（防误触）还是“确认”？当前 ConfirmModal 未设置初始聚焦（见 `ConfirmModal.tsx:15-24`）。
2. **主操作语义色最终规范**：导入流“确认导入”是否定为 `success(emerald)` 还是统一 `primary(blue)`？练习“提交试卷”当前为 emerald（ExamScreen:612），是否与“确认导入”保持一致？
3. **考试返回策略**：练习（随机/错题/全量/收藏）是否也应像正式考试一样“离开需二次确认并保留进度”？还是练习允许无确认直接返回、仅正式考试强确认？这决定 IC-9 的收敛方向。
4. **原生弹窗去留**：清除 API Key、退订科目等目前用原生 `confirm()`，迁移到 AppConfirm 后是否保留“可逆/可恢复”提示文案（这些操作部分可恢复），需在 type 语义上区分 warning(可恢复) vs danger(不可恢复)。
5. **Tailwind v4 主题 token**：是否接受在 `index.css`/`theme` 中新增语义色 token（如 `--color-danger`、`--color-success`）以支撑 Button/Field 的全局一致性？（当前多为散写 `blue-600`/`rose-600`/`emerald-600`。）

---

## 核实边界（未充分核实部分）

以下文件在本次审计中**未逐行打开**，相关维度结论如需 100% 落锤建议补充核对：
- `src/pages/ExamPage.tsx`、`src/pages/FormalExamPage.tsx`：仅通过子组件与 `useBackPrevention` 的 import 关系推断，未读页面级包裹逻辑。
- `src/components/MarkdownEditor.tsx`、`src/components/MarkdownRenderer.tsx`：作为通用组件被多处引用，但其自身交互（如编辑态校验）未单独审计。
- `src/hooks/useQuestionBank.ts`、`src/questionBank.ts`、`src/services/*`、`src/shared/scoring/*`：数据/服务层，不在本次“操作习惯一致性”10 维度重点内，未打开。
- `src/components/import/SubjectPicker.tsx`、`OcrDialog.tsx`、`PaddleOcrSettings.tsx`、`questionConvert.tsx`、`subjectName.tsx`：仅通过 grep 确认其 overlay 类名与 z-index（§IC-1 证据），未读完整交互。

> 其余所有 §三 证据均来自已实际打开并标注行号的源文件。
