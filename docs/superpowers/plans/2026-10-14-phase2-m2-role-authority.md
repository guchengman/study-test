# Phase 2 · M2 角色权威切换（Role Authority Switch）实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把服务端判权的权威源从全局 `users.role`（烤进 JWT）切换为 `org_members.role`（按当前操作组织解析），全程通过统一能力层 + 双读对账开关落地，**行为零变更**。

**Architecture:** 新增 `authority.js` 能力解析层：`resolveAuthority` 中间件在 `authMiddleware` 之后把「操作组织 orgId + 组织内角色 orgRole + 生效能力集合 caps」挂到 `req`；所有判权点改调 `hasCapability(req, cap)` / `requireCapability(cap)`。角色→能力用两张矩阵（旧词表 `users.role`、新词表 `org_members.role`）分别定义，由环境变量 `ROLE_AUTHORITY_SOURCE`（`legacy|shadow|org`）决定用哪张矩阵做决策；`shadow` 阶段用旧矩阵决策、同时算新矩阵并对比打日志，保证零行为变更，对账干净后再翻 `org`。

**Tech Stack:** Node.js + Express + mysql2（`server/`），Vitest（`server/tests/`），现有 `personalOrg.js` 影子工具。

**关键前提（已核实）：**
- 当前**只有 PERSONAL 租户**（1 人 = 1 组织），`org_members.role` 由 `mapUserRoleToOrg(users.role)` 1:1 派生（`admin→platform_admin`、`teacher→content_author`、其余→`examinee`）。因此「换权威源」在只换源阶段结果与旧值**完全等价**——这正是零行为变更的依据。
- 判权点散落约 12 文件 / 66 处；三处 `isOwner` 语义不同：`exams.js` = `admin || owner`，`exports.js`/`stats.js` = `admin || teacher || owner`。能力矩阵必须区分这两类旁路。
- `org_admin` 目前无人持有（M3 建真实组织才会出现），能力集合里预先包含它是安全的、且是本次切换的前向价值所在。

---

## 文件结构

- Create: `server/src/utils/authority.js` — 能力矩阵 + `resolveAuthority` 中间件 + `hasCapability` / `requireCapability`。
- Create: `server/scripts/reconcile-role-authority.cjs` — 全量对账脚本（`mapUserRoleToOrg(users.role)` vs `org_members.role`）。
- Modify: `server/src/index.js` — 在全局 `authMiddleware` 使用点之后串接 `resolveAuthority`（或在各路由 `authMiddleware` 后追加）。
- Modify: `server/src/middleware/auth.js` — `adminMiddleware` 改走能力层。
- Modify: `server/src/utils/access.js` — `canManageSubject` 改走能力层。
- Modify: `server/src/routes/{exams,exports,stats}.js` — 三处 `isOwner` 收敛到统一 helper。
- Modify: `server/src/routes/{students,questions,subjects,invite-codes,questionGroups,judge}.js` — 判权点改调 `hasCapability`。
- Modify: `server/.env.example` — 增加 `ROLE_AUTHORITY_SOURCE` 说明。
- Test: `server/tests/unit/authority.test.js`、`server/tests/unit/role-authority-reconcile.test.js`。

**能力词表（本次用到的全部 cap，务必逐字一致）：**

| cap | 含义 | 旧 `users.role` 持有者 | 新 `org_members.role` 持有者 |
|---|---|---|---|
| `platform.super` | 平台超管（现状 `role==='admin'` 的一切旁路） | admin | platform_admin |
| `content.manage` | 内容管理（`adminMiddleware`、`canManageSubject` 的 admin/teacher） | admin, teacher | platform_admin, org_admin, content_author |
| `student.manage` | 管理学员（students.js 的 teacher/admin） | admin, teacher | platform_admin, org_admin, content_author |
| `exam.manage_super` | 跨属主管理考试（exams.js isOwner 的 admin 旁路） | admin | platform_admin |
| `exam.manage_any` | 跨属主管理考试（exports/stats isOwner 的 admin+teacher 旁路） | admin, teacher | platform_admin, org_admin, content_author |
| `invite.manage` | 生成注册邀请码（invite-codes 的 teacher/admin） | admin, teacher | platform_admin, org_admin, content_author |
| `actor.examinee` | 考生身份（questions.js `role==='student'` 触发 teacher_id 查表） | student | examinee |

---

## Task 1: 能力矩阵与解析核心（纯函数，先不接中间件）

**Files:**
- Create: `server/src/utils/authority.js`
- Test: `server/tests/unit/authority.test.js`

- [ ] **Step 1: 写失败测试**

创建 `server/tests/unit/authority.test.js`：

```javascript
import { describe, it, expect } from 'vitest';
import {
  LEGACY_ROLE_CAPS,
  ORG_ROLE_CAPS,
  capsForLegacyRole,
  capsForOrgRole,
  authoritySource,
} from '../../src/utils/authority.js';

describe('capability matrix', () => {
  it('admin 拥有 platform.super 但不含 student.manage 之外的考生能力', () => {
    expect(capsForLegacyRole('admin')).toContain('platform.super');
    expect(capsForLegacyRole('admin')).toContain('student.manage');
    expect(capsForLegacyRole('admin')).not.toContain('actor.examinee');
  });
  it('teacher 有 content.manage/student.manage/exam.manage_any 但无 platform.super', () => {
    const t = capsForLegacyRole('teacher');
    expect(t).toContain('content.manage');
    expect(t).toContain('student.manage');
    expect(t).toContain('exam.manage_any');
    expect(t).not.toContain('platform.super');
    expect(t).not.toContain('exam.manage_super'); // exams.js 只 admin 旁路
  });
  it('student 只有考生能力', () => {
    const s = capsForLegacyRole('student');
    expect(s).toContain('actor.examinee');
    expect(s).not.toContain('content.manage');
  });
  it('org 词表：platform_admin ⊇ content_author ⊇ examinee 能力单调', () => {
    expect(capsForOrgRole('platform_admin')).toContain('platform.super');
    expect(capsForOrgRole('content_author')).toContain('exam.manage_any');
    expect(capsForOrgRole('content_author')).not.toContain('platform.super');
    expect(capsForOrgRole('examinee')).toContain('actor.examinee');
  });
  it('等价性：mapUserRoleToOrg 后旧/新能力集合一致', () => {
    // admin→platform_admin, teacher→content_author, student/independent→examinee
    const pairs = [['admin', 'platform_admin'], ['teacher', 'content_author'], ['student', 'examinee'], ['independent', 'examinee']];
    for (const [legacy, org] of pairs) {
      expect([...capsForLegacyRole(legacy)].sort()).toEqual([...capsForOrgRole(org)].sort());
    }
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd server && npx vitest run tests/unit/authority.test.js`
Expected: FAIL（`Cannot find module .../authority.js`）

- [ ] **Step 3: 写最小实现**

创建 `server/src/utils/authority.js`：

```javascript
// ============================================================
// M2 角色权威层（PRD §5.2 角色映射 + §5.3 影子租户）
// ------------------------------------------------------------
// 把判权权威源从 users.role（全局、烤进 JWT）切换到 org_members.role
// （按当前操作组织解析）。三档开关 ROLE_AUTHORITY_SOURCE：
//   legacy —— 纯旧行为（回滚开关）
//   shadow —— 旧矩阵决策 + 新矩阵对账打差异日志（默认，零行为变更）
//   org    —— 新矩阵决策（对账干净后切换）
// 能力词表见计划文档「能力词表」表；改 cap 名必须同步矩阵与调用点。
// ============================================================

/** 旧词表：users.role ∈ {admin,teacher,student,independent} */
export const LEGACY_ROLE_CAPS = {
  admin: ['platform.super', 'content.manage', 'student.manage', 'exam.manage_super', 'exam.manage_any', 'invite.manage'],
  teacher: ['content.manage', 'student.manage', 'exam.manage_any', 'invite.manage'],
  student: ['actor.examinee'],
  independent: ['actor.examinee'],
};

/** 新词表：org_members.role ∈ {platform_admin,org_admin,content_author,examinee,reader} */
export const ORG_ROLE_CAPS = {
  platform_admin: ['platform.super', 'content.manage', 'student.manage', 'exam.manage_super', 'exam.manage_any', 'invite.manage'],
  org_admin: ['content.manage', 'student.manage', 'exam.manage_any', 'invite.manage'],
  content_author: ['content.manage', 'student.manage', 'exam.manage_any', 'invite.manage'],
  examinee: ['actor.examinee'],
  reader: [],
};

export function capsForLegacyRole(role) {
  return new Set(LEGACY_ROLE_CAPS[role] || []);
}

export function capsForOrgRole(orgRole) {
  return new Set(ORG_ROLE_CAPS[orgRole] || []);
}

export function authoritySource() {
  const s = (process.env.ROLE_AUTHORITY_SOURCE || 'shadow').trim().toLowerCase();
  return s === 'legacy' || s === 'org' ? s : 'shadow';
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd server && npx vitest run tests/unit/authority.test.js`
Expected: PASS（含「等价性」用例，证明只换源结果不变）

- [ ] **Step 5: 提交**

```bash
git add server/src/utils/authority.js server/tests/unit/authority.test.js
git commit -m "feat(m2): add capability matrix for role authority switch (legacy/org parity)"
```

---

## Task 2: `resolveAuthority` 中间件（加载 orgRole + 双读对账日志）

**Files:**
- Modify: `server/src/utils/authority.js`（追加）
- Test: `server/tests/unit/authority.test.js`（追加）

- [ ] **Step 1: 写失败测试**

在 `authority.test.js` 追加：

```javascript
import { computeCaps, logAuthorityDrift } from '../../src/utils/authority.js';

describe('resolveAuthority decision', () => {
  it('legacy 源：用 users.role 决定 caps', () => {
    process.env.ROLE_AUTHORITY_SOURCE = 'legacy';
    const caps = computeCaps({ legacyRole: 'teacher', orgRole: 'examinee' });
    expect(caps.has('content.manage')).toBe(true);
  });
  it('org 源：用 org_members.role 决定 caps', () => {
    process.env.ROLE_AUTHORITY_SOURCE = 'org';
    const caps = computeCaps({ legacyRole: 'teacher', orgRole: 'examinee' });
    expect(caps.has('content.manage')).toBe(false);
    expect(caps.has('actor.examinee')).toBe(true);
  });
  it('shadow 源：决策用 legacy，但检测到漂移时回调 onDrift', () => {
    process.env.ROLE_AUTHORITY_SOURCE = 'shadow';
    let drifted = null;
    const caps = computeCaps({ legacyRole: 'admin', orgRole: 'examinee', onDrift: (d) => (drifted = d) });
    expect(caps.has('platform.super')).toBe(true); // 仍按 legacy 决策
    expect(drifted).toEqual({ legacyRole: 'admin', orgRole: 'examinee' }); // 漂移被记录
  });
  it('shadow 源：legacy 与 org 等价时不报漂移', () => {
    process.env.ROLE_AUTHORITY_SOURCE = 'shadow';
    let called = false;
    computeCaps({ legacyRole: 'teacher', orgRole: 'content_author', onDrift: () => (called = true) });
    expect(called).toBe(false);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd server && npx vitest run tests/unit/authority.test.js`
Expected: FAIL（`computeCaps` 未定义）

- [ ] **Step 3: 实现 `computeCaps` + `resolveAuthority`**

在 `authority.js` 追加：

```javascript
function sameCaps(a, b) {
  if (a.size !== b.size) return false;
  for (const x of a) if (!b.has(x)) return false;
  return true;
}

/**
 * 依据开关算出生效能力集合。
 * shadow：用 legacy 决策，若 legacy 能力集 ≠ org 能力集则回调 onDrift（对账信号）。
 * @returns {Set<string>} 生效 caps
 */
export function computeCaps({ legacyRole, orgRole, onDrift }) {
  const src = authoritySource();
  const legacyCaps = capsForLegacyRole(legacyRole);
  const orgCaps = capsForOrgRole(orgRole);
  if (src === 'org') return orgCaps;
  if (src === 'legacy') return legacyCaps;
  // shadow
  if (!sameCaps(legacyCaps, orgCaps) && onDrift) onDrift({ legacyRole, orgRole });
  return legacyCaps;
}

/** 漂移日志（限频交给调用侧，这里只发一条 warn）。 */
export function logAuthorityDrift(userId, info) {
  console.warn(
    `[role-authority:drift] user=${userId} legacy=${info.legacyRole} org=${info.orgRole} ` +
      `(mapUserRoleToOrg 与 org_members.role 不一致，M3 迁移前应对账清零)`
  );
}

/**
 * 取用户在「操作组织」内的 org_members.role。
 * 只换源阶段：操作组织 = 用户 PERSONAL 组织（resolvePersonalOrgId）。
 * @returns {Promise<{orgId:number|null, orgRole:string|null}>}
 */
export async function loadOrgRole(db, userId) {
  const [rows] = await db.execute(
    `SELECT m.org_id, m.role FROM org_members m
     JOIN organizations o ON o.id = m.org_id AND o.type = 'PERSONAL'
     WHERE m.user_id = ? LIMIT 1`,
    [userId]
  );
  if (rows.length === 0) return { orgId: null, orgRole: null };
  return { orgId: rows[0].org_id, orgRole: rows[0].role };
}

import pool from '../db.js';

/**
 * Express 中间件：在 authMiddleware 之后运行，把 req.orgId / req.caps 注入。
 * 不改动 req.user（JWT 里的 legacy role 保留，供 computeCaps 对账）。
 */
export function resolveAuthority(req, res, next) {
  if (!req.user) return next(); // 未鉴权路由直接放行
  (async () => {
    try {
      const { orgId, orgRole } = await loadOrgRole(pool, req.user.id);
      req.orgId = orgId;
      req.orgRole = orgRole;
      req.caps = computeCaps({
        legacyRole: req.user.role,
        orgRole,
        onDrift: (info) => logAuthorityDrift(req.user.id, info),
      });
      next();
    } catch (err) {
      // 权威层异常不得放大为 500：回退 legacy 决策，保证零行为变更
      console.warn('[role-authority] 解析失败，回退 legacy:', err.message);
      req.orgId = null;
      req.orgRole = null;
      req.caps = capsForLegacyRole(req.user.role);
      next();
    }
  })();
}

/** 同步判权（在已跑过 resolveAuthority 的 req 上）。 */
export function hasCapability(req, cap) {
  return !!(req.caps && req.caps.has(cap));
}

/** 路由守卫工厂。 */
export function requireCapability(...caps) {
  return (req, res, next) => {
    if (!caps.some((c) => hasCapability(req, c))) {
      return res.status(403).json({ error: '权限不足' });
    }
    next();
  };
}
```

> 注：`import pool from '../db.js'` 放到文件顶部与其它 import 合并（此处为展示就近；实现时移到顶部，避免 import 散落）。

- [ ] **Step 4: 跑测试确认通过**

Run: `cd server && npx vitest run tests/unit/authority.test.js`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add server/src/utils/authority.js server/tests/unit/authority.test.js
git commit -m "feat(m2): add resolveAuthority middleware, computeCaps dual-read + drift logging"
```

---

## Task 3: 把 `resolveAuthority` 串进鉴权链

**Files:**
- Modify: `server/src/middleware/auth.js`（`authMiddleware` 末尾调用 `resolveAuthority`，或导出组合中间件）
- Test: `server/tests/unit/authority.test.js`（追加集成断言，可选）

- [ ] **Step 1: 决策串接方式（二选一，本计划选 A）**

- **A（推荐，改动最小）**：不改 `authMiddleware`；在 `server/src/index.js` 里每个 `router.use('/api/xxx', authMiddleware, ...)` 之后无法统一插桩，故改为**导出一个 `authWithAuthority`**：`authMiddleware` 成功 `req.user=decoded` 后紧接 `resolveAuthority`。把所有路由文件里的 `authMiddleware` 引用替换为 `authWithAuthority`。
- B：在 `authMiddleware` 内部直接 `await` 解析（把 `authMiddleware` 改 async）。风险：auth.js 变有状态依赖 db，测试桩更难。

采用 A。

- [ ] **Step 2: 在 `auth.js` 增加组合中间件**

在 `server/src/middleware/auth.js` 顶部 import 区加：

```javascript
import { resolveAuthority } from '../utils/authority.js';
```

在 `authMiddleware` 定义之后加：

```javascript
/** authMiddleware + 权威解析（M2）。路由用它替换裸 authMiddleware。 */
export const authWithAuthority = (req, res, next) => {
  authMiddleware(req, res, (err) => {
    if (err) return next(err);
    if (!req.user) return next();
    resolveAuthority(req, res, next);
  });
};
```

> 若 `authMiddleware` 内部直接 `next()`（无 err 参数约定），则简化为顺序数组中间件：`export const authWithAuthority = [authMiddleware, resolveAuthority];` 并在路由处 `router.get(path, authWithAuthority, handler)`（Express 支持中间件数组）。**实现时以现有 `authMiddleware` 的调用风格为准**：它是 `(req,res,next)` 且直接 `next()`，故用数组形式最稳。

- [ ] **Step 3: 批量替换路由 import 与使用点**

对 `server/src/routes/` 下所有使用 `authMiddleware` 的文件：
1. import 增加 `authWithAuthority`（从 `../middleware/auth.js`）。
2. 将 `router.<verb>(..., authMiddleware,` 替换为 `router.<verb>(..., authWithAuthority,`。

Run（列出受影响点，逐文件核对）：
```bash
cd server && grep -rln "authMiddleware" src/routes
```
Expected: 覆盖 exams/questions/subjects/students/stats/exports/invite-codes/questionGroups/judge/practice/sync/upload/tags/admin/notifications/streak/quota/ai 等。

> 注意：`adminMiddleware` 内部依赖 `req.user`，其前置已是 `authWithAuthority`，无需额外改动。

- [ ] **Step 4: 冒烟：现有路由测试全绿（零行为变更）**

Run: `cd server && npx vitest run`
Expected: 既有全部测试 PASS（`shadow` 默认下 caps 由 legacy 决定，行为不变）。若有依赖 `req.caps` 未注入的测试报错，说明某路由漏替换。

- [ ] **Step 5: 提交**

```bash
git add server/src/middleware/auth.js server/src/routes
git commit -m "feat(m2): wire resolveAuthority via authWithAuthority into all protected routes (shadow mode)"
```

---

## Task 4: 全量对账脚本 + CI 断言

**Files:**
- Create: `server/scripts/reconcile-role-authority.cjs`
- Test: `server/tests/unit/role-authority-reconcile.test.js`

- [ ] **Step 1: 写对账查询（核心 SQL）**

创建 `server/scripts/reconcile-role-authority.cjs`：

```javascript
// 对账：每个用户 PERSONAL 组织的 org_members.role 是否 = mapUserRoleToOrg(users.role)
// 退出码非 0 表示存在漂移（M3 迁移前必须为 0）。
const mysql = require('mysql2/promise');
require('dotenv').config();

const EXPECT = { admin: 'platform_admin', teacher: 'content_author' }; // 其余 → examinee

(async () => {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST, user: process.env.DB_USER,
    password: process.env.DB_PASSWORD, database: process.env.DB_NAME,
  });
  const [rows] = await conn.query(`
    SELECT u.id, u.username, u.role AS legacy_role, m.role AS org_role
    FROM users u
    JOIN organizations o ON o.type='PERSONAL' AND o.name=u.username
    LEFT JOIN org_members m ON m.user_id=u.id AND m.org_id=o.id
  `);
  const drift = rows.filter((r) => {
    const want = EXPECT[r.legacy_role] || 'examinee';
    return (r.org_role || null) !== want;
  });
  console.log(`[reconcile] 用户总数=${rows.length} 漂移=${drift.length}`);
  drift.slice(0, 50).forEach((r) =>
    console.log(`  user#${r.id} ${r.username}: legacy=${r.legacy_role} org=${r.org_role} 期望=${EXPECT[r.legacy_role] || 'examinee'}`)
  );
  await conn.end();
  process.exit(drift.length === 0 ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(2); });
```

- [ ] **Step 2: 加纯逻辑单测（不连库，测漂移判定函数）**

创建 `server/tests/unit/role-authority-reconcile.test.js`：

```javascript
import { describe, it, expect } from 'vitest';
const EXPECT = { admin: 'platform_admin', teacher: 'content_author' };
const expectedOrgRole = (legacy) => EXPECT[legacy] || 'examinee';

describe('reconcile expected mapping', () => {
  it('与 mapUserRoleToOrg 同口径', async () => {
    const { mapUserRoleToOrg } = await import('../../src/utils/personalOrg.js');
    for (const r of ['admin', 'teacher', 'student', 'independent']) {
      expect(expectedOrgRole(r)).toBe(mapUserRoleToOrg(r));
    }
  });
});
```

- [ ] **Step 3: 跑单测**

Run: `cd server && npx vitest run tests/unit/role-authority-reconcile.test.js`
Expected: PASS

- [ ] **Step 4: 对真实库跑一次对账（本地/测试库）**

Run: `cd server && node scripts/reconcile-role-authority.cjs`
Expected: `漂移=0`，退出码 0。若 >0，先修数据再进 Task 5（不得带漂移翻 `org`）。

- [ ] **Step 5: 提交**

```bash
git add server/scripts/reconcile-role-authority.cjs server/tests/unit/role-authority-reconcile.test.js
git commit -m "feat(m2): add role-authority reconciliation script + parity test"
```

---

## Task 5: 收敛三处 `isOwner` 到统一 helper（保留语义差异）

**Files:**
- Modify: `server/src/routes/exams.js`、`server/src/routes/exports.js`、`server/src/routes/stats.js`
- Test: `server/tests/unit/authority.test.js`（追加）

- [ ] **Step 1: 写失败测试（helper 语义）**

追加到 `authority.test.js`：

```javascript
import { canManageExam } from '../../src/utils/authority.js';

describe('canManageExam', () => {
  const mkReq = (caps) => ({ caps: new Set(caps), user: { id: 7 } });
  it('属主恒可管理', () => {
    expect(canManageExam({ created_by: 7 }, mkReq([]), 'exam.manage_super')).toBe(true);
  });
  it('非属主需对应旁路能力', () => {
    expect(canManageExam({ created_by: 8 }, mkReq(['exam.manage_super']), 'exam.manage_super')).toBe(true);
    expect(canManageExam({ created_by: 8 }, mkReq([]), 'exam.manage_super')).toBe(false);
  });
  it('exports/stats 用 exam.manage_any 旁路', () => {
    expect(canManageExam({ created_by: 8 }, mkReq(['exam.manage_any']), 'exam.manage_any')).toBe(true);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd server && npx vitest run tests/unit/authority.test.js`
Expected: FAIL（`canManageExam` 未定义）

- [ ] **Step 3: 实现 `canManageExam`**

`authority.js` 追加：

```javascript
/**
 * 统一「能否管理某考试/成绩」。属主恒可；非属主需 bypassCap 能力。
 * @param exam 含 created_by 的行
 * @param req  已注入 req.caps / req.user
 * @param bypassCap 'exam.manage_super'(exams.js) 或 'exam.manage_any'(exports.js/stats.js)
 */
export function canManageExam(exam, req, bypassCap) {
  if (exam.created_by === req.user.id) return true;
  return hasCapability(req, bypassCap);
}
```

- [ ] **Step 4: 替换三处本地 `isOwner`**

- `exams.js`：删除本地 `function isOwner`（第 35-37 行），import `canManageExam`，把每处 `isOwner(exam, req.user.id, req.user.role)` 改为 `canManageExam(exam, req, 'exam.manage_super')`。
- `exports.js`：删除本地 `isOwner`（第 24-26 行），改 `canManageExam(examRows[0], req, 'exam.manage_any')`。
- `stats.js`：删除本地 `isOwner`（第 26 行附近），改 `canManageExam(examRows[0], req, 'exam.manage_any')`。

Run（确认无残留本地 isOwner）：
```bash
cd server && grep -rn "function isOwner" src/routes
```
Expected: 无输出。

- [ ] **Step 5: 跑测试 + 提交**

```bash
cd server && npx vitest run tests/unit/authority.test.js
git add server/src/utils/authority.js server/src/routes/exams.js server/src/routes/exports.js server/src/routes/stats.js server/tests/unit/authority.test.js
git commit -m "refactor(m2): unify isOwner trio into canManageExam capability helper"
```

---

## Task 6: 迁移 `adminMiddleware` 与 `canManageSubject`

**Files:**
- Modify: `server/src/middleware/auth.js`、`server/src/utils/access.js`
- Test: `server/tests/unit/authority.test.js`（可选集成）

- [ ] **Step 1: `adminMiddleware` 改走能力**

`auth.js` 中 `adminMiddleware` 体替换为：

```javascript
import { hasCapability } from '../utils/authority.js';

export function adminMiddleware(req, res, next) {
  // 旧：role in (admin,teacher) → 新：content.manage（platform_admin/org_admin/content_author 持有）
  if (!hasCapability(req, 'content.manage')) {
    return res.status(403).json({ error: '权限不足' });
  }
  next();
}
```

> 前置须是 `authWithAuthority`（Task 3 已保证），否则 `req.caps` 未注入。使用 `adminMiddleware` 的路由确认其上游为 `authWithAuthority`。

- [ ] **Step 2: `canManageSubject` 改走能力（保留属主 OR）**

`access.js`：`canManageSubject` 目前把「admin/teacher」写进 SQL 子查询。改为两段：先查属主，再用能力判超管。签名调整为接收 `req`：

```javascript
export async function canManageSubject(req, subjectId) {
  const [rows] = await pool.execute(
    `SELECT created_by FROM subjects WHERE id = ?`,
    [subjectId]
  );
  if (rows.length === 0) return false;
  if (rows[0].created_by === req.user.id) return true;
  return hasCapability(req, 'content.manage');
}
```

- 更新 `canManageSubject` 全部调用点：由 `(userId, subjectId)` 改为 `(req, subjectId)`。
  Run: `cd server && grep -rn "canManageSubject(" src`
  逐个把第一个实参从 `req.user.id` 改为 `req`。

- [ ] **Step 3: 全量测试**

Run: `cd server && npx vitest run`
Expected: 全绿（shadow 下等价）。

- [ ] **Step 4: 提交**

```bash
git add server/src/middleware/auth.js server/src/utils/access.js server/src/routes
git commit -m "refactor(m2): route adminMiddleware & canManageSubject through capability layer"
```

---

## Task 7: 迁移 students / questions / subjects / invite-codes / questionGroups / judge 判权点

统一替换规则（逐点应用，语义严格对齐「能力词表」）：

| 原始判定 | 替换为 |
|---|---|
| `req.user.role === 'admin'` | `hasCapability(req, 'platform.super')` |
| `req.user.role !== 'admin'` | `!hasCapability(req, 'platform.super')` |
| `req.user.role in (admin,teacher)` 类（students/invite reg-code） | `hasCapability(req, 'student.manage')` / `hasCapability(req, 'invite.manage')` |
| `req.user.role === 'student'`（questions teacher_id 查表触发） | `hasCapability(req, 'actor.examinee')` |
| `isAdmin = req.user.role === 'admin' ? 1 : 0`（SQL 参数） | `const isAdmin = hasCapability(req, 'platform.super') ? 1 : 0` |

**Files & 逐点：**

- [ ] **Step 1: students.js** — 5 处 `req.user.role !== 'teacher' && req.user.role !== 'admin'` → `!hasCapability(req, 'student.manage')`。`teacher_id` 归属过滤保持不变（那是数据关系，不是角色权威）。

- [ ] **Step 2: questions.js** — `role==='student'`→`hasCapability(req,'actor.examinee')`；所有 `role==='admin'`/`isAdmin`→`platform.super`。

- [ ] **Step 3: subjects.js** — `req.user.role === 'admin' ? 1 : 0`（第 194 行）与 `req.user.role !== 'admin'`（274/306）→ `platform.super`。第 17/345 行 `const userRole = req.user.role` 若仅用于日志可保留；若用于判权改 `req.caps`。

- [ ] **Step 4: invite-codes.js** — 第 31/157/160 `role==='admin'`→`platform.super`；第 88 `role!=='admin'`→`!platform.super`；第 103 reg-code `teacher||admin`→`hasCapability(req,'invite.manage')`。

- [ ] **Step 5: questionGroups.js** — 第 74/104 `role!=='admin'`→`!hasCapability(req,'platform.super')`（属主 `created_by` 判定保留）。

- [ ] **Step 6: judge.js** — 第 58 `role!=='admin'`→`!hasCapability(req,'platform.super')`。

每个文件顶部 import：`import { hasCapability } from '../utils/authority.js';`

- [ ] **Step 7: 全量测试 + 手工回归关键路径**

Run: `cd server && npx vitest run`
Expected: 全绿。
再本地起服务，用 admin/teacher/student 各跑一遍：建题、组卷、判分、导出、管学生、生成邀请码、回收站可见性 —— 与切换前逐一对照应完全一致。

- [ ] **Step 8: 提交**

```bash
git add server/src/routes
git commit -m "refactor(m2): migrate remaining role checks to capability layer"
```

---

## Task 8: 翻开关到 `org` + 运行手册 + 文档

**Files:**
- Modify: `server/.env.example`
- Create: `docs/superpowers/plans/2026-10-14-m2-rollout-runbook.md`

- [ ] **Step 1: `.env.example` 增加说明**

```
# M2 角色权威源：legacy(纯旧) | shadow(双读对账,默认) | org(以 org_members.role 为准)
# 翻 org 前必须：node scripts/reconcile-role-authority.cjs 输出「漂移=0」
ROLE_AUTHORITY_SOURCE=shadow
```

- [ ] **Step 2: 写运行手册（切换 + 回滚）**

`docs/superpowers/plans/2026-10-14-m2-rollout-runbook.md`：

```markdown
# M2 角色权威切换 运行手册

## 灰度顺序
1. 部署本计划代码，保持 ROLE_AUTHORITY_SOURCE=shadow，观察日志 `[role-authority:drift]` 是否出现。
2. 跑 `node scripts/reconcile-role-authority.cjs`，确认「漂移=0」。有漂移先补 org_members（或排查注册链路 ensurePersonalOrg）。
3. 测试库设 ROLE_AUTHORITY_SOURCE=org，跑全量 vitest + 手工回归。
4. 生产 `pm2 restart study-server --update-env` 前先备份 .env；改 org；观察 30 分钟。

## 回滚
任一步异常：把 ROLE_AUTHORITY_SOURCE 改回 legacy（或 shadow），`pm2 restart --update-env`，即时生效，无需回滚代码。

## 只换源阶段的已知边界
- 操作组织恒为个人 PERSONAL 组织；org_admin/reader 尚无人持有。
- 真实多租户隔离（跨 org 过滤）属 M3，本计划不引入 org 上下文选择。
```

- [ ] **Step 3: 提交**

```bash
git add server/.env.example docs/superpowers/plans/2026-10-14-m2-rollout-runbook.md
git commit -m "docs(m2): add role authority source flag config + rollout runbook"
```

- [ ] **Step 4: 生产翻 `org`（人工，按运行手册执行，非自动）**

---

## 验收标准（Definition of Done）

- [ ] `npx vitest run` 全绿；「等价性」单测长期在位（防止矩阵漂移）。
- [ ] `node scripts/reconcile-role-authority.cjs` 输出「漂移=0」。
- [ ] `grep -rn "req.user.role" server/src/routes server/src/middleware server/src/utils` 仅剩 `auth.js` 里 `generateToken`（JWT 仍携带 legacy role 作对账兜底）与日志用途；**所有判权点无 `req.user.role` 直接比较**。
- [ ] `grep -rn "function isOwner" server/src` 无输出。
- [ ] `ROLE_AUTHORITY_SOURCE=org` 下手工回归 admin/teacher/student 三条链路，行为与 legacy 一致。
- [ ] 回滚开关（legacy/shadow）验证可用。

## 不在本计划范围（明确排除）

- 真实 SCHOOL/ENTERPRISE 组织创建、成员邀请、组织切换 UI/API → M3。
- 查询路径按 org_id 过滤（跨租户不可见）→ M3（依赖非 PERSONAL 数据）。
- `org_admin`/`reader` 的授予流程 → M3。
- 把 `role` 从 JWT 彻底移除 → 待 org 稳定后单列（本计划保留 legacy role 作对账/回滚兜底）。
