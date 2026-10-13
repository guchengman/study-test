/**
 * FR-106 编程题在线判题服务。
 * 判题是服务端外部自动评分器，不进 SSOT（src/shared/scoring）。
 * Runner 置于接口后：生产用 DockerRunner（每提交起 python:3-slim 容器），测试用确定性 StubRunner。
 * 由环境变量 JUDGE_RUNNER 切换（默认 'docker'；集成/单测设 'stub'）。
 */
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import pool from '../db.js';
import log from '../utils/logger.js';

const JUDGE_CONCURRENCY = Math.max(1, Number(process.env.JUDGE_CONCURRENCY) || 2);

/** 输出归一：CRLF→LF、去每行尾随空白、去末尾空行。纯函数，供比对与单测。 */
export function normalizeOutput(s) {
  return String(s ?? '')
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((l) => l.replace(/[ \t]+$/, ''))
    .join('\n')
    .replace(/\n+$/, '');
}

/**
 * StubRunner（仅测试）：确定性——某用例通过 iff 提交代码包含其 expected_output 归一后首行的子串。
 * 绝不在生产使用。用于让判分链路与状态机在无数 Docker/无外网环境下可离线测通。
 */
export function createStubRunner() {
  return {
    name: 'stub',
    async run({ code, testCases = [] }) {
      const src = String(code ?? '');
      const perCase = testCases.map((c, index) => {
        const needle = normalizeOutput(c.expected_output).split('\n')[0];
        const ok = needle.length > 0 && src.includes(needle);
        return { index, ok, expected: c.expected_output, actual: ok ? c.expected_output : '', err: ok ? null : 'stub-mismatch' };
      });
      const passed = perCase.filter((p) => p.ok).length;
      const total = perCase.length;
      const verdict = total > 0 && passed === total ? 'AC' : 'WA';
      return { verdict, passed, total, time_ms: 0, mem_kb: 0, log: 'stub', perCase };
    },
  };
}

/** 探测本机 docker 是否可用（生产装配前可调；不在 import 时执行）。 */
export function dockerAvailable() {
  try {
    const r = spawnSync('docker', ['version'], { timeout: 5000 });
    return r.status === 0;
  } catch {
    return false;
  }
}

// —— DockerRunner：每提交起一个 python:3-slim 容器，一容器顺序跑完全部用例（禁网/只读/非root/资源上限）。
/** 容器内 harness：逐用例喂 stdin、限时、比对归一 stdout，末行打印 ###RESULT###JSON。 */
const RUNNER_PY = [
  'import json, subprocess',
  'cases = json.load(open("/code/cases.json", encoding="utf-8"))',
  'meta = json.load(open("/code/run_meta.json", encoding="utf-8"))',
  'tlimit = max(1, int(meta.get("time_limit_ms", 2000)) / 1000)',
  'def norm(s):',
  '    return "\\n".join(l.rstrip() for l in s.replace("\\r\\n", "\\n").split("\\n")).rstrip()',
  'res = []; passed = 0',
  'for i, c in enumerate(cases):',
  '    try:',
  '        p = subprocess.run(["python", "/code/solution.py"], input=str(c.get("input", "")),',
  '            capture_output=True, text=True, timeout=tlimit)',
  '        ok = norm(p.stdout) == norm(str(c.get("expected_output", "")))',
  '        err = None if p.returncode == 0 else ("RE: rc=%d %s" % (p.returncode, p.stderr.strip()[:200]))',
  '        actual = p.stdout',
  '    except subprocess.TimeoutExpired:',
  '        ok = False; err = "TLE"; actual = ""',
  '    except Exception as e:',
  '        ok = False; err = "RE:%s" % e; actual = ""',
  '    if ok: passed += 1',
  '    res.append({"index": i, "ok": ok, "expected": c.get("expected_output"), "actual": actual, "err": err})',
  'total = len(cases)',
  'verdict = "AC" if total > 0 and passed == total else ("CE" if total == 0 else "WA")',
  'print("###RESULT###" + json.dumps({"verdict": verdict, "passed": passed, "total": total, "perCase": res}))',
].join('\n');

/** 解析 runner.py 末行 ###RESULT### JSON；无结果按运行时错误（fail-closed）。 */
export function parseRunnerOutput(stdout, exitCode) {
  const line = String(stdout || '').split('\n').find((l) => l.startsWith('###RESULT###'));
  if (!line) return { verdict: exitCode === 0 ? 'RE' : 'CE', passed: 0, total: 0, perCase: [], log: `no-result exit=${exitCode}` };
  try {
    return JSON.parse(line.slice('###RESULT###'.length));
  } catch {
    return { verdict: 'RE', passed: 0, total: 0, perCase: [], log: 'bad-result-json' };
  }
}

/** spawn docker run + wall-clock kill，返回 {stdout,stderr,code,ms}。 */
function runDocker(args, hardMs) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    let child;
    try {
      child = spawn('docker', args);
    } catch (e) {
      resolve({ stdout: '', stderr: String(e.message || e), code: -1, ms: 0 });
      return;
    }
    let stdout = '', stderr = '', done = false;
    child.stdout.on('data', (d) => { stdout += d; });
    child.stderr.on('data', (d) => { stderr += d; });
    const killer = setTimeout(() => { if (!done) { try { child.kill('SIGKILL'); } catch { /* ignore */ } } }, hardMs);
    child.on('close', (code) => { done = true; clearTimeout(killer); resolve({ stdout, stderr, code, ms: Date.now() - t0 }); });
    child.on('error', (e) => { done = true; clearTimeout(killer); resolve({ stdout: '', stderr: String(e.message || e), code: -1, ms: Date.now() - t0 }); });
  });
}

function createDockerRunner() {
  const IMAGE = process.env.JUDGE_PYTHON_IMAGE || 'python:3-slim';
  return {
    name: 'docker',
    async run({ code, testCases = [], timeLimitMs = 2000, memoryLimitMb = 128 }) {
      const work = mkdtempSync(join(tmpdir(), 'judge-'));
      try {
        writeFileSync(join(work, 'solution.py'), String(code ?? ''), 'utf8');
        writeFileSync(join(work, 'cases.json'), JSON.stringify(testCases), 'utf8');
        writeFileSync(join(work, 'run_meta.json'), JSON.stringify({ time_limit_ms: timeLimitMs }), 'utf8');
        writeFileSync(join(work, 'runner.py'), RUNNER_PY, 'utf8');
        try { chmodSync(work, 0o755); ['solution.py', 'cases.json', 'run_meta.json', 'runner.py'].forEach((f) => chmodSync(join(work, f), 0o644)); } catch { /* ignore (Windows/dev) */ }
        const hardMs = timeLimitMs * Math.max(1, testCases.length) + 8000; // 含冷启裕量
        const args = [
          'run', '--rm', '--network', 'none', '--memory', `${memoryLimitMb}m`, '--cpus', '0.5',
          '--pids-limit', '64', '--read-only', '--tmpfs', '/tmp:rw,size=16m', '--user', 'nobody',
          '-v', `${work}:/code:ro`, IMAGE, 'python', '/code/runner.py',
        ];
        const out = await runDocker(args, hardMs);
        const result = parseRunnerOutput(out.stdout, out.code);
        if (out.stderr && /docker|command not found|No such file/i.test(out.stderr)) {
          log.warn('[fr106] docker 执行异常:', out.stderr.slice(0, 200));
        }
        return { ...result, time_ms: out.ms, mem_kb: 0, log: out.stderr || result.log || '' };
      } finally {
        try { rmSync(work, { recursive: true, force: true }); } catch { /* ignore */ }
      }
    },
  };
}

/** 依据 JUDGE_RUNNER 返回判题执行器（stub/docker）。 */
export function getRunner() {
  if ((process.env.JUDGE_RUNNER || 'docker') === 'stub') return createStubRunner();
  return createDockerRunner();
}

/** 进程内并发闸：限制同时执行的判题容器数，超限排队。 */
let active = 0;
const waiters = [];

export function acquireSlot() {
  if (active < JUDGE_CONCURRENCY) {
    active++;
    return Promise.resolve();
  }
  return new Promise((resolve) => waiters.push(resolve));
}

export function releaseSlot() {
  active--;
  const next = waiters.shift();
  if (next) {
    active++;
    next();
  }
}

export { JUDGE_CONCURRENCY, pool, log };
export default { getRunner, acquireSlot, releaseSlot, normalizeOutput, createStubRunner, dockerAvailable };
