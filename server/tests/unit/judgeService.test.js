import { describe, it, expect } from 'vitest';
import { normalizeOutput, createStubRunner, getLanguageDescriptor, parseRunnerOutput } from '../../src/services/judgeService.js';

describe('fr106 judgeService', () => {
  it('normalizeOutput 去尾随空白与末尾空行、CRLF→LF', () => {
    expect(normalizeOutput('42  \n\n')).toBe('42');
    expect(normalizeOutput('a\r\nb')).toBe('a\nb');
    expect(normalizeOutput('a  \nb\t\n')).toBe('a\nb');
  });

  it('StubRunner：代码含各用例 expected_output 首行子串则 AC，否则 WA', async () => {
    const stub = createStubRunner();
    const cases = [
      { input: '', expected_output: '42', is_sample: true },
      { input: '', expected_output: '7', is_sample: true },
    ];
    const ok = await stub.run({ code: 'x=42\ny=7', language: 'python', testCases: cases, timeLimitMs: 2000, memoryLimitMb: 128 });
    expect(ok.verdict).toBe('AC');
    expect(ok.passed).toBe(2);
    expect(ok.total).toBe(2);
    const bad = await stub.run({ code: 'x=1', language: 'python', testCases: cases, timeLimitMs: 2000, memoryLimitMb: 128 });
    expect(bad.verdict).toBe('WA');
    expect(bad.passed).toBe(0);
  });

  it('getLanguageDescriptor：javascript 走 node，python/未知走 python 默认', () => {
    const js = getLanguageDescriptor('javascript');
    expect(js.key).toBe('javascript');
    expect(js.image).toMatch(/node/);
    expect(js.solutionFile).toBe('solution.js');
    expect(js.containerCmd[0]).toBe('node');
    const py = getLanguageDescriptor('python');
    expect(py.image).toMatch(/python/);
    expect(py.solutionFile).toBe('solution.py');
    expect(getLanguageDescriptor('ruby').key).toBe('python');
    expect(getLanguageDescriptor(undefined).key).toBe('python');
  });

  it('getLanguageDescriptor：c 走 gcc、go 走 golang（编译型，需预写用例文件）', () => {
    const c = getLanguageDescriptor('c');
    expect(c.key).toBe('c');
    expect(c.image).toMatch(/gcc/);
    expect(c.solutionFile).toBe('solution.c');
    expect(c.containerCmd[0]).toBe('bash');
    expect(c.prepCaseFiles).toBe(true);
    const go = getLanguageDescriptor('go');
    expect(go.key).toBe('go');
    expect(go.image).toMatch(/golang/);
    expect(go.solutionFile).toBe('solution.go');
    expect(go.prepCaseFiles).toBe(true);
    expect(getLanguageDescriptor('golang').key).toBe('go');
    // 解释型不预写用例文件（仍走 cases.json）
    expect(getLanguageDescriptor('python').prepCaseFiles).toBeFalsy();
  });

  it('parseRunnerOutput：解释型 JSON、编译型 SUMMARY/COMPILE_ERROR、无结果 fail-closed', () => {
    expect(parseRunnerOutput('###RESULT###{"verdict":"AC","passed":1,"total":1,"perCase":[]}', 0).verdict).toBe('AC');
    const s = parseRunnerOutput('CASE 0 PASS\nCASE 1 FAIL\nSUMMARY WA 1 2\n', 0);
    expect(s.verdict).toBe('WA');
    expect(s.passed).toBe(1);
    expect(s.total).toBe(2);
    expect(s.perCase).toEqual([{ index: 0, ok: true }, { index: 1, ok: false }]);
    expect(parseRunnerOutput('COMPILE_ERROR\n', 0).verdict).toBe('CE');
    expect(parseRunnerOutput('garbage', 1).verdict).toBe('CE');
  });

  it('StubRunner 与语言无关：javascript 仍能判 AC', async () => {
    const stub = createStubRunner();
    const r = await stub.run({ code: 'console.log(42)', language: 'javascript', testCases: [{ input: '', expected_output: '42' }], timeLimitMs: 2000, memoryLimitMb: 128 });
    expect(r.verdict).toBe('AC');
  });
});
