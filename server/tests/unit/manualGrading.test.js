import { describe, it, expect } from 'vitest';
import { applyManualScore, recomputeTotals } from '../../src/utils/manualGrading.js';

const det = (qid, extra = {}) => ({
  question_id: qid,
  user_answer: 'x',
  correct_answer: 'ref',
  is_correct: null,
  points: 10,
  earned: 0,
  explanation: '',
  needs_manual: true,
  ...extra,
});

describe('applyManualScore', () => {
  it('给分后重算 score/correct_count 并清 needs_manual', () => {
    const details = [det(1), det(2)];
    const r = applyManualScore(details, 1, { earned: 10, gradedBy: 99 });
    expect(r.details.find((d) => d.question_id === 1)).toMatchObject({
      earned: 10,
      is_correct: true,
      needs_manual: false,
      graded_by: 99,
    });
    expect(r.score).toBe(10);
    expect(r.correctCount).toBe(1);
    expect(r.changedToComplete).toBe(false); // 题2 仍待人工
  });

  it('earned 越界 clamp 到 [0,points]', () => {
    const r = applyManualScore([det(1)], 1, { earned: 999 });
    expect(r.details[0].earned).toBe(10);
    const r2 = applyManualScore([det(1)], 1, { earned: -5 });
    expect(r2.details[0].earned).toBe(0);
  });

  it('非满分 is_correct=false', () => {
    const r = applyManualScore([det(1)], 1, { earned: 4 });
    expect(r.details[0].is_correct).toBe(false);
    expect(r.score).toBe(4);
  });

  it('全部判完 changedToComplete=true', () => {
    const details = [det(1), det(2, { needs_manual: false, earned: 5 })];
    const r = applyManualScore(details, 1, { earned: 10 });
    expect(r.changedToComplete).toBe(true);
    expect(r.score).toBe(15);
  });

  it('幂等重判以完整 details 重算，不双计', () => {
    let details = [det(1)];
    details = applyManualScore(details, 1, { earned: 6 }).details;
    const r = applyManualScore(details, 1, { earned: 3 });
    expect(r.score).toBe(3);
  });

  it('不修改入参 details', () => {
    const details = [det(1)];
    applyManualScore(details, 1, { earned: 10 });
    expect(details[0].needs_manual).toBe(true);
    expect(details[0].earned).toBe(0);
  });

  it('题不在 details 抛错', () => {
    expect(() => applyManualScore([det(1)], 999, { earned: 5 })).toThrow();
  });
});

describe('recomputeTotals', () => {
  it('score=Σ earned，correctCount=is_correct===true 计数，totalCount=len', () => {
    const details = [det(1, { earned: 10, is_correct: true, needs_manual: false }), det(2, { earned: 4, is_correct: false, needs_manual: false })];
    expect(recomputeTotals(details)).toEqual({ score: 14, correctCount: 1, totalCount: 2 });
  });
});
