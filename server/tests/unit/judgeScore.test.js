import { describe, it, expect } from 'vitest';
import { applyJudgeScore } from '../../src/utils/manualGrading.js';

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

  it('部分通过按比例给分（earned 由调用方算好，graded_by=null 标记判题）', () => {
    const details = [{ question_id: 9, points: 10, earned: 0, is_correct: null, needs_manual: true }];
    const r = applyJudgeScore(details, 9, { earned: 5, verdict: 'WA', passed: 1, total: 2 });
    expect(r.details[0].earned).toBe(5);
    expect(r.details[0].graded_by).toBeNull();
    expect(r.details[0].is_correct).toBe(false);
    expect(r.score).toBe(5);
    expect(r.changedToComplete).toBe(true);
  });
});
