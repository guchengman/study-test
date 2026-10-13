# FR-104 材料题（一拖 N）核心纵切 实施计划

> **For agentic workers:** 本计划内联执行（本项目环境已禁用通用 implementer 子代理）。每步用 checkbox（`- [ ]`）跟踪，遵循 TDD、频繁提交。
> 设计依据：docs/superpowers/specs/2026-10-13-fr104-material-questions-design.md

**Goal:** 交付「一段共享材料 + N 道子题」的材料题组：可经 API 创建、可整组组卷、学生作答时子题上方显示材料、交卷后子题独立判分并回写总分；跨租户隔离进门禁。

**Architecture:** 新增 `question_groups` 表存材料本体，`questions.group_id` 可空软引用列标记子题。`question_set` 保持扁平 `{question_id,points}`；组语义仅在「选组=批量加子题」与「读时 LEFT JOIN 带出 group_material」两处表达。判分 SSOT 与 examSweep.gradeAttempt 零改动。

**Tech Stack:** Node/Express + MySQL(utf8mb4) 后端；React+Vite+TS 前端；vitest + node 原生 HTTP 集成/隔离脚本四重门禁。

---

## 文件结构（改动地图）

- 新建 `server/migrations/025_question_groups.sql` — DDL：建 `question_groups` + `questions.group_id` 列/索引。
- 新建 `server/src/utils/questionGroups.js` — 纯校验函数 `validateGroupPayload`。
- 新建 `server/tests/unit/questionGroups.test.js` — 上者单测。
- 新建 `server/src/routes/questionGroups.js` — 三端点：`POST /` 建组、`GET /` 按科目列组、`GET /:id` 组详情。
- 改 `server/src/index.js` — 挂载 `/api/question-groups`。
- 改 `server/src/routes/exams.js` — GET /:id 详情(L255-289) 与 start(L437-457) 两处 SELECT 加 LEFT JOIN question_groups 带出 `group_id/group_material`。
- 改 `server/tests/integration_exam.mjs` — 新增 FR-104 section（建组→列组→组详情→组卷→开考带材料→交卷子题独立计分）；cleanup 增补 question_groups。
- 改 `server/tests/isolation.integration.mjs` — B 读/写 A 的材料组 → 403/404。
- 改 `src/services/api.ts` — `QuestionItem.group_id?`；新增 `questionGroupApi`（create/list/detail）。
- 改 `src/types.ts` — `ExamQuestionDetail/ExamQuestionFull` 加 `group_id?/group_material?`；新增 `QuestionGroupInput/QuestionGroupSummary/QuestionGroupDetail`。
- 新建 `src/components/exam/QuestionGroupForm.tsx` — 新建材料组模态（material + N 子题）。
- 改 `src/pages/QuestionManagePage.tsx` — 「新建材料组」入口按钮挂载上述模态。
- 改 `src/components/exam/ExamForm.tsx` — 「材料组」区按组批量加入子题到 `selected`。
- 改 `src/components/app/FormalExamScreen.tsx` — 子题上方渲染 `group_material` 材料卡片。
- 改 `docs/开发文档.md`、`docs/产品需求文档-平台化演进.md` — 端点清单 + FR-104 状态。

---

## Task 1: 迁移 025 — question_groups 表 + questions.group_id

**Files:** Create `server/migrations/025_question_groups.sql`

- [ ] **Step 1: 写迁移 DDL**

```sql
-- 025：FR-104 材料题（一拖 N）——新增 question_groups 表存共享材料本体，
--      questions 加可空软引用列 group_id 标记子题归属。
-- 范式对齐 013/014：幂等、utf8mb4_unicode_ci、migrate.js 按「分号+换行」拆句，语句体内不得出现行内分号。
-- group_id 不建 DB 外键：规避 ON DELETE CASCADE 绕过「被试卷引用题目禁止物理删」护栏（见 spec D5）。

CREATE TABLE IF NOT EXISTS question_groups (
  id INT AUTO_INCREMENT PRIMARY KEY,
  subject_id VARCHAR(50) NOT NULL,
  material LONGTEXT NOT NULL,
  created_by INT DEFAULT NULL,
  org_id INT DEFAULT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_qg_subject (subject_id),
  KEY idx_qg_created_by (created_by),
  KEY idx_qg_org (org_id),
  CONSTRAINT fk_qg_subject FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE,
  CONSTRAINT fk_qg_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE questions
  ADD COLUMN group_id INT DEFAULT NULL;

ALTER TABLE questions
  ADD KEY idx_questions_group (group_id);
```

- [ ] **Step 2: 应用到 dev 库并验证**

Run: `node server/scripts/<现有 migrate 入口>.js`（沿用项目既有迁移脚本；若为逐文件应用则执行本文件）
Expected: 无报错；`SHOW COLUMNS FROM questions LIKE 'group_id'` 返回一行 Null=YES、Key=MUL。
再跑一次验证幂等：`CREATE TABLE IF NOT EXISTS` 不报错；`ADD COLUMN` 二次执行会因列已存在报 1060——**确认现有 migrate 是否按 `schema_migrations` 记录跳过已应用文件**（对照 013/014 的处理方式，迁移框架按文件名去重则幂等成立）。

- [ ] **Step 3: 提交**

```bash
git add server/migrations/025_question_groups.sql
git commit -m "feat(fr104): 迁移025 新增 question_groups 表 + questions.group_id 可空软引用列"
```

---

## Task 2: 领域校验纯函数 validateGroupPayload + 单测

**Files:** Create `server/src/utils/questionGroups.js`、`server/tests/unit/questionGroups.test.js`

- [ ] **Step 1: 写失败单测**

```js
// server/tests/unit/questionGroups.test.js
import { describe, it, expect } from 'vitest';
import { validateGroupPayload } from '../../src/utils/questionGroups.js';

const VALID_Q = (over = {}) => ({ type: 'single', title: 't', answer: 'A', options: ['A', 'B'], ...over });

describe('validateGroupPayload', () => {
  it('合法：material 非空 + 子题数组 → ok', () => {
    const r = validateGroupPayload({ subject_id: 's', material: '阅读下面短文…', questions: [VALID_Q(), VALID_Q({ type: 'fill_in', answer: 'x' })] });
    expect(r.ok).toBe(true);
    expect(r.errors).toEqual([]);
  });
  it('material 缺失/空白 → 不 ok', () => {
    expect(validateGroupPayload({ subject_id: 's', material: '   ', questions: [VALID_Q()] }).ok).toBe(false);
    expect(validateGroupPayload({ subject_id: 's', questions: [VALID_Q()] }).ok).toBe(false);
  });
  it('subject_id 缺失 → 不 ok', () => {
    expect(validateGroupPayload({ material: 'm', questions: [VALID_Q()] }).ok).toBe(false);
  });
  it('questions 非数组或空 → 不 ok（允许后续加题，但创建时至少 1 题更合理）', () => {
    expect(validateGroupPayload({ subject_id: 's', material: 'm', questions: [] }).ok).toBe(false);
    expect(validateGroupPayload({ subject_id: 's', material: 'm' }).ok).toBe(false);
  });
  it('子题题型非法 → 不 ok 并定位序号', () => {
    const r = validateGroupPayload({ subject_id: 's', material: 'm', questions: [VALID_Q(), VALID_Q({ type: 'essay' })] });
    expect(r.ok).toBe(false);
    expect(r.errors.join()).toMatch(/第 2/);
  });
  it('子题缺 title 或 answer → 不 ok', () => {
    expect(validateGroupPayload({ subject_id: 's', material: 'm', questions: [VALID_Q({ title: '' })] }).ok).toBe(false);
    expect(validateGroupPayload({ subject_id: 's', material: 'm', questions: [VALID_Q({ answer: '' })] }).ok).toBe(false);
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run server/tests/unit/questionGroups.test.js`（或 server 目录 vitest）
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现纯函数**

```js
// server/src/utils/questionGroups.js
/** FR-104 材料组创建入参校验（纯函数，零 DB 依赖，便于单测）。 */
export const VALID_QUESTION_TYPES = ['single', 'multiple', 'programming', 'judge', 'fill_in', 'short_answer'];

/**
 * @returns {{ ok: boolean, errors: string[] }}
 */
export function validateGroupPayload(payload) {
  const errors = [];
  const p = payload || {};
  if (!p.subject_id || String(p.subject_id).trim() === '') errors.push('subject_id 不能为空');
  if (!p.material || String(p.material).trim() === '') errors.push('material（共享材料）不能为空');
  if (!Array.isArray(p.questions) || p.questions.length === 0) {
    errors.push('questions 至少包含一道子题');
    return { ok: false, errors };
  }
  p.questions.forEach((q, i) => {
    const n = i + 1;
    const type = q?.type || 'single';
    if (!VALID_QUESTION_TYPES.includes(type)) errors.push(`第 ${n} 道子题题型无效: ${type}`);
    if (!q?.title || String(q.title).trim() === '') errors.push(`第 ${n} 道子题缺少标题`);
    if (q?.answer === undefined || q?.answer === null || q?.answer === '') errors.push(`第 ${n} 道子题缺少答案`);
  });
  return { ok: errors.length === 0, errors };
}

export default { validateGroupPayload };
```

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run server/tests/unit/questionGroups.test.js`
Expected: PASS（6 用例）

- [ ] **Step 5: 提交**

```bash
git add server/src/utils/questionGroups.js server/tests/unit/questionGroups.test.js
git commit -m "feat(fr104): questionGroups 领域校验纯函数 validateGroupPayload + 单测(6例)"
```

---

## Task 3: 后端 questionGroups 路由三端点 + 挂载 + 集成用例

**Files:** Create `server/src/routes/questionGroups.js`、Modify `server/src/index.js`、Modify `server/tests/integration_exam.mjs`

- [ ] **Step 1: 写路由**

复用 `resolvePersonalOrgId`、`authMiddleware`、`isOwner` 口径（与 questions.js 一致）。

```js
// server/src/routes/questionGroups.js
import { Router } from 'express';
import pool from '../db.js';
import { authMiddleware } from '../middleware/auth.js';
import { resolvePersonalOrgId } from '../utils/personalOrg.js';
import { validateGroupPayload } from '../utils/questionGroups.js';
import log from '../utils/logger.js';

const router = Router();
// 注意：本路由不挂 apiLimiter（与 /api/exams 一致），避免集成/隔离脚本连跑触发 429 串扰。

// POST / — 建组（事务：插 group → 逐子题插 questions 并写 group_id）
router.post('/', authMiddleware, async (req, res) => {
  const { ok, errors } = validateGroupPayload(req.body);
  if (!ok) return res.status(400).json({ error: errors.join('; ') });
  const { subject_id, material, questions } = req.body;
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const orgId = await resolvePersonalOrgId(conn, req.user.id);
    const [g] = await conn.execute(
      'INSERT INTO question_groups (subject_id, material, created_by, org_id) VALUES (?, ?, ?, ?)',
      [subject_id, material, req.user.id, orgId]
    );
    const groupId = g.insertId;
    const ids = [];
    for (const q of questions) {
      const [r] = await conn.execute(
        `INSERT INTO questions (subject_id, type, title, code, options, answer, explanation, points, created_by, org_id, group_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [subject_id, q.type || 'single', q.title, q.code || null,
         q.options ? JSON.stringify(q.options) : null, JSON.stringify(q.answer),
         q.explanation || null, q.points || 1, req.user.id, orgId, groupId]
      );
      ids.push(r.insertId);
    }
    await conn.commit();
    res.json({ group_id: groupId, question_ids: ids, message: '材料组创建成功' });
  } catch (err) {
    await conn.rollback();
    log.error('创建材料组错误:', err);
    res.status(500).json({ error: '创建材料组失败' });
  } finally {
    conn.release();
  }
});

// GET /?subject_id= — 列某科目的组（id, material 摘要, 子题 id 列表）
router.get('/', authMiddleware, async (req, res) => {
  try {
    const { subject_id } = req.query;
    if (!subject_id) return res.status(400).json({ error: 'subject_id 必填' });
    const [groups] = await pool.execute(
      'SELECT id, subject_id, material, created_by, created_at FROM question_groups WHERE subject_id = ? ORDER BY created_at DESC',
      [subject_id]
    );
    const ids = groups.map((g) => g.id);
    let qMap = {};
    if (ids.length) {
      const ph = ids.map(() => '?').join(',');
      const [qs] = await pool.execute(
        `SELECT id, group_id, type, title, points FROM questions WHERE group_id IN (${ph}) AND deleted_at IS NULL`,
        ids
      );
      qMap = qs.reduce((m, q) => { (m[q.group_id] ||= []).push(q); return m; }, {});
    }
    res.json({ groups: groups.map((g) => ({ ...g, questions: qMap[g.id] || [] })) });
  } catch (err) {
    log.error('获取材料组列表错误:', err);
    res.status(500).json({ error: '获取材料组列表失败' });
  }
});

// GET /:id(\d+) — 组详情（owner 视角，子题含答案）
router.get('/:id(\\d+)', authMiddleware, async (req, res) => {
  try {
    const [g] = await pool.execute('SELECT * FROM question_groups WHERE id = ?', [req.params.id]);
    if (g.length === 0) return res.status(404).json({ error: '材料组不存在' });
    const group = g[0];
    if (req.user.role !== 'admin' && group.created_by !== req.user.id) {
      return res.status(403).json({ error: '无权查看该材料组' });
    }
    const [qs] = await pool.execute(
      'SELECT id, type, title, code, options, answer, explanation, points FROM questions WHERE group_id = ? AND deleted_at IS NULL',
      [group.id]
    );
    res.json({ group: { ...group, questions: qs } });
  } catch (err) {
    log.error('获取材料组详情错误:', err);
    res.status(500).json({ error: '获取材料组详情失败' });
  }
});

export default router;
```

> `resolvePersonalOrgId` 来自 `../utils/personalOrg.js`（已核对 questions.js L6 真实导入路径）；`authMiddleware` 来自 `../middleware/auth.js`；`pool` 来自 `../db.js`。

- [ ] **Step 2: index.js 挂载**

在 `app.use('/api/questions', questionRoutes);` 之后加：

```js
import questionGroupRoutes from './routes/questionGroups.js';
// ...
app.use('/api/question-groups', questionGroupRoutes);
```

- [ ] **Step 3: 集成用例（新建组 → 列组 → 组详情）**

在 `integration_exam.mjs` cleanup() 内加（置于删 questions 之前）：
```js
  await db.execute("DELETE FROM question_groups WHERE subject_id IN ('it_subj_01','it_subj_grp')");
```
在合适 section（FR-103 区块附近，交卷相关之后）新增：
```js
  // ── FR-104 材料题：建组→列组→组详情 ──
  await db.execute("INSERT INTO subjects (id,name,created_by,share_scope) VALUES ('it_subj_grp','材料题科目',?,'all')", [tId]);
  r = await api('POST', '/question-groups', tToken, {
    subject_id: 'it_subj_grp', material: '阅读材料：《春风》——“春风又绿江南岸”。',
    questions: [
      { type: 'single', title: 'G1-诗的作者', options: ['王安石', '李白', '杜甫', '白居易'], answer: '王安石', points: 5 },
      { type: 'fill_in', title: 'G1-填空', answer: '绿', points: 3 },
      { type: 'short_answer', title: 'G1-简答', answer: '思乡', points: 6 },
    ],
  });
  check('FR104 建组', r.status === 200 && r.data.group_id && r.data.question_ids.length === 3, r.status);
  const grpId = r.data.group_id, gq1 = r.data.question_ids[0], gq2 = r.data.question_ids[1], gq3 = r.data.question_ids[2];

  r = await api('GET', '/question-groups?subject_id=it_subj_grp', tToken);
  check('FR104 列组含3子题', r.status === 200 && r.data.groups.some((g) => g.id === grpId && g.questions.length === 3), JSON.stringify(r.data && r.data.groups && r.data.groups.length));

  r = await api('GET', `/question-groups/${grpId}`, tToken);
  check('FR104 组详情含答案', r.status === 200 && r.data.group.questions[0].answer === '王安石', r.status);
```

- [ ] **Step 4: 运行集成（需 fresh server，见 Task 前置说明）**

Run: 启动后端 → `node server/tests/integration_exam.mjs`
Expected: FR104 三条 check 全 PASS，退出码 0（连同既有用例不回归）。

- [ ] **Step 5: 提交**

```bash
git add server/src/routes/questionGroups.js server/src/index.js server/tests/integration_exam.mjs
git commit -m "feat(fr104): question-groups 三端点(建/列/详情)+挂载+集成用例"
```

---

## Task 4: 材料下发 — exams GET 详情与 start 两处 LEFT JOIN

**Files:** Modify `server/src/routes/exams.js`、`server/tests/integration_exam.mjs`

- [ ] **Step 1: 改 GET /:id 详情（exams.js 约 L255-289）**

把：
```js
      const [qRows] = await pool.execute(
        `SELECT id, type, title, code, options, answer, explanation, points
         FROM questions WHERE id IN (${placeholders})`,
        questionIds
      );
```
改为：
```js
      const [qRows] = await pool.execute(
        `SELECT q.id, q.type, q.title, q.code, q.options, q.answer, q.explanation, q.points,
                q.group_id, qg.material AS group_material
         FROM questions q LEFT JOIN question_groups qg ON q.group_id = qg.id
         WHERE q.id IN (${placeholders})`,
        questionIds
      );
```
并在 `questions = questionSet.map(...)` 返回对象里（含缺题分支后的正常分支）追加：
```js
        group_id: q.group_id ?? null,
        group_material: q.group_material ?? null,
```

- [ ] **Step 2: 改 start（exams.js 约 L437-457）**

把：
```js
      const [qRows] = await pool.execute(
        `SELECT id, type, title, code, options, points
         FROM questions WHERE deleted_at IS NULL AND id IN (${placeholders})`,
        questionIds
      );
```
改为：
```js
      const [qRows] = await pool.execute(
        `SELECT q.id, q.type, q.title, q.code, q.options, q.points,
                q.group_id, qg.material AS group_material
         FROM questions q LEFT JOIN question_groups qg ON q.group_id = qg.id
         WHERE q.deleted_at IS NULL AND q.id IN (${placeholders})`,
        questionIds
      );
```
map 内返回对象追加 `group_id: q.group_id ?? null, group_material: q.group_material ?? null,`。

- [ ] **Step 3: 集成断言——组卷入考、开考带材料、子题独立计分、总分回写**

延续 Task 3 的 grpId/题号，新增：
```js
  // 组卷：把材料组 3 子题整组加入一张新试卷
  r = await api('POST', '/exams', tToken, {
    subject_id: 'it_subj_grp', title: 'IT_材料题考试', duration_minutes: 30,
    question_set: [{ question_id: gq1, points: 5 }, { question_id: gq2, points: 3 }, { question_id: gq3, points: 6 }],
  });
  check('FR104 组卷', r.status === 200 && r.data.id, r.status);
  const grpExamId = r.data.id;
  await api('PUT', `/exams/${grpExamId}`, tToken, { status: 'published' });

  // 学生开考：子题带 group_material
  r = await api('POST', `/exams/${grpExamId}/start`, sToken);
  check('FR104 开考子题带材料',
    r.status === 200 && r.data.questions.every((q) => q.group_material && q.group_material.includes('春风')),
    JSON.stringify((r.data.questions || []).map((q) => q.group_material)));
  const grpAttemptId = r.data.attemptId;

  // 交卷：单选对+填空对+简答(needs_manual 0) → score=5+3+0=8；correct_count=2
  r = await api('POST', `/exams/${grpExamId}/submit`, sToken, {
    attemptId: grpAttemptId,
    answers: { [gq1]: '王安石', [gq2]: '绿', [gq3]: '我认为思乡' },
  });
  check('FR104 子题独立计分 score=8',
    r.status === 200 && r.data.score === 8 && r.data.correct_count === 2,
    `score=${r.data.score},cc=${r.data.correct_count}`);
```

- [ ] **Step 4: 运行集成**

Run: fresh server → `node server/tests/integration_exam.mjs`
Expected: FR104 全部新增 check PASS；score=8、correct_count=2 命中。

- [ ] **Step 5: 提交**

```bash
git add server/src/routes/exams.js server/tests/integration_exam.mjs
git commit -m "feat(fr104): 考试详情/开考 LEFT JOIN 带出 group_material + 组卷计分集成用例"
```

---

## Task 5: 判分聚合回归语料（子题独立计分口径固化）

**Files:** Create `server/tests/unit/fr104GradingCorpus.test.js`

- [ ] **Step 1: 写纯判分语料（直调 SSOT gradeQuestion，证明同组多子题各自计分可累加）**

```js
// server/tests/unit/fr104GradingCorpus.test.js
import { describe, it, expect } from 'vitest';
import { gradeQuestion } from '../../src/utils/examScoring.generated.js';

const sub = [
  { q: { type: 'single', answer: 'A', options: ['A', 'B'] }, ua: 'A', pts: 5 },   // 对 → 5
  { q: { type: 'fill_in', answer: '绿,绿' }, ua: '绿', pts: 3 },                    // 对 → 3
  { q: { type: 'short_answer', answer: 'x' }, ua: '任意', pts: 6 },                 // 人工 → earned 0
];

describe('FR104 材料题子题聚合判分', () => {
  it('逐子题独立给分，score=Σearned，correct_count 仅计 is_correct===true', () => {
    let score = 0, correct = 0;
    const earned = sub.map(({ q, ua, pts }) => {
      const g = gradeQuestion(q, ua, pts);
      score += g.earned; if (g.is_correct === true) correct += 1;
      return g;
    });
    expect(earned[0].earned).toBe(5);
    expect(earned[1].earned).toBe(3);
    expect(earned[2].needs_manual).toBe(true);
    expect(earned[2].earned).toBe(0);
    expect(score).toBe(8);
    expect(correct).toBe(2);
  });
});
```

- [ ] **Step 2: 运行确认通过**

Run: server vitest
Expected: PASS（SSOT 未改动，此用例作为回归固化与 PRD「子题聚合用例」证据）

- [ ] **Step 3: 提交**

```bash
git add server/tests/unit/fr104GradingCorpus.test.js
git commit -m "test(fr104): 子题独立计分聚合语料（SSOT 零改动回归固化）"
```

---

## Task 6: 跨租户隔离门禁（B 读/写 A 的材料组）

**Files:** Modify `server/tests/isolation.integration.mjs`

- [ ] **Step 1: 加断言**

在租户 teacher B 已登录的上下文里，对 A 的组做越权读写：
```js
  // FR104：B 越权读 A 的材料组 → 403/404
  const grpAId = /* 取自 A 建组结果，若无则按脚本既有 seed 方式新建一组 */;
  checkBlocked('FR104 B读A组详情', await api('GET', `/question-groups/${grpAId}`, tBToken));
  checkBlocked('FR104 B列A科目组(空/无权)', await api('GET', `/question-groups?subject_id=${subjA}`, tBToken), { allowEmpty: true });
```
> 若隔离脚本结构以「A 建资源、B 尝试访问」为范式，复用其既有 seed：让 A 建一个 question_group（POST /question-groups），记录 grpAId，再让 B `checkBlocked`。`GET ?subject_id=` 列他人科目组应返回空数组而非泄露——用 `allowEmpty` 变体断言「不泄露他组数据」。**实现时先读 isolation.integration.mjs 既有 teacherA/teacherB 变量名与 seed 段，按其命名落地。**

- [ ] **Step 2: 运行隔离门禁**

Run: fresh server → `node server/tests/isolation.integration.mjs`
Expected: 新增断言 PASS，全绿 0×429（避免与 integration 同窗口连跑，单独跑）。

- [ ] **Step 3: 提交**

```bash
git add server/tests/isolation.integration.mjs
git commit -m "test(fr104): 材料组跨租户隔离断言(403/404/不泄露)进门禁"
```

---

## Task 7: 前端类型 + questionGroupApi

**Files:** Modify `src/types.ts`、`src/services/api.ts`

- [ ] **Step 1: types.ts**
  - `ExamQuestionDetail` 与 `ExamQuestionFull` 各加：`group_id?: number | null;`、`group_material?: string | null;`
  - 新增：
```ts
export interface QuestionGroupInput {
  subject_id: string;
  material: string;
  questions: Array<{ type: string; title: string; code?: string; options?: string[]; answer: string | string[]; explanation?: string; points?: number }>;
}
export interface QuestionGroupSummary {
  id: number; subject_id: string; material: string; created_by: number; created_at: string;
  questions: { id: number; group_id: number; type: string; title: string; points: number }[];
}
export interface QuestionGroupDetail { id: number; subject_id: string; material: string; questions: Record<string, unknown>[]; }
```

- [ ] **Step 2: api.ts**
  - `QuestionItem` 加 `group_id?: number | null;`
  - 新增 `questionGroupApi`：
```ts
export const questionGroupApi = {
  create: (data: QuestionGroupInput) =>
    client.post<{ group_id: number; question_ids: number[]; message: string }>('/question-groups', data),
  list: (subjectId: string) =>
    client.get<{ groups: QuestionGroupSummary[] }>(`/question-groups?subject_id=${encodeURIComponent(subjectId)}`),
  detail: (id: number) =>
    client.get<{ group: QuestionGroupDetail }>(`/question-groups/${id}`),
};
```
（import 相应类型。）

- [ ] **Step 3: lint**

Run: `npx tsc --noEmit`
Expected: 0 错误

- [ ] **Step 4: 提交**

```bash
git add src/types.ts src/services/api.ts
git commit -m "feat(fr104): 前端 types(group_id/group_material/组接口)+questionGroupApi"
```

---

## Task 8: 前端 UI — 建组模态 + 组卷选组 + 作答材料渲染

**Files:** Create `src/components/exam/QuestionGroupForm.tsx`、Modify `src/pages/QuestionManagePage.tsx`、`src/components/exam/ExamForm.tsx`、`src/components/app/FormalExamScreen.tsx`

- [ ] **Step 1: QuestionGroupForm.tsx（受控模态）**
  - props：`{ open, subjectId, onClose, onCreated }`。
  - state：`material: string`、`subQuestions: QuestionGroupInput['questions']`（默认 1 行 single）。可增删子题行，每题字段与现有单题录入一致（type/title/options/answer/points）。
  - 提交调用 `questionGroupApi.create({ subject_id: subjectId, material, questions: subQuestions })`；成功 `onCreated()` + 关闭；失败显示 error。

- [ ] **Step 2: QuestionManagePage 入口**
  - 顶部操作区加「新建材料组」按钮（lucide `Layers` 图标），`useState` 控制模态 open，渲染 `<QuestionGroupForm open subjectId onClose onCreated={刷新列表}/>”。subjectId 取当前选中科目。

- [ ] **Step 3: ExamForm 选组批量加入**
  - 拉取：科目变化时并行 `questionGroupApi.list(subjectId)` 存 `groups` state。
  - 渲染「材料组」区：每个组显示材料摘要 + 「加入整组」按钮。点击：`setSelected(prev => { const next = {...prev}; g.questions.forEach(q => { if (next[q.id] === undefined) next[q.id] = q.points || 1; }); return next; })`。

- [ ] **Step 4: FormalExamScreen 材料渲染**
  - 在题型徽标行（L158-168）与题干 MarkdownRenderer（L170）之间插入：
```tsx
{currentQuestion.group_material ? (
  <div className="mb-4 p-4 rounded-2xl bg-amber-50 border border-amber-100">
    <div className="text-xs font-bold text-amber-600 uppercase mb-1">阅读材料</div>
    <MarkdownRenderer content={currentQuestion.group_material} className="text-slate-700 leading-relaxed" />
  </div>
) : null}
```

- [ ] **Step 5: lint + root vitest**

Run: `npx tsc --noEmit` → 0；`npx vitest run`（root）→ 全绿不回归。

- [ ] **Step 6: 提交**

```bash
git add src/components/exam/QuestionGroupForm.tsx src/pages/QuestionManagePage.tsx src/components/exam/ExamForm.tsx src/components/app/FormalExamScreen.tsx
git commit -m "feat(fr104): 建组模态+组卷选组+作答材料渲染"
```

---

## Task 9: 文档同步

**Files:** Modify `docs/开发文档.md`、`docs/产品需求文档-平台化演进.md`

- [ ] Step 1: 开发文档端点清单（§8.7）追加 `/api/question-groups` 三端点。
- [ ] Step 2: PRD FR-104 行标注「核心纵切已交付 v1（2026-10-13）：question_groups + 组卷选组 + 子题材料渲染 + 子题独立计分进隔离门禁；Excel 材料行导入约定/组内可视化编辑延后」；导入约定指向增量 2。
- [ ] Step 3: 提交 `git commit -m "docs(fr104): 同步材料组端点清单与 PRD FR-104 交付状态"`

---

## Task 10: 四重门禁回归 + DoD 复核

- [ ] **每个 HTTP 门单独起 fresh server**（避免 15min/300 次/IP 内存限流串扰，见教训）。
- [ ] integration_exam.mjs → exit 0；isolation.integration.mjs → exit 0（0×429）；server vitest（含 questionGroups 6 + fr104 corpus）全绿；root vitest 全绿；`npx tsc --noEmit` 0。
- [ ] DoD：`git diff main..HEAD -- src/shared/scoring server/src/utils/examScoring.generated.js` 为空（SSOT 零改动）；迁移仅新增 025 可整体 revert；文档同步；工作树无越界改动。

---

## Self-Review 记录

- **spec 覆盖**：数据模型(T1)、出题(T3)、组卷选组(T8)、下发渲染(T4/T8)、判分聚合(T4/T5)、隔离(T6)、门禁(T10)——spec §8 DoD 各项均有对应任务。
- **占位符**：集成/隔离脚本的具体变量名（tBToken/subjA/grpAId）在实现时须按脚本既有 seed 落地——已在 Task 6 Step 1 显式标注「先读 isolation.integration.mjs 既有命名」，不凭空猜。
- **类型一致**：`group_id/group_material` 字段名贯穿后端 SQL 别名、types.ts、FormalExamScreen、ExamForm；`questionGroupApi.create/list/detail` 与路由三端点一一对应；`QuestionGroupInput` 用于模态提交与 create。
