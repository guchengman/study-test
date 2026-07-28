/**
 * 判分逻辑「单一事实源」回归测试 —— 边界值与异常输入（R4）
 *
 * 与同目录 scoring.test.ts（主路径）互补，这里专门锁定：
 *  - 判分函数在「空 / 非法 / 缺字段」输入下的行为
 *  - formatTime / gradeQuestion / scoreByIndices 的边界
 * 目标：任何后续对 src/shared/scoring/index.ts 的改动若破坏既有口径，本文件立即翻红。
 */
import { describe, it, expect } from 'vitest';
import {
  isAnswerCorrect,
  scoreByIndices,
  correctOptionIndices,
  gradeQuestion,
  formatTime,
} from '../index';

// 构造最小 Question 形状（运行时无需完整字段）
const single = (over: Record<string, unknown> = {}) => ({
  type: 'single',
  options: ['Apple', 'Banana', 'Cat', 'Dog'],
  answer: 'B',
  ...over,
});
const multiple = (over: Record<string, unknown> = {}) => ({
  type: 'multiple',
  options: ['1', '2', '3', '4'],
  answer: ['B', 'D'],
  ...over,
});
const programming = (over: Record<string, unknown> = {}) => ({
  type: 'programming',
  answer: 'print(1)',
  ...over,
});

describe('isAnswerCorrect —— 边界 / 异常输入', () => {
  it('用户未作答（null/undefined/空串/0/false）一律判错', () => {
    const q = single();
    expect(isAnswerCorrect(q, null as unknown as string)).toBe(false);
    expect(isAnswerCorrect(q, undefined as unknown as string)).toBe(false);
    expect(isAnswerCorrect(q, '')).toBe(false);
    expect(isAnswerCorrect(q, 0 as unknown as string)).toBe(false);
    expect(isAnswerCorrect(q, false as unknown as string)).toBe(false);
  });

  it('未知题型（不在 single/multiple/programming）判错', () => {
    const q = single({ type: 'unknown' } as Record<string, unknown>);
    expect(isAnswerCorrect(q, 'Banana')).toBe(false);
  });

  it('single：答案直接是选项文本（非字母标签）也能命中', () => {
    const q = single({ answer: 'Banana' });
    expect(isAnswerCorrect(q, 'Banana')).toBe(true);
    expect(isAnswerCorrect(q, 'Apple')).toBe(false);
  });

  it('single：无 options 且答案为字母标签，用户给文本无法回退 → 判错', () => {
    const q = single({ options: undefined });
    // 答案 'B' 是字母，但无 options 可回退；用户给 'Banana' 与 'B' 不相等
    expect(isAnswerCorrect(q, 'Banana')).toBe(false);
  });

  it('multiple：用户答案缺省为空数组 → 判错', () => {
    const q = multiple();
    expect(isAnswerCorrect(q, [])).toBe(false);
  });

  it('multiple：options 为空时按字母标签直接比对', () => {
    const q = multiple({ options: undefined });
    // 答案 ['B','D'] 与用户 ['B','D'] 字母级一致
    expect(isAnswerCorrect(q, ['B', 'D'])).toBe(true);
    expect(isAnswerCorrect(q, ['D', 'B'])).toBe(true);
  });
});

describe('correctOptionIndices —— 边界', () => {
  it('无 options 时永远返回空数组', () => {
    expect(correctOptionIndices(single({ options: undefined }))).toEqual([]);
    expect(correctOptionIndices(multiple({ options: undefined }))).toEqual([]);
  });

  it('答案为选项文本时可被 findIndex 解析', () => {
    const q = single({ options: ['Apple', 'Banana'], answer: 'Banana' });
    expect(correctOptionIndices(q)).toEqual([1]);
  });

  it('答案为非法标签时过滤掉，返回空', () => {
    const q = single({ answer: '??' });
    expect(correctOptionIndices(q)).toEqual([]);
  });
});

describe('scoreByIndices —— 扩展端内核边界', () => {
  it('命中 / 未命中（含乱序）集合比对', () => {
    expect(scoreByIndices(multiple(), [1, 3])).toBe(true);
    expect(scoreByIndices(multiple(), [3, 1])).toBe(true);
    expect(scoreByIndices(multiple(), [1])).toBe(false);
    expect(scoreByIndices(single(), [1])).toBe(true);
    expect(scoreByIndices(single(), [0])).toBe(false);
  });

  it('programming 回退到文本判分（索引无意义）', () => {
    // 编程题 scoreByIndices 内部 isAnswerCorrect(q, sortedNumberArray)
    expect(scoreByIndices(programming(), [])).toBe(false);
  });

  it('答案无法解析 + 用户空选 → 当前实现返回 true（已知边角，已锁定行为）', () => {
    // 极端用例：题目答案无法解析导致 correct=[]，空选 [] 长度相等 → 返回 true。
    // 视为低概率畸形输入的既有行为，写入回归以防无意改动。
    const malformed = single({ options: ['A', 'B'], answer: '??' });
    expect(correctOptionIndices(malformed)).toEqual([]);
    expect(scoreByIndices(malformed, [])).toBe(true);
  });
});

describe('gradeQuestion —— 边界', () => {
  it('非编程题：命中得满分，未命中 0 分', () => {
    expect(gradeQuestion(single(), 'Banana', 5)).toEqual({
      is_correct: true,
      earned: 5,
      needs_manual: false,
    });
    expect(gradeQuestion(single(), 'Apple', 5)).toEqual({
      is_correct: false,
      earned: 0,
      needs_manual: false,
    });
  });

  it('分值非法（NaN / undefined / 字符串）按 Number 解析，失败回退 0', () => {
    expect(gradeQuestion(single(), 'Banana', '10').earned).toBe(10);
    expect(gradeQuestion(single(), 'Banana', NaN).earned).toBe(0);
    expect(gradeQuestion(single(), 'Banana', undefined as unknown as number).earned).toBe(0);
  });

  it('编程题恒为 needs_manual，不自动判分', () => {
    const r = gradeQuestion(programming(), 'print(1)', 20);
    expect(r).toEqual({ is_correct: null, earned: 0, needs_manual: true });
  });
});

describe('formatTime —— 边界', () => {
  it('常规 / 整十分 / 大数值', () => {
    expect(formatTime(0)).toBe('0:00');
    expect(formatTime(5)).toBe('0:05');
    expect(formatTime(65)).toBe('1:05');
    expect(formatTime(600)).toBe('10:00');
  });

  it('非整数秒：当前实现仅对分钟取整，不对余数取整（已知小瑕疵，已锁定行为）', () => {
    // formatTime 用 Math.floor(seconds/60) 取分钟，秒数取余后未再取整，
    // 故非整数输入会产生非标准 m:ss 字符串。应用层始终传入整数秒，影响极低。
    // 此处锁定当前行为；若后续改为对余数取整（更健壮），本用例需同步更新。
    expect(formatTime(65.9)).toBe('1:5.900000000000006');
  });
});

describe('isAnswerCorrect —— multiple（真实 App 输入形态：选项文本）', () => {
  it('用户选「选项文本」（与 useExam.toggleMultipleAnswer 一致）命中/未命中', () => {
    const q = multiple(); // options ['1','2','3','4']，answer ['B','D']
    expect(isAnswerCorrect(q, ['2', '4'])).toBe(true);
    expect(isAnswerCorrect(q, ['4', '2'])).toBe(true);
    expect(isAnswerCorrect(q, ['2'])).toBe(false);
  });
});
