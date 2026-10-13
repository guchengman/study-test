# FR-106 编程题在线判题（核心纵切 v1）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 给 `programming` 题引入基于 Docker 的真·代码执行与自动判分（Python 单语言），练习同步运行样例、考试交卷异步判分并回写分数，判题失败回落人工。

**Architecture:** 判题是服务端外部自动评分器，**不进 SSOT `src/shared/scoring`**；配置存新表 `question_judge_configs`、运行账本存 `judge_runs`（`questions` 表零改动）。判题结果复用 FR-103 的 `applyManualScore` 同款 `FOR UPDATE` + `Σearned` 重算 + `score_ready` 通知链路写回 `exam_attempts.details`。Runner 置于接口后：生产用 `DockerRunner`、测试用确定性 `StubRunner`（`JUDGE_RUNNER=stub`），保证四重门禁离线可跑。

**Tech Stack:** Node/Express + MySQL5.7（utf8mb4_unicode_ci，JSON 列）+ Docker（`python:3-slim`，`child_process`）+ React/Vite/TS + vitest。

**关联 spec:** `docs/superpowers/specs/2026-10-13-fr106-programming-judge-design.md`

---

## 约定（贯穿全计划）
- 迁移范式：幂等 `CREATE TABLE IF NOT EXISTS`、`utf8mb4_unicode_ci`、`org_id` shadow 列；`migrate.js` 按「分号+换行」拆句，**语句体内不得出现行内分号**；`.gitignore *.sql`，新迁移 `git add -f`。
- 判分链路与 SSOT 隔离：任何改动**不得触碰** `src/shared/scoring/index.ts` 与 `server/src/utils/examScoring.generated.js`。
- 每个 HTTP 门单独 kill+起 fresh server 避 429；合并/推送前过 L3。
- 幂等：迁移 027、028；StubRunner 仅测试用（`JUDGE_RUNNER=stub`），生产默认 `docker`。

## File Structure（新建/修改）
- 新建：`server/migrations/027_question_judge_configs.sql`、`028_judge_runs.sql`
- 新建：`server/src/services/judgeService.js`（JudgeRunner 接口 + StubRunner + DockerRunner + 归一纯函数 + 进程内并发闸 + dispatch 入队）
- 新建：`server/src/routes/judge.js`（`POST /practice` + `GET /runs/:attemptId`）
- 新建：`server/tests/judge.docker.integration.mjs`（可选真 Docker，无 Docker 显式 skip）
- 新建：`server/tests/unit/judgeService.test.js`、`server/tests/unit/judgeScore.test.js`
- 修改：`server/src/utils/manualGrading.js`（加 `applyJudgeScore`）、`questions.js`（建/批/改写 `judge_config`）、`exams.js`（交卷入队 + 判题回写 + 通知）、`index.js`（挂 `/api/judge`）
- 修改：`src/types.ts`、`src/services/api.ts`（`judgeApi` + `QuestionItem.judge_config`）、`src/components/exam/QuestionForm.tsx`、`src/components/app/ExamScreen.tsx`、`src/components/app/FormalExamScreen.tsx`
- 修改：测试 `server/tests/integration_exam.mjs`、`isolation.integration.mjs`、`src/services/__tests__/mappers.test.ts`
- 文档：`docs/开发文档.md`、`docs/产品需求文档-平台化演进.md`

---

## Task 1: 分支 + 迁移 027/028

**Files:**
- Create: `server/migrations/027_question_judge_configs.sql`
- Create: `server/migrations/028_judge_runs.sql`

- [ ] **Step 1: 建分支**

```bash
git checkout -b feature/fr106-programming-judge
```

- [ ] **Step 2: 写迁移 027（判题配置表）**

```sql
-- 027：FR-106 编程题在线判题 —— 判题配置（1:1 软引用 questions）
--   language/time_limit_ms/memory_limit_mb/starter_code/test_cases(JSON 数组)。
--   test_cases 元素：{ "input": string, "expected_output": string, "is_sample": boolean }
--   question_id 不设 DB 外键：与 025/026 软引用一致，删题不级联硬删配置（YAGNI：本增量不做级联清理）。
--   范式对齐 013/014/025：幂等 CREATE TABLE IF NOT EXISTS、utf8mb4_unicode_ci；migrate.js 按「分号+换行」拆句，语句体内不得行内分号。

CREATE TABLE IF NOT EXISTS question_judge_configs (
  question_id INT NOT NULL,
  language VARCHAR(32) NOT NULL DEFAULT 'python',
  time_limit_ms INT NOT NULL DEFAULT 2000,
  memory_limit_mb INT NOT NULL DEFAULT 128,
  starter_code LONGTEXT DEFAULT NULL,
  test_cases JSON NOT NULL,
  created_by INT DEFAULT NULL,
  org_id INT DEFAULT NULL COMMENT 'shadow org（Phase 0 写入即赋值、查询不过滤）',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (question_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

- [ ] **Step 3: 写迁移 028（判题运行账本）**

```sql
-- 028：FR-106 编程题在线判题 —— 判题运行账本（异步状态机 + 审计）
--   status: queued/running/done/failed/skipped；verdict: AC/WA/TLE/MLE/RE/CE。
--   分数真相仍在 exam_attempts.details；本表只做状态/日志/重跑审计。attempt_id/question_id 软引用不设 FK。
--   范式对齐：幂等、utf8mb4_unicode_ci；migrate.js 按「分号+换行」拆句。

CREATE TABLE IF NOT EXISTS judge_runs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  attempt_id INT NOT NULL,
  question_id INT NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'queued',
  verdict VARCHAR(16) DEFAULT NULL,
  passed INT DEFAULT NULL,
  total INT DEFAULT NULL,
  time_ms INT DEFAULT NULL,
  mem_kb INT DEFAULT NULL,
  log TEXT DEFAULT NULL,
  created_by INT DEFAULT NULL,
  org_id INT DEFAULT NULL COMMENT 'shadow org（Phase 0 写入即赋值、查询不过滤）',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_attempt_question (attempt_id, question_id),
  KEY idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

- [ ] **Step 4: 应用迁移并校验列/表存在**

Run: `cd server; node src/migrate.js; node src/migrate.js --status`
Expected: 027/028 显示已应用；`SHOW TABLES LIKE 'question_judge_configs'` 与 `'judge_runs'` 均存在。

- [ ] **Step 5: 提交（迁移需 -f）**

```bash
git add -f server/migrations/027_question_judge_configs.sql server/migrations/028_judge_runs.sql
git commit -m "feat(fr106): 迁移027 question_judge_configs + 028 judge_runs（软引用/无FK，SSOT零改动前提）"
```

---

## Task 2: judgeService — Runner 接口 + StubRunner + 归一纯函数 + 单测

**Files:**
- Create: `server/src/services/judgeService.js`
- Test: `server/tests/unit/judgeService.test.js`

- [ ] **Step 1: 写失败单测（归一 + StubRunner 契约）**

```js
// server/tests/unit/judgeService.test.js
import { describe, it, expect } from 'vitest';
import { normalizeOutput, createStubRunner } from '../src/services/judgeService.js';

describe('fr106 judgeService', () => {
  it('normalizeOutput 去尾随空白与末尾空行', () => {
    expect(normalizeOutput('42  \n\n')).toBe('42');
    expect(normalizeOutput('a\r\nb')).toBe('a\nb');
  });
  it('StubRunner：代码含各用例 expected_output 子串则 AC，否则 WA', async () => {
    const stub = createStubRunner();
    const cases = [
      { input: '', expected_output: '42', is_sample: true },
      { input: '', expected_output: '7', is_sample: true },
    ];
    const ok = await stub.run({ code: 'x=42; y=7', language: 'python', testCases: cases, timeLimitMs: 2000, memoryLimitMb: 128 });
    expect(ok.verdict).toBe('AC'); expect(ok.passed).toBe(2); expect(ok.total).toBe(2);
    const bad = await stub.run({ code: 'x=1', language: 'python', testCases: cases, timeLimitMs: 2000, memoryLimitMb: 128 });
    expect(bad.verdict).toBe('WA'); expect(bad.passed).toBe(0);
  });
});
```

- [ ] **Step 2: 跑单测确认失败**

Run: `cd server; npx vitest run tests/unit/judgeService.test.js`
Expected: FAIL（找不到模块 / `normalizeOutput is not a function`）

- [ ] **Step 3: 实现 judgeService.js（接口 + 归一 + StubRunner + DockerRunner + 并发闸 + getRunner）**

```js
// server/src/services/judgeService.js
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import pool from '../db.js';
import log from '../utils/logger.js';

const JUDGE_CONCURRENCY = Math.max(1, Number(process.env.JUDGE_CONCURRENCY) || 2);

/** 输出归一：CRLF→LF、去每行尾随空白、去末尾空行。纯函数，供比对与单测。 */
export function normalizeOutput(s) {
  return String(s ?? '').replace(/\r
/g, '
').split('
').map((l) => l.replace(/[ \t]+$/, '')).join('
').replace(/
+$/, '');
}

/** StubRunner（仅测试）：确定性——某用例通过 iff 提交代码包含其 expected_output（trim 后）子串。绝不在生产用。 */
export function createStubRunner() {
  return {
    name: 'stub',
    async run({ code, testCases = [] }) {
      const src = String(code ?? '');
      const perCase = testCases.map((c, index) => {
        const ok = src.includes(normalizeOutput(c.expected_output).split('\n')[0] || '__never__');
        return { index, ok, expected: c.expected_output, actual: ok ? c.expected_output : '', err: ok ? null : 'stub-mismatch' };
      });
      const passed = perCase.filter((p) => p.ok).length;
      const total = perCase.length;
      return { verdict: total > 0 && passed === total ? 'AC' : 'WA', passed, total, time_ms: 0, mem_kb: 0, log: 'stub', perCase };
    },
  };
}

// —— DockerRunner 在 Task 2b 实现；此处先导出占位选择器，getRunner 兜底 stub ——
function dockerAvailable() {
  const r = spawnSync('docker', ['version'], { timeout: 5000 });
  return r.status === 0;
}

export function getRunner() {
  if ((process.env.JUDGE_RUNNER || 'docker') === 'stub') return createStubRunner();
  return createDockerRunner();
}

/** 进程内并发闸：限制同时执行的判题容器数，超限排队。 */
let active = 0;
const waiters = [];
export function acquireSlot() {
  if (active < JUDGE_CONCURRENCY) { active++; return Promise.resolve(); }
  return new Promise((resolve) => waiters.push(resolve));
}
export function releaseSlot() {
  active--;
  const next = waiters.shift();
  if (next) { active++; next(); }
}

// createDockerRunner 的具体实现在 Task 2b（下一步）；先给最小可用体以便本任务单测通过。
function createDockerRunner() {
  return { name: 'docker', run: async () => { throw new Error('docker runner 未装配（见 Task 2b）'); } };
}

export { dockerAvailable, JUDGE_CONCURRENCY };
export default { getRunner, acquireSlot, releaseSlot, normalizeOutput, createStubRunner };
```

- [ ] **Step 4: 跑单测确认通过**

Run: `cd server; npx vitest run tests/unit/judgeService.test.js`
Expected: PASS（2 用例）

- [ ] **Step 5: 提交**

```bash
git add server/src/services/judgeService.js server/tests/unit/judgeService.test.js
git commit -m "feat(fr106): judgeService 骨架——Runner接口+StubRunner(确定性)+输出归一+进程内并发闸"
```

---

## Task 2b: DockerRunner 真实执行 + 可选 Docker 集成测试（可 skip）

**Files:**
- Modify: `server/src/services/judgeService.js`（实现 `createDockerRunner`）
- Create: `server/tests/judge.docker.integration.mjs`

- [ ] **Step 1: 用真实实现替换占位 `createDockerRunner`**

```js
function createDockerRunner() {
  const IMAGE = process.env.JUDGE_PYTHON_IMAGE || 'python:3-slim';
  return {
    name: 'docker',
    async run({ code, testCases = [], timeLimitMs = 2000, memoryLimitMb = 128 }) {
      const work = mkdtempSync(join(tmpdir(), 'judge-'));
      try {
        writeFileSync(join(work, 'solution.py'), String(code ?? ''), 'utf8');
        writeFileSync(join(work, 'cases.json'), JSON.stringify(testCases), 'utf8');
        writeFileSync(join(work, 'runner.py'), RUNNER_PY, 'utf8');
        const hardMs = timeLimitMs * Math.max(1, testCases.length) + 5000; // 冷启裕量
        const dockerArgs = [
          'run', '--rm', '--network', 'none', '--memory', `${memoryLimitMb}m`, '--cpus', '0.5',
          '--pids-limit', '64', '--read-only', '--tmpfs', '/tmp:rw,size=16m', '--user', 'nobody',
          '-v', `${work}:/code:ro`, IMAGE, 'python', '/code/runner.py',
        ];
        const out = await runDocker(dockerArgs, hardMs);
        const result = parseRunnerOutput(out.stdout, out.code);
        return { ...result, time_ms: out.ms, mem_kb: 0, log: out.stderr || '' };
      } finally {
        try { rmSync(work, { recursive: true, force: true }); } catch { /* ignore */ }
      }
    },
  };
}
```

追加到同文件（helper + 容器内 harness）：

```js
/** 容器内 harness：逐用例喂 stdin、限时、比对归一 stdout，末行打印 JSON 结果。写入 runner.py。 */
const RUNNER_PY = [
  'import json,subprocess,sys,time',
  'cases=json.load(open("/code/cases.json",encoding="utf-8"))',
  'res=[]; passed=0',
  'def norm(s):',
  '    return "\\n".join(l.rstrip() for l in s.replace("\\r\\n","\\n").split("\\n")).rstrip()',
  'for i,c in enumerate(cases):',
  '    t0=time.time()',
  '    try:',
  '        p=subprocess.run(["python","/code/solution.py"],input=str(c.get("input","")),',
  '            capture_output=True,text=True,timeout=max(1,int(%s/1000)) if False else 2)' % '2000',
  '        ok=norm(p.stdout)==norm(str(c.get("expected_output","")))',
  '        err=None if p.returncode==0 else ("RE: rc=%d %s"%(p.returncode,p.stderr.strip()[:200]))',
  '        actual=p.stdout',
  '    except subprocess.TimeoutExpired:',
  '        ok=False; err="TLE"; actual=""',
  '    except Exception as e:',
  '        ok=False; err="RE:%s"%e; actual=""',
  '    if ok: passed+=1',
  '    res.append({"index":i,"ok":ok,"expected":c.get("expected_output"),"actual":actual,"err":err})',
  'total=len(cases)',
  'verdict="AC" if total>0 and passed==total else ("CE" if total==0 else "WA")',
  'print("###RESULT###"+json.dumps({"verdict":verdict,"passed":passed,"total":total,"perCase":res}))',
].join('\n');

/** 解析 runner.py 末行 ###RESULT### JSON；无结果按运行时错误。 */
export function parseRunnerOutput(stdout, exitCode) {
  const line = String(stdout || '').split('\n').find((l) => l.startsWith('###RESULT###'));
  if (!line) return { verdict: exitCode === 0 ? 'RE' : 'CE', passed: 0, total: 0, perCase: [], log: `no-result exit=${exitCode}` };
  try { return JSON.parse(line.slice('###RESULT###'.length)); }
  catch { return { verdict: 'RE', passed: 0, total: 0, perCase: [], log: 'bad-result-json' }; }
}

/** spawn docker run + wall-clock kill，返回 {stdout,stderr,code,ms}。 */
function runDocker(args, hardMs) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const child = spawn('docker', args);
    let stdout = '', stderr = '', done = false;
    child.stdout.on('data', (d) => { stdout += d; });
    child.stderr.on('data', (d) => { stderr += d; });
    const killer = setTimeout(() => { if (!done) { try { child.kill('SIGKILL'); } catch {} } }, hardMs);
    child.on('close', (code) => {
      done = true; clearTimeout(killer);
      resolve({ stdout, stderr, code, ms: Date.now() - t0 });
    });
    child.on('error', (e) => {
      done = true; clearTimeout(killer);
      resolve({ stdout: '', stderr: String(e.message || e), code: -1, ms: Date.now() - t0 });
    });
  });
}
```

- [ ] **Step 2: 写可选 Docker 集成测试（无 Docker 显式 skip、不红）**

```js
// server/tests/judge.docker.integration.mjs
// 独立脚本：需本机有可用 docker 且已 pull python:3-slim；否则 SKIP（退出码 0，不使门禁变红）。
import { getRunner, dockerAvailable } from '../src/services/judgeService.js';

async function main() {
  if (!dockerAvailable()) { console.log('[SKIP] 本机无可用 docker，跳过真实判题集成'); process.exit(0); }
  const runner = getRunner();
  const r = await runner.run({
    code: 'print(int(input())*2)', language: 'python',
    testCases: [{ input: '21', expected_output: '42', is_sample: true }],
    timeLimitMs: 2000, memoryLimitMb: 128,
  });
  const ok = r.verdict === 'AC' && r.passed === 1;
  console.log(`${ok ? '✓' : '✗'} Docker 判题 print(int(input())*2) 期望 42 => ${r.verdict} passed=${r.passed}/${r.total}`);
  process.exit(ok ? 0 : 1);
}
main();
```

- [ ] **Step 3: 运行（无 docker 环境应 SKIP 且 exit 0）**

Run: `cd server; node tests/judge.docker.integration.mjs`
Expected: 无 docker → `[SKIP] ...` exit 0；有 docker → `✓ Docker 判题 ...` exit 0。

- [ ] **Step 4: 提交**

```bash
git add server/src/services/judgeService.js server/tests/judge.docker.integration.mjs
git commit -m "feat(fr106): DockerRunner 真实执行(禁网/只读/非root/限额/harness) + 可选Docker集成(无则skip)"
```

---

## Task 3: 建题/批量/更新写入 judge_config（027 表）

**Files:**
- Modify: `server/src/routes/questions.js`（create L157-163、batch L226-233、update L266-271）
- Test: `server/tests/integration_exam.mjs`（FR-106 建题回读段）

- [ ] **Step 1: 写失败断言（先仅建题回读，挂起 server 用 stub）**

在 `integration_exam.mjs` FR-105 段 `{...}` 之后新增：

```js
  // 19d) FR-106 编程题判题配置：建题带 judge_config → 详情回读一致
  {
    const jc = { language: 'python', time_limit_ms: 2000, memory_limit_mb: 128, starter_code: 'def solve():\n    pass',
      test_cases: [{ input: '21', expected_output: '42', is_sample: true }] };
    const rc = await api('POST', '/questions', tToken, {
      subject_id: 'it_subj_01', type: 'programming', title: 'IT_FR106编程题', answer: '(参考解)', judge_config: jc,
    });
    check('FR106 建编程题(200,id)', rc.status === 200 && rc.data?.id, rc.status);
    const qProg = rc.data?.id;
    const rd = await api('GET', `/questions/${qProg}`, tToken);
    const got = rd.data?.judge_config;
    check('FR106 详情回读judge_config', rd.status === 200 && got?.language === 'python' && Array.isArray(got?.test_cases) && got.test_cases[0].expected_output === '42', { got });
  }
```

- [ ] **Step 2: 起 fresh server（`JUDGE_RUNNER=stub`）跑集成确认失败**

Run（kill 旧 3100 → `cd server; $env:JUDGE_RUNNER='stub'; node src/index.js` 后台）→ `node tests/integration_exam.mjs`
Expected: `FR106 详情回读judge_config` FAIL（`judge_config` undefined，端点尚未写/读）。

- [ ] **Step 3: create 端点写 judge_config**

`questions.js` create 解构加 `judge_config`（L117），INSERT 题目拿到 `insertId` 后：

```js
    if (type === 'programming' && judge_config && Array.isArray(judge_config.test_cases)) {
      await pool.execute(
        `INSERT INTO question_judge_configs (question_id, language, time_limit_ms, memory_limit_mb, starter_code, test_cases, created_by, org_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [result.insertId, judge_config.language || 'python', Number(judge_config.time_limit_ms) || 2000,
         Number(judge_config.memory_limit_mb) || 128, judge_config.starter_code || null,
         JSON.stringify(judge_config.test_cases), req.user.id, await resolvePersonalOrgId(pool, req.user.id)]
      );
    }
```

- [ ] **Step 4: batch 每题写 config；update 覆盖/清空 config**

batch 循环内 INSERT 题目后同样 `if (qType === 'programming' && q.judge_config?.test_cases) INSERT ... ON DUPLICATE KEY UPDATE`（用 `result.insertId`）。update：解构 `judge_config`，题目更新后：

```js
    if (judge_config && Array.isArray(judge_config.test_cases)) {
      await pool.execute(
        `INSERT INTO question_judge_configs (question_id, language, time_limit_ms, memory_limit_mb, starter_code, test_cases, created_by, org_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE language=VALUES(language), time_limit_ms=VALUES(time_limit_ms), memory_limit_mb=VALUES(memory_limit_mb),
           starter_code=VALUES(starter_code), test_cases=VALUES(test_cases), updated_at=NOW()`,
        [req.params.id, judge_config.language || 'python', Number(judge_config.time_limit_ms) || 2000,
         Number(judge_config.memory_limit_mb) || 128, judge_config.starter_code || null, JSON.stringify(judge_config.test_cases), req.user.id, orgId]
      );
    } else if (judge_config === null) {
      await pool.execute('DELETE FROM question_judge_configs WHERE question_id = ?', [req.params.id]);
    }
```

- [ ] **Step 5: 详情端点带出 judge_config（属主守卫内）**

`questions.js` `GET /:id` 成功取到 `rows[0]` 后（L104 附近）：

```js
    const [jcRows] = await pool.execute('SELECT language, time_limit_ms, memory_limit_mb, starter_code, test_cases FROM question_judge_configs WHERE question_id = ?', [rows[0].id]);
    rows[0].judge_config = jcRows.length ? { ...jcRows[0], test_cases: JSON.parse(jcRows[0].test_cases || '[]') } : null;
```

- [ ] **Step 6: fresh server 重跑集成确认通过**

Run: `node tests/integration_exam.mjs`（仍 `JUDGE_RUNNER=stub`）
Expected: `FR106 建编程题`、`FR106 详情回读judge_config` 均 PASS。

- [ ] **Step 7: 提交**

```bash
git add server/src/routes/questions.js server/tests/integration_exam.mjs
git commit -m "feat(fr106): 建题/批量/更新写 question_judge_configs，详情带出 judge_config"
```

---

## Task 4: `POST /api/judge/practice` 同步样例判题端点 + 挂载

**Files:**
- Create: `server/src/routes/judge.js`
- Modify: `server/src/index.js`（import + `app.use('/api/judge', ...)`，参考 L143/L151）

- [ ] **Step 1: 写失败断言（练习运行样例，stub）**

在集成脚本新增（紧接 19d）：

```js
  // 19e) FR-106 练习同步运行样例（stub 判题：代码含 expected 子串即 AC）
  {
    const rp = await api('POST', '/judge/practice', tToken, { question_id: qProg, code: 'print(42)' });
    check('FR106 练习运行样例 AC', rp.status === 200 && rp.data?.verdict === 'AC' && rp.data?.passed === rp.data?.total && rp.data.total >= 1, { status: rp.status, d: rp.data });
    const rbad = await api('POST', '/judge/practice', tToken, { question_id: qProg, code: 'print(0)' });
    check('FR106 练习运行样例 WA', rbad.status === 200 && rbad.data?.verdict === 'WA', rbad.data?.verdict);
  }
```

（`qProg` 从 19d 提到外层块作用域：将 `const qProg` 声明并入 19d 所在块顶部或复用既有变量风格；执行时按脚本实际作用域调整。）

- [ ] **Step 2: 实现 judge.js**

```js
// server/src/routes/judge.js
import { Router } from 'express';
import pool from '../db.js';
import { authMiddleware } from '../middleware/auth.js';
import { getRunner, acquireSlot, releaseSlot } from '../services/judgeService.js';
import log from '../utils/logger.js';

const router = Router();

/** POST /api/judge/practice  { question_id, code } — 同步跑样例用例（is_sample，无则全部），不计分。 */
router.post('/practice', authMiddleware, async (req, res) => {
  try {
    const qid = Number(req.body?.question_id);
    const code = String(req.body?.code ?? '');
    if (!qid) return res.status(400).json({ error: 'question_id 不能为空' });
    const [jc] = await pool.execute(
      `SELECT jc.language, jc.time_limit_ms, jc.memory_limit_mb, jc.test_cases
       FROM question_judge_configs jc JOIN questions q ON q.id = jc.question_id
       WHERE jc.question_id = ? AND q.type = 'programming'`, [qid]);
    if (jc.length === 0) return res.status(404).json({ error: '该题无判题配置' });
    const all = JSON.parse(jc[0].test_cases || '[]');
    const samples = all.filter((c) => c.is_sample !== false);
    const cases = (samples.length ? samples : all).map((c) => ({ ...c, expected_output: c.expected_output }));
    await acquireSlot();
    let result;
    try { result = await getRunner().run({ code, language: jc[0].language, testCases: cases, timeLimitMs: jc[0].time_limit_ms, memoryLimitMb: jc[0].memory_limit_mb }); }
    finally { releaseSlot(); }
    res.json({ verdict: result.verdict, passed: result.passed, total: result.total, perCase: result.perCase, time_ms: result.time_ms });
  } catch (err) {
    log.error('练习判题错误:', err);
    res.status(500).json({ error: '判题失败' });
  }
});

/** GET /api/judge/runs/:attemptId — 某答卷的判题运行（仅属主/管理员）。 */
router.get('/runs/:attemptId(\\d+)', authMiddleware, async (req, res) => {
  try {
    const [a] = await pool.execute('SELECT user_id FROM exam_attempts WHERE id = ?', [Number(req.params.attemptId)]);
    if (a.length === 0) return res.status(404).json({ error: '答卷不存在' });
    if (a[0].user_id !== req.user.id && req.user.role !== 'admin') return res.status(403).json({ error: '无权查看' });
    const [runs] = await pool.execute('SELECT id, question_id, status, verdict, passed, total, time_ms FROM judge_runs WHERE attempt_id = ? ORDER BY id', [Number(req.params.attemptId)]);
    res.json({ runs });
  } catch (err) { log.error('判题运行查询错误:', err); res.status(500).json({ error: '查询失败' }); }
});

export default router;
```

- [ ] **Step 3: 挂载路由**

`index.js` 顶部 import 区加 `import judgeRoutes from './routes/judge.js';`；在 `app.use('/api/upload', uploadRoutes);`（L143）之后加：

```js
app.use('/api/judge', judgeRoutes);
```

- [ ] **Step 4: fresh server（stub）重跑集成确认通过**

Run: `node tests/integration_exam.mjs`
Expected: `FR106 练习运行样例 AC`、`FR106 练习运行样例 WA` PASS。

- [ ] **Step 5: 提交**

```bash
git add server/src/routes/judge.js server/src/index.js server/tests/integration_exam.mjs
git commit -m "feat(fr106): POST /judge/practice 同步样例判题 + GET /judge/runs/:attemptId(属主) + 挂载 /api/judge"
```

---

## Task 5: 考试交卷异步判题 + `applyJudgeScore` 回写 + `score_ready`

**Files:**
- Modify: `server/src/utils/manualGrading.js`（加 `applyJudgeScore`）
- Test: `server/tests/unit/judgeScore.test.js`
- Modify: `server/src/routes/exams.js`（submit L589 commit 后入队 + 判题回写 worker）

- [ ] **Step 1: 写失败单测 `applyJudgeScore`**

```js
// server/tests/unit/judgeScore.test.js
import { describe, it, expect } from 'vitest';
import { applyJudgeScore } from '../src/utils/manualGrading.js';

describe('fr106 applyJudgeScore', () => {
  it('按 passed/total 比例给分并写回，判完置 complete', () => {
    const details = [{ question_id: 9, points: 10, earned: 0, is_correct: null, needs_manual: true }];
    const r = applyJudgeScore(details, 9, { earned: 10, verdict: 'AC', passed: 1, total: 1 });
    expect(r.details[0].earned).toBe(10);
    expect(r.details[0].needs_manual).toBe(false);
    expect(r.details[0].judge_status).toBe('AC');
    expect(r.score).toBe(10);
    expect(r.changedToComplete).toBe(true);
  });
});
```

- [ ] **Step 2: 确认失败 → 实现 `applyJudgeScore`**

在 `manualGrading.js` 末尾 `export default` 前新增：

```js
/** 判题回写：同 applyManualScore 口径，额外记录 judge_status/passed/total，graded_by 置 null(=judge)。 */
export function applyJudgeScore(details, questionId, { earned, verdict, passed, total }) {
  const idx = details.findIndex((d) => Number(d.question_id) === Number(questionId));
  if (idx === -1) throw new Error(`题目 ${questionId} 不在答卷明细中`);
  const points = Number(details[idx].points) || 0;
  const e = clampEarned(earned, points);
  const updated = details.map((d, i) =>
    i === idx ? { ...d, earned: e, is_correct: points > 0 && e === points, needs_manual: false,
      graded_by: null, graded_at: new Date().toISOString(), judge_status: verdict, judge_passed: passed, judge_total: total } : d,
  );
  const totals = recomputeTotals(updated);
  return { details: updated, ...totals, changedToComplete: !updated.some((d) => d.needs_manual === true) };
}
```

- [ ] **Step 3: 单测通过 + 更新 default export**

`export default { applyManualScore, recomputeTotals, applyJudgeScore };`
Run: `cd server; npx vitest run tests/unit/judgeScore.test.js` → PASS。

- [ ] **Step 4: submit 交卷后入队编程题判题**

`exams.js` import 加：`import { getRunner, acquireSlot, releaseSlot } from '../services/judgeService.js';` 与 `import { applyJudgeScore } from '../utils/manualGrading.js';`（合并到既有 manualGrading import）。在 submit `await conn.commit();`（L589）之后、`res.json`（L594）之前插入入队（异步非阻断）：

```js
    // FR-106：交卷后为「有判题配置的编程题」建 judge_runs 并异步判题（非阻断，失败回落人工）
    enqueueProgrammingJudges(examId, Number(attemptId), req.user.id).catch((e) => log.warn('[fr106] enqueue 失败:', e.message));
```

新增模块级函数（放 submit 路由之前）：

```js
async function enqueueProgrammingJudges(examId, attemptId, userId) {
  const [examRows] = await pool.execute('SELECT question_set FROM exams WHERE id = ?', [examId]);
  const qs = JSON.parse(examRows[0]?.question_set || '[]').map((x) => x.question_id);
  if (!qs.length) return;
  const ph = qs.map(() => '?').join(',');
  const [rows] = await pool.query(
    `SELECT q.id, jc.language, jc.time_limit_ms, jc.memory_limit_mb, jc.test_cases
     FROM questions q JOIN question_judge_configs jc ON jc.question_id = q.id
     WHERE q.id IN (${ph}) AND q.type = 'programming'`, qs);
  if (!rows.length) return;
  const [att] = await pool.execute('SELECT answers, org_id FROM exam_attempts WHERE id = ?', [attemptId]);
  const answers = JSON.parse(att[0]?.answers || '{}');
  for (const r of rows) {
    const [ins] = await pool.execute(
      `INSERT INTO judge_runs (attempt_id, question_id, status, created_by, org_id) VALUES (?, ?, 'queued', ?, ?)`,
      [attemptId, r.id, userId, att[0].org_id ?? null]);
    runJudge(ins.insertId, attemptId, r, answers[r.id] ?? '', att[0].org_id ?? null).catch((e) => log.warn('[fr106] run 失败:', e.message));
  }
}

async function runJudge(runId, attemptId, cfg, code, orgId) {
  await pool.execute(`UPDATE judge_runs SET status='running', updated_at=NOW() WHERE id=?`, [runId]);
  await acquireSlot();
  let res;
  try {
    res = await getRunner().run({ code, language: cfg.language, testCases: JSON.parse(cfg.test_cases || '[]'), timeLimitMs: cfg.time_limit_ms, memoryLimitMb: cfg.memory_limit_mb });
  } catch (e) {
    await pool.execute(`UPDATE judge_runs SET status='failed', log=?, updated_at=NOW() WHERE id=?`, [String(e.message || e).slice(0, 500), runId]);
    return; // 回落人工：该题 details 仍 needs_manual
  } finally { releaseSlot(); }
  await pool.execute(`UPDATE judge_runs SET status='done', verdict=?, passed=?, total=?, time_ms=?, updated_at=NOW() WHERE id=?`,
    [res.verdict, res.passed, res.total, res.time_ms ?? null, runId]);
  await writeJudgeScoreToAttempt(attemptId, cfg.id, res, orgId);
}

async function writeJudgeScoreToAttempt(attemptId, qid, res, orgId) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.execute('SELECT * FROM exam_attempts WHERE id = ? FOR UPDATE', [attemptId]);
    if (rows.length === 0) { await conn.rollback(); return; }
    const attempt = rows[0];
    if (!['submitted', 'auto_submitted'].includes(attempt.status)) { await conn.rollback(); return; }
    const details = JSON.parse(attempt.details || '[]');
    const item = details.find((d) => Number(d.question_id) === Number(qid));
    const pts = Number(item?.points) || 0;
    const earned = res.total > 0 ? Math.round((pts * res.passed) / res.total) : 0;
    const r = applyJudgeScore(details, qid, { earned, verdict: res.verdict, passed: res.passed, total: res.total });
    await conn.execute('UPDATE exam_attempts SET details=?, score=?, correct_count=?, updated_at=NOW() WHERE id=?',
      [JSON.stringify(r.details), r.score, r.correctCount, attemptId]);
    await conn.commit();
    if (r.changedToComplete) {
      const [ex] = await pool.execute('SELECT title FROM exams WHERE id=?', [attempt.exam_id]);
      createNotification(pool, { user_id: attempt.user_id, type: 'score_ready', title: `${ex[0]?.title || '考试'} 成绩已更新`,
        payload: { exam_id: attempt.exam_id, attempt_id: attemptId }, org_id: orgId }).catch((e) => log.warn('[fr106] 通知失败:', e.message));
    }
  } catch (e) { try { await conn.rollback(); } catch {} log.error('[fr106] 判题回写错误:', e); }
  finally { conn.release(); }
}
```

- [ ] **Step 5: 写集成断言（stub 端到端判题回写 + score_ready）**

集成脚本 `sToken` 交卷一张含编程题（19d 的 `qProg`，config stub 判 AC）的试卷后轮询 `GET /exams/attempts/:attemptId`：

```js
  // 19f) FR-106 考试异步判题：交卷→judge_runs done→details 回写 earned→score 命中
  {
    const rex = await api('POST', '/exams', tToken, { subject_id: 'it_subj_01', title: 'IT_FR106编考',
      question_set: [{ question_id: qProg, points: 10 }], duration_minutes: 30, pass_score: 6 });
    const exProg = rex.data?.id;
    await api('PUT', `/exams/${exProg}`, tToken, { status: 'published', start_time: fmt(new Date(now.getTime() - 60000)), end_time: fmt(new Date(now.getTime() + 86400000)) });
    const rst = await api('POST', `/exams/${exProg}/start`, sToken);
    const aid = rst.data?.attemptId;
    const rsub = await api('POST', `/exams/${exProg}/submit`, sToken, { attemptId: aid, answers: { [qProg]: 'print(42)' } });
    check('FR106 交卷(初判 needs_manual score=0)', rsub.status === 200, rsub.status);
    // 轮询判题完成（stub 即时）
    let final = null;
    for (let i = 0; i < 20; i++) {
      const ra = await api('GET', `/exams/attempts/${aid}`, sToken);
      const d = (ra.data?.details || []).find((x) => Number(x.question_id) === Number(qProg));
      if (d && d.needs_manual === false) { final = { score: ra.data?.score, d }; break; }
      await new Promise((r) => setTimeout(r, 100));
    }
    check('FR106 判题回写 earned=10 needs_manual=false', !!final && final.d.earned === 10 && final.d.judge_status === 'AC', final);
    const rr = await api('GET', `/judge/runs/${aid}`, sToken);
    check('FR106 judge_runs done', rr.status === 200 && (rr.data?.runs || []).some((x) => x.status === 'done' && x.verdict === 'AC'), rr.data);
  }
```

- [ ] **Step 6: fresh server（stub）重跑集成 + server 单测确认全通过**

Run: `cd server; npx vitest run tests/unit/judgeScore.test.js; node tests/integration_exam.mjs`
Expected: 单测 PASS；集成 `FR106 判题回写 earned=10`、`FR106 judge_runs done` PASS。

- [ ] **Step 7: 提交**

```bash
git add server/src/utils/manualGrading.js server/tests/unit/judgeScore.test.js server/src/routes/exams.js server/tests/integration_exam.mjs
git commit -m "feat(fr106): 交卷异步判题入队+Docker/Stub执行+复用FOR UPDATE回写details/score/score_ready(失败回落人工)"
```

---

## Task 6: 跨租户隔离门禁 FR-106 段

**Files:**
- Modify: `server/tests/isolation.integration.mjs`

- [ ] **Step 1: 新增隔离断言（B 不可见 A 的判题配置/运行）**

在 FR-105 隔离段之后插入：

```js
  // FR-106 编程判题跨租户：A 建带 config 编程题 + 答卷判题；B 读 config/运行均不可越权
  {
    const jc = { language: 'python', time_limit_ms: 2000, memory_limit_mb: 128, test_cases: [{ input: '2', expected_output: '4', is_sample: true }] };
    const ca = await api('POST', '/questions', tA.token, { subject_id: 'iso_subj_A', type: 'programming', title: 'ISO_编程题A', answer: 'x', judge_config: jc });
    const qProgA = ca.data?.id;
    check('ISO FR106 A建编程题带config', ca.status === 200 && !!qProgA, ca.status);
    const da = await api('GET', `/questions/${qProgA}`, tA.token);
    check('ISO FR106 A读回config(正向对照)', da.status === 200 && da.data?.judge_config?.language === 'python', da.status);
    checkBlocked('ISO FR106 B读A编程题(403/404)', await api('GET', `/questions/${qProgA}`, tB.token));
    checkBlocked('ISO FR106 B练习判A题config(403/404/404-题不属B)', await api('POST', '/judge/practice', tB.token, { question_id: qProgA, code: 'print(4)' }));
  }
```

- [ ] **Step 2: fresh server（stub）跑隔离确认通过**

Run: `cd server; $env:JUDGE_RUNNER='stub'; node tests/isolation.integration.mjs`
Expected: `ISO FR106 ...` 全 ✓，`checkBlocked` 断言 B→403/404。exit 0。

> 说明：`/judge/practice` 对 B 应返回 404（B 查不到该题 config，因 JOIN questions 未按 created_by 过滤——执行时若 practice 仍对越权题放行，则在 practice 增加与题目可见性一致的属主/共享校验后再断言 403/404）。以实际隔离结果为准，务必让 B 无法借 practice 触发 A 题判题。

- [ ] **Step 3: 提交**

```bash
git add server/tests/isolation.integration.mjs
git commit -m "test(fr106): 跨租户隔离门禁——编程题config/判题运行随属主隔离，B不可越权读或触发"
```

---

## Task 7: 前端契约（types + api.judgeApi + create 透传 + mapper）

**Files:**
- Modify: `src/types.ts`、`src/services/api.ts`
- Test: `src/services/__tests__/mappers.test.ts`

- [ ] **Step 1: 加类型**

`src/types.ts` `Question` 附近新增：

```ts
export interface JudgeTestCase { input: string; expected_output: string; is_sample?: boolean; }
export interface JudgeConfig { language?: string; time_limit_ms?: number; memory_limit_mb?: number; starter_code?: string | null; test_cases: JudgeTestCase[]; }
export interface JudgeRunResult { verdict: 'AC' | 'WA' | 'TLE' | 'MLE' | 'RE' | 'CE' | string; passed: number; total: number; time_ms?: number; perCase?: { index: number; ok: boolean; expected?: string; actual?: string; err?: string | null }[]; }
```

`src/services/api.ts` `QuestionItem`（L173-190）加可选 `judge_config?: JudgeConfig | null;`（import 类型）。

- [ ] **Step 2: `questionApi.create` 透传 + `judgeApi`**

`api.ts` `questionApi.create`（L322）入参类型已 `Partial<QuestionItem>`，无需改调用；在 `mediaApi`（L426）之后新增：

```ts
export const judgeApi = {
  practice: (questionId: number, code: string): Promise<JudgeRunResult> =>
    client.post<JudgeRunResult>('/judge/practice', { question_id: questionId, code }),
  runs: (attemptId: number): Promise<{ runs: { id: number; question_id: number; status: string; verdict: string | null; passed: number | null; total: number | null }[] }> =>
    client.get(`/judge/runs/${attemptId}`),
};
```

- [ ] **Step 3: 提交**

```bash
git add src/types.ts src/services/api.ts
git commit -m "feat(fr106): 前端契约 types(JudgeConfig/JudgeRunResult)+judgeApi(practice/runs)+QuestionItem.judge_config"
```

---

## Task 8: QuestionForm 编程题配置区（用例编辑 + 透传）

**Files:**
- Modify: `src/components/exam/QuestionForm.tsx`
- Test: `npm run build` 通过即门禁；无独立单测（受控表单）

- [ ] **Step 1: 加用例编辑 state 与提交透传**

`isProgramming = type === 'programming'`；新增：

```tsx
  const [starter, setStarter] = useState<string>('');
  const [cases, setCases] = useState<{ input: string; expected_output: string; is_sample: boolean }[]>(
    [{ input: '', expected_output: '', is_sample: true }]);
```

`handleSubmit` 内 `questionApi.create({...})` 的 payload 追加（仅编程题）：

```tsx
        judge_config: type === 'programming'
          ? { language: 'python', time_limit_ms: 2000, memory_limit_mb: 128, starter_code: starter || null,
              test_cases: cases.map((c) => ({ input: c.input, expected_output: c.expected_output, is_sample: c.is_sample !== false })) }
          : undefined,
```

编程题分支校验：`if (type==='programming' && !cases.some((c)=>c.expected_output.trim())) { setError('编程题至少填一个样例用例的期望输出'); return; }`（放在 options 校验后）。

- [ ] **Step 2: 渲染配置区（仅 isProgramming）**

在听力音频块之后插入：

```tsx
          {type === 'programming' && (
            <div className="p-3 rounded-2xl border border-emerald-100 bg-emerald-50/50 space-y-3">
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-slate-600">编程题判题配置</span>
                <span className="text-xs text-slate-400">语言固定 Python · 2s / 128MB</span>
              </div>
              <label className="block text-sm">
                <span className="font-bold text-slate-600">初始代码（可选）</span>
                <textarea value={starter} onChange={(e) => setStarter(e.target.value)}
                  className="mt-1 w-full px-3 py-2 rounded-xl border-2 border-slate-100 focus:border-emerald-600 outline-none font-mono text-xs h-20 resize-none" />
              </label>
              <div className="space-y-2">
                <span className="text-sm font-bold text-slate-600">样例用例（输入 → 期望输出）</span>
                {cases.map((c, i) => (
                  <div key={i} className="flex gap-2 items-start">
                    <textarea value={c.input} onChange={(e) => setCases((p) => p.map((x, j) => j === i ? { ...x, input: e.target.value } : x))}
                      placeholder="stdin 输入" className="flex-1 px-2 py-1.5 rounded-lg border border-slate-200 font-mono text-xs h-16 resize-none" />
                    <textarea value={c.expected_output} onChange={(e) => setCases((p) => p.map((x, j) => j === i ? { ...x, expected_output: e.target.value } : x))}
                      placeholder="期望 stdout" className="flex-1 px-2 py-1.5 rounded-lg border border-slate-200 font-mono text-xs h-16 resize-none" />
                    <button type="button" onClick={() => setCases((p) => p.filter((_, j) => j !== i))} className="text-rose-500 text-xs px-1">删除</button>
                  </div>
                ))}
                <button type="button" onClick={() => setCases((p) => [...p, { input: '', expected_output: '', is_sample: true }])}
                  className="text-xs text-emerald-600 font-bold">+ 添加用例</button>
              </div>
            </div>
          )}
```

`reset()` 补 `setStarter(''); setCases([{ input: '', expected_output: '', is_sample: true }]);`。

- [ ] **Step 3: tsc + build**

Run: `npx tsc --noEmit; npm run build`
Expected: 均 exit 0。

- [ ] **Step 4: 提交**

```bash
git add src/components/exam/QuestionForm.tsx
git commit -m "feat(fr106): QuestionForm 编程题配置区(初始代码+样例用例增删)并透传 judge_config"
```

---

## Task 9: 作答页「运行样例」+ 逐用例结果；考试页「判题中」

**Files:**
- Modify: `src/components/app/ExamScreen.tsx`（practice L480-494 编程分支）
- Modify: `src/components/app/FormalExamScreen.tsx`（结果/交卷态提示）

- [ ] **Step 1: ExamScreen 本地运行样例**

import `judgeApi` 与 `JudgeRunResult`；组件内加本地 state（若函数式）或复用现有 hooks 风格新增：

```tsx
  const [judgeResult, setJudgeResult] = React.useState<JudgeRunResult | null>(null);
  const [judging, setJudging] = React.useState<boolean>(false);
  const runSample = async () => {
    setJudging(true); setJudgeResult(null);
    try { const r = await judgeApi.practice(currentQuestion.id, (userAnswers[currentQuestion.id] as string) || ''); setJudgeResult(r); }
    finally { setJudging(false); }
  };
```

在编程分支 textarea 下、「提交并查看解析」按钮旁追加：

```tsx
              <div className="flex items-center gap-3">
                <button onClick={runSample} disabled={judging} className="py-3 px-5 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 disabled:opacity-60">
                  {judging ? '运行中…' : '运行样例'}
                </button>
                {judgeResult && (
                  <span className={`font-bold ${judgeResult.verdict === 'AC' ? 'text-emerald-600' : 'text-rose-600'}`}>
                    {judgeResult.verdict} · {judgeResult.passed}/{judgeResult.total}
                  </span>
                )}
              </div>
              {judgeResult?.perCase && (
                <div className="space-y-1">
                  {judgeResult.perCase.map((pc) => (
                    <div key={pc.index} className={`text-xs px-3 py-2 rounded-lg ${pc.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
                      用例 #{pc.index + 1} {pc.ok ? '通过' : `失败${pc.err ? ' · ' + pc.err : ''}`}
                      {!pc.ok && <pre className="mt-1 whitespace-pre-wrap">{`期望:\n${pc.expected ?? ''}\n实际:\n${pc.actual ?? ''}`}</pre>}
                    </div>
                  ))}
                </div>
              )}
```

切题时 `useEffect(() => { setJudgeResult(null); }, [currentQuestion.id]);` 清空。

- [ ] **Step 2: FormalExamScreen 交卷态「判题中」提示**

在结果/待判分处，对 `currentQuestion.type === 'programming'` 或结果页 `needs_manual && judge_status` 展示「编程题判题中，成绩稍后更新」文案（复用既有「待人工判分」徽标位，改为「判题中/待人工」二态；沿用现有成绩刷新/通知，无需轮询实现）。

- [ ] **Step 3: tsc + root vitest + build**

Run: `npx tsc --noEmit; npx vitest run; npm run build`
Expected: 全 exit 0（既有用例无回归）。

- [ ] **Step 4: 提交**

```bash
git add src/components/app/ExamScreen.tsx src/components/app/FormalExamScreen.tsx
git commit -m "feat(fr106): 练习页运行样例+逐用例结果面板；考试页判题中提示"
```

---

## Task 10: 文档同步（开发文档 §8.3d + 路由 + PRD FR-106）

**Files:**
- Modify: `docs/开发文档.md`（§6.2 路由表加 `/api/judge`；§8.3c 后加 §8.3d）
- Modify: `docs/产品需求文档-平台化演进.md`（FR-106 行追加交付状态）

- [ ] **Step 1: 路由表加行**

`/api/judge | routes/judge.js | FR-106 编程题判题：POST /practice 同步样例判题、GET /runs/:attemptId 属主读取；Docker 每提交起容器(python:3-slim，禁网/只读/非root/限额)，JUDGE_RUNNER=stub 测试用，失败回落人工`

- [ ] **Step 2: §8.3d 编程题在线判题（FR-106）说明块**

数据（027/028 两表、`questions` 零改动、判题外置于服务端不进 SSOT）、Runner 接口（Docker/Stub 由 `JUDGE_RUNNER` 切换）、建题写 config、练习同步 `/judge/practice`、考试交卷异步 `enqueueProgrammingJudges`→`applyJudgeScore`(FOR UPDATE + Σearned)→`score_ready`、`earned=round(points*passed/total)`、失败回落人工、隔离进门禁、前端 QuestionForm+运行样例。

- [ ] **Step 3: PRD FR-106 行追加交付状态**

参照 FR-104/105 写法追加：`**核心纵切已交付 v1（2026-10-13）**：迁移027/028 + Docker 每提交容器执行(Python) + 练习同步样例 + 考试交卷异步判题回写(score_ready，复用FR-103链路) + SSOT零改动 + 失败回落人工 + 跨租户隔离进门禁。**延后为增量2**：多语言、CodeMirror 高亮编辑器、分布式队列(Redis)、隐藏用例反作弊、逐用例加权分、判题配额治理(FR-606/109)。详见 docs/superpowers/specs/2026-10-13-fr106-programming-judge-design.md`

- [ ] **Step 4: 提交**

```bash
git add docs/开发文档.md docs/产品需求文档-平台化演进.md
git commit -m "docs(fr106): /api/judge 路由 + §8.3d 编程判题说明 + PRD FR-106 核心纵切交付状态"
```

---

## Task 11: DoD + 四重门禁 + finishing（L3 + 合并）

- [ ] **Step 1: DoD — SSOT 零改动 & 迁移仅 027/028**

```bash
git diff main..HEAD -- src/shared/scoring/index.ts server/src/utils/examScoring.generated.js   # 期望：空
git diff main..HEAD --stat -- server/migrations                                                  # 期望：仅 027、028
```

- [ ] **Step 2: server 单测 + 前端 tsc/vitest/build**

```bash
cd server; npx vitest run            # 含 judgeService/judgeScore 新单测，exit 0
npx tsc --noEmit                     # exit 0
npx vitest run                       # root，全绿
npm run build                        # exit 0
```

- [ ] **Step 3: integration（fresh server，JUDGE_RUNNER=stub）**

kill 3100 → `cd server; $env:JUDGE_RUNNER='stub'; node src/index.js`（后台）→ health 200 → `node tests/integration_exam.mjs`（含 FR106 段全 ✓，exit 0）。

- [ ] **Step 4: isolation（另起 fresh server）**

kill 3100 → 重启（stub）→ health 200 → `node tests/isolation.integration.mjs`（含 ISO FR106，B→403/404，exit 0）。

- [ ] **Step 5: 可选 Docker 真实执行（不阻断门禁）**

`cd server; node tests/judge.docker.integration.mjs` — 无 docker 应 `[SKIP]` exit 0；有则 ✓。

- [ ] **Step 6: L3 深审（合并/推送前）**

安全设置解析 → L3 启用则 `qodersec review --layer=l3`；0 findings 方可继续；有 findings 走修复门禁。

- [ ] **Step 7: finishing-a-development-branch**

呈现 4 选项；用户选合并 → `git checkout main; git merge --ff-only feature/fr106-programming-judge` → 合并后重验 tsc/vitest/server vitest → 删分支 → `git push origin main`（FF）。

---

## Self-Review（作者自检，随计划提交）

- **Spec 覆盖**：§3 数据→T1；§4 执行→T2/2b；§5 时机→T4(practice)/T5(exam 异步)；建题→T3；隔离→T6；契约→T7；前端录入/作答→T8/T9；文档→T10；测试/SSOT 边界→各任务 Step1 + T11 DoD。§10 增量2 明确不在本计划。✓
- **占位符**：无 TBD/TODO；DockerRunner 分 T2(占位)→T2b(真实) 两步递进，每步可测。✓
- **类型/签名一致**：`getRunner/acquireSlot/releaseSlot/normalizeOutput/createStubRunner/applyJudgeScore` 跨任务命名一致；`JudgeRunResult.perCase` 与后端 `perCase[{index,ok,expected,actual,err}]` 对齐；`judge_config` 字段与 027 列对齐。✓
