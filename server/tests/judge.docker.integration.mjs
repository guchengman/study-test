/**
 * FR-106 T2b：DockerRunner 真实执行集成（可选，不在主门禁）。
 * 本机无可用 docker 时显式 [SKIP] 并 exit 0，绝不把主门禁跑红。
 * 有 docker 时跑一个 print(int(input())*2) 的最小 AC 用例，验证 harness/比对链路。
 */
import { getRunner, dockerAvailable } from '../src/services/judgeService.js';

async function main() {
  if (!dockerAvailable()) {
    console.log('[SKIP] 本机无可用 docker，跳过真实判题集成');
    process.exit(0);
  }
  const runner = getRunner();
  const r = await runner.run({
    code: 'print(int(input())*2)',
    language: 'python',
    testCases: [{ input: '21', expected_output: '42', is_sample: true }],
    timeLimitMs: 2000,
    memoryLimitMb: 128,
  });
  const ok = r.verdict === 'AC' && r.passed === 1;
  console.log(`${ok ? '✓' : '✗'} Docker 判题 print(int(input())*2) 期望 42 => ${r.verdict} passed=${r.passed}/${r.total}`);
  process.exit(ok ? 0 : 1);
}

main();
