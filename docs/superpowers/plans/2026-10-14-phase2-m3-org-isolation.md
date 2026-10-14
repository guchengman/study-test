# M3 数据地基：跨租户隔离的「零风险准备 + shadow 对账」Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 Phase 2 M3（存量迁移 + 跨租户强隔离）铺设**零行为变更**的数据地基：建目标表、落地「师生同属一个共享组织」的分组数据、并把 org 读过滤做成**仅打日志不改结果**的 shadow 开关，用它**量化**将来开闸会隐藏哪些数据，作为下一步迁移的驱动力。

**Architecture:** 新增 `orgScope.js`（`orgIsolationMode()` 三档 off/shadow/enforce + `withOrg(alias, orgIds)` 谓词构建）与 `orgIsolationShadow.js`（对同一请求算「按 org 过滤会隐藏什么」，仅在 shadow 下打 `[org-isolation:shadow]` 日志、**绝不改响应**）。迁移 029 建 `departments`/`resource_acl`（空表，前向兼容）；迁移 030 把 `teacher_id` 关系落成共享 SCHOOL 组织 + 成员 + 老师内容 `org_id` 重指。读路径不改结果，只旁路比对。开闸（enforce）与订阅类 acl 迁移属后续计划，本计划**只铺地基与度量**。

**Tech Stack:** Node/Express、MySQL 5.7（utf8mb4_unicode_ci，migrate.js 按「分号+换行」拆句，体内禁行内分号）、vitest（纯函数 + 假 rows）、shell 对账脚本（mysql2/promise，镜像 014 的 UPDATE…JOIN 与对账 SELECT 模式）。

**权威约定（复刻 M2）：** 三档开关 `ORG_ISOLATION_MODE`（默认 `off`）。`off`=线上现状；`shadow`=旁路比对、打日志、不改结果；`enforce`=真正按 org 过滤（**本计划不启用，留后续**）。回滚 = 改回 off + `pm2 restart --update-env`。

---

## 文件结构（File Structure）

| 动作 | 路径 | 职责 |
|---|---|---|
| Create | `server/src/utils/orgScope.js` | 纯函数：模式解析 + org 过滤谓词/参数构建 |
| Create | `server/src/utils/orgIsolationShadow.js` | `loadUserOrgIds` + shadow 旁路比对与漂移日志（非纯，DB） |
| Create | `server/migrations/029_resource_acl_departments.sql` | 建 `departments` + `resource_acl`（空表） |
| Create | `server/migrations/030_teacher_class_grouping.sql` | 师生共享组织 + 成员 + 老师内容 org_id 重指（幂等/可回滚/对账） |
| Modify | `server/src/routes/subjects.js` | list 读路径接入 shadow 旁路（默认 off，零变更） |
| Modify | `server/src/routes/exams.js` | list 读路径接入 shadow 旁路 |
| Modify | `server/src/routes/questions.js` | list 读路径接入 shadow 旁路 |
| Create | `server/tests/unit/org-scope.test.js` | 纯函数单测（模式 + 谓词） |
| Create | `server/tests/unit/org-isolation-shadow.test.js` | shadow 漂移计算（注入 orgIds + 假 rows，无 DB） |
| Create | `server/scripts/reconcile-org-isolation.cjs` | 对账：org_id 缺失分布 + 分组完整性（镜像 014 对账风格） |
| Modify | `.gitignore` | 负向放行 `!server/scripts/reconcile-org-isolation.cjs` |
| Modify | `server/.env.example` | 增 `ORG_ISOLATION_MODE` 说明 |
| Create | `docs/superpowers/plans/2026-10-14-m3-isolation-runbook.md` | 开闸/回滚运行手册 + 翻 enforce 的判据（drift=0） |

> 说明：本计划**不改**任何路由的返回结果。所有读路径改动形如「跑完原查询 → 若 mode=shadow 旁路比对打日志 → 原样返回」。

---

## Task 1：org 隔离开关 + 谓词构建（纯函数）

**Files:**
- Create: `server/src/utils/orgScope.js`
- Test: `server/tests/unit/org-scope.test.js`

- [ ] **Step 1: 写失败测试**

```javascript
// server/tests/unit/org-scope.test.js
import { describe, it, expect, afterEach } from 'vitest';
import { orgIsolationMode, buildOrgFilter } from '../src/utils/orgScope.js';

const ORIG = process.env.ORG_ISOLATION_MODE;
afterEach(() => {
  if (ORIG === undefined) delete process.env.ORG_ISOLATION_MODE;
  else process.env.ORG_ISOLATION_MODE = ORIG;
});

describe('orgIsolationMode', () => {
  it('默认 off', () => { delete process.env.ORG_ISOLATION_MODE; expect(orgIsolationMode()).toBe('off'); });
  it('shadow 生效', () => { process.env.ORG_ISOLATION_MODE = 'shadow'; expect(orgIsolationMode()).toBe('shadow'); });
  it('enforce 生效（大小写/空格容错）', () => { process.env.ORG_ISOLATION_MODE = ' ENFORCE '; expect(orgIsolationMode()).toBe('enforce'); });
  it('非法值回落 off', () => { process.env.ORG_ISOLATION_MODE = 'yes'; expect(orgIsolationMode()).toBe('off'); });
});

describe('buildOrgFilter', () => {
  it('orgIds=[3,5] → IN(?,?)', () => {
    expect(buildOrgFilter('s', [3, 5])).toEqual({ clause: ' AND s.org_id IN (?,?)', params: [3, 5] });
  });
  it('orgIds=[] → 恒不命中', () => {
    expect(buildOrgFilter('s', [])).toEqual({ clause: ' AND 1=0', params: [] });
  });
  it('去重且升序', () => {
    expect(buildOrgFilter('t', [5, 5, 1]).clause).toBe(' AND t.org_id IN (?,?)');
    expect(buildOrgFilter('t', [5, 5, 1]).params).toEqual([1, 5]);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd server && npx vitest run tests/unit/org-scope.test.js`
Expected: FAIL（`Cannot find module .../orgScope.js`）

- [ ] **Step 3: 最小实现**

```javascript
// server/src/utils/orgScope.js
// M3 数据地基：org 读过滤的开关与谓词构建（纯函数，零 DB）。
// 权威源=org_members：某用户可见的数据 = 其所属全部组织的并集。
//   （一人可属多组织：个人 PERSONAL + 所在班级/企业），故过滤单位是 `org_id IN (用户组织集合)`，
//   而非单一 currentOrg。

export function orgIsolationMode() {
  const s = (process.env.ORG_ISOLATION_MODE || 'off').trim().toLowerCase();
  return s === 'shadow' || s === 'enforce' ? s : 'off';
}

/** 构建 org 过滤片段。alias=表别名；orgIds=用户所属组织 id 数组。 */
export function buildOrgFilter(alias, orgIds) {
  const ids = [...new Set((orgIds || []).map((n) => Number(n)).filter((n) => Number.isInteger(n)))].sort(
    (a, b) => a - b
  );
  if (ids.length === 0) return { clause: ' AND 1=0', params: [] };
  return { clause: ` AND ${alias}.org_id IN (${ids.map(() => '?').join(',')})`, params: ids };
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd server && npx vitest run tests/unit/org-scope.test.js`
Expected: PASS（7 测）

- [ ] **Step 5: 提交**

```bash
git add server/src/utils/orgScope.js server/tests/unit/org-scope.test.js
git commit -m "feat(m3): add org isolation mode flag + org filter builder (pure)"
```

---

## Task 2：shadow 旁路比对器（漂移计算）

**Files:**
- Create: `server/src/utils/orgIsolationShadow.js`
- Test: `server/tests/unit/org-isolation-shadow.test.js`

职责：`loadUserOrgIds` 取用户所属组织集合；`shadowCompare` 用「纯函数」算出**按 org 过滤会隐藏哪些当前可见行**并打日志；`maybeShadowCheckByOrg` 只在 mode=shadow 时触发（off/enforce 都直接 return）。**绝不改调用方的 rows/响应。**

- [ ] **Step 1: 写失败测试（注入 orgIds + 假 rows，无 DB）**

```javascript
// server/tests/unit/org-isolation-shadow.test.js
import { describe, it, expect, vi } from 'vitest';
import { shadowCompare, isShadowActive } from '../src/utils/orgIsolationShadow.js';

describe('shadowCompare', () => {
  it('orgIds=[1]：org_id=1 保留、org_id=2 隐藏、NULL 记 missingOrg', () => {
    const rows = [{ id: 1, org_id: 1 }, { id: 2, org_id: 2 }, { id: 3, org_id: null }];
    const r = shadowCompare(rows, [1], 'subjects');
    expect(r.kept).toEqual([1]);
    expect(r.wouldHide).toEqual([{ id: 2, org_id: 2 }]);
    expect(r.missingOrg).toEqual([{ id: 3 }]);
    expect(r.drift).toBe(2); // wouldHide + missingOrg
  });
  it('全部同组织 → drift=0', () => {
    const r = shadowCompare([{ id: 1, org_id: 7 }], [7], 'x');
    expect(r.drift).toBe(0);
    expect(r.kept).toEqual([1]);
  });
  it('空 rows → 全 0', () => {
    expect(shadowCompare([], [1], 'x')).toEqual({ kept: [], wouldHide: [], missingOrg: [], drift: 0 });
  });
});

describe('isShadowActive', () => {
  it('由环境变量决定', () => {
    vi.stubEnv('ORG_ISOLATION_MODE', 'shadow');
    expect(isShadowActive()).toBe(true);
    vi.stubEnv('ORG_ISOLATION_MODE', 'off');
    expect(isShadowActive()).toBe(false);
    vi.unstubAllEnvs();
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd server && npx vitest run tests/unit/org-isolation-shadow.test.js`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 最小实现**

```javascript
// server/src/utils/orgIsolationShadow.js
// M3 数据地基：org 隔离 shadow 旁路比对器。
//   * 只读、只打日志，绝不修改调用方数据或响应。
//   * mode=off → isShadowActive()=false → 调用点直接 return，零开销/零变更。
//   * mode=enforce → 也不走这里（由过滤读路径在后续计划直接应用 buildOrgFilter）。
import pool from '../db.js';
import { orgIsolationMode } from './orgScope.js';
import log from './logger.js';

export function isShadowActive() {
  return orgIsolationMode() === 'shadow';
}

/** 用户所属全部组织 id（org_members 权威）。失败返回 []（调用方据此判空，不影响主流程）。 */
export async function loadUserOrgIds(db, userId) {
  try {
    const [rows] = await db.execute(
      'SELECT org_id FROM org_members WHERE user_id = ?',
      [userId]
    );
    return rows.map((r) => r.org_id);
  } catch {
    return [];
  }
}

/** 纯函数：给定当前可见 rows 与用户组织集合，算「按 org 过滤会隐藏什么」。 */
export function shadowCompare(rows, orgIds, table) {
  const set = new Set((orgIds || []).map(Number));
  const kept = [];
  const wouldHide = [];
  const missingOrg = [];
  for (const r of rows || []) {
    if (r.org_id === null || r.org_id === undefined) {
      missingOrg.push({ id: r.id });
    } else if (set.has(Number(r.org_id))) {
      kept.push(r.id);
    } else {
      wouldHide.push({ id: r.id, org_id: r.org_id });
    }
  }
  return { kept, wouldHide, missingOrg, drift: wouldHide.length + missingOrg.length };
}

function logShadow(userId, table, res) {
  if (res.drift === 0) return;
  const preview = res.wouldHide.slice(0, 10).map((x) => x.id).join(',');
  log.warn(
    `[org-isolation:shadow] user=${userId} table=${table} drift=${res.drift} ` +
      `wouldHide=${res.wouldHide.length} missingOrg=${res.missingOrg.length} hideIds=[${preview}]`
  );
}

/**
 * 在 shadow 模式下旁路比对并打日志；非 shadow 直接 return。调用方拿到结果后忽略即可——
 * 本函数不返回业务数据、不改 rows。
 */
export async function maybeShadowCheckByOrg(req, rows, table) {
  if (!isShadowActive() || !Array.isArray(rows)) return;
  const orgIds = await loadUserOrgIds(pool, req.user.id);
  logShadow(req.user.id, table, shadowCompare(rows, orgIds, table));
}
```

> 若 `logger.js` 未暴露 `warn`，用 `log.warn || console.warn` 兜底；实现时先读 `server/src/utils/logger.js` 确认可用方法，缺则补 `warn` 别名（不改动既有 `info/error`）。

- [ ] **Step 4: 跑测试确认通过**

Run: `cd server && npx vitest run tests/unit/org-isolation-shadow.test.js`
Expected: PASS（4 测）

- [ ] **Step 5: 提交**

```bash
git add server/src/utils/orgIsolationShadow.js server/tests/unit/org-isolation-shadow.test.js
git commit -m "feat(m3): add org-isolation shadow comparator + would-hide drift logging"
```

---

## Task 3：迁移 029 — 建 `departments` + `resource_acl`（空表，前向兼容）

**Files:**
- Create: `server/migrations/029_resource_acl_departments.sql`

- [ ] **Step 1: 写迁移**

```sql
-- 029_resource_acl_departments.sql
-- M3 数据地基：建两张新模型目标表，本阶段仅建表，不接入任何读写路径 —— 行为零变更。
--   * departments：班级(kind=CLASS)/部门(kind=DEPT)，org_members.dept_id 的目标（013 预留列）。
--   * resource_acl：跨租户资源共享授权，是 subject_subscriptions / subject_student_access 的落点
--     （订阅类跨组织共享的迁移属后续计划，本处只建表）。
-- MySQL 5.7：utf8mb4_unicode_ci；migrate.js 按「分号+换行」拆句，体内禁行内分号。

CREATE TABLE IF NOT EXISTS departments (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  org_id     INT NOT NULL,
  name       VARCHAR(100) NOT NULL,
  kind       ENUM('CLASS','DEPT') NOT NULL DEFAULT 'DEPT',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_org_name_kind (org_id, name, kind),
  KEY idx_org (org_id),
  FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS resource_acl (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  resource     ENUM('subject','exam','question_group') NOT NULL,
  resource_id  INT NOT NULL,
  org_id       INT NOT NULL,
  grantee_type ENUM('user','org','dept') NOT NULL,
  grantee_id   INT NOT NULL,
  perm         ENUM('read','practice','manage') NOT NULL DEFAULT 'read',
  granted_by   INT DEFAULT NULL,
  created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_res_grantee_perm (resource, resource_id, grantee_type, grantee_id, perm),
  KEY idx_org (org_id),
  KEY idx_grantee (grantee_type, grantee_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SELECT 'departments_total' AS metric, COUNT(*) AS cnt FROM departments;
SELECT 'resource_acl_total' AS metric, COUNT(*) AS cnt FROM resource_acl;
```

- [ ] **Step 2: 本地库应用并核验**

Run: `cd server && node src/migrate.js --status`
Expected: `029_...sql` 显示 PENDING；随后 `node src/migrate.js` 应用，输出含 `✅ 完成: 029_...sql`。
再查：`SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name IN ('departments','resource_acl');` → 2。

- [ ] **Step 3: 提交**

```bash
git add -f server/migrations/029_resource_acl_departments.sql
git commit -m "feat(m3): create departments + resource_acl target tables (dormant)"
```

> `.sql` 被全局 gitignore，用 `-f` 显式纳入（与既有 013/014 同处理）。

---

## Task 4：迁移 030 — 师生共享组织分组（幂等 / 可回滚 / 带对账）

**Files:**
- Create: `server/migrations/030_teacher_class_grouping.sql`

**分组规则（写死在文件，决策依据=「师生归同一共享组织」）：**
1. 每个 `users.role='teacher'` 且 `EXISTS(users st WHERE st.teacher_id=t.id)` 的老师 → 建 SCHOOL 组织 `name='class:{teacher.username}'`（UNIQUE(type,name) 幂等）。
2. 老师入 `org_members` 为 `content_author`；学生入为 `examinee`（`INSERT IGNORE`，UNIQUE(org_id,user_id) 幂等）。
3. 把**老师创建的内容**（subjects/questions/exams，`created_by=老师`）的 `org_id` 由老师 PERSONAL 组织**重指到该 class 组织**。
4. 个人归属行（exam_attempts/mistake_records/favorites/study_stats，`user_id=学生`）**保持不动**（属学生 PERSONAL）；teacher 侧对活动的可见性差异交由 shadow 量化，后续计划处理。

**回滚（030r，另一文件，不进自动迁移，手工用）：** 把 class 内容的 `org_id` 复原为老师 PERSONAL 组织，并删除 class 组织（CASCADE 清成员）。

- [ ] **Step 1: 写迁移**

```sql
-- 030_teacher_class_grouping.sql
-- M3 数据地基：落地「师生同属一个共享组织」（PRD §5.2 建模）。写侧数据，读路径不过滤 —— 行为零变更。
-- migrate.js 按「分号+换行」拆句，体内禁行内分号；全部 INSERT IGNORE / UPDATE WHERE 幂等，可重放。

-- 1) 为每位「有学生的老师」建 class 组织
INSERT IGNORE INTO organizations (type, name)
SELECT 'SCHOOL', CONCAT('class:', t.username)
FROM users t
WHERE t.role = 'teacher'
  AND EXISTS (SELECT 1 FROM users st WHERE st.teacher_id = t.id);

-- 2a) 老师进 class 组织，角色 content_author
INSERT IGNORE INTO org_members (org_id, user_id, role)
SELECT o.id, t.id, 'content_author'
FROM users t
JOIN organizations o ON o.type = 'SCHOOL' AND o.name = CONCAT('class:', t.username)
WHERE t.role = 'teacher';

-- 2b) 学生进其老师的 class 组织，角色 examinee
INSERT IGNORE INTO org_members (org_id, user_id, role)
SELECT o.id, st.id, 'examinee'
FROM users st
JOIN users t ON t.id = st.teacher_id
JOIN organizations o ON o.type = 'SCHOOL' AND o.name = CONCAT('class:', t.username);

-- 3a) 老师创建的科目重指到 class 组织
UPDATE subjects s
JOIN users t ON t.id = s.created_by AND t.role = 'teacher'
JOIN organizations c ON c.type = 'SCHOOL' AND c.name = CONCAT('class:', t.username)
SET s.org_id = c.id
WHERE s.org_id IS NOT NULL;

-- 3b) 老师创建的题目重指到 class 组织
UPDATE questions q
JOIN users t ON t.id = q.created_by AND t.role = 'teacher'
JOIN organizations c ON c.type = 'SCHOOL' AND c.name = CONCAT('class:', t.username)
SET q.org_id = c.id
WHERE q.org_id IS NOT NULL;

-- 3c) 老师创建的考试重指到 class 组织
UPDATE exams e
JOIN users t ON t.id = e.created_by AND t.role = 'teacher'
JOIN organizations c ON c.type = 'SCHOOL' AND c.name = CONCAT('class:', t.username)
SET e.org_id = c.id
WHERE e.org_id IS NOT NULL;

-- 对账
SELECT 'class_orgs' AS metric, COUNT(*) AS cnt FROM organizations WHERE type = 'SCHOOL' AND name LIKE 'class:%';
SELECT 'members_in_class' AS metric, COUNT(*) AS cnt
FROM org_members m JOIN organizations o ON o.id = m.org_id
WHERE o.type = 'SCHOOL' AND o.name LIKE 'class:%';
SELECT 'teachers_without_class' AS metric, COUNT(*) AS cnt
FROM users t WHERE t.role = 'teacher'
  AND EXISTS (SELECT 1 FROM users st WHERE st.teacher_id = t.id)
  AND NOT EXISTS (SELECT 1 FROM organizations o WHERE o.type = 'SCHOOL' AND o.name = CONCAT('class:', t.username));
```

- [ ] **Step 2: 本地库应用并核验幂等**

Run: `cd server && node src/migrate.js`
Expected: `✅ 完成: 030_...sql`，对账里 `teachers_without_class=0`。
再跑一次（`node src/migrate.js --apply` 或先删该行 `schema_migrations` 记录重放）确认可重放且计数不翻倍（INSERT IGNORE/UPDATE 幂等）。

- [ ] **Step 3: 写回滚脚本（手工，不入库）**

创建 `server/migrations/rollback/030r_undo_teacher_class_grouping.sql`（内容见下方回滚 SQL）。**不纳入自动迁移**，仅供需要时手工执行。

```sql
-- 030r：把 class 内容 org_id 复原为老师 PERSONAL 组织，再删 class 组织（CASCADE 清成员）
UPDATE subjects s
JOIN users t ON t.id = s.created_by AND t.role = 'teacher'
JOIN organizations p ON p.type = 'PERSONAL' AND p.name = t.username
JOIN organizations c ON c.type = 'SCHOOL' AND c.name = CONCAT('class:', t.username)
SET s.org_id = p.id WHERE s.org_id = c.id;
UPDATE questions q
JOIN users t ON t.id = q.created_by AND t.role = 'teacher'
JOIN organizations p ON p.type = 'PERSONAL' AND p.name = t.username
JOIN organizations c ON c.type = 'SCHOOL' AND c.name = CONCAT('class:', t.username)
SET q.org_id = p.id WHERE q.org_id = c.id;
UPDATE exams e
JOIN users t ON t.id = e.created_by AND t.role = 'teacher'
JOIN organizations p ON p.type = 'PERSONAL' AND p.name = t.username
JOIN organizations c ON c.type = 'SCHOOL' AND c.name = CONCAT('class:', t.username)
SET e.org_id = p.id WHERE e.org_id = c.id;
DELETE FROM organizations WHERE type = 'SCHOOL' AND name LIKE 'class:%';
```

- [ ] **Step 4: 提交**

```bash
git add -f server/migrations/030_teacher_class_grouping.sql server/migrations/rollback/030r_undo_teacher_class_grouping.sql
git commit -m "feat(m3): group teacher+students into shared class org (write-side, idempotent)"
```

---

## Task 5：读路径接入 shadow 旁路（subjects，默认 off 零变更）

**Files:**
- Modify: `server/src/routes/subjects.js`（`GET /` 主体查询）

原则：拿到 `rows` 后、`res.json` 前，插一行 `await maybeShadowCheckByOrg(req, rows, 'subjects');`。不改 SQL、不改返回结构。

- [ ] **Step 1: 加 import**

在 `subjects.js` 顶部 import 处加：

```javascript
import { maybeShadowCheckByOrg } from '../utils/orgIsolationShadow.js';
```

- [ ] **Step 2: 在列表返回前旁路比对**

在 `GET /` 各分支 `res.json({ subjects: rows })` 之前插入（admin 分支同理用其 `rows`）：

```javascript
    await maybeShadowCheckByOrg(req, rows, 'subjects');
```

> 实现时逐个 `res.json({ subjects: <var> })` 前加一行，变量名对齐该分支（student 分支在 `if (teacherId){...}else{...}` 内各有一个返回，两处都加）。

- [ ] **Step 3: 冒烟 + 全量测试（默认 off，应无日志、结果不变）**

Run: `cd server && npx vitest run`
Expected: 全绿（含既有 194）。
手动：`ORG_ISOLATION_MODE` 不设 → 走一遍 `GET /api/subjects` 无 `[org-isolation:shadow]` 日志；设 `shadow` → 若分组完整则 drift 少/为 0，若有 teacher 活动可见性等残留则打日志（预期，用于度量）。

- [ ] **Step 4: 提交**

```bash
git add server/src/routes/subjects.js
git commit -m "refactor(m3): wire org-isolation shadow check into subjects list (off by default)"
```

---

## Task 6：读路径接入 shadow 旁路（exams + questions）

**Files:**
- Modify: `server/src/routes/exams.js`（list）
- Modify: `server/src/routes/questions.js`（list）

- [ ] **Step 1: exams.js 加 import + 列表旁路**

```javascript
import { maybeShadowCheckByOrg } from '../utils/orgIsolationShadow.js';
```
在 exams 列表查询返回前：`await maybeShadowCheckByOrg(req, <rowsVar>, 'exams');`

- [ ] **Step 2: questions.js 加 import + 列表旁路**

```javascript
import { maybeShadowCheckByOrg } from '../utils/orgIsolationShadow.js';
```
在按 subject 拉题目列表的返回前：`await maybeShadowCheckByOrg(req, <rowsVar>, 'questions');`

> 只接入**列表类**读路径（跨租户泄露面最大的地方）；详情类路由已有属主守卫，留待 enforce 计划。实现时先读两个文件定位各 list 分支变量名，再逐点插入一行，不改查询本身。

- [ ] **Step 3: 全量测试**

Run: `cd server && npx vitest run`
Expected: 全绿。

- [ ] **Step 4: 提交**

```bash
git add server/src/routes/exams.js server/src/routes/questions.js
git commit -m "refactor(m3): wire org-isolation shadow check into exams + questions lists"
```

---

## Task 7：对账脚本 + 忽略放行

**Files:**
- Create: `server/scripts/reconcile-org-isolation.cjs`
- Modify: `.gitignore`

脚本口径（镜像 014/reconcile-role-authority 风格，连生产库、只读、退出码门禁）：
- 7 核心表 + 新表里 **org_id 仍为 NULL 的行数**（应仅历史孤儿科目）。
- **class 组织/成员计数**、`teachers_without_class`（应为 0）。
- 综合判断：分组不完整或 NULL 面异常放大 → 退出码 1。

- [ ] **Step 1: 写脚本**

```javascript
// server/scripts/reconcile-org-isolation.cjs
// M3 数据地基对账：org_id 覆盖 + 师生分组完整性。只读，漂移/缺口>0 退出码非0。
// 用法：cd server && node scripts/reconcile-org-isolation.cjs
const path = require('path');
const mysql = require('mysql2/promise');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const ORG_TABLES = [
  'questions', 'subjects', 'exams', 'exam_attempts', 'mistake_records',
  'favorites', 'study_stats', 'question_groups', 'question_judge_configs',
  'question_tags', 'export_jobs', 'judge_runs',
];

(async () => {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST, port: +(process.env.DB_PORT || 3306),
    user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME,
  });
  let issues = 0;

  for (const t of ORG_TABLES) {
    try {
      const [[r]] = await conn.query(
        `SELECT COUNT(*) total, SUM(org_id IS NULL) nulls FROM \`${t}\``
      );
      const flag = r.nulls > 0 ? ' ⚠️' : '';
      console.log(`[org_id] ${t}: total=${r.total} null=${r.nulls}${flag}`);
      if (r.nulls > 0) issues++; // 有 NULL 视为待确认（历史孤儿科目可能合理，人工判定）
    } catch (e) {
      console.log(`[org_id] ${t}: 跳过(${e.code === 'ER_NO_SUCH_TABLE' ? '表不存在' : e.message})`);
    }
  }

  const [[tc]] = await conn.query(
    `SELECT COUNT(*) n FROM users t WHERE t.role='teacher'
       AND EXISTS (SELECT 1 FROM users st WHERE st.teacher_id=t.id)
       AND NOT EXISTS (SELECT 1 FROM organizations o
             WHERE o.type='SCHOOL' AND o.name=CONCAT('class:', t.username))`
  );
  console.log(`[group] teachers_without_class=${tc.n}${tc.n > 0 ? ' ❌' : ''}`);
  if (tc.n > 0) issues++;

  await conn.end();
  if (issues === 0) { console.log('[reconcile] 地基对账通过：分组完整，org_id 无待确认缺口'); process.exit(0); }
  console.error(`[reconcile] 存在 ${issues} 项待确认（NULL 覆盖或分组缺口），详见上方`);
  process.exit(1);
})().catch((e) => { console.error('[reconcile] 执行失败:', e.message); process.exit(2); });
```

- [ ] **Step 2: .gitignore 放行（*.cjs 全局忽略，仿 role-authority）**

在 `.gitignore` 里 `!server/scripts/reconcile-role-authority.cjs` 同段追加：

```
!server/scripts/reconcile-org-isolation.cjs
```

- [ ] **Step 3: 本地跑**

Run: `cd server && node scripts/reconcile-org-isolation.cjs`
Expected: `teachers_without_class=0`；org_id NULL 仅剩历史孤儿科目（可接受，人工确认）；整体可读。

- [ ] **Step 4: 提交**

```bash
git add .gitignore server/scripts/reconcile-org-isolation.cjs
git commit -m "chore(m3): add org-isolation groundwork reconcile script + gitignore allow"
```

---

## Task 8：配置 + 运行手册 + 文档

**Files:**
- Modify: `server/.env.example`
- Create: `docs/superpowers/plans/2026-10-14-m3-isolation-runbook.md`

- [ ] **Step 1: `.env.example` 增加说明**

```
# M3 org 读隔离：off(线上现状,默认) | shadow(旁路比对只打日志,不改结果) | enforce(按 org 强过滤,本阶段未启用)
# 翻 enforce 前必须：reconcile-org-isolation.cjs 通过 + shadow 各 list 路由 [org-isolation:shadow] drift=0
ORG_ISOLATION_MODE=off
```

- [ ] **Step 2: 写运行手册**

`docs/superpowers/plans/2026-10-14-m3-isolation-runbook.md`：

```markdown
# M3 跨租户隔离 · 数据地基与开闸 运行手册

## 本阶段做了什么（地基，零行为变更）
- 建目标表 departments / resource_acl（暂不使用）。
- 师生分组：teacher + 其学生 → 同一 SCHOOL 组织 'class:{username}'，老师内容 org_id 重指到 class 组织。
- ORG_ISOLATION_MODE=shadow：每个 list 读路径旁路比对「按 org 过滤会隐藏什么」，打 [org-isolation:shadow] 日志，**不改结果**。

## 下一步（enforce 计划的前置，不在本计划）
1. 用 shadow drift 定位残留跨用户可见性来源：订阅类(subject_subscriptions/share_scope)→ 迁 resource_acl；老师看学生活动 → 决定是否把相关活动行纳入 class 组织。
2. 逐路由把 drift 降到 0（补齐 acl/分组）。
3. 测试库 ORG_ISOLATION_MODE=enforce，跑 isolation.integration.mjs + 手工回归。
4. 生产翻 enforce：备份 .env → 改 enforce → pm2 restart study-server --update-env，观察。

## 回滚
任一步异常：ORG_ISOLATION_MODE 改回 off（或 shadow），pm2 restart study-server --update-env，即时生效，无需回滚代码/数据。
数据回滚（如需撤销分组）：手工执行 server/migrations/rollback/030r_undo_teacher_class_grouping.sql。

## 已知边界（本计划不做）
- 不启用 enforce（读结果与现状完全一致）。
- resource_acl 不填充；订阅/share_scope 跨组织共享仍走旧关系。
- 多组织切换（一人多 org 的 currentOrg 选择）、token org_id 声明 → 后续。
- GET /tags/question/:id 越权 KNOWN-GAP（属行为变更）→ enforce 计划修。
```

- [ ] **Step 3: 提交**

```bash
git add server/.env.example docs/superpowers/plans/2026-10-14-m3-isolation-runbook.md
git commit -m "docs(m3): add org isolation mode config + groundwork/enforce runbook"
```

- [ ] **Step 4: 生产部署 shadow（人工，按手册）**

部署后设 `ORG_ISOLATION_MODE=shadow` 观察 drift，属人工，不自动执行。

---

## 验收标准（Definition of Done）

- [ ] `cd server && npx vitest run` 全绿（含既有 194 + 新增 org-scope/org-isolation-shadow）。
- [ ] `node src/migrate.js` 应用 029/030 成功且**可重放**（幂等）；`departments`/`resource_acl` 存在；`teachers_without_class=0`。
- [ ] **默认 off**：所有 list 接口返回与改造前**逐字节一致**，无 `[org-isolation:shadow]` 日志。
- [ ] **shadow**：命中残留时打 `[org-isolation:shadow] ... drift=N` 日志，**返回结果不变**。
- [ ] `node scripts/reconcile-org-isolation.cjs` 可跑、输出 org_id 覆盖与分组完整性。
- [ ] 无任何读路径在 off/shadow 下应用 org 过滤（grep `buildOrgFilter` 仅在测试与工具中出现，未接入生产查询）。

## 不在本计划范围（明确排除，属后续 enforce 计划）

- 真正启用 `enforce`（按 org 强过滤读结果）。
- `subject_subscriptions` / `subject_student_access` / `share_scope` → `resource_acl` 的迁移与填充。
- `org_id` 由可空转**非空**约束。
- 多组织上下文选择（一人多 org 的 currentOrg 切换）、token 携带 `org_id` 声明。
- `GET /tags/question/:id` 越权 KNOWN-GAP 修复（属行为变更，单独评审）。
- 灯塔（部门/批量导入/指派考试）、DPA/微信等合规。
```
