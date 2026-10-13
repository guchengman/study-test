/**
 * FR-106 编程题在线判题服务。
 * 判题是服务端外部自动评分器，不进 SSOT（src/shared/scoring）。
 * Runner 置于接口后：生产用 DockerRunner（每提交起 python:3-slim 容器），测试用确定性 StubRunner。
 * 由环境变量 JUDGE_RUNNER 切换（默认 'docker'；集成/单测设 'stub'）。
 */
import { spawnSync } from 'node:child_process';
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

// DockerRunner 的真实实现见 Task 2b（同文件追加 createDockerRunner）。此处先给最小可用体。
function createDockerRunner() {
  return {
    name: 'docker',
    run: async () => {
      throw new Error('docker runner 未装配（见 Task 2b）');
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
