# FR-103 人工判分工作流 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让老师对某场考试的简答/编程题「按题批改」跨学生批量回写分数，自动重算总分并通知学生。

**Architecture:** 纯增量。后端在 `exams` 路由新增 3 端点 + 抽出可测领域函数 `manualGrading.js`；判分完成复用 `notificationService` 的 `score_ready`。前端 `examApi`+`types` 扩方法，新增 `ManualGradingPage.tsx` 并从考试管理页进入。不改 `exam_attempts.status` 枚举、不动 SSOT 判分主流程。

**Tech Stack:** Express 4 (ESM) + MySQL(mysql2/promise)；React 19 + TS 5.8；vitest(server + root)；集成/隔离 `.mjs` 脚本（真实 HTTP + studyapp 直连库）。

**关联 spec：** [`../specs/2026-10-13-fr103-manual-grading-design.md`](../specs/2026-10-13-fr103-manual-grading-design.md)

**分支：** `feature/fr103-manual-grading`（spec 已在 451775c）。

---

## 文件结构

- Create: `server/src/utils/manualGrading.js` — 纯领域函数（应用人工分 + 重算）。
- Modify: `server/src/routes/exams.js` — 新增 3 端点（`GET /:id/grading`、`GET /:id/grading/:questionId`、`POST /:id/grading/:questionId`）。
- Create: `server/tests/unit/manualGrading.test.js` — 领域函数单测。
- Modify: `server/tests/integration_exam.mjs` — FR-103 端到端闭环用例。
- Modify: `server/tests/isolation.integration.mjs` — grading 端点跨租户 403 断言。
- Modify: `src/types.ts` — 判分相关接口类型。
- Modify: `src/services/examApi.ts` — 3 个客户端方法。
- Create: `src/pages/ManualGradingPage.tsx` — 老师判分页。
- Modify: `src/pages/ExamManagePage.tsx` — 每卷「人工判分」入口（跳转）。
- Modify: `docs/开发文档.md`、`docs/README.md`（或需求盘点）— 同步 FR-103 状态。

**统一约定**
- 仅统计已交卷：`exam_attempts.status IN ('submitted','auto_submitted')`。
- 人工题集合：`question.type IN ('short_answer','programming')` 且该题在 `exam.question_set` 内。
- 重算口径：`score=Σ details[].earned`；`correct_count=|{is_correct===true}|`；`total_count` 不变。
- 新端点路由参数用数字守卫：`/:id(\\d+)/grading`、`/:id(\\d+)/grading/:questionId(\\d+)`，置于既有 `/:id(\\d+)/...` 同区，勿放 `attempts/:attemptId` 之前造成歧义。

**运行/门禁命令（本地）**
```bash
# 需先启动后端： (cd server && node src/index.js)  默认绑 0.0.0.0:3100
# 用 127.0.0.1（PowerShell localhost→::1 会 ECONNREFUSED）
$env:EXAM_IT_BASE='http://127.0.0.1:3100/api'
$env:EXAM_IT_DB_HOST='127.0.0.1'; $env:EXAM_IT_DB_USER='studyapp'; $env:EXAM_IT_DB_NAME='study_test'
node server/tests/integration_exam.mjs
node server/tests/isolation.integration.mjs
cd server && npx vitest run && cd ..
npx vitest run
npm run lint   # tsc --noEmit
```

---

## Task 1: 领域函数 manualGrading.js + 单测

**Files:**
- Create: `server/src/utils/manualGrading.js`
- Test: `server/tests/unit/manualGrading.test.js`

- [ ] **Step 1: 写失败单测**

```js
// server/tests/unit/manualGrading.test.js
import { describe, it, expect } from 'vitest';
import { applyManualScore } from '../src/utils/manualGrading.js';

const det = (qid, extra = {}) => ({
  question_id: qid, user_answer: 'x', correct_answer: 'ref',
  is_correct: null, points: 10, earned: 0, explanation: '', needs_manual: true, ...extra,
});

describe('applyManualScore', () => {
  it('给分后重算 score/correct_count 并清 needs_manual', () => {
    const details = [det(1), det(2)];
    const r = applyManualScore(details, 1, { earned: 10, gradedBy: 99 });
    expect(r.details.find(d => d.question_id === 1)).toMatchObject({ earned: 10, is_correct: true, needs_manual: false });
    expect(r.score).toBe(10);
    expect(r.correctCount).toBe(1);
    expect(r.changedToComplete).toBe(false); // 题2 仍待人工
  });

  it('earned 越界 clamp 到 [0,points]', () => {
    const r = applyManualScore([det(1)], 1, { earned: 999 });
    expect(r.details[0].earned).toBe(10);
    const r2 = applyManualScore([det(1)], 1, { earned: -5 });
    expect(r2.details[0].earned).toBe(0);
  });

  it('非满分 is_correct=false', () => {
    const r = applyManualScore([det(1)], 1, { earned: 4 });
    expect(r.details[0].is_correct).toBe(false);
    expect(r.score).toBe(4);
  });

  it('全部判完 changedToComplete=true', () => {
    const details = [det(1), det(2, { needs_manual: false, earned: 5 })];
    const r = applyManualScore(details, 1, { earned: 10 });
    expect(r.changedToComplete).toBe(true);
    expect(r.score).toBe(15);
  });

  it('幂等重判以完整 details 重算，不双计', () => {
    let details = [det(1)];
    details = applyManualScore(details, 1, { earned: 6 }).details;
    const r = applyManualScore(details, 1, { earned: 3 });
    expect(r.score).toBe(3);
  });

  it('题不在 details 抛错', () => {
    expect(() => applyManualScore([det(1)], 999, { earned: 5 })).toThrow();
  });
});
```

- [ ] **Step 2: 跑单测确认失败**

Run: `cd server && npx vitest run tests/unit/manualGrading.test.js`
Expected: FAIL（`Cannot find module '../src/utils/manualGrading.js'` 或 `applyManualScore is not a function`）

- [ ] **Step 3: 实现领域函数**

```js
// server/src/utils/manualGrading.js
/**
 * FR-103 人工判分领域逻辑（纯函数，零 I/O）。
 * applyManualScore：对一份 details 应用某题人工分，并按 SSOT 口径重算总分。
 */

/** 四舍五入并夹到 [0, points] 的整数分。 */
function clampEarned(raw, points) {
  const n = Math.round(Number(raw));
  if (!Number.isFinite(n)) return 0;
  return Math.min(Math.max(n, 0), Math.max(0, points));
}

/** 以 details 重算总分口径（与 gradeAttempt 一致：score=Σ earned，correct=Σ is_correct===true）。 */
export function recomputeTotals(details) {
  let score = 0;
  let correctCount = 0;
  for (const d of details) {
    score += Number(d.earned) || 0;
    if (d.is_correct === true) correctCount += 1;
  }
  return { score, correctCount, totalCount: details.length };
}

/**
 * 对指定题目应用人工分，返回新 details + 重算结果。
 * @param {Array} details 原 details 数组（不修改入参，返回浅拷贝项）
 * @param {number} questionId
 * @param {{earned:number, gradedBy?:number}} opts
 * @returns {{details:Array, score:number, correctCount:number, totalCount:number, changedToComplete:boolean}}
 */
export function applyManualScore(details, questionId, { earned, gradedBy = null }) {
  const idx = details.findIndex((d) => Number(d.question_id) === Number(questionId));
  if (idx === -1) throw new Error(`题目 ${questionId} 不在答卷明细中`);
  const points = Number(details[idx].points) || 0;
  const e = clampEarned(earned, points);
  const updated = details.map((d, i) =>
    i === idx
      ? { ...d, earned: e, is_correct: points > 0 && e === points, needs_manual: false, graded_by: gradedBy, graded_at: new Date().toISOString() }
      : d
  );
  const totals = recomputeTotals(updated);
  const changedToComplete = !updated.some((d) => d.needs_manual === true);
  return { details: updated, ...totals, changedToComplete };
}

export default { applyManualScore, recomputeTotals };
```

- [ ] **Step 4: 跑单测确认通过**

Run: `cd server && npx vitest run tests/unit/manualGrading.test.js`
Expected: PASS（6 用例）

- [ ] **Step 5: 提交**

```bash
git add server/src/utils/manualGrading.js server/tests/unit/manualGrading.test.js
git commit -m "feat(fr103): 人工判分领域函数 applyManualScore/recomputeTotals + 单测(clamp/满分/幂等/完成翻转)"
```

---

## Task 2: 后端 3 端点（总览 + 某题作答 + 批量回写）

**Files:**
- Modify: `server/src/routes/exams.js`
- Test: `server/tests/integration_exam.mjs`（Step 追加用例，Task 3 补隔离）

- [ ] **Step 1: 顶部 import 领域函数与通知**

在 `server/src/routes/exams.js` 现有 import 区追加：
```js
import { applyManualScore } from '../utils/manualGrading.js';
import { createNotification } from '../utils/notificationService.js';
```

- [ ] **Step 2: 新增判分总览端点（放在 `/:id(\\d+)/sweep` 之后、模块底部路由定义区之内）**

```js
/** FR-103：本卷人工题清单 + 每题进度（仅 needs_manual 类型；仅已交卷）。 */
router.get('/:id(\\d+)/grading', authMiddleware, async (req, res) => {
  try {
    const examId = Number(req.params.id);
    const [examRows] = await pool.execute('SELECT * FROM exams WHERE id = ?', [examId]);
    if (examRows.length === 0) return res.status(404).json({ error: '考试不存在' });
    const exam = examRows[0];
    if (!isOwner(exam, req.user.id, req.user.role)) return res.status(403).json({ error: '无权判分该考试' });

    const qSet = parseJsonSafe(exam.question_set, []);
    const ids = qSet.map((q) => q.question_id).filter((x) => x != null);
    if (ids.length === 0) return res.json({ questions: [] });
    const ph = ids.map(() => '?').join(',');
    const [qRows] = await pool.execute(
      `SELECT id, type, title, points FROM questions WHERE id IN (${ph}) AND type IN ('short_answer','programming')`, ids);

    const [attRows] = await pool.execute(
      `SELECT id, details FROM exam_attempts WHERE exam_id = ? AND status IN ('submitted','auto_submitted')`, [examId]);

    const questions = qRows.map((q) => {
      const graded = attRows.filter((a) => {
        const d = parseJsonSafe(a.details, []).find((x) => Number(x.question_id) === Number(q.id));
        return d && d.needs_manual === false;
      }).length;
      return { question_id: q.id, type: q.type, title: q.title, points: Number(q.points) || 0, total_responses: attRows.length, graded_count: graded };
    });
    res.json({ questions });
  } catch (err) {
    log.error('判分总览错误:', err); res.status(500).json({ error: '判分总览失败' });
  }
});
```

- [ ] **Step 3: 新增某题跨学生作答端点**

```js
/** FR-103：某人工题的所有已交卷作答（按 submitted_at 升序）。 */
router.get('/:id(\\d+)/grading/:questionId(\\d+)', authMiddleware, async (req, res) => {
  try {
    const examId = Number(req.params.id);
    const qid = Number(req.params.questionId);
    const [examRows] = await pool.execute('SELECT * FROM exams WHERE id = ?', [examId]);
    if (examRows.length === 0) return res.status(404).json({ error: '考试不存在' });
    const exam = examRows[0];
    if (!isOwner(exam, req.user.id, req.user.role)) return res.status(403).json({ error: '无权判分该考试' });

    const qSet = parseJsonSafe(exam.question_set, []).map((q) => q.question_id);
    if (!qSet.includes(qid)) return res.status(400).json({ error: '题目不属于该考试' });
    const [qRows] = await pool.execute(`SELECT id, type, title, answer, points, explanation FROM questions WHERE id = ? AND type IN ('short_answer','programming')`, [qid]);
    if (qRows.length === 0) return res.status(400).json({ error: '题目非人工题或不存在' });
    const q = qRows[0];

    const [attRows] = await pool.execute(
      `SELECT a.id AS attempt_id, a.user_id, a.submitted_at, a.details, u.username
       FROM exam_attempts a JOIN users u ON u.id = a.user_id
       WHERE a.exam_id = ? AND a.status IN ('submitted','auto_submitted')
       ORDER BY a.submitted_at ASC`, [examId]);

    const responses = attRows.map((a) => {
      const d = parseJsonSafe(a.details, []).find((x) => Number(x.question_id) === qid) || {};
      return { attempt_id: a.attempt_id, user_id: a.user_id, username: a.username, submitted_at: a.submitted_at,
        user_answer: d.user_answer ?? null, earned: Number(d.earned) || 0, graded: d.needs_manual === false };
    });
    res.json({ question: { question_id: q.id, type: q.type, title: q.title, points: Number(q.points) || 0, reference_answer: parseJsonSafe(q.answer, q.answer), explanation: q.explanation || '' }, responses });
  } catch (err) {
    log.error('题目作答列表错误:', err); res.status(500).json({ error: '获取作答失败' });
  }
});
```

- [ ] **Step 4: 新增批量回写端点（事务 + FOR UPDATE + 通知）**

```js
/** FR-103：批量给某人工题多份答卷回写分数（整批原子）。 */
router.post('/:id(\\d+)/grading/:questionId(\\d+)', authMiddleware, async (req, res) => {
  let conn = null;
  try {
    const examId = Number(req.params.id);
    const qid = Number(req.params.questionId);
    const scores = Array.isArray(req.body?.scores) ? req.body.scores : [];
    if (scores.length === 0) return res.status(400).json({ error: 'scores 不能为空' });

    const [examRows] = await pool.execute('SELECT * FROM exams WHERE id = ?', [examId]);
    if (examRows.length === 0) return res.status(404).json({ error: '考试不存在' });
    const exam = examRows[0];
    if (!isOwner(exam, req.user.id, req.user.role)) return res.status(403).json({ error: '无权判分该考试' });

    const qSet = parseJsonSafe(exam.question_set, []).map((q) => q.question_id);
    if (!qSet.includes(qid)) return res.status(400).json({ error: '题目不属于该考试' });
    const [qRows] = await pool.execute(`SELECT id, type FROM questions WHERE id = ? AND type IN ('short_answer','programming')`, [qid]);
    if (qRows.length === 0) return res.status(400).json({ error: '题目非人工题或不存在' });

    conn = await pool.getConnection();
    const updated = [];
    await conn.beginTransaction();
    for (const s of scores) {
      const attemptId = Number(s.attempt_id);
      const [rows] = await conn.execute('SELECT * FROM exam_attempts WHERE id = ? FOR UPDATE', [attemptId]);
      if (rows.length === 0 || rows[0].exam_id !== examId || !['submitted','auto_submitted'].includes(rows[0].status)) {
        await conn.rollback(); return res.status(400).json({ error: `非法 attempt ${attemptId}` });
      }
      const details = parseJsonSafe(rows[0].details, []);
      const item = details.find((d) => Number(d.question_id) === qid);
      if (!item) { await conn.rollback(); return res.status(400).json({ error: `attempt ${attemptId} 不含该题` }); }
      const r = applyManualScore(details, qid, { earned: s.earned, gradedBy: req.user.id });
      await conn.execute('UPDATE exam_attempts SET details = ?, score = ?, correct_count = ?, updated_at = NOW() WHERE id = ?',
        [JSON.stringify(r.details), r.score, r.correctCount, attemptId]);
      updated.push({ attempt_id: attemptId, score: r.score, user_id: rows[0].user_id, org_id: rows[0].org_id, complete: r.changedToComplete });
    }
    await conn.commit();

    // 判完翻转 → 站内通知（非阻断，事务外发送）
    for (const u of updated) {
      if (u.complete) {
        createNotification(pool, { user_id: u.user_id, type: 'score_ready', title: `${exam.title} 成绩已更新`, payload: { exam_id: examId, attempt_id: u.attempt_id }, org_id: u.org_id })
          .catch((e) => log.warn('[fr103] 通知失败:', e.message));
      }
    }
    res.json({ updated: updated.length, attempts: updated.map((u) => ({ attempt_id: u.attempt_id, score: u.score })) });
  } catch (err) {
    try { if (conn) await conn.rollback(); } catch {}
    log.error('人工判分错误:', err); res.status(500).json({ error: '人工判分失败' });
  } finally {
    if (conn) conn.release();
  }
});
```

- [ ] **Step 5: 校验路由不与既有 `/:id` 冲突 + 后端可启动**

Run: `cd server && node src/migrate.js --status >/dev/null && (node -e "import('./src/routes/exams.js').then(()=>{console.log('route module loads ok');process.exit(0)}).catch(e=>{console.error(e);process.exit(1)})")`
Expected: `route module loads ok`

- [ ] **Step 6: 提交**

```bash
git add server/src/routes/exams.js
git commit -m "feat(fr103): exams 路由新增判分总览/某题作答/批量回写 3 端点（isOwner 校验 + 事务 FOR UPDATE + score_ready 通知）"
```

---

## Task 3: 集成用例（端到端闭环）

**Files:**
- Modify: `server/tests/integration_exam.mjs`

- [ ] **Step 1: 在既有 FR-202/FR-108 区块之后、`reportExit(...)` 之前，追加 FR-103 区块**

参照文件内既有 `check(name, cond, extra)`、`api(method, path, token, body)` 用法，构造：
- 以 `it_teacher` 建卷：科目 `it_subj_01` 下新建 1 道 `short_answer`（points 10）+ 1 道 `programming`（points 10），组卷并发布。
- `it_student`、`it_student2` 各 `start`+`submit`（作答简答与编程题）。
- 断言序列（每条 `check`）：
  1. `GET /exams/:id/grading` 返回 2 题、每题 `total_responses=2, graded_count=0`。
  2. `GET /exams/:id/grading/:saQid` 返回 `responses.length===2`，`graded===false`。
  3. `POST /exams/:id/grading/:saQid` body `{scores:[{attempt_id:sa,earned:10},{attempt_id:sb,earned:4}]}` → `updated===2`。
  4. `GET /exams/attempts/:sa` 简答题项 `needs_manual===false && earned===10`。
  5. `GET /exams/:id/grading` 简答 `graded_count=2`、编程仍 `0`。
  6. 对编程题同样回写满 10 分 → 该 attempt 全部判完；`GET /exams/my-history`（it_student）反映新 `score`（简答10+编程10+客观题原分）。
  7. 通知：`GET /notifications`（it_student，需 harness 有查通知封装；若无则直连库 `SELECT`）出现 `type='score_ready'` 且 payload.attempt_id 命中。
  8. 非法：`POST /exams/:id/grading/999999`（非本卷题）→ `400`；`POST .../:saQid` body `{scores:[]}` → `400`。
  9. 幂等改判：对同一 attempt 简答再回写 `earned:3` → `score` 相应下调（以完整 details 重算，无双计）。

> 若 harness 无 notifications 查询封装，Step 7 用 `await db.execute("SELECT * FROM notifications WHERE user_id=? AND type='score_ready'", [studentId])` 直连库断言（`db` 已在脚本内）。

- [ ] **Step 2: 跑集成确认通过**

Run: `EXAM_IT_BASE=http://127.0.0.1:3100/api node server/tests/integration_exam.mjs`（后端需已启动）
Expected: 结尾「集成联调结论：N/N 通过」且 exit 0（N 较基线增加上述断言条数）。

- [ ] **Step 3: 提交**

```bash
git add server/tests/integration_exam.mjs
git commit -m "test(fr103): 集成用例覆盖按题批改闭环/进度统计/通知/非法入参400/幂等改判"
```

---

## Task 4: 隔离门禁扩展（新写端点跨租户 403）

**Files:**
- Modify: `server/tests/isolation.integration.mjs`

- [ ] **Step 1: 在 exams 组断言之后追加 grading 断言**

复用现有 `tA/tB`（两租户老师）、`examAId`（A 的考试）。用 `checkBlocked(name, res)`：
```js
checkBlocked('ISO grading A总览(正向,owner 200)', await api('GET', `/exams/${examAId}/grading`, tA.token));
checkBlocked('ISO grading B读A判分总览(403/404)', await api('GET', `/exams/${examAId}/grading`, tB.token), { expectBlocked: true });
checkBlocked('ISO grading B写A判分(403/404)', await api('POST', `/exams/${examAId}/grading/1`, tB.token, { scores: [{ attempt_id: 1, earned: 5 }] }), { expectBlocked: true });
```
> 说明：本文件既有 `checkBlocked` 语义为「断言被拦(403/404)」；正向 200 用 `check(...)` 单独加，保持与 M1 复审「同端点正向对照」风格一致。落地时按文件内实际 `checkBlocked` 签名适配（若无 `expectBlocked` 选项则拆成 `check('...B判分返回403', res.status===403||res.status===404)`）。

- [ ] **Step 2: 跑隔离确认通过且未回归**

Run: `EXAM_IT_BASE=http://127.0.0.1:3100/api node server/tests/isolation.integration.mjs`
Expected: exit 0，断言总数较 M1 增加；KNOWN-GAP 软告警仍恒定不判红。

- [ ] **Step 3: 提交**

```bash
git add server/tests/isolation.integration.mjs
git commit -m "test(fr103): 隔离门禁新增 grading 端点跨租户 403 断言(读/写)+owner 正向对照"
```

---

## Task 5: 前端类型 + examApi 方法

**Files:**
- Modify: `src/types.ts`
- Modify: `src/services/examApi.ts`

- [ ] **Step 1: `src/types.ts` 追加接口**

```ts
// ===== FR-103 人工判分 =====
export interface GradingQuestionItem {
  question_id: number; type: 'short_answer' | 'programming'; title: string;
  points: number; total_responses: number; graded_count: number;
}
export interface GradingResponse {
  attempt_id: number; user_id: number; username: string; submitted_at: string;
  user_answer: string | string[] | null; earned: number; graded: boolean;
}
export interface GradingResponses {
  question: { question_id: number; type: string; title: string; points: number; reference_answer: unknown; explanation: string };
  responses: GradingResponse[];
}
export interface GradeScoreInput { attempt_id: number; earned: number; }
export interface GradeResult { updated: number; attempts: { attempt_id: number; score: number }[]; }
```

- [ ] **Step 2: `src/services/examApi.ts` 追加方法（import 新类型）**

```ts
  /** GET /api/exams/:id/grading — 人工题判分总览 */
  gradingOverview: (id: number) =>
    client.get<{ questions: GradingQuestionItem[] }>(`/exams/${id}/grading`),

  /** GET /api/exams/:id/grading/:questionId — 某题跨学生作答 */
  getResponses: (id: number, qid: number) =>
    client.get<GradingResponses>(`/exams/${id}/grading/${qid}`),

  /** POST /api/exams/:id/grading/:questionId — 批量回写分数 */
  gradeResponses: (id: number, qid: number, scores: GradeScoreInput[]) =>
    client.post<GradeResult>(`/exams/${id}/grading/${qid}`, { scores }),
```
在文件顶部 `import type { ... }` 列表加入 `GradingQuestionItem, GradingResponses, GradeScoreInput, GradeResult`。

- [ ] **Step 3: lint 通过**

Run: `npm run lint`
Expected: 零错误。

- [ ] **Step 4: 提交**

```bash
git add src/types.ts src/services/examApi.ts
git commit -m "feat(fr103): 前端 types + examApi 判分三方法(gradingOverview/getResponses/gradeResponses)"
```

---

## Task 6: ManualGradingPage + 入口

**Files:**
- Create: `src/pages/ManualGradingPage.tsx`
- Modify: `src/pages/ExamManagePage.tsx`

- [ ] **Step 1: 参照现有页面写法（`ExamAnalysisDashboard.tsx` 的 `examApi.listMine()` + loading/error 模式、`client` 错误结构、Tailwind 类）新建 `ManualGradingPage.tsx`**

行为要求（实现细节遵循仓库现有组件风格与前端类型安全规范，禁 `any`）：
- 读取 `?examId=`（沿用现有路由参数方式；若项目用状态导航而非 URL query，按 `ExamManagePage` 传参方式对齐）。
- `useEffect` 拉 `gradingOverview(examId)` → 左栏题目列表（显示 `title`、`已判/总数`、points）。默认选第一题。
- 选中题 → `getResponses(examId, qid)` → 右栏每行：`username`、`user_answer`（只读、多行展示）、`0..points` 的 number 输入（本地暂存，`earned` 初值取回写前值）。
- 每行「保存」或「批量保存本页」：对已改动的行 `gradeResponses(examId, qid, scores)`；成功后刷新该题进度/总览；给轻量 toast/inline 反馈（复用现有 UI 反馈组件）。
- 顶部显示考试标题 + 「返回考试管理」。
- 空态：无人工题 / 无已交卷 → 明确提示。

- [ ] **Step 2: `ExamManagePage.tsx` 每张试卷操作区加「人工判分」入口**

在既有每卷操作按钮（如「分析」`examApi.analysis`）旁，新增按钮跳转 `ManualGradingPage`（按项目现有导航方式：路由或状态提升），传 `exam.id`。

- [ ] **Step 3: lint + 前端 vitest 通过**

Run: `npm run lint && npx vitest run`
Expected: tsc 零错误；root vitest 不因新页失败（现有用例全绿）。

- [ ] **Step 4: 提交**

```bash
git add src/pages/ManualGradingPage.tsx src/pages/ExamManagePage.tsx
git commit -m "feat(fr103): 新增 ManualGradingPage 按题批改界面 + 考试管理页入口"
```

---

## Task 7: 文档同步 + 需求盘点更新

**Files:**
- Modify: `docs/开发文档.md`
- Modify: `docs/README.md`（如登记交付物/索引）

- [ ] **Step 1: 开发文档新增/更新 FR-103 小节**

记录：判分三端点契约、`manualGrading.js` 领域函数、`score_ready` 通知触发、前端 `ManualGradingPage` 与入口；标注「零 status 枚举变更、SSOT 判分主流程未触」。

- [ ] **Step 2: 需求盘点文档更新**

把「FR-103 人工判分工作流」从"未实现"改列"已实现"（引用本次提交）；`docs/README.md` 若维护交付物索引则登记 spec/plan 链接。

- [ ] **Step 3: 提交**

```bash
git add docs/开发文档.md docs/README.md
git commit -m "docs(fr103): 同步人工判分到开发文档与需求盘点(标注端点契约/零枚举变更)"
```

---

## Task 8: 最终四重门禁回归

- [ ] **Step 1: 后端启动 + 全量四重门禁**

Run（依次，全 exit 0）：
```bash
$env:EXAM_IT_BASE='http://127.0.0.1:3100/api'; $env:EXAM_IT_DB_HOST='127.0.0.1'; $env:EXAM_IT_DB_USER='studyapp'; $env:EXAM_IT_DB_NAME='study_test'
node server/tests/integration_exam.mjs
node server/tests/isolation.integration.mjs
cd server && npx vitest run; cd ..
npx vitest run
npm run lint
```
Expected: 集成/隔离 exit 0；server vitest 全绿（含新单测）；root vitest 全绿；lint 零错误。

- [ ] **Step 2: 复核 DoD**

对照 spec §8：判分闭环可用、通知触发、非 owner 三端点被拒、零 status 枚举变更、`git diff server/src/shared/scoring` 为空。

- [ ] **Step 3: 收尾**

清理本地临时 env；按 finishing-a-development-branch 选择集成方式（合并/PR）。
