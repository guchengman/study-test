# Phase 2 / M1 跨租户隔离守门 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立可独立运行、进 CI、能阻断部署的跨租户隔离集成安全网，冻结现有属主隔离，零生产代码行为变更。

**Architecture:** 从现有 `integration_exam.mjs` 抽出公共测试桁架（含凭据脱敏参数化），新增独立脚本 `isolation.integration.mjs` 覆盖 7 张核心表的跨租户不可达断言；`deploy.yml` 增 `isolation-test` job（GitHub-hosted runner + `mysql:5.7` service 容器 + boot 真后端 + health 探活），deploy job `needs` 它。

**Tech Stack:** Node ESM (.mjs)、mysql2/promise、原生 fetch、GitHub Actions、Express（现有 server）。

**依据 spec:** `docs/superpowers/specs/2026-10-13-phase2-m1-isolation-gate-design.md`

---

## 文件结构

| 文件 | 职责 | 动作 |
|---|---|---|
| `server/tests/helpers/integrationHarness.mjs` | 与用例无关的桁架：DB 配置解析、`api()`、`check()`、`results`、`reportExit()`、`registerWithCode()` | 新建 |
| `server/tests/integration_exam.mjs` | 现有 E2E 用例；改为 import 桁架 | 修改（只搬不改断言） |
| `server/tests/isolation.integration.mjs` | 跨租户隔离断言（7 张核心表） | 新建 |
| `.github/workflows/deploy.yml` | 增 `isolation-test` job + deploy `needs` | 修改 |

约定：所有断言状态码口径与 `integration_exam.mjs` 一致——越权用 `403`/`404`，"仅见己有"用列表内容比对。

---

## Task 1: 抽取公共桁架 + 凭据脱敏参数化

**Files:**
- Create: `server/tests/helpers/integrationHarness.mjs`
- Modify: `server/tests/integration_exam.mjs`（头部 import、删本地重复定义）

- [ ] **Step 1: 创建桁架文件**

写入 `server/tests/helpers/integrationHarness.mjs`：

```js
// ============================================================
// 集成测试公共桁架（与具体用例无关，供 integration_exam / isolation 等复用）
// 凭据全部走 env 回退，禁止硬编码生产口令。
// ============================================================
import mysql from 'mysql2/promise';
import crypto from 'crypto';

const BASE = process.env.EXAM_IT_BASE || 'http://localhost:3100/api';

/** 测试库连接配置：CI 注入 service 容器凭据；本地沿用 server/.env 的 DB_* */
export function resolveDbConfig() {
  return {
    host: process.env.EXAM_IT_DB_HOST || process.env.DB_HOST || 'localhost',
    port: Number(process.env.EXAM_IT_DB_PORT || process.env.DB_PORT || 3306),
    user: process.env.EXAM_IT_DB_USER || process.env.DB_USER || 'studyapp',
    password: process.env.EXAM_IT_DB_PASSWORD || process.env.DB_PASSWORD || '',
    database: process.env.EXAM_IT_DB_NAME || process.env.DB_NAME || 'study_test',
  };
}

export const API_BASE = BASE;

export const results = [];
export function check(name, cond, extra) {
  results.push({ name, ok: !!cond });
  console.log(`${cond ? '✅' : '❌'} ${name}${extra !== undefined ? '  ' + JSON.stringify(extra) : ''}`);
}

/** pass/fail 门禁：任一未通过即 exit 1（供 CI 阻断） */
export function reportExit() {
  const failed = results.filter((x) => !x.ok);
  console.log(`\n==== 集成联调结论：${results.length - failed.length}/${results.length} 通过 ====`);
  process.exit(failed.length ? 1 : 0);
}

export async function api(method, path, token, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch { /* ignore */ }
  return { status: res.status, data };
}

/**
 * 注册（兼容邮箱验证码强校验）：生产 register 必须带 6 位验证码，
 * 集成测试无法收邮件，故直接向 email_verifications 种 sha256(码) 哈希再带码注册。
 * 未强制校验的环境会忽略种入的码，两种情况皆兼容。
 */
export async function registerWithCode(db, payload, code = '654321') {
  await db.execute(
    "UPDATE email_verifications SET consumed = 1 WHERE email = ? AND purpose = 'register' AND consumed = 0",
    [payload.email]
  );
  await db.execute(
    "INSERT INTO email_verifications (email, purpose, code_hash, expires_at) VALUES (?, 'register', ?, DATE_ADD(NOW(), INTERVAL 5 MINUTE))",
    [payload.email, crypto.createHash('sha256').update(code).digest('hex')]
  );
  return api('POST', '/auth/register', null, { ...payload, emailCode: code });
}

/** 便捷：断言资源对调用方不可达（越权口径） */
export function checkBlocked(name, res) {
  check(name, res.status === 403 || res.status === 404, res.status);
}
```

- [ ] **Step 2: 改 integration_exam.mjs 用桁架（只搬不改）**

删除 `integration_exam.mjs` 中以下本地定义并改为 import：
- 顶部 `const BASE = process.env.EXAM_IT_BASE || ...`、`const DB = {...}`（含硬编码 `password: '<REDACTED_DB_PASSWORD>'`）、`function check(...)`、`async function api(...)`、`async function registerWithCode(...)`、`const results = []`。
- 保留本地独有的：`fmt`、`cleanup`、`UPLOADS_ROOT`、`import { tickDay, checkBroken }`。

替换后的头部 import 段：

```js
import mysql from 'mysql2/promise';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { tickDay, checkBroken } from '../src/utils/streakService.js';
import {
  resolveDbConfig, results, check, api, registerWithCode, reportExit, API_BASE,
} from './helpers/integrationHarness.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOADS_ROOT = path.resolve(__dirname, '../uploads');
const DB = resolveDbConfig();
```

把 `main()` 里 `const db = await mysql.createConnection(DB);` 保留；把脚本末尾原
`const failed = results.filter(...); console.log(...); process.exit(failed.length ? 1 : 0);`
整段替换为 `reportExit();`。

- [ ] **Step 3: 本地起后端+库，跑回归确认抽出后等价**

Run: `node server/tests/integration_exam.mjs`
Expected: `==== 集成联调结论：N/N 通过 ====`，且 `N` 与重构前一致（断言条数不变），exit 0。

- [ ] **Step 4: Commit**

```bash
git add server/tests/helpers/integrationHarness.mjs server/tests/integration_exam.mjs
git commit -m "test(phase2-m1): 抽出集成桁架并脱敏参数化 DB 凭据"
```

---

## Task 2: 隔离脚本骨架 + 双租户夹具 + questions/subjects 断言

**Files:**
- Create: `server/tests/isolation.integration.mjs`

- [ ] **Step 1: 写骨架 + 夹具（两个 PERSONAL 租户）**

写入 `server/tests/isolation.integration.mjs`：

```js
/**
 * Phase 2 / M1 跨租户隔离集成测试（冻结现有属主隔离，零行为变更）
 * 建两个 PERSONAL 租户(teacherA/teacherB，各带一名学员)，断言 B 读不到 A 的核心表资源。
 * 运行：先启动后端；node server/tests/isolation.integration.mjs
 * 环境变量：EXAM_IT_BASE、EXAM_IT_DB_HOST/PORT/USER/PASSWORD/NAME（见 integrationHarness）
 */
import mysql from 'mysql2/promise';
import {
  resolveDbConfig, results, check, api, registerWithCode, reportExit, checkBlocked,
} from './helpers/integrationHarness.mjs';

const DB = resolveDbConfig();
const fmt = (d) => d.toISOString().slice(0, 19).replace('T', ' ');

async function cleanup(db) {
  const like = (c) => db.execute(`DELETE ${c} WHERE username LIKE 'it_iso_%'`).catch(() => {});
  await db.execute("DELETE FROM exam_attempts WHERE exam_id IN (SELECT id FROM exams WHERE title LIKE 'ISO_%')").catch(() => {});
  await db.execute("DELETE FROM exams WHERE title LIKE 'ISO_%'").catch(() => {});
  await db.execute("DELETE FROM question_tag_map WHERE question_id IN (SELECT id FROM questions WHERE title LIKE 'ISO_%')").catch(() => {});
  await db.execute("DELETE FROM questions WHERE title LIKE 'ISO_%'").catch(() => {});
  await db.execute("DELETE FROM subjects WHERE name LIKE 'ISO_%'").catch(() => {});
  await db.execute("DELETE FROM notifications WHERE user_id IN (SELECT id FROM users WHERE username LIKE 'it_iso_%')").catch(() => {});
  await db.execute("DELETE FROM email_verifications WHERE email LIKE 'it_iso_%@test.com'").catch(() => {});
  await db.execute("DELETE FROM org_members WHERE user_id IN (SELECT id FROM users WHERE username LIKE 'it_iso_%')").catch(() => {});
  await db.execute("DELETE FROM organizations WHERE name LIKE 'it_iso_%'").catch(() => {});
  await like('DELETE FROM users');
}

async function makeTenant(db, tag, role = 'teacher') {
  const username = `it_iso_${tag}`;
  const email = `${username}@test.com`;
  const r = await registerWithCode(db, { username, password: 'iso123456', email, role, phone: '13900000000' });
  check(`ISO 注册 ${tag}`, r.status === 200 && r.data.token, r.status);
  return { token: r.data.token, id: r.data.user.id, username };
}

async function makeStudent(db, tag, teacherId) {
  const stu = await makeTenant(db, tag, 'student');
  await db.execute('UPDATE users SET teacher_id=? WHERE id=?', [teacherId, stu.id]);
  return stu;
}

const main = async () => {
  const db = await mysql.createConnection(DB);
  await cleanup(db);
  try {
    const tA = await makeTenant(db, 'teacherA');
    const tB = await makeTenant(db, 'teacherB');
    const sA = await makeStudent(db, 'stuA', tA.id);
    const sB = await makeStudent(db, 'stuB', tB.id);

    // ===== 在此追加各表断言（Task 2~5）=====

  } finally {
    await cleanup(db);
    await db.end();
  }
  reportExit();
};

main().catch((e) => { console.error('FATAL', e); process.exit(2); });
```

- [ ] **Step 2: 追加 questions 跨租户断言**

在 `// ===== 在此追加各表断言` 处插入：

```js
    // A 建私有科目 + 题目
    const subjA = await api('POST', '/subjects', tA.token, { name: 'ISO_科目A' });
    check('ISO A 建科目', subjA.status === 200 || subjA.status === 201, subjA.status);
    const subjAId = subjA.data?.id ?? subjA.data?.subject?.id;
    const qA = await api('POST', '/questions', tA.token, {
      subject_id: subjAId, type: 'single', title: 'ISO_题A', options: ['甲', '乙'], answer: '"甲"', explanation: 'A私有',
    });
    check('ISO A 建题', qA.status === 200 && qA.data.id, qA.status);
    const qAId = qA.data.id;

    // B 直取 A 的题目 → 不可达
    checkBlocked('ISO questions B取A题(403/404)', await api('GET', `/questions/${qAId}`, tB.token));
    // B 的题目列表不含 A 的题
    const listB = await api('GET', `/questions?subject_id=${subjAId}`, tB.token);
    check('ISO questions B列表不含A题',
      listB.status === 200 && !(listB.data?.questions || []).some((q) => q.id === qAId),
      { status: listB.status });
```

- [ ] **Step 3: 追加 subjects 跨租户断言**

紧接插入：

```js
    // B 的科目列表不含 A 私有科目
    const subjListB = await api('GET', '/subjects', tB.token);
    check('ISO subjects B列表不含A科目',
      subjListB.status === 200 && !(subjListB.data?.subjects || []).some((s) => s.id === subjAId),
      { status: subjListB.status });
    // B 改 / 删 A 的科目 → 不可达
    checkBlocked('ISO subjects B改A科目(403/404)', await api('PUT', `/subjects/${subjAId}`, tB.token, { name: 'ISO_被篡改' }));
    checkBlocked('ISO subjects B删A科目(403/404)', await api('DELETE', `/subjects/${subjAId}`, tB.token));
```

- [ ] **Step 4: 本地跑，验证 questions/subjects 断言**

Run: `node server/tests/isolation.integration.mjs`
Expected: 上述每条 `✅`，脚本末尾 `==== ... 通过 ====`。若某条 `❌`（如 B 竟能 200 读到 A 题），按 spec §4.2 记录为既有越权缺陷，不在 M1 内改生产码，先注释该断言并单列，其余须绿。

- [ ] **Step 5: Commit**

```bash
git add server/tests/isolation.integration.mjs
git commit -m "test(phase2-m1): 隔离脚本骨架+双租户夹具+questions/subjects 跨租户断言"
```

---

## Task 3: exams / exam_attempts 跨租户断言

**Files:**
- Modify: `server/tests/isolation.integration.mjs`（Task 2 断言之后追加）

- [ ] **Step 1: A 建并发布考试、A 学员作答**

追加：

```js
    // A 用其题组卷并发布
    const examA = await api('POST', '/exams', tA.token, {
      subject_id: subjAId, title: 'ISO_考A',
      question_set: [{ question_id: qAId, points: 100 }],
      duration_minutes: 30, pass_score: 60,
    });
    check('ISO A 建考试', examA.status === 200 && examA.data.id, examA.status);
    const examAId = examA.data.id;
    const now = new Date();
    await api('PUT', `/exams/${examAId}`, tA.token, {
      status: 'published', start_time: fmt(new Date(now.getTime() - 60000)), end_time: fmt(new Date(now.getTime() + 86400000)),
    });
    // A 学员开考留一份答卷（制造 exam_attempts 归属数据）
    const startA = await api('POST', `/exams/${examAId}/start`, sA.token);
    const attemptAId = startA.data?.attemptId;
```

- [ ] **Step 2: B 侧不可达断言**

追加：

```js
    checkBlocked('ISO exams B看A考试详情(403/404)', await api('GET', `/exams/${examAId}`, tB.token));
    checkBlocked('ISO exams B看A答卷列表(403/404)', await api('GET', `/exams/${examAId}/attempts`, tB.token));
    checkBlocked('ISO exams B看A考情分析(403/404)', await api('GET', `/exams/${examAId}/analysis`, tB.token));
    if (attemptAId) {
      checkBlocked('ISO exam_attempts B读A学员答卷(403/404)', await api('GET', `/exams/attempts/${attemptAId}`, tB.token));
    } else {
      check('ISO A 学员开考成功(产出 attemptId)', false, startA.status);
    }
    // B 学员不在 A 考试可参加列表
    const availB = await api('GET', '/exams/available', sB.token);
    check('ISO exams A考试不在B学员可参加列表',
      availB.status === 200 && !(availB.data?.exams || []).some((e) => e.id === examAId),
      { status: availB.status });
```

- [ ] **Step 3: 本地跑验证**

Run: `node server/tests/isolation.integration.mjs`
Expected: exams/exam_attempts 各条 `✅`。

- [ ] **Step 4: Commit**

```bash
git add server/tests/isolation.integration.mjs
git commit -m "test(phase2-m1): exams/exam_attempts 跨租户隔离断言"
```

---

## Task 4: mistake_records / favorites / study_stats 学员维度"仅见己有"断言

**Files:**
- Modify: `server/tests/isolation.integration.mjs`

- [ ] **Step 1: A 学员写入 own 数据，B 学员写入 own 数据**

追加（练习端点按 `req.user.id` 归属，断言口径＝B 列表不含 A 记录）：

```js
    // A 学员产生错题 / 收藏 / 学习统计（用 A 的题 qAId）
    await api('POST', '/practice/mistakes/add', sA.token, { question_id: qAId });
    await api('POST', '/practice/favorites', sA.token, { question_id: qAId, subject_id: subjAId });
    await api('POST', '/practice/stats', sA.token, { subject_id: subjAId, total: 5, correct: 4 });

    // B 学员读取三张维度表 → 不得出现 A 的题 qAId / A 的统计
    const mkB = await api('GET', '/practice/mistakes', sB.token);
    check('ISO mistakes B列表不含A记录',
      mkB.status === 200 && !(mkB.data?.mistakes || []).some((m) => String(m.question_id) === String(qAId)),
      { status: mkB.status });

    const favB = await api('GET', '/practice/favorites', sB.token);
    check('ISO favorites B列表不含A记录',
      favB.status === 200 && !(favB.data?.favorites || []).some((f) => String(f.question_id) === String(qAId)),
      { status: favB.status });

    const stB = await api('GET', '/practice/stats', sB.token);
    check('ISO study_stats B不含A科目统计',
      stB.status === 200 && !(stB.data?.stats || []).some((s) => String(s.subject_id) === String(subjAId)),
      { status: stB.status });
```

- [ ] **Step 2: 本地跑验证**

Run: `node server/tests/isolation.integration.mjs`
Expected: 三条 `✅`。若某表响应字段名与假设不同（如 `data.list`），据实际结构微调取值路径——断言语义不变（B 不得见 A 的行）。

- [ ] **Step 3: Commit**

```bash
git add server/tests/isolation.integration.mjs
git commit -m "test(phase2-m1): mistakes/favorites/study_stats 学员维度仅见己有断言"
```

---

## Task 5: tags 跨租户断言 + 收尾 + 门禁有效性自检

**Files:**
- Modify: `server/tests/isolation.integration.mjs`

- [ ] **Step 1: 追加 tags 断言**

```js
    // A 建标签并绑定到 A 题
    const tagA = await api('POST', '/tags', tA.token, { name: 'ISO_标签A', level: 1 });
    const tagAId = tagA.data?.id;
    if (tagAId) await api('POST', `/tags/question/${qAId}/bindTags`, tA.token, { tag_ids: [tagAId] });
    // B 题目标签读 A 题 → 不可达/不含
    const tagB = await api('GET', `/tags/question/${qAId}`, tB.token);
    check('ISO tags B读A题标签(不可达或空)',
      (tagB.status === 403 || tagB.status === 404) || !(tagB.data?.tags || []).some((t) => t.id === tagAId),
      { status: tagB.status });
    // B 标签树不含 A 私有标签
    const treeB = await api('GET', '/tags/tree', tB.token);
    check('ISO tags B树不含A标签',
      treeB.status === 200 && !JSON.stringify(treeB.data?.tags || []).includes('ISO_标签A'),
      { status: treeB.status });
```

- [ ] **Step 2: 全量跑，确认整脚本绿**

Run: `node server/tests/isolation.integration.mjs`
Expected: 所有 `ISO` 断言 `✅`，末行 `==== ... 通过 ====`，exit 0。

- [ ] **Step 3: 门禁有效性自检（证明非空跑）**

临时在 `questions` 断言处把期望改成"允许 200"制造一条必 `❌`，跑一次确认脚本 `exit 1`，然后撤销该临时改动。
Run: `node server/tests/isolation.integration.mjs; echo "exit=$LASTEXITCODE"`
Expected: 临时破坏期 `exit=1`；撤销后 `exit=0`。

- [ ] **Step 4: 回归 integration_exam + 四重门禁**

Run:
```bash
node server/tests/integration_exam.mjs
cd server; npx vitest run; cd ..
npm run lint
```
Expected: 集成脚本全绿；vitest 全绿；lint 零错误。

- [ ] **Step 5: Commit**

```bash
git add server/tests/isolation.integration.mjs
git commit -m "test(phase2-m1): tags 跨租户断言 + 隔离脚本完成并通过门禁自检"
```

---

## Task 6: CI 阻断接线（deploy.yml）

**Files:**
- Modify: `.github/workflows/deploy.yml`

- [ ] **Step 1: 新增 isolation-test job**

在 `jobs:` 下、`deploy:` 之前插入：

```yaml
  isolation-test:
    runs-on: ubuntu-latest
    timeout-minutes: 20
    services:
      mysql:
        image: mysql:5.7
        env:
          MYSQL_ROOT_PASSWORD: rootpw
          MYSQL_DATABASE: study_test
          MYSQL_USER: studyapp
          MYSQL_PASSWORD: citestpw
        ports: ['3306:3306']
        options: >-
          --health-cmd="mysqladmin ping -h 127.0.0.1 -uroot -prootpw"
          --health-interval=10s --health-timeout=5s --health-retries=10
    env:
      DB_HOST: 127.0.0.1
      DB_PORT: '3306'
      DB_USER: studyapp
      DB_PASSWORD: citestpw
      DB_NAME: study_test
      JWT_SECRET: ci-only-jwt-secret-not-a-real-secret-0123456789
      JWT_EXPIRES_IN: 7d
      NODE_ENV: production
      PORT: '3100'
      EXAM_IT_BASE: http://localhost:3100/api
      EXAM_IT_DB_HOST: 127.0.0.1
      EXAM_IT_DB_PORT: '3306'
      EXAM_IT_DB_USER: studyapp
      EXAM_IT_DB_PASSWORD: citestpw
      EXAM_IT_DB_NAME: study_test
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20', cache: 'npm' }
      - name: Install deps (scoring + server)
        run: |
          npm ci
          node scripts/build-scoring.mjs
          cd server && npm ci && cd ..
      - name: Run migrations
        run: node server/src/migrate.js
      - name: Boot server (background)
        run: |
          node server/src/index.js > server.log 2>&1 &
          echo $! > server.pid
      - name: Wait for health
        run: |
          for i in $(seq 1 30); do
            if curl -sf http://localhost:3100/api/health >/dev/null; then echo "healthy"; exit 0; fi
            sleep 2
          done
          echo "server not healthy"; cat server.log; exit 1
      - name: Run integration + isolation suites
        run: |
          node server/tests/integration_exam.mjs
          node server/tests/isolation.integration.mjs
      - name: Stop server
        if: always()
        run: kill "$(cat server.pid)" 2>/dev/null || true
      - name: Upload server log on failure
        if: failure()
        uses: actions/upload-artifact@v4
        with: { name: isolation-server-log, path: server.log }
```

- [ ] **Step 2: deploy job 依赖门禁**

把现有 `deploy:` 顶层增加一行（与 `runs-on` 同级）：

```yaml
    needs: isolation-test
```

- [ ] **Step 3: 本地静态校验 YAML + 干跑命令**

Run:
```bash
node -e "const fs=require('fs');const y=require('yaml');y.parse(fs.readFileSync('.github/workflows/deploy.yml','utf8'));console.log('yaml-ok')"
```
（若项目无 `yaml` 依赖，用在线/编辑器 lint 或 `npx js-yaml .github/workflows/deploy.yml` 校验。）
Expected: `yaml-ok`，无缩进/结构错误。

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/deploy.yml
git commit -m "ci(phase2-m1): isolation-test job(mysql:5.7) 进 CI 并阻断 deploy"
```

---

## Task 7: 文档同步与索引

**Files:**
- Modify: `docs/开发文档.md`（测试章节）、`docs/Phase2-租户化与角色重构-立项评估.md`（M1 状态）

- [ ] **Step 1: 记录 M1 隔离门禁**

在 `docs/开发文档.md` 测试/CI 章节追加：集成测试桁架路径 `server/tests/helpers/integrationHarness.mjs`、隔离脚本 `server/tests/isolation.integration.mjs` 及其 env、CI `isolation-test` job 阻断语义。

- [ ] **Step 2: 更新立项文档 M1 状态**

`docs/Phase2-租户化与角色重构-立项评估.md` 里程碑表把 M1 标为「已交付（安全网进 CI）」。

- [ ] **Step 3: Commit**

```bash
git add docs/开发文档.md docs/Phase2-租户化与角色重构-立项评估.md
git commit -m "docs(phase2-m1): 同步隔离门禁到开发文档并标记 M1 交付"
```

---

## Self-Review（写完后自查，已执行）

- **Spec 覆盖**：G1 隔离测试=Task 2–5；G2 CI 阻断=Task 6；G3 凭据参数化=Task 1；7 张表=questions/subjects(Task2)+exams/exam_attempts(Task3)+mistake/favorites/study_stats(Task4)+tags(Task5)。零行为变更贯穿全程（无生产 src 改动）。
- **占位符**：无 TBD/TODO；各断言含具体代码与期望值。
- **类型/命名一致**：桁架导出 `resolveDbConfig/results/check/api/registerWithCode/reportExit/checkBlocked` 在 Task 1 定义、Task 2–6 引用一致；夹具 `makeTenant/makeStudent` 与 `it_iso_` 前缀、cleanup 前缀一致。
- **已知不确定点**（Step 内已给兜底）：① 建科目/题响应字段名（`data.id` vs `data.subject.id`）— 代码已用 `??` 兜底并附"按实际结构微调"提示；② practice 列表响应字段名 — Task4 Step2 附同样兜底。执行时先小跑一条确认真实 shape 再补齐，不改断言语义。
