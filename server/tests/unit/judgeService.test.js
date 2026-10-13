import { describe, it, expect } from 'vitest';
import { normalizeOutput, createStubRunner } from '../../src/services/judgeService.js';

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
});
