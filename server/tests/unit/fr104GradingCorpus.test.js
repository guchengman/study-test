import { describe, it, expect } from 'vitest';
import { gradeQuestion } from '../../src/utils/examScoring.generated.js';

// FR-104 材料题「子题聚合用例」：同一材料下的子题就是普通题型，
// 逐题独立给分、可累加回写 attempt 总分——SSOT 零改动，本用例作为回归固化与 PRD 证据。
describe('FR104 材料题子题独立计分聚合', () => {
  const subQuestions = [
    { q: { type: 'single', answer: '王安石', options: ['王安石', '李白', '杜甫', '白居易'] }, ua: '王安石', pts: 5 }, // 对 → 5
    { q: { type: 'fill_in', answer: ['绿', '岸'] }, ua: ['绿', '岸'], pts: 3 }, // 两空全对 → 3
    { q: { type: 'short_answer', answer: '思乡' }, ua: '我认为表达了思乡之情', pts: 6 }, // 人工 → earned 0
  ];

  it('逐子题独立给分：score=Σearned，correct_count 仅计 is_correct===true，简答 needs_manual', () => {
    let score = 0;
    let correct = 0;
    const results = subQuestions.map(({ q, ua, pts }) => {
      const g = gradeQuestion(q, ua, pts);
      score += g.earned;
      if (g.is_correct === true) correct += 1;
      return g;
    });

    expect(results[0].earned).toBe(5);
    expect(results[0].is_correct).toBe(true);
    expect(results[1].earned).toBe(3);
    expect(results[1].is_correct).toBe(true);
    expect(results[2].needs_manual).toBe(true);
    expect(results[2].earned).toBe(0);

    expect(score).toBe(8);
    expect(correct).toBe(2);
  });

  it('子题部分答错仅扣该题分，不影响其它子题（聚合口径隔离）', () => {
    const wrongSingle = gradeQuestion({ type: 'single', answer: '李白', options: ['李白', '杜甫'] }, '杜甫', 5);
    const okFill = gradeQuestion({ type: 'fill_in', answer: '绿' }, '绿', 3);
    expect(wrongSingle.earned).toBe(0);
    expect(okFill.earned).toBe(3);
    expect(wrongSingle.earned + okFill.earned).toBe(3);
  });
});
