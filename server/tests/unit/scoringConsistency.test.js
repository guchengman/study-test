/**
 * 判分单轨行为回归（FR-110 收敛后）
 *
 * 背景：判分双轨已收敛为单轨——server 生产代码（examSweep.js）唯一引用 SSOT 生成物
 * examScoring.generated.js（由 src/shared/scoring/index.ts 经 scripts/build-scoring.mjs 生成），
 * 手写副本 server/src/utils/examScoring.js 已删除。
 *
 * generated↔源码 的同步由根测试 src/__tests__/build-scoring.consistency.test.ts 守护
 * （改源码忘记 sync:scoring 会翻红）。本文件负责「判分口径」本身：用固定语料断言
 * generated 的 gradeQuestion/isAnswerCorrect 逐条期望结果，任何口径回归立即翻红。
 */
import { describe, it, expect } from 'vitest';
import * as gen from '../../src/utils/examScoring.generated.js';
import { isAnswerCorrect, gradeQuestion } from '../../src/utils/examScoring.generated.js';

const PTS = 10;

/**
 * 判分语料 + 期望结果。逐条口径来自 SSOT 实现语义：
 *  - single：文本等值 或 answer 为 A-Z 标签时映射 options[idx] 后与作答文本比对（区分大小写）
 *  - multiple：A-Z 标签先映射选项文本，排序后与作答集合全等（多一项/少一项皆判错）
 *  - programming：恒不自动判分 → { is_correct:null, earned:0, needs_manual:true }
 *  - 空作答（含 ''/null/[]）→ false
 */
const corpus = [
  {
    name: 'single 标签答案 + 文本作答命中',
    q: { type: 'single', options: ['Apple', 'Banana', 'Cat', 'Dog'], answer: 'B' },
    ans: 'Banana',
    expect: { is_correct: true, earned: PTS, needs_manual: false },
  },
  {
    name: 'single 标签答案 + 文本作答未命中',
    q: { type: 'single', options: ['Apple', 'Banana', 'Cat', 'Dog'], answer: 'B' },
    ans: 'Apple',
    expect: { is_correct: false, earned: 0, needs_manual: false },
  },
  {
    name: 'single 文本答案 + 字母作答（不支持反向映射）→ 判错',
    q: { type: 'single', options: ['Apple', 'Banana', 'Cat', 'Dog'], answer: 'Banana' },
    ans: 'B',
    expect: { is_correct: false, earned: 0, needs_manual: false },
  },
  {
    name: 'single 前后空格容错命中',
    q: { type: 'single', options: ['Apple', 'Banana'], answer: 'B' },
    ans: '  Banana ',
    expect: { is_correct: true, earned: PTS, needs_manual: false },
  },
  {
    name: 'single 无 options 且 answer 非标签 → 判错',
    q: { type: 'single', answer: 'B' },
    ans: 'Banana',
    expect: { is_correct: false, earned: 0, needs_manual: false },
  },
  {
    name: 'single 区分大小写（小写作答不命中）',
    q: { type: 'single', options: ['Apple', 'Banana'], answer: 'B' },
    ans: 'banana',
    expect: { is_correct: false, earned: 0, needs_manual: false },
  },
  {
    name: 'multiple 标签答案 + 文本乱序全等命中',
    q: { type: 'multiple', options: ['1', '2', '3', '4'], answer: ['B', 'D'] },
    ans: ['4', '2'],
    expect: { is_correct: true, earned: PTS, needs_manual: false },
  },
  {
    name: 'multiple 少选 → 判错',
    q: { type: 'multiple', options: ['1', '2', '3', '4'], answer: ['B', 'D'] },
    ans: ['2'],
    expect: { is_correct: false, earned: 0, needs_manual: false },
  },
  {
    name: 'multiple 多选一项 → 判错',
    q: { type: 'multiple', options: ['a', 'b', 'c'], answer: ['A', 'B'] },
    ans: ['a', 'b', 'c'],
    expect: { is_correct: false, earned: 0, needs_manual: false },
  },
  {
    name: 'multiple 无 options 标签直比全等命中',
    q: { type: 'multiple', answer: ['B', 'D'] },
    ans: ['D', 'B'],
    expect: { is_correct: true, earned: PTS, needs_manual: false },
  },
  {
    name: 'multiple 空作答 → 判错',
    q: { type: 'multiple', options: ['1', '2'], answer: ['A'] },
    ans: [],
    expect: { is_correct: false, earned: 0, needs_manual: false },
  },
  {
    name: 'programming 内容相等仍不自动判分',
    q: { type: 'programming', answer: 'print("hello")' },
    ans: "print('hello')",
    expect: { is_correct: null, earned: 0, needs_manual: true },
  },
  {
    name: 'programming 内容不等 → 待定',
    q: { type: 'programming', answer: 'print(1)' },
    ans: 'print(2)',
    expect: { is_correct: null, earned: 0, needs_manual: true },
  },
  {
    name: '空作答 null → 判错',
    q: { type: 'single', options: ['A1', 'B2'], answer: 'A' },
    ans: null,
    expect: { is_correct: false, earned: 0, needs_manual: false },
  },
  {
    name: '未知题型 → 判错（不自动判分）',
    q: { type: 'unknown', answer: 'x' },
    ans: 'x',
    expect: { is_correct: false, earned: 0, needs_manual: false },
  },
];

describe('examScoring.generated 判分单轨口径回归（FR-110）', () => {
  it('gradeQuestion 全语料逐条命中期望', () => {
    for (const c of corpus) {
      expect([c.name, gradeQuestion(c.q, c.ans, PTS)]).toEqual([c.name, c.expect]);
    }
  });

  it('isAnswerCorrect 与 gradeQuestion.is_correct 口径一致（非编程题）', () => {
    for (const c of corpus) {
      if (c.q.type === 'programming') continue; // programming 在 gradeQuestion 短路，不看 isAnswerCorrect
      expect([c.name, isAnswerCorrect(c.q, c.ans)]).toEqual([c.name, c.expect.is_correct]);
    }
  });

  it('生成物包含 SSOT 全部导出（防止 build-scoring 漏符号）', () => {
    for (const name of ['isAnswerCorrect', 'gradeQuestion', 'correctOptionIndices', 'scoreByIndices', 'formatTime']) {
      expect(typeof gen[name]).toBe('function');
    }
  });

  it('programming 恒不自动判分（无论内容异同）', () => {
    const prog = { type: 'programming', answer: 'print(1)' };
    expect(gradeQuestion(prog, 'print(1)', 20)).toEqual({ is_correct: null, earned: 0, needs_manual: true });
    expect(gradeQuestion(prog, 'print(2)', 20)).toEqual({ is_correct: null, earned: 0, needs_manual: true });
  });
});
