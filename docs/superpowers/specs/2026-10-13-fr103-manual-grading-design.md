# FR-103 简答题/编程题人工判分工作流 · 设计 Spec

> 立项编号：FR-103-MANUAL-GRADING
> 事实基准：**2026-10-13**；判分口径以 [`src/shared/scoring/index.ts`](../../../src/shared/scoring/index.ts)（SSOT，FR-110）为准。
> 关联需求：PRD §6 Phase 0「FR-101/102/103 题型补齐」；本文补齐 FR-103 描述中「人工判分工作流（判分列表界面）」这一未落地闭环。
> 结论先行：**纯增量交付**——新增 3 个读/写端点 + 1 个重算领域函数 + 1 个老师判分页；不改 `exam_attempts.status` 枚举、不动既有判分/收卷主流程、不做权限引擎切换。

---

## 1. 背景与现状（实测）

交卷/收卷走 `gradeAttempt`（[server/src/utils/examSweep.js:44-108](../../../server/src/utils/examSweep.js)），对 `short_answer`/`programming` 调 `gradeQuestion` 返回 `{ is_correct: null, earned: 0, needs_manual: true }`（[index.ts:184-191](../../../src/shared/scoring/index.ts)）。因此：

- **数据已具备读侧**：`GET /api/exams/attempts/:attemptId` 逐题透出 `user_answer / correct_answer / points / earned / needs_manual`；`GET /api/exams/:id/attempts` 列出本卷全部答卷（`examApi.listAttempts`）。
- **缺写侧与界面**：没有任何端点能把人工分回写并重算总分；前端无任何判分入口。

`details` 每条目实际结构（`gradeAttempt` 产出，写回时同构）：
```jsonc
{ "question_id": 123, "user_answer": "...", "correct_answer": "...",
  "is_correct": null, "points": 10, "earned": 0, "explanation": "", "needs_manual": true }
```

总分口径（重算必须与之一致，[examSweep.js:103-107](../../../server/src/utils/examSweep.js)）：
- `score = Σ details[].earned`
- `correct_count = |{ d ∈ details : d.is_correct === true }|`
- `total_count = |details|`（不变）

`analysis / my-history / bestScores` 全部**实时读** `exam_attempts.score`，故改分后自动反映（含「取最高分」口径），无需额外派生。

权限判定：`isOwner(exam, userId, role) = role === 'admin' || exam.created_by === userId`（[exams.js:32-34](../../../server/src/routes/exams.js)）。本工作流**沿用**此判定（M2 权威切换不在本 spec 范围）。

通知：`notificationService.createNotification(db, { user_id, type, title, payload, org_id })`，`NOTIFICATION_TYPES` 已含 **`score_ready`**（[notificationService.js:15-36](../../../server/src/utils/notificationService.js)）——直接复用，无需新增类型。

---

## 2. 目标与非目标

**目标**
- G-A：老师能对某场考试的每一道 `needs_manual` 题（简答 + 编程），跨所有已交卷答卷**按题批改**、批量回写分数。
- G-B：回写后该答卷 `score / correct_count / details` 与 SSOT 口径一致地重算，统计/最高分自动更新。
- G-C：某答卷全部 `needs_manual` 题判完 → 给学生发一条 `score_ready` 站内通知（非阻断）。
- G-D：新写端点纳入既有隔离门禁（非 owner → 403），补上「写端点未纳门禁」TODO。

**非目标（本次不做）**
- 不做 M2 角色权威切换（`org_members.role` / withOrg / ESLint）。
- 不做 AI 辅助评分建议（FR-401）、不做半分/权重细粒度配置。
- 不改 `exam_attempts.status` 枚举、不加"锁定/发布判分"状态（v1 允许反复改判）。
- 不做填空题人工复核（`fill_in` 已自动判分，不在 `needs_manual` 集内）。

---

## 3. 判分交互（已定案）

- **按题批改**：入口先给「本卷人工题清单 + 每题进度」，选中一题 → 平铺该题所有学生作答 → 逐个给分、即时保存。
- **覆盖题型**：`type ∈ {short_answer, programming}`（凡 `needs_manual` 者）。
- **打分粒度**：整数 `earned ∈ [0, points]`（服务端 clamp；越界取端点）。
- **改判**：允许对同一 attempt-题目反复回写，服务端幂等重算（每次以完整 `details` 重算总分）。
- **入口位置**：挂在现有考试管理页（`ExamManagePage` / `ExamAnalysisDashboard`）每场考试的「人工判分」按钮，不开一级导航。

---

## 4. 后端设计（exams 路由新增 3 端点）

全部 `authMiddleware`；除详情外均先 `SELECT exam` → `isOwner` 校验，非 owner 返回 `403 { error:'无权判分该考试' }`。仅统计**已交卷** attempt：`status IN ('submitted','auto_submitted')`。

### 4.1 `GET /api/exams/:id/grading` — 判分总览
返回本卷所有 `needs_manual` 题及进度：
```jsonc
{ "questions": [
  { "question_id": 123, "type": "short_answer", "title": "...", "points": 10,
    "total_responses": 7, "graded_count": 2 }
] }
```
- `question_id` 取自 `exam.question_set`，且该题 `type ∈ {short_answer, programming}`（读 `questions` 表 type）。
- `total_responses` = 本卷已交卷 attempt 数；`graded_count` = 这些 attempt 中该题 `needs_manual === false`（已判）的数量。

### 4.2 `GET /api/exams/:id/grading/:questionId` — 某题跨学生作答
校验 `questionId ∈ exam.question_set` 且为 `needs_manual` 类型，否则 `400`。返回：
```jsonc
{ "question": { "question_id":123, "type":"short_answer", "title":"...", "points":10,
                "reference_answer":"...", "explanation":"..." },
  "responses": [
    { "attempt_id":55, "user_id":9, "username":"stu_a", "submitted_at":"...",
      "user_answer":"学生作答原文", "earned":0, "graded":false }
  ] }
```
- `responses` 按 `submitted_at` 升序；某 attempt 该题缺 `details` 项时以 `user_answer:null, graded:false` 兜底列出。

### 4.3 `POST /api/exams/:id/grading/:questionId` — 批量回写
Body：`{ "scores": [ { "attempt_id":55, "earned":8 }, ... ] }`
流程（逐 attempt，事务 + `FOR UPDATE` 重读，防并发丢更新）：
1. 校验 `attempt` 存在、`attempt.exam_id === :id`、`status ∈ {submitted, auto_submitted}`、该题在其 `details` 内且属 `needs_manual` 类型。采用**整批原子**语义：任一 `scores` 项非法即整请求 `400` 且不写任何项（v1 取此简化以保正确性；前端按题分桶提交）。
2. 对该题 `details` 项：`earned = clamp(round(earned), 0, points)`；`is_correct = (points > 0 && earned === points)`；`needs_manual = false`；补 `graded_by = req.user.id`、`graded_at = now`。
3. 用 §1 口径重算整份 `score / correct_count`，`UPDATE exam_attempts SET details=?, score=?, correct_count=?, updated_at=NOW() WHERE id=?`。
4. 提交后：若该 attempt **已无任何 `needs_manual===true`** 且此前未发过 `score_ready`（以本次翻转为准）→ `createNotification(db,{ user_id: attempt.user_id, type:'score_ready', title:'<考试名> 成绩已更新', payload:{exam_id,attempt_id}, org_id: attempt.org_id })`；通知失败仅 `log.warn`，不回滚判分。

返回：`{ "updated": <count>, "attempts": [ { "attempt_id":55, "score": 68 } ] }`

### 4.4 领域函数抽取（可测）
把「对一份 `details` 应用某题人工分 + 重算总分」抽为纯函数，放 `server/src/utils/manualGrading.js`：
- `applyManualScore(details, questionId, { earned, gradedBy }) → { details, score, correctCount, changedToComplete }`（内部 clamp + §1 重算；`changedToComplete` = 判完此题后该 attempt 无剩余 `needs_manual`）。
- 路由只做 I/O 与事务编排，便于单测 mock。

---

## 5. 前端设计

- `src/services/examApi.ts` 增：
  - `gradingOverview: (id) => client.get<{ questions: GradingQuestionItem[] }>(`/exams/${id}/grading`)`
  - `getResponses: (id, qid) => client.get<GradingResponses>(`/exams/${id}/grading/${qid}`)`
  - `gradeResponses: (id, qid, scores) => client.post<GradeResult>(`/exams/${id}/grading/${qid}`, { scores })`
- `src/types.ts` 增对应接口（`GradingQuestionItem`、`GradingResponse`、`GradeScoreInput`、`GradeResult`）。
- 新页 `src/pages/ManualGradingPage.tsx`：左栏题清单（带 `已判/总数`），右栏该题学生作答列表；每行一个 `0..points` 数字输入 + 「保存」（或防抖自动保存）；切换题目保留进度；顶部显示考试名。
- 入口：`ExamManagePage`（或 `ExamAnalysisDashboard`）每张试卷操作区加「人工判分」按钮 → 路由到 `ManualGradingPage?examId=`。
- 复用现有 `client`（自动带 JWT、统一错误结构）与页面样式约定；遵循前端类型安全规范（无 `any`）。

---

## 6. 测试与门禁（对齐项目四重门禁）

1. **单测（vitest，server）** `manualGrading.test.js`：
   - clamp 越界取端点、`is_correct` 仅在满分、`score=Σ earned`、`correct_count` 计数、幂等重判（二次回写不双计）、`changedToComplete` 触发时机。
2. **集成（integration_exam.mjs）**：建含简答+编程的卷 → 两学生提交（`needs_manual`）→ `GET /grading` 进度=0 → `GET /grading/:qid` 拉到作答 → `POST` 批量给分 → 校验 `score` 更新、`GET /attempts/:id` 该题 `needs_manual=false`、`my-history` bestScore 反映；再测非法题目 id→400、重复改判幂等。
3. **隔离（isolation.integration.mjs）**：owner 之外的学生 B、异租户老师 B → `GET/POST /:idA/grading/*` 全 403；纳入 `checkBlocked`，纳入 exit≠0 门禁。
4. **前端**：`tsc --noEmit` 零错误；`vitest`（root）不因新页破坏；如加组件测则并入。
5. 沿用 CI `isolation-test` job（`deploy needs`）对新集成/隔离断言自动阻断。

---

## 7. 风险与回滚

| 风险 | 缓解 |
|---|---|
| 改分与并发收卷/重复提交竞争 | 事务内 `FOR UPDATE` 重读 attempt；仅对已交卷 attempt 判分 |
| 整批原子语义过严（一个非法全批失败） | 明确文档 + 前端按题分桶提交；v1 取"整批原子"简化正确性 |
| 通知重复发送 | 仅在本次回写使 `changedToComplete` 由 false→true 时发一次 |
| 影响既有分析口径 | 只写 `score/correct_count/details`，analysis 实时读，无独立缓存需失效 |
| 回滚 | 纯增量：新增端点/函数/页面，未触既有判分主流程；可整体 revert 单 PR |

---

## 8. 验收标准（Definition of Done）

- 老师能在 UI 对某卷每道简答/编程题跨学生批量给分，刷新后 `score/统计/最高分` 正确更新且可改判。
- 判完的学生收到 `score_ready` 站内通知。
- 非 owner 访问三个新端点均被拒（隔离门禁断言在 CI 生效）。
- 四重门禁全绿：新单测 + `integration_exam`（+新用例）+ `isolation`（+新断言）+ `tsc --noEmit` 零错误 + 双 `vitest`。
- 零 `exam_attempts.status` 枚举变更；`git diff` 不触及 SSOT 判分主流程。
