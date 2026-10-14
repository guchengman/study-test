# 分享落地页（科目公开分享）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 未登录访客通过 `/s/{科目邀请码}` 公开预览"全员共享"科目、免费试做客观题（服务端判分、不泄答案），并被引导注册加入。

**Architecture:** 新增两个公开无鉴权端点（`preview` + `grade`），逻辑做成返回 `{status, body}` 的纯 service（无 supertest 也能单测），路由只做薄映射；体验会话无状态、不落库；前端在鉴权外壳 `AppLayout` 之外加一条公开路由渲染落地页。零新表、零 nginx 改动。

**Tech Stack:** Node/Express + MySQL 5.7 + jsonwebtoken + express-rate-limit（server）；React + react-router + Tailwind（前端）；vitest（前后端单测）。

---

## 关键既有事实（实现时依赖，勿推翻）

- 题面字段是 **`title`**（不是 stem）；`options`/`answer` 为 JSON 列，`type ∈ single|multiple|programming`；题目软删列 **`deleted_at`**。
- 服务端判分**单一事实源** = `server/src/utils/examScoring.generated.js`，导出 `isAnswerCorrect(question, userAnswer)`（`question` 需 `{type, answer, options}`）。**严禁重写判分**。
- mysql2 会自动解析 JSON 列 → 读回可能是数组/对象，也可能是字符串（历史脏数据）；用容错 `asJson` 归一，勿裸 `JSON.parse`。
- 可见性：科目 `share_scope='all'` 才可公开；`invite_codes`（`type='subject'`）列 `code/subject_id/expires_at/used_count`。
- `JWT_SECRET` 生产强制存在（`index.js` 启动即校验）。`app.use('/api/xxx')` 各自决定鉴权，**无全局 auth 中间件** → `/api/public` 不加 auth 即公开。
- 限流工厂：`import { createLimiter } from './middleware/rateLimit.js'`（`createLimiter({windowMs,max,message})`）。
- 路由挂载点：`server/src/index.js` 第 160 行 `app.use('/api/streak', streakRoutes);` 之后、静态/SPA 兜底（192 行）之前。
- SPA 兜底 `app.get('*')` + nginx `try_files … /index.html` 已就位 → `/s/:code` 无需改动服务端/ nginx。
- 前端 api：`src/services/api.ts` 的 `client`（`API_BASE='/api'`），404/400 会抛 `{message,status}`；`subjectApi.join(code)` 已存在。
- 前端路由：`src/App.tsx` 用 `<Routes>`，业务页都在 `<Route element={<AppLayout/>}>` 内；公开页须加**平级** Route，不进 AppLayout。
- 迁移/脚本 `*.cjs` 全局被 gitignore；本计划**不新增迁移**（零新表）。

## 文件结构（创建/修改）

- Create: `server/src/utils/shareToken.js` — quizToken 签名/验签。
- Create: `server/src/services/publicShareService.js` — `buildPreview(db,code)` / `buildGrade(db,token,answers)`，返回 `{status, body}`。
- Create: `server/src/routes/publicShare.js` — 公开路由（薄映射 + 限流）。
- Create: `server/tests/unit/shareToken.test.js`、`server/tests/unit/publicShareService.test.js`。
- Modify: `server/src/index.js` — 挂 `/api/public`。
- Modify: `src/services/api.ts` — 加 `publicShareApi` + 返回类型。
- Create: `src/pages/PublicSharePage.tsx` — 落地页（含纯逻辑 helper）。
- Create: `src/pages/__tests__/publicShareView.test.ts` — helper 纯逻辑测试（无 DOM 依赖，稳妥可跑）。
- Modify: `src/App.tsx` — 加公开路由 `/s/:code`。
- Modify: `src/components/SubjectShareCode.tsx` — 加"复制分享链接"。
- Modify: `server/.env.example` — 加 `SHARE_PREVIEW_COUNT`（可选项，代码有默认 5）。

---

## Task 1: quizToken 签名/验签工具

**Files:**
- Create: `server/src/utils/shareToken.js`
- Test: `server/tests/unit/shareToken.test.js`

- [ ] **Step 1: 写失败测试**

`server/tests/unit/shareToken.test.js`：
```javascript
import { describe, it, expect } from 'vitest';
import { signShareToken, verifyShareToken } from '../../src/utils/shareToken.js';

describe('shareToken', () => {
  it('签发的 token 可验回 code 与 qids', () => {
    const t = signShareToken({ code: 'ABC123', qids: [1, 2, 3] });
    const p = verifyShareToken(t);
    expect(p.code).toBe('ABC123');
    expect(p.qids).toEqual([1, 2, 3]);
  });
  it('篡改 token 验签抛错', () => {
    const t = signShareToken({ code: 'ABC', qids: [1] });
    expect(() => verifyShareToken(t + 'x')).toThrow();
  });
  it('过期 token 被拒', () => {
    const t = signShareToken({ code: 'ABC', qids: [1] }, { expiresIn: '-1s' });
    expect(() => verifyShareToken(t)).toThrow();
  });
});
```

- [ ] **Step 2: 跑测试，确认失败**

Run: `cd server && npx vitest run tests/unit/shareToken.test.js`
Expected: FAIL（找不到模块 `shareToken.js`）

- [ ] **Step 3: 写最小实现**

`server/src/utils/shareToken.js`：
```javascript
// 分享体验卷的签名令牌：载荷只放 { code, qids }，不含任何答案。
// 密钥复用生产强制存在的 JWT_SECRET，禁止硬编码；缺失时启动即抛（与 index.js 校验一致）。
import jwt from 'jsonwebtoken';

function secret() {
  const s = process.env.JWT_SECRET;
  if (!s || String(s).trim().length < 16) {
    throw new Error('JWT_SECRET 未配置或过短，无法签发分享令牌');
  }
  return s;
}

export function signShareToken(payload, { expiresIn = '30m' } = {}) {
  return jwt.sign({ code: payload.code, qids: payload.qids }, secret(), { expiresIn });
}

export function verifyShareToken(token) {
  // 抛错即视为无效；调用方据此返回 400
  const p = jwt.verify(token, secret());
  return { code: p.code, qids: Array.isArray(p.qids) ? p.qids.map(Number) : [] };
}
```

- [ ] **Step 4: 跑测试，确认通过**

Run: `cd server && npx vitest run tests/unit/shareToken.test.js`
Expected: PASS（3 项）。若报 `JWT_SECRET` 相关失败，测试文件顶部加 `process.env.JWT_SECRET = 'test_secret_for_unit_0123456789';` 再跑。

- [ ] **Step 5: 提交**

```bash
git add server/src/utils/shareToken.js server/tests/unit/shareToken.test.js
git commit -m "feat(share): quizToken 签名/验签工具 (shareToken.js)"
```

---

## Task 2: 公开分享 service（可见性 + 抽样 + 预览 + 判分）

**Files:**
- Create: `server/src/services/publicShareService.js`
- Test: `server/tests/unit/publicShareService.test.js`

设计约定：service 函数返回 `{ status, body }`，路由只 `res.status(status).json(body)`；`db` 依赖注入（默认 `pool`），测试传 mock。

- [ ] **Step 1: 写失败测试**

`server/tests/unit/publicShareService.test.js`：
```javascript
import { describe, it, expect } from 'vitest';
import { buildPreview, buildGrade } from '../../src/services/publicShareService.js';

// 极简 mock：按 SQL 关键字返回预设行；query 返回 [rows]
function mockDb({ codeRow, subjectRow, typeRows, sampleRows, qrows }) {
  return {
    async query(sql, params) {
      if (/FROM invite_codes/.test(sql)) return [codeRow ? [codeRow] : []];
      if (/GROUP BY/.test(sql) && /FROM questions/.test(sql)) return [typeRows || []];
      if (/FROM questions/.test(sql) && /COUNT\(\*\)/.test(sql)) return [typeRows || []];
      if (/FROM questions/.test(sql) && /ORDER BY RAND/.test(sql)) return [sampleRows || []];
      if (/FROM questions/.test(sql) && /IN \(\?\)/.test(sql)) return [qrows || []];
      if (/FROM users/.test(sql)) return [[{ username: 'teacher_a' }]];
      return [[]];
    },
  };
}

describe('buildPreview', () => {
  it('有效 all 科目返回预览且响应不含 answer/explanation', async () => {
    const db = mockDb({
      codeRow: { subject_id: 'S1' },
      subjectRow: { id: 'S1', name: '数学', icon: '📐', welcome_title: '欢迎', welcome_desc: '介绍', share_scope: 'all', created_by: 9 },
      typeRows: [{ type: 'single', c: 10 }],
      sampleRows: [{ id: 1, type: 'single', title: '1+1=?', options: ['1', '2', '3'], answer: 'B' }],
    });
    // 让 subject 查询命中：覆盖 mock
    db.query = async (sql, params) => {
      if (/FROM invite_codes/.test(sql)) return [[{ subject_id: 'S1', expires_at: null }]];
      if (/FROM subjects/.test(sql)) return [[{ id: 'S1', name: '数学', icon: '📐', welcome_title: '欢迎', welcome_desc: '介绍', share_scope: 'all', created_by: 9 }]];
      if (/FROM users/.test(sql)) return [[{ username: 'teacher_a' }]];
      if (/GROUP BY/.test(sql)) return [[{ type: 'single', c: 10 }]];
      if (/ORDER BY RAND/.test(sql)) return [[{ id: 1, type: 'single', title: '1+1=?', options: ['1', '2', '3'], answer: 'B' }]];
      return [[]];
    };
    const r = await buildPreview(db, 'CODE1');
    expect(r.status).toBe(200);
    expect(r.body.subject.name).toBe('数学');
    expect(r.body.experience.questions[0]).toEqual({ id: 1, type: 'single', title: '1+1=?', options: ['1', '2', '3'] });
    const json = JSON.stringify(r.body);
    expect(json).not.toMatch(/"answer"/);
    expect(json).not.toMatch(/"explanation"/);
    expect(r.body.experience.quizToken).toBeTruthy();
  });

  it('私有科目 → 404 统一话术', async () => {
    const db = mockDb({});
    db.query = async (sql) => {
      if (/FROM invite_codes/.test(sql)) return [[{ subject_id: 'S1', expires_at: null }]];
      if (/FROM subjects/.test(sql)) return [[{ id: 'S1', name: 'x', share_scope: 'students', created_by: 9 }]];
      return [[]];
    };
    const r = await buildPreview(db, 'CODE1');
    expect(r.status).toBe(404);
    expect(r.body.error).toBe('链接不存在或已失效');
  });

  it('未知码 → 404 同一话术（防枚举）', async () => {
    const db = mockDb({ codeRow: null });
    const r = await buildPreview(db, 'BAD');
    expect(r.status).toBe(404);
    expect(r.body.error).toBe('链接不存在或已失效');
  });
});

describe('buildGrade', () => {
  it('全对 → scorePercent 100', async () => {
    const db = { async query() { return [[{ id: 1, type: 'single', answer: 'B', options: ['1', '2', '3'], deleted_at: null }]]; } };
    const { signShareToken } = await import('../../src/utils/shareToken.js');
    const token = signShareToken({ code: 'C', qids: [1] });
    const r = await buildGrade(db, token, { 1: 'B' });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ total: 1, correct: 1, scorePercent: 100 });
    expect(JSON.stringify(r.body)).not.toMatch(/"answer"/);
  });
  it('令牌被篡改 → 400', async () => {
    const db = {};
    const r = await buildGrade(db, 'garbage.token.value', { 1: 'A' });
    expect(r.status).toBe(400);
  });
  it('忽略令牌外的 qid（防探测任意题）', async () => {
    const db = { async query() { return [[{ id: 1, type: 'single', answer: 'B', options: ['1', '2', '3'], deleted_at: null }]]; } };
    const { signShareToken } = await import('../../src/utils/shareToken.js');
    const token = signShareToken({ code: 'C', qids: [1] });
    const r = await buildGrade(db, token, { 1: 'B', 999: 'A' });
    expect(r.body.total).toBe(1);
    expect(r.body.results.map((x) => x.qid)).toEqual([1]);
  });
});
```
> 测试文件顶部同样需 `process.env.JWT_SECRET = 'test_secret_for_unit_0123456789';`（在 import 前设置：作为文件第一行）。

- [ ] **Step 2: 跑测试，确认失败**

Run: `cd server && npx vitest run tests/unit/publicShareService.test.js`
Expected: FAIL（找不到 `publicShareService.js`）

- [ ] **Step 3: 写最小实现**

`server/src/services/publicShareService.js`：
```javascript
// 分享落地页核心逻辑（可见性 + 抽样 + 预览 + 无状态判分）。
// 返回 { status, body }；任何响应体手工白名单构造，绝不含 answer/explanation。
import pool from '../db.js';
import { isAnswerCorrect } from '../utils/examScoring.generated.js';
import { signShareToken, verifyShareToken } from '../utils/shareToken.js';

const NOT_FOUND = { status: 404, body: { error: '链接不存在或已失效' } };
const previewCount = () => {
  const n = parseInt(process.env.SHARE_PREVIEW_COUNT, 10);
  return Number.isInteger(n) && n > 0 ? n : 5;
};

// 容错解析 JSON 列（mysql2 可能已解析为对象/数组，历史也可能仍是字符串）
function asJson(v) {
  if (v == null) return v;
  if (typeof v === 'string') { try { return JSON.parse(v); } catch { return v; } }
  return v;
}

async function resolvePublicSubject(db, code) {
  const [codes] = await db.query(
    'SELECT subject_id, expires_at FROM invite_codes WHERE code = ? AND type = \'subject\' LIMIT 1',
    [code]
  );
  if (!codes.length) return null;
  const c = codes[0];
  if (c.expires_at && new Date(c.expires_at).getTime() < Date.now()) return null; // 码过期
  const [subs] = await db.query(
    'SELECT id, name, icon, welcome_title, welcome_desc, share_scope, created_by FROM subjects WHERE id = ? LIMIT 1',
    [c.subject_id]
  );
  if (!subs.length) return null;
  const s = subs[0];
  if (s.share_scope !== 'all') return null; // 非全员共享不可公开发现
  return s;
}

export async function buildPreview(db = pool, code) {
  if (!code || typeof code !== 'string') return NOT_FOUND;
  const subject = await resolvePublicSubject(db, code);
  if (!subject) return NOT_FOUND;

  const [types] = await db.query(
    'SELECT type, COUNT(*) c FROM questions WHERE subject_id = ? AND deleted_at IS NULL GROUP BY type',
    [subject.id]
  );
  const byType = {};
  let questionCount = 0;
  for (const t of types) { byType[t.type] = Number(t.c); questionCount += Number(t.c); }

  const [rows] = await db.query(
    'SELECT id, type, title, options, answer FROM questions WHERE subject_id = ? AND deleted_at IS NULL AND type IN (\'single\',\'multiple\') ORDER BY RAND() LIMIT ?',
    [subject.id, previewCount()]
  );

  const questions = rows.map((r) => ({ id: r.id, type: r.type, title: r.title, options: asJson(r.options) ?? [] }));
  const qids = rows.map((r) => r.id);
  const quizToken = signShareToken({ code, qids });

  let creator = null;
  if (subject.created_by) {
    const [us] = await db.query('SELECT username FROM users WHERE id = ? LIMIT 1', [subject.created_by]);
    creator = us.length ? { displayName: us[0].username } : null;
  }

  return {
    status: 200,
    body: {
      subject: {
        name: subject.name, icon: subject.icon,
        welcomeTitle: subject.welcome_title, welcomeDesc: subject.welcome_desc,
        questionCount, byType,
      },
      creator,
      experience: { quizToken, questions },
    },
  };
}

export async function buildGrade(db = pool, token, answers) {
  let payload;
  try { payload = verifyShareToken(token); } catch { return { status: 400, body: { error: '体验会话无效或已过期' } }; }
  const qids = payload.qids; // 只信令牌内 id
  if (!qids.length) return { status: 400, body: { error: '体验会话无效' } };

  const [rows] = await db.query(
    'SELECT id, type, answer, options FROM questions WHERE id IN (?) AND deleted_at IS NULL',
    [qids]
  );
  const safeAnswers = answers && typeof answers === 'object' ? answers : {};
  const results = rows.map((r) => {
    const q = { type: r.type, answer: asJson(r.answer), options: asJson(r.options) };
    const correct = isAnswerCorrect(q, safeAnswers[String(r.id)] ?? safeAnswers[r.id]);
    return { qid: r.id, correct };
  });
  const total = results.length;
  const correct = results.filter((x) => x.correct).length;
  const scorePercent = total > 0 ? Math.round((correct / total) * 100) : 0;
  return { status: 200, body: { total, correct, scorePercent, results } };
}
```
> 注：`WHERE id IN (?)` 传数组，mysql2 会自动展开为占位符列表（项目内 `examSweep`/`statsService` 有同款用法）。

- [ ] **Step 4: 跑测试，确认通过**

Run: `cd server && npx vitest run tests/unit/publicShareService.test.js`
Expected: PASS（buildPreview 3 项 + buildGrade 3 项）。

- [ ] **Step 5: 提交**

```bash
git add server/src/services/publicShareService.js server/tests/unit/publicShareService.test.js
git commit -m "feat(share): 公开分享 service（可见性/抽样/预览/无状态判分，响应不泄答案）"
```

---

## Task 3: 公开路由 + 限流 + 挂载

**Files:**
- Create: `server/src/routes/publicShare.js`
- Modify: `server/src/index.js`（约 44 行 import 区 + 160 行挂载区）

- [ ] **Step 1: 写路由（薄映射，无鉴权）**

`server/src/routes/publicShare.js`：
```javascript
// 公开分享端点：无需鉴权，置于 /api/public。限流防刷；响应来自 service 白名单，不含答案。
import { Router } from 'express';
import { createLimiter } from '../middleware/rateLimit.js';
import { buildPreview, buildGrade } from '../services/publicShareService.js';
import log from '../utils/logger.js';

const router = Router();

const previewLimiter = createLimiter({ windowMs: 15 * 60 * 1000, max: 60, message: '预览过于频繁，请稍后再试' });
// grade 更严：防批量刷判分/探测答案
const gradeLimiter = createLimiter({ windowMs: 15 * 60 * 1000, max: 30, message: '提交过于频繁，请稍后再试' });

router.get('/share/:code', previewLimiter, async (req, res) => {
  try {
    const r = await buildPreview(req.db || undefined, req.params.code);
    res.status(r.status).json(r.body);
  } catch (e) {
    log.error({ err: e }, '分享预览失败');
    res.status(500).json({ error: '服务器内部错误' });
  }
});

router.post('/share/grade', gradeLimiter, async (req, res) => {
  try {
    const { quizToken, answers } = req.body || {};
    const r = await buildGrade(req.db || undefined, quizToken, answers);
    res.status(r.status).json(r.body);
  } catch (e) {
    log.error({ err: e }, '分享判分失败');
    res.status(500).json({ error: '服务器内部错误' });
  }
});

export default router;
```
> `buildPreview(db=pool, ...)` 用默认参：路由不传 `req.db` 时 service 内部默认取 `pool`。此处 `req.db || undefined` 让默认参数生效。

- [ ] **Step 2: 在 index.js 挂载（公开，置于 streak 之后、静态兜底之前）**

修改 `server/src/index.js`：在 `import streakRoutes ...`（第 44 行）后加：
```javascript
import publicShareRoutes from './routes/publicShare.js';
```
在 `app.use('/api/streak', streakRoutes);`（第 160 行）后加：
```javascript
// 公开分享落地页端点（无需鉴权，须置于 SPA 兜底 app.get('*') 之前）
app.use('/api/public', publicShareRoutes);
```

- [ ] **Step 3: 冒烟验证路由已挂（起服务/或 grep 确认）**

Run: `cd server && npx vitest run`（确保未破坏既有用例）+ 人工确认：
```bash
git grep -n "app.use('/api/public'" server/src/index.js
```
Expected: 命中 1 行；全量测试通过。

- [ ] **Step 4: 提交**

```bash
git add server/src/routes/publicShare.js server/src/index.js
git commit -m "feat(share): 公开分享路由 /api/public/share（无鉴权+限流）并挂载"
```

---

## Task 4: 前端 API 客户端

**Files:**
- Modify: `src/services/api.ts`（在 `subjectApi` 附近追加导出 + 类型）

- [ ] **Step 1: 追加类型与 `publicShareApi`**

在 `src/services/api.ts` 末尾（`inviteCodeApi` 段附近）追加：
```typescript
// ─── 公开分享落地页（无需登录） ───────────────────────────
export interface PublicShareQuestion { id: number; type: 'single' | 'multiple'; title: string; options: string[]; }
export interface PublicSharePreview {
  subject: { name: string; icon: string; welcomeTitle: string; welcomeDesc: string; questionCount: number; byType: Record<string, number> };
  creator: { displayName: string } | null;
  experience: { quizToken: string; questions: PublicShareQuestion[] };
}
export interface PublicShareGradeResult { qid: number; correct: boolean }
export interface PublicShareGrade { total: number; correct: number; scorePercent: number; results: PublicShareGradeResult[] }

export const publicShareApi = {
  preview: (code: string, signal?: AbortSignal) =>
    client.get<PublicSharePreview>(`/public/share/${encodeURIComponent(code)}`, signal),
  grade: (quizToken: string, answers: Record<string, unknown>) =>
    client.post<PublicShareGrade>('/public/share/grade', { quizToken, answers }),
};
```
> `client` 会把 token 附带上（若有），公开端点忽略之；404/400 抛 `{message,status}`。

- [ ] **Step 2: 类型检查**

Run: `npx tsc --noEmit`（或项目 TS 检查命令）
Expected: 无新增错误。

- [ ] **Step 3: 提交**

```bash
git add src/services/api.ts
git commit -m "feat(share): 前端 publicShareApi 客户端与类型"
```

---

## Task 5: 落地页纯逻辑 helper + 测试

把"预览数据 → 视图状态"与"判分提交"的纯逻辑抽成 helper，便于无 DOM 测试。

**Files:**
- Create: `src/pages/publicShareView.ts`
- Test: `src/pages/__tests__/publicShareView.test.ts`

- [ ] **Step 1: 写失败测试**

`src/pages/__tests__/publicShareView.test.ts`：
```typescript
import { describe, it, expect } from 'vitest';
import { isAnswerableType, buildAnswersPayload } from '../publicShareView';

describe('publicShareView helpers', () => {
  it('仅 single/multiple 可作答', () => {
    expect(isAnswerableType('single')).toBe(true);
    expect(isAnswerableType('multiple')).toBe(true);
    expect(isAnswerableType('programming')).toBe(false);
  });
  it('answers payload 只含 qid→选项，无其它字段', () => {
    const p = buildAnswersPayload({ 1: 'B', 2: ['A', 'C'] });
    expect(p).toEqual({ 1: 'B', 2: ['A', 'C'] });
  });
});
```

- [ ] **Step 2: 跑测试，确认失败**

Run: `npx vitest run src/pages/__tests__/publicShareView.test.ts`
Expected: FAIL（找不到模块）

- [ ] **Step 3: 写实现**

`src/pages/publicShareView.ts`：
```typescript
import type { PublicShareQuestion } from '../services/api';

export function isAnswerableType(type: string): boolean {
  return type === 'single' || type === 'multiple';
}

// 仅把 {qid: 选项} 原样转成 wire 形态（键转字符串），无其它字段
export function buildAnswersPayload(answers: AnswerMap): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(answers)) out[k] = v;
  return out;
}

// 视图状态机
export type SharePhase = 'loading' | 'invalid' | 'preview' | 'quiz' | 'result';

// 每题所选（multiple 用数组）
export type AnswerMap = Record<number, string | string[]>;

export function singleSelect(prev: AnswerMap, q: PublicShareQuestion, choice: string): AnswerMap {
  if (q.type === 'multiple') {
    const cur = Array.isArray(prev[q.id]) ? (prev[q.id] as string[]) : [];
    const next = cur.includes(choice) ? cur.filter((c) => c !== choice) : [...cur, choice].sort();
    return { ...prev, [q.id]: next };
  }
  return { ...prev, [q.id]: choice };
}
```

- [ ] **Step 4: 跑测试，确认通过**

Run: `npx vitest run src/pages/__tests__/publicShareView.test.ts`
Expected: PASS（2 项）。

- [ ] **Step 5: 提交**

```bash
git add src/pages/publicShareView.ts src/pages/__tests__/publicShareView.test.ts
git commit -m "feat(share): 落地页纯逻辑 helper（可作答类型/答案载荷/选择态）+ 测试"
```

---

## Task 6: `PublicSharePage.tsx` + 公开路由

**Files:**
- Create: `src/pages/PublicSharePage.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: 写落地页组件**

`src/pages/PublicSharePage.tsx`：
```tsx
import { useEffect, useState, type ReactNode } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { publicShareApi, type PublicSharePreview, type PublicShareGrade } from '../services/api';
import { singleSelect, buildAnswersPayload, type AnswerMap } from './publicShareView';

type Phase = 'loading' | 'invalid' | 'preview' | 'quiz' | 'result';

export function PublicSharePage() {
  const { code = '' } = useParams();
  const navigate = useNavigate();
  const [phase, setPhase] = useState<Phase>('loading');
  const [data, setData] = useState<PublicSharePreview | null>(null);
  const [answers, setAnswers] = useState<AnswerMap>({});
  const [grade, setGrade] = useState<PublicShareGrade | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await publicShareApi.preview(code);
        if (!alive) return;
        setData(res);
        setPhase('preview');
      } catch {
        if (alive) setPhase('invalid');
      }
    })();
    return () => { alive = false; };
  }, [code]);

  const copyCodeAndGoRegister = async () => {
    try { await navigator.clipboard.writeText(code); } catch { /* 忽略复制失败 */ }
    navigate('/');
  };

  if (phase === 'loading') return <Shell><p className="text-slate-500">加载中…</p></Shell>;

  if (phase === 'invalid') return (
    <Shell>
      <h1 className="text-xl font-bold text-slate-800 mb-2">链接不存在或已失效</h1>
      <p className="text-slate-500 mb-4">该分享可能已被取消或过期。</p>
      <button onClick={() => navigate('/')} className="px-4 py-2 bg-blue-600 text-white rounded-lg">前往首页</button>
    </Shell>
  );

  const s = data!.subject;
  return (
    <Shell>
      <div className="text-center mb-6">
        <div className="text-4xl mb-2">{s.icon || '📚'}</div>
        <h1 className="text-2xl font-bold text-slate-800">{s.name}</h1>
        {s.welcomeTitle && <p className="text-slate-600 mt-1">{s.welcomeTitle}</p>}
        {s.welcomeDesc && <p className="text-sm text-slate-400 mt-1 max-w-md mx-auto">{s.welcomeDesc}</p>}
        <p className="text-xs text-slate-400 mt-2">共 {s.questionCount} 道题{data!.creator ? ` · by ${data!.creator.displayName}` : ''}</p>
      </div>

      {phase === 'preview' && (
        <div className="flex flex-col items-center gap-3">
          <p className="text-slate-500 text-sm">先来 {data!.experience.questions.length} 道体验题试试看？</p>
          <button onClick={() => setPhase('quiz')} className="px-5 py-2.5 bg-emerald-600 text-white rounded-xl font-medium">开始免费体验</button>
        </div>
      )}

      {(phase === 'quiz' || phase === 'result') && (
        <div className="space-y-5">
          {phase === 'result' && grade && (
            <div className="text-center p-4 bg-blue-50 rounded-xl">
              <div className="text-3xl font-bold text-blue-700">{grade.scorePercent} 分</div>
              <div className="text-sm text-slate-500 mt-1">答对 {grade.correct}/{grade.total}</div>
            </div>
          )}
          {data!.experience.questions.map((q, qi) => {
            const picked = answers[q.id];
            const verdict = grade?.results.find((r) => r.qid === q.id);
            return (
              <div key={q.id} className="p-4 bg-white rounded-xl border border-slate-100">
                <div className="font-medium text-slate-800 mb-3">{qi + 1}. {q.title}
                  {phase === 'result' && verdict && (
                    <span className={`ml-2 text-sm ${verdict.correct ? 'text-emerald-600' : 'text-rose-500'}`}>
                      {verdict.correct ? '✓ 正确' : '✗ 错误'}
                    </span>
                  )}
                </div>
                <div className="space-y-2">
                  {(q.options || []).map((opt, oi) => {
                    const label = String.fromCharCode(65 + oi); // A/B/C...
                    const chosen = q.type === 'multiple' ? Array.isArray(picked) && picked.includes(label) : picked === label;
                    return (
                      <button key={label} disabled={phase === 'result'}
                        onClick={() => setAnswers((prev) => singleSelect(prev, q, label))}
                        className={`w-full text-left px-3 py-2 rounded-lg border ${chosen ? 'border-blue-500 bg-blue-50' : 'border-slate-200 hover:bg-slate-50'}`}>
                        <span className="font-medium text-slate-500 mr-2">{label}</span>{opt}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {phase === 'quiz' && (
            <button
              onClick={async () => {
                const g = await publicShareApi.grade(data!.experience.quizToken, buildAnswersPayload(answers));
                setGrade(g);
                setPhase('result');
              }}
              className="w-full py-2.5 bg-blue-600 text-white rounded-xl font-medium">提交体验卷</button>
          )}
          {phase === 'result' && (
            <button onClick={copyCodeAndGoRegister}
              className="w-full py-2.5 bg-emerald-600 text-white rounded-xl font-medium">
              注册解锁完整题库与解析（邀请码已复制）
            </button>
          )}
        </div>
      )}
    </Shell>
  );
}

const Shell = ({ children }: { children: ReactNode }) => (
  <div className="min-h-screen bg-slate-50 flex items-start justify-center px-4 py-10">
    <div className="w-full max-w-lg">{children}</div>
  </div>
);
```
> 安全：所有老师自填文本（name/title/options/welcomeDesc）都经 JSX 插值 → React 默认转义，无 `dangerouslySetInnerHTML`。选项用 A/B/C 标签提交（`isAnswerCorrect` 支持标签）。

- [ ] **Step 2: 在 App.tsx 加公开路由（与 AppLayout 平级）**

修改 `src/App.tsx`：顶部 lazy 区加：
```tsx
const PublicSharePage = lazy(() => import('./pages/PublicSharePage').then((m) => ({ default: m.PublicSharePage })));
```
在 `<Routes>` 内、`<Route element={<AppLayout />}>…</Route>` **之后**（同级）加：
```tsx
<Route path="s/:code" element={<Suspense fallback={<PageFallback />}><PublicSharePage /></Suspense>} />
```

- [ ] **Step 3: 类型 + 构建检查**

Run: `npx tsc --noEmit`
Expected: 无新增错误。

- [ ] **Step 4: 提交**

```bash
git add src/pages/PublicSharePage.tsx src/App.tsx
git commit -m "feat(share): PublicSharePage 落地页 + 公开路由 /s/:code（AppLayout 之外）"
```

---

## Task 7: 科目分享面板加"复制分享链接"

**Files:**
- Modify: `src/components/SubjectShareCode.tsx`

- [ ] **Step 1: 在读到 `shareCode` 后追加"复制链接"按钮**

在组件展示 `shareCode` 的区域，追加（与现有复制邀请码按钮并列）：
```tsx
{shareCode && (
  <button
    onClick={async () => {
      try { await navigator.clipboard.writeText(`${window.location.origin}/s/${shareCode}`); setCopied(true); setTimeout(() => setCopied(false), 1500); }
      catch { /* 忽略 */ }
    }}
    className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-sm flex items-center gap-1 hover:bg-emerald-700"
    title="复制公开分享链接">
    <Copy size={14} /><span>复制分享链接</span>
  </button>
)}
```
> `Copied`/`Copy` 图标已在该文件 import（来自 lucide-react）；沿用现有 `copied` state。

- [ ] **Step 2: 类型检查**

Run: `npx tsc --noEmit`
Expected: 无新增错误。

- [ ] **Step 3: 提交**

```bash
git add src/components/SubjectShareCode.tsx
git commit -m "feat(share): 科目分享面板增加“复制分享链接”（指向 /s/:code）"
```

---

## Task 8: 配置、全量验证与自检

**Files:**
- Modify: `server/.env.example`

- [ ] **Step 1: `.env.example` 追加可选项**

在文件末尾追加：
```dotenv
# 分享落地页每次体验抽取的题目数（缺省 5）
SHARE_PREVIEW_COUNT=5
```

- [ ] **Step 2: 后端全量测试**

Run: `cd server && npx vitest run`
Expected: 全绿（新增 shareToken + publicShareService 用例并入，总数增加）。

- [ ] **Step 3: 前端全量测试 + 类型 + 构建**

Run: `npx vitest run`（前端）与 `npx tsc --noEmit` 与 `npm run build`
Expected: 全绿、无类型错误、构建成功（不产出安装包）。

- [ ] **Step 4: 防泄题自检（红线核验）**

人工核验：
```bash
git grep -n "answer\|explanation" -- server/src/services/publicShareService.js server/src/routes/publicShare.js
```
Expected: `answer` 仅出现在 SQL 选取与服务端判分内部（`asJson(r.answer)` 传给 `isAnswerCorrect`），**任何 `return body`/`res.json` 的构造对象都不含 `answer`/`explanation` 字段**；测试用例已断言 `JSON.stringify(body)` 不含 `"answer"`。

- [ ] **Step 5: 提交**

```bash
git add server/.env.example
git commit -m "chore(share): .env.example 增加 SHARE_PREVIEW_COUNT 并做全量验证收口"
```

---

## Definition of Done

- 后端 `cd server && npx vitest run` 全绿；含：有效 all 码 200 且响应序列化无 `"answer"`/`"explanation"`、私有/过期/未知码统一 404 同话术、抽题仅 single/multiple、判分正确、令牌篡改→400、忽略令牌外 qid。
- 前端 `npx vitest run` + `npx tsc --noEmit` + `npm run build` 全绿；`/s/:code` 渲染落地页，预览/答题/结果/失效四态可用。
- `app.use('/api/public', …)` 已挂且无鉴权中间件；两端点带 `createLimiter`。
- 零新表、零 nginx 改动；不改任何既有路由行为。
- 每个 Task 独立提交；全部完成后走 finishing（推送前 L3）。

## 明确排除（本期不做）
- 试卷/单题分享；访问/答题/转化埋点（`share_links`/`share_events`）；选项乱序；访客体验成绩续存/并入；`/?join=` 自动预填（CTA 用"复制码+回首页"）。
