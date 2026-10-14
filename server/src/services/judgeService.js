/**
 * FR-106 编程题在线判题服务。
 * 判题是服务端外部自动评分器，不进 SSOT（src/shared/scoring）。
 * Runner 置于接口后：生产用 DockerRunner（每提交起 python:3-slim 容器），测试用确定性 StubRunner。
 * 由环境变量 JUDGE_RUNNER 切换（默认 'docker'；集成/单测设 'stub'）。
 */
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync, chmodSync, readdirSync } from 'node:fs';
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

/** JS harness（node 镜像内）：逐用例 spawn node solution.js、限时、归一 stdout 比对。 */
const RUNNER_JS = [
  'const fs=require("fs"), cp=require("child_process");',
  'const cases=JSON.parse(fs.readFileSync("/code/cases.json","utf8"));',
  'const meta=JSON.parse(fs.readFileSync("/code/run_meta.json","utf8"));',
  'const tlimit=Math.max(1, parseInt(meta.time_limit_ms||2000,10));',
  'function norm(s){return String(s||"").replace(/\\r\\n/g,"\\n").split("\\n").map(l=>l.replace(/[ \\t]+$/g,"")).join("\\n").replace(/\\n+$/g,"");}',
  'let res=[],passed=0;',
  'for(let i=0;i<cases.length;i++){',
  '  const c=cases[i];let ok=false,err=null,actual="";',
  '  try{',
  '    const p=cp.spawnSync("node",["/code/solution.js"],{input:String(c.input||""),encoding:"utf8",timeout:tlimit});',
  '    actual=p.stdout||"";',
  '    if(p.error){err="TLE";}\n else if(p.status!==0){err="RE: rc="+p.status+" "+String(p.stderr||"").trim().slice(0,200);}',
  '    else{ok=norm(actual)===norm(String(c.expected_output||""));}',
  '  }catch(e){err="RE:"+e.message;}',
  '  if(ok)passed++;',
  '  res.push({index:i,ok,expected:c.expected_output,actual,err});',
  '}',
  'const total=cases.length;',
  'const verdict=(total>0&&passed===total)?"AC":(total===0?"CE":"WA");',
  'console.log("###RESULT###"+JSON.stringify({verdict,passed,total,perCase:res}));',
].join('\n');

/** 编译型 harness 通用体：归一比对 + 逐用例跑 /tmp/sol + 文本协议（CASE/SUMMARY）输出。 */
const COMPILED_LOOP = [
  'normfile(){ tr -d \'\\r\' | sed -e \'s/[ \\t]*$//\' | awk \'BEGIN{b=0}{if($0==""){b++;next}for(k=0;k<b;k++)print "";b=0;print}\'; }',
  'passed=0',
  'for i in $(seq 0 $((N-1))); do',
  '  timeout "$T" /tmp/sol < "/code/case_$i.stdin" > /tmp/o 2>/dev/null',
  '  rc=$?',
  '  ok=0',
  '  if [ "$rc" -ne 124 ] && diff -q <(normfile < /tmp/o) <(normfile < "/code/case_$i.expected") >/dev/null 2>&1; then ok=1; fi',
  '  if [ "$ok" = 1 ]; then passed=$((passed+1)); echo "CASE $i PASS"; else echo "CASE $i FAIL"; fi',
  'done',
  'if [ "$N" -eq 0 ]; then v=CE; elif [ "$passed" -eq "$N" ]; then v=AC; else v=WA; fi',
  'echo "SUMMARY $v $passed $N"',
].join('\n');

/** C harness（gcc 镜像）：先编译 solution.c，再逐用例跑。 */
const RUNNER_C = [
  '#!/usr/bin/env bash',
  'cd /tmp',
  'N=$(cat /code/n_cases)',
  'T=$(cat /code/time_ms)',
  'if ! gcc /code/solution.c -o /tmp/sol 2>/tmp/ce.err; then echo COMPILE_ERROR; exit 0; fi',
  COMPILED_LOOP,
].join('\n');

/** Go harness（golang 镜像）：go build 单文件到可写缓存，再逐用例跑。 */
const RUNNER_GO = [
  '#!/usr/bin/env bash',
  'cd /tmp',
  'N=$(cat /code/n_cases)',
  'T=$(cat /code/time_ms)',
  'export GOCACHE=/tmp/gocache GOPATH=/tmp/gopath GOFLAGS=-mod=mod',
  'cp /code/solution.go /tmp/sol_main.go',
  'if ! go build -o /tmp/sol /tmp/sol_main.go 2>/tmp/ce.err; then echo COMPILE_ERROR; exit 0; fi',
  COMPILED_LOOP,
].join('\n');

/** 语言 → 容器描述（镜像 / 提交文件名 / harness / 容器命令）；未知回落 python。 */
export function getLanguageDescriptor(lang) {
  const k = String(lang || '').toLowerCase();
  if (k === 'c') {
    return {
      key: 'c',
      image: process.env.JUDGE_C_IMAGE || 'gcc:13',
      solutionFile: 'solution.c', harnessFile: 'runner.sh', harnessSrc: RUNNER_C,
      containerCmd: ['bash', '/code/runner.sh'],
      prepCaseFiles: true, tmpfsSize: '64m', extraGraceMs: 15000, pidsLimit: 128, minMemoryMb: 256,
    };
  }
  if (k === 'go' || k === 'golang') {
    return {
      key: 'go',
      image: process.env.JUDGE_GO_IMAGE || 'golang:1.22',
      solutionFile: 'solution.go', harnessFile: 'runner.sh', harnessSrc: RUNNER_GO,
      containerCmd: ['bash', '/code/runner.sh'],
      prepCaseFiles: true, tmpfsSize: '256m', extraGraceMs: 40000, pidsLimit: 512, minMemoryMb: 1024,
    };
  }
  if (k === 'javascript') {
    return {
      key: 'javascript',
      image: process.env.JUDGE_NODE_IMAGE || 'node:20-slim',
      solutionFile: 'solution.js', harnessFile: 'runner.js', harnessSrc: RUNNER_JS,
      containerCmd: ['node', '/code/runner.js'],
    };
  }
  return {
    key: 'python',
    image: process.env.JUDGE_PYTHON_IMAGE || 'python:3-slim',
    solutionFile: 'solution.py', harnessFile: 'runner.py', harnessSrc: RUNNER_PY,
    containerCmd: ['python', '/code/runner.py'],
  };
}

/** 解析 runner 输出：优先 ###RESULT### JSON（解释型）；否则文本协议（编译型）；都无则 fail-closed。 */
export function parseRunnerOutput(stdout, exitCode) {
  const text = String(stdout || '');
  const line = text.split('\n').find((l) => l.startsWith('###RESULT###'));
  if (line) {
    try {
      return JSON.parse(line.slice('###RESULT###'.length));
    } catch {
      return { verdict: 'RE', passed: 0, total: 0, perCase: [], log: 'bad-result-json' };
    }
  }
  // 编译型 harness：逐行 CASE n PASS/FAIL + SUMMARY <verdict> <passed> <total>；编译失败仅输出 COMPILE_ERROR。
  const summary = text.split('\n').find((l) => /^SUMMARY /.test(l));
  if (summary) {
    const [, v, p, t] = summary.trim().split(/\s+/);
    const perCase = text.split('\n').filter((l) => /^CASE \d+ /.test(l)).map((l) => {
      const parts = l.trim().split(/\s+/);
      return { index: Number(parts[1]), ok: parts[2] === 'PASS' };
    });
    return { verdict: v, passed: Number(p) || 0, total: Number(t) || 0, perCase, log: 'compiled' };
  }
  if (/COMPILE_ERROR/.test(text)) {
    return { verdict: 'CE', passed: 0, total: 0, perCase: [], log: 'compile-error' };
  }
  return { verdict: exitCode === 0 ? 'RE' : 'CE', passed: 0, total: 0, perCase: [], log: `no-result exit=${exitCode}` };
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
  return {
    name: 'docker',
    async run({ code, testCases = [], language = 'python', timeLimitMs = 2000, memoryLimitMb = 128 }) {
      const d = getLanguageDescriptor(language);
      const work = mkdtempSync(join(tmpdir(), 'judge-'));
      try {
        writeFileSync(join(work, d.solutionFile), String(code ?? ''), 'utf8');
        writeFileSync(join(work, 'cases.json'), JSON.stringify(testCases), 'utf8');
        writeFileSync(join(work, 'run_meta.json'), JSON.stringify({ time_limit_ms: timeLimitMs }), 'utf8');
        writeFileSync(join(work, d.harnessFile), d.harnessSrc, 'utf8');
        // 编译型 harness 用 shell 逐用例跑，不便解析 JSON，改预写每用例 stdin/expected 与元数据文件
        if (d.prepCaseFiles) {
          writeFileSync(join(work, 'n_cases'), String(testCases.length), 'utf8');
          writeFileSync(join(work, 'time_ms'), String(Math.max(1, Math.round(timeLimitMs / 1000))), 'utf8');
          testCases.forEach((c, i) => {
            writeFileSync(join(work, `case_${i}.stdin`), String(c.input ?? ''), 'utf8');
            writeFileSync(join(work, `case_${i}.expected`), String(c.expected_output ?? ''), 'utf8');
          });
        }
        try { chmodSync(work, 0o755); readdirSync(work).forEach((f) => { try { chmodSync(join(work, f), 0o644); } catch { /* ignore */ } }); } catch { /* ignore (Windows/dev) */ }
        const hardMs = timeLimitMs * Math.max(1, testCases.length) + 8000 + (d.extraGraceMs || 0); // 含冷启/编译裕量
        const args = [
          'run', '--rm', '--network', 'none', '--memory', `${Math.max(memoryLimitMb, d.minMemoryMb || 0)}m`, '--cpus', '0.5',
          '--pids-limit', String(d.pidsLimit || 64), '--read-only', '--tmpfs', `/tmp:rw,exec,size=${d.tmpfsSize || '16m'}`, '--user', 'nobody',
          '-v', `${work}:/code:ro`, d.image, ...d.containerCmd,
        ];
        const out = await runDocker(args, hardMs);
        const result = parseRunnerOutput(out.stdout, out.code);
        if (out.stderr && /docker|command not found|No such file|Unable to find image/i.test(out.stderr)) {
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
export default { getRunner, acquireSlot, releaseSlot, normalizeOutput, createStubRunner, dockerAvailable, getLanguageDescriptor };
