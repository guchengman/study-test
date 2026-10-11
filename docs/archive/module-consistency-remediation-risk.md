# Study-test 一致性整改方案（T1~T8）破坏性风险评审
> 【已归档 2026-10-11】本文是一次性历史产物，内容可能过时。现行文档见 [docs/README.md](../README.md) 索引。

> 评审人：高见远（软件架构师）
> 评审对象：`docs/module-consistency-audit.md` 第五章 T1~T8 落地任务
> 方法：逐项对照 `src/` 真实代码（本轮实际打开核实），评估每项改动是否可能造成 **功能断裂 / 数据丢失 / 视觉回归 / 行为不一致 / 构建失败**。
> 所有 `文件:行号` 均为本轮实际读取核实；未充分核实的部分见文末第六节。

---

## 一、风险总览表

| 任务 | 风险等级 | 主要破坏类型 | 爆炸半径 | 一句话结论 |
|---|---|---|---|---|
| T1 UI 底座（新增 ui/*） | 🟢 低 | （间接）API 契约缺陷 → 下游全部任务故障源 | 0 个现有文件（纯增量），但契约影响 T2~T8 全部 | 本身安全；**必须先锁 API 契约**（见 §四.1） |
| T2 全量弹窗包裹 AppModal | 🔴 高 | 功能断裂 + 数据丢失（表单态） | 12+ 文件，含 **登录（核心链路）**、**导入（核心链路）** | LoginModal 的 ref 状态机与 ImportModal 的未保存态是两颗雷 |
| T3 危险操作统一 AppConfirm | 🔴 高 | 数据丢失（守卫逻辑丢失）/ 破坏性操作失控 | 4 文件 5 处，含科目删除（级联删题） | 迁移的不是弹窗，是**回调里的级联状态逻辑** |
| T4 主操作按钮语义色 | 🟡 中 | 视觉回归 + 误伤状态语义色 | ~10 文件，非核心逻辑 | 批量替换会误伤"状态指示色"，需人工逐处 |
| T5 Loading/反馈统一 | 🟡 中 | 行为不一致（loading 判定错位、toast 被遮挡） | ~9 文件 | spinner 替换本身低危；**toast 迁全局有 z-index 遮挡陷阱** |
| T6 LoginModal 改 Tailwind/TextField | 🔴 高 | 功能断裂（auth 核心链路） | 1 文件但 1216 行、4 个表单流程 | 样式改动安全，风险在**大 diff 夹带逻辑变更**与 required/autoComplete 丢失 |
| T7 导航/返回/考试中断统一 | 🔴 高（最高危） | 功能断裂 + 数据丢失（进度） | 4 文件，覆盖**全部页面**的返回行为 | `useBackPrevention` 是脆弱的隐式状态机，改错即"困死用户"或"一键丢进度" |
| T8 状态共享治理 | 🔴 高 | 数据丢失（localStorage）+ 功能断裂（payload 丢失） | useUIState 30+ 消费点 + 5 组 localStorage key | object 状态不是"范式不统一"，是**带业务 payload**；key 改名=用户数据蒸发 |

🔴 高危：**T2、T3、T6、T7、T8**（共 5 项）　🟡 中危：T4、T5　🟢 低危：T1

---

## 二、🔴 高危项深析

### R-T7　导航/返回/考试中断统一 —— 全场最高危

**破坏类型**：功能断裂（返回被永久吞掉/完全失效）+ 数据丢失（练习/考试进度）。
**爆炸半径**：`useBackPrevention.ts`、`AppLayout.tsx`、`ExamScreen.tsx`、`FormalExamScreen.tsx` —— 但行为上覆盖**应用内所有页面**的浏览器返回键，含考试核心链路。

**证据（当前实现是一台"隐式状态机"，文档没写出来的行为比写出来的多）**：

1. `useBackPrevention.ts:7-18`：仅在 **mount 时 pushState 一次**守卫条目（deps=`[]`）。用户按返回 → popstate 弹出守卫条目 → 弹窗出现。守卫条目是**一次性的**。
2. `useBackPrevention.ts:20-22`：`confirmExit` **只做 `setShowExitPrompt(false)`，不做任何导航**。即用户点"退出"后其实**留在应用里**；且 `handlingRef.current` 保持 `true` 永不重置 → 此后所有 popstate 在 `:11` 被 early-return 吞掉、弹窗永不再出现 → **下一次按返回才真正离开**。"退出"按钮的真实语义是"解除拦截"，不是"退出"。
3. `useBackPrevention.ts:24-29`：`cancelExit` 依赖 `history.forward()` + **`setTimeout 100ms` 竞态**等 forward 触发的 popstate 被吞掉后再复位标志。
4. `ExamScreen.tsx:163-169`：练习页内返回是 `setStatus('welcome')` —— **状态机切换，不是路由跳转**。
5. `FormalExamScreen.tsx:259-271`：正式考试自带 `ConfirmModal` 退出（依赖 `onBack` 回调）；与全局 popstate 弹窗（`AppLayout.tsx:1029-1054`）**是两套互不知晓的系统**。
6. 全库 grep 证实：**没有任何 `beforeunload` 拦截**（仅 `useBackPrevention.ts:16` 一处 popstate）。刷新/关标签页本来就会直接丢练习进度——整改者若误以为存在刷新保护而"顺手合并"，会引入不存在的假设。
7. `AppLayout.tsx:57`：`navigate('/', { replace: true })` 等 react-router v7 路由跳转与 `pushState` 守卫**共用同一 history 栈**。当前 pushState 完全绕过 router。

**触发条件（怎么炸）**：
- 若把弹窗换成 AppConfirm 且"修复"了 `handlingRef` 不重置的"bug"：每次返回都弹窗且守卫条目已被消耗 → 第二次"取消"时 `history.forward()` 前进到的不再是守卫条目 → **拦截错乱，用户按 N 次返回都离不开或直接离开**。
- 若改为 react-router blocker 来"合并页内返回"：`ExamScreen.tsx:164` 的返回根本不走路由，blocker 拦不到；而 SPA 内部 navigate 产生的历史条目会让守卫条目位置漂移。
- 若给练习页内返回加确认时直接复用 `confirmExit`/`cancelExit`：`cancelExit` 的 `history.forward()` 会在没有 popstate 场景下**把用户往前推一个真实历史条目**，页面莫名跳转。
- 若 AppConfirm 关闭带退出动画（AnimatePresence）：`setTimeout 100ms` 竞态窗口与动画时长叠加，`handlingRef` 复位时机错误 → 拦截时灵时不灵。

**缓解措施**：
1. **先写行为规格再动代码**：把上面第 1~3 条"隐藏行为"（含"退出其实不退出"）写成测试清单，改造前后逐条对比。
2. 重写而非缝补：用"守卫条目计数 + 场景回调注入"的新 hook（`useBackPrevention(scene: 'practice'|'formalExam'|'idle', onLeave)`），由页面注册场景，**一次 PR 只换实现、不换行为**；场景化文案在第二个 PR 做。
3. 正式考试的退出确认（`FormalExamScreen.tsx:259-271`）**保持独立不合并**——它依赖服务端答案恢复（`useFormalExam.ts:131` `initialAnswers = a.attempt.answers`），语义与"退出应用"根本不同；只统一视觉组件即可。
4. 回归清单必测：练习中按浏览器返回→取消→再返回；点"退出"后再按返回；考试中按返回；首页按返回；`navigate('/')` 后按返回。

---

### R-T2　全量弹窗包裹 AppModal

**破坏类型**：功能断裂（登录/注册流程）+ 数据丢失（导入未保存内容）+ 视觉回归（层级翻转）。
**爆炸半径**：12+ 文件；含登录、导入两条核心链路。

**证据与触发条件（分弹窗）**：

① **LoginModal —— 最危险的迁移对象**
- `AppLayout.tsx:122-137`：LoginModal **无条件常驻挂载**，靠内部 `LoginModal.tsx:180` `if (!isOpen) return null` 隐藏。因此 `prevIsOpenRef`（:78）、`inRegFlowRef`（:80）与全部 useState **跨开/关存活**。
- `LoginModal.tsx:124-137`：重新打开时依据 `inRegFlowRef` 决定"恢复注册验证码步骤"还是"重置表单"。
- **触发条件**：AppModal 若采用常见的 `{open && children}` 条件渲染（卸载式），LoginModal 一关闭组件即销毁 → 用户在"已发送邮箱验证码、等待输入"时误关弹窗再打开，**注册流程状态全丢**，验证码作废体验断裂；`prevIsOpenRef` 机制整体失效。
- `LoginModal.tsx:84-91`（ESC）、`:94-112`（焦点陷阱，mount 时查询一次 focusable 并 `first.focus()`）、`:1174`（点击遮罩关闭）——AppModal 若自带 ESC/焦点陷阱，会与 LoginModal 自身的重复注册，Tab 循环错乱、ESC 双触发。
- **缓解**：AppModal 必须提供 `keepMounted` prop（LoginModal 传 true）；迁移 LoginModal 时**先删除其自身 ESC/焦点陷阱代码**再套壳，单独 PR，手工回归注册/登录/忘记密码/设置密码 4 条流。

② **点击遮罩关闭：三种现状不可用一个默认值统一**
- 有点击关闭：`ConfirmModal.tsx:60`、`LoginModal.tsx:1174`、`StudentSelectorModal.tsx:75`（且 `saving` 时禁用！）、`AppLayout.tsx:956`（科目删除）。
- 无点击关闭：`ImportModal.tsx:673`、`JoinSubjectModal.tsx:46`、`StudentManagementModal.tsx:95`、`SettingsModal.tsx`（:306 区域，footer 见 :413）等多数。
- **触发条件**：AppModal 默认 `closeOnOverlay=true` → 用户在 ImportModal 粘贴了几千字题目文本/AI 解析出预览后误点遮罩，`ImportModal.tsx:47-105` 的 text/preview/OCR 等**全部本地状态瞬间蒸发**（该弹窗由 `AppLayout.tsx:109` 条件渲染，关闭即卸载）——这是真实的用户数据丢失。默认 `false` → LoginModal/StudentSelector 体验退化。
- **缓解**：`closeOnOverlay` 无默认智能，**逐弹窗显式声明**，迁移 PR 中列表核对；另需 `disableClose` prop 复刻 `StudentSelectorModal.tsx:75,82` "保存中禁止关闭"。

③ **挂载语义与副作用**
- `ImportModal.tsx:88-98`：mount 即拉取服务端 AI 设置；`StudentManagementModal.tsx:42`：`isOpen` 变 true 时 loadData。AppModal 若统一改成"常驻挂载 + CSS 隐藏"，ImportModal 的请求会在未打开时发出；反之若统一"卸载式"，回到①的问题。**挂载策略必须保持每个弹窗现状不变**。

④ **z-index 与 portal**
- `ImportModal.tsx:673` z-50 与其子 `OcrDialog` z-50 同层靠 DOM 顺序压住父级，`PaddleOcrSettings` 用 z-[60]（审计 IC-1 已证）。当前无任何 portal。
- **触发条件**：AppModal 若用 `createPortal(document.body)`，父子弹窗脱离原 DOM 顺序，同 z 值时**层级由挂载先后决定 → OCR 对话框可能被压在 ImportModal 下面**点不到。motion 的 transform 还会创建新 stacking context。
- **缓解**：要么全部不用 portal 维持现状，要么统一 portal 并同时落实"嵌套 +10"的 z 规则，不允许半迁移状态过夜。

---

### R-T3　危险操作统一 AppConfirm —— 迁的不是弹窗，是回调

**破坏类型**：数据丢失（守卫丢失导致误删/悬空）+ 破坏性操作失控。
**爆炸半径**：`AppLayout.tsx`、`SettingsModal.tsx`、`StudentManagementModal.tsx`、`ExamScreen.tsx`。

**证据与触发条件**：
- **科目删除** `AppLayout.tsx:993-1017`：确认回调是 8 步级联——`:995` 最后一个科目守卫、`:1000-1001` setCustomSubjects、`:1002-1005` **当前科目 fallback 切换**、`:1007` `subjectApi.delete(...).catch(() => {})`（静默失败，本地先删）、`:1009-1014` 关联题目并入 removedIds 并过滤 customQuestions。
  **触发条件**：迁 AppConfirm 时只搬"确认→删除"主干、漏掉 `:995` 守卫 → 删光科目应用空转；漏掉 `:1002-1005` → `currentSubjectId` 指向已删科目，题库页白屏/空列表。
- **退订** `AppLayout.tsx:602-611`：原生 `confirm()` 是**同步阻塞**，闭包直接捕获 map 迭代变量 `subject`。迁 AppConfirm 变异步，必须把待退订 subject 存入 state；若实现成"单一全局确认状态"，用户连点两个科目的退订按钮 → 状态被覆盖，**退订的是后点的那个**（静默错删）。
- **清 Key** `SettingsModal.tsx:414-420`：确认后两个动作 `clearAllApiKeys()` + `setSettings({...BUILD_TIME_CONFIG})`。漏第二个 → 界面仍显示已清除的 Key，用户"保存"后把幽灵 Key 又写回去，行为诡异。
- **学生管理** `StudentManagementModal.tsx:54-77`：删邀请码/移除学生/重置密码目前**零确认直接执行**——加确认是行为新增，本身低危；但注意 `handleResetPassword`（:74-77）成功后**故意不 loadData**，迁移时别"顺手统一"加刷新。列表项回调携带 `id` 闭包（:146,178,179），用共享确认状态时同样有覆盖风险。
- **练习行内确认** `ExamScreen.tsx:206-244,281-305`：去重/仅客观题/剔题的行内 yes/no 是**轻量高频**操作，全部升级成全屏 AppConfirm 属于**体验降级**（每剔一题弹一次全屏窗）；且 `confirmingDelete` 等三个状态在 `useUIState.ts:32-34`，被 AppContext 消费，删除时要同步清理。

**缓解**：每处迁移**逐行搬运原回调**，diff review 时对照本节清单打勾；确认状态一律用"携带 payload 的对象"（学 `subjectToDelete` 范式）而非全局布尔；ExamScreen 行内确认建议**保留行内形态**只统一视觉，不上全屏弹窗。

---

### R-T6　LoginModal 改 Tailwind + TextField —— auth 核心链路上做大 diff

**破坏类型**：功能断裂（登录/注册被锁死）。
**爆炸半径**：单文件 `LoginModal.tsx`（1216 行），但它是**唯一登录入口**，炸了全站不能登录。

**证据与触发条件**：
- `LoginModal.tsx:386-395`：`inputStyle` 被 4 个表单 10+ 个输入框共享；替换成 TextField 是**全文件级 diff**——大 diff 中夹带逻辑变更是此类改造最常见的事故来源。
- `:399` `form onSubmit={regStep === 1 ? handleSendRegCode : handleCompleteReg}`、`:411-419` `required` + `type="text"` + `autoComplete="username"`、`:427-434` `type="email"` + `autoComplete="email"`、`:441-449` `autoComplete="new-password"`。
  **触发条件**：TextField 封装若不透传 `required/type/autoComplete/onKeyDown`：浏览器原生必填校验消失（与 `:187-237` 手动校验是**双保险**，不是冗余）、密码管理器/自动填充失效、回车提交失效——用户感知就是"登录不了了"。
- `:1152-1169`：设置密码按钮的 `disabled={setupLoading}` 和颜色分支在内联 style 里；换 Button 组件时若丢 `disabled` 绑定，重复提交；若把 loading 判定移进组件而外层仍控制文案，出现"按钮转圈但可点"。
- `:180` `if (!isOpen) return null` 位于全部 hooks 之后——重构时若有人把 early-return 上移到 hooks 之前，**React hooks 顺序错误直接崩组件**（这类"顺手整理"在大重构里很常见）。

**缓解**：只换 className/JSX 外观，**handlers 与 useState/useEffect 一行不动**；TextField 用"透传剩余 props（`...rest`）"设计；单独 PR；上线前人工回归 4 条流程（注册含验证码步骤、登录、忘记密码、被重置后设置密码）+ 密码管理器自动填充。

---

### R-T8　状态共享治理 —— object 状态是业务 payload，key 是用户数据

**破坏类型**：功能断裂 + **用户数据丢失（不可逆）**。
**爆炸半径**：`useUIState.ts` → `AppContext` → `AppLayout`（:66-79 向 AppHeader 透传 14 个 setter）→ 各弹窗，30+ 消费点；另 5 组 localStorage key。

**证据与触发条件**：

① **"boolean vs object 统一"是伪命题**
- `useUIState.ts:41` `subjectToDelete: Subject | null`——payload 是**要删哪个科目**（`AppLayout.tsx:950,976,980` 直接读 `.name`、过滤题目）。
- `:50` `userActionConfirm: { type; username; onConfirm: () => void }`——**payload 里存着回调函数本身**。
- `:54` `studentSelectorSubject: { id; name }`——`AppLayout.tsx:152-157` 读 `.id/.name` 传给弹窗。
- **触发条件**：统一成 boolean → payload 无处安放，功能直接断（删除弹窗不知道删谁）；统一成 object → `isImportModalOpen` 等十几个 boolean 及其 setter 要改名，AppHeader/AppContext/各页面全量连改，任何一处漏改都是运行时 undefined。
- **缓解**：**放弃"二选一全量改造"**。正确做法：内部引入统一结构，**导出层保留全部旧字段名做兼容 getter/setter**，消费方零改动；之后按文件逐个切换到新 API，最后删兼容层。三段式，每段可独立回滚。

② **localStorage key 收敛 = 潜在用户数据蒸发**
- 实测 key 清单：`study_test_current_subject`（useQuestionBank.ts:12,144）、`last_selected_model`（ImportModal.tsx:49 / ImportTabs.tsx:347）、`last_ai_vision_model`（ImportModal.tsx:73,872）、**`paddle_ocr_api_key` / `paddle_ocr_api_url`**（ImportModal.tsx:78,81,887-888；`services/extract/ocr.ts:159` 服务层也直接读！）、`ai_settings`（ImportTabs.tsx:337 读它决定是否显示提示条）、`VERIFY_*` 三键（useAuth.ts:162-216，注册验证码流程）。
- **触发条件**：改名不写迁移 → 用户自己付费的 **PaddleOCR API Key 消失**、当前科目重置、`ai_settings` 读不到导致 ImportTabs 提示逻辑错乱；`ocr.ts:159` 在**服务层**硬编码旧 key，只改组件层不改它 → 读写分家，设置保存了但 OCR 用不上。
- **缓解**：封装 `storageGet/storageSet` 时 **key 一律沿用原字面量**；确需改名必须带"读旧写新 + 首读迁移"逻辑；用 grep 全量核对读/写两端（尤其 `services/` 下的隐藏读取点）。

③ **StudentManagement 本地 toast 迁全局的 z-index 陷阱**（与 T5 共享，证据见 R-T5）。

---

## 三、🟡 中危项

### R-T5　Loading/反馈统一

- **spinner 替换的"永久 disabled"陷阱**：`FormalExamScreen.tsx:220,224,236-241` —— `submitting` 一个状态驱动三处（按钮 disabled、文案"提交中..."、底部 spinner）。若 Spinner 组件内部自持 loading 状态而外层仍传 `disabled={submitting}`，或替换时误把 `disabled` 绑到新组件不存在的 prop 上，出现**按钮永久禁用或转圈可重复提交**。ImportTabs 的 `isGenerating`/`isParsing` 是互斥双状态，合并成一个 loading 会让两个按钮联动禁用（行为变化）。
  **缓解**：Spinner 做成纯展示组件（无内部状态），loading 判定条件原样保留在业务侧。
- **toast 迁全局会被弹窗遮住**：全局 Toast 在 `AppLayout.tsx:94-106`（`z-50`，DOM 序在前），StudentManagementModal overlay 也是 `z-50`（`StudentManagementModal.tsx:95`）且 DOM 序在后（`AppLayout.tsx:147`）→ 同 z 值后者压前者。本地 toast 现在渲染在弹窗**内部** `absolute bottom`（:211）所以可见；迁到全局后，"密码已重置为123456"这类**唯一一次展示的关键信息**将被弹窗遮住。
  **缓解**：迁移前先把全局 Toast 提到 `z-[1100]`（高于现存最高 z-[1001]）。
- **alert → toast 的信息强度降级**：`StudentSelectorModal.tsx:66`、`SubjectShareCode.tsx:45` 的 alert 是阻塞式、必读的**错误**提示；全局 toast 2 秒自动消失（本地版 `StudentManagementModal.tsx:23` 也是 2000ms）。错误改 toast 用户可能漏看。**缓解**：错误走行内 InlineError，成功才走 toast。
- **审计文档笔误**：T5 列出的 `ImportTabs.tsx:403` 行内错误在实际代码为 rose 系错误条（IC-7 证据 403-408）——迁移时注意它同时是"错误误用 Info 图标"的修复点，别只换色不换图标。

### R-T4　主操作按钮语义色

- **正则批量替换会误伤状态语义色**：`AppLayout.tsx:562-568` shareScope 徽标的 indigo/emerald 是**状态指示**不是主操作；`StudentManagementModal.tsx:116` tab 选中 `text-blue-600`；`ExamScreen.tsx:259-276` 导出组合控件的 green 系是与 select 配套的整体设计。全局 `indigo-600 → blue-600` 替换会把它们一并改掉 → 视觉回归。
  **缓解**：只允许人工逐处替换"主操作按钮"，禁止全局正则；每个 PR 附截图对比。
- **禁用色不要动**：`AppLayout.tsx:592` 删除按钮 `disabled:opacity-40` 等禁用态样式与色值耦合，换 Button 组件时保留 disabled 分支。
- 其余为纯视觉，易回滚，Git revert 即可。

---

## 四、🟢 低危项

### R-T1　UI 底座（新增 `src/components/ui/*`）

纯增量，不触碰任何现有文件（除 AppContext 注入反馈方法——该注入若只增不改，亦安全）。**唯一风险是 API 契约不足，成为 T2~T8 的故障源头**。基于本轮核实的消费方需求，给出最小安全契约：

**AppModal 最小 props 集**（缺一项就有对应弹窗迁不动）：
| prop | 必要性证据 |
|---|---|
| `open` / `onClose` / `children` / `title?` | 通用 |
| `closeOnOverlay: boolean`（**无全局默认，强制显式传**） | LoginModal:1174 要 true；ImportModal:673 必须 false（防丢稿） |
| `closeOnEsc: boolean` | LoginModal:84-91 |
| `disableClose: boolean` | StudentSelectorModal:75,82 保存中禁关 |
| `keepMounted: boolean` | LoginModal 常驻挂载 + inRegFlowRef（AppLayout:122-137, LoginModal:78-80） |
| `trapFocus: boolean` | LoginModal:94-112；启用时迁移方必须删自身实现 |
| `layer: 'base'\|'nested'\|'top'`（映射 z-50/z-[60]/z-[1001]） | ImportModal/OcrDialog/PaddleOcrSettings 嵌套；ConfirmModal/退出弹窗 z-[1001] |
| `maxWidth` / `rounded` | max-w-sm~4xl、rounded-2xl/3xl 并存 |
| **不使用 portal（首期）** | 保持现有 DOM 层叠语义，见 R-T2④ |

**AppConfirm**：在 `ConfirmModal.tsx:4-13` 现有 props 上增加 `loading?: boolean`（异步确认时按钮 pending+禁双击，服务 T3 的异步回调）与 `initialFocus?: 'cancel'|'confirm'`（对应审计待确认事项 1）。确认回调签名保持 `() => void`，异步逻辑留在业务侧。

### T8 中的 EmptyState 部分
纯视觉替换（`StudentManagementModal.tsx:139,160,173,186` 等），低危、易回滚。

---

## 五、安全落地顺序建议

```
第 1 批（安全）   T1 底座（含上表契约）→ T4 / T5-spinner / T8-EmptyState（纯视觉，小 PR，截图回归）
第 2 批（灰度）   T5-toast 前置：全局 Toast 升 z-[1100] → StudentManagement 本地 toast 迁全局
                 T2 灰度①：JoinSubject / RoleSwitch / Help / StudentManagement / SubjectPicker（无复杂状态）
第 3 批（单独PR） T3：科目删除、退订、清Key 各一个 PR，逐行搬运回调对照 §二 R-T3 清单
                 T2 灰度②：Settings / StudentSelector（disableClose）/ AppLayout 内联弹窗
第 4 批（高危区） T6：LoginModal 纯样式 PR（handlers 零改动）→ T2 灰度③：LoginModal 套 AppModal（keepMounted）
                 T2 灰度④：ImportModal + OcrDialog + PaddleOcrSettings（closeOnOverlay=false + 嵌套 layer，一个 PR 内整体迁）
第 5 批（最后）   T8-useUIState：兼容层三段式（新结构+旧字段 getter → 逐文件切换 → 删兼容层）
                 T8-localStorage：storageGet/Set 封装但 key 不改名（含 services/extract/ocr.ts:159）
                 T7：先写现状行为规格与回归清单，重写 useBackPrevention（场景注入），独立 PR + 全量手工回归
```

原则：**T7 永远最后做**；LoginModal / ImportModal 的任何改动单独 PR；所有"确认回调迁移"PR 的 review 重点是回调内容而非弹窗外观。

---

## 六、待确认 / 未充分核实

1. `HelpModal.tsx`、`RoleSwitchModal.tsx`、`import/OcrDialog.tsx`、`PaddleOcrSettings.tsx`、`import/SubjectPicker.tsx`：本轮未逐行打开（沿用上轮审计的 overlay/行号证据），其内部是否有依赖 DOM 结构的状态未 100% 排除——迁 AppModal 前建议逐个速查。
2. `ImportTabs.tsx` 仅核实 :337,347 两处 localStorage 与 props 接口（ImportModal.tsx:705-720），其内部错误展示区（:403-408）未整读。
3. `useFormalExam.ts` 仅核实 :131 答案恢复点；"退出考试已作答内容自动保留"依赖的**答案保存时机**（逐题上报 or 退出时上报）未核实——若是退出时上报，T7 改动 onBack 链路会直接影响该保存，风险将升级，**需工程确认**。
4. `SettingsModal.tsx` 仅核实 :370-445；`clearAllApiKeys()` 的实现（清哪些存储）未打开，T8 key 收敛前需确认其覆盖范围。
5. ExamScreen 练习进度是否有任何持久化（本轮未见）——若确认纯内存，T7 的"练习返回加确认"是唯一保护层，其正确性更加关键。
