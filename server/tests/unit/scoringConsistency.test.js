/**
 * 判分双轨一致性回归（P1 技术债护栏）
 *
 * 背景：exams.js 引用手写副本 src/utils/examScoring.js，而 SSOT 生成物是
 * examScoring.generated.js（由 src/shared/scoring 经 sync:scoring 生成）。
 * 在双轨合并前，本测试锁定两者对同一语料的判分结果完全一致；
 * 任何一方口径漂移立即翻红。合并到 generated 后本文件可简化为单轨断言。
 */
import { describe, it, expect } from 'vitest';
import * as hand from '../../src/utils/examScoring.js';
import * as gen from '../../src/utils/examScoring.generated.js';

/** 判分语料：覆盖 single/multiple/programming 的命中、未命中与边界形态 */
const corpus = [
  // single：字母标签答案 + 文本作答
  { q: { id: '1', subject: 's', title: 't', points: 5, type: 'single', options: ['Apple', 'Banana', 'Cat', 'Dog'], answer: 'B' }, ans: 'Banana' },
  { q: { id: '2', subject: 's', title: 't', points: 5, type: 'single', options: ['Apple', 'Banana', 'Cat', 'Dog'], answer: 'B' }, ans: 'Apple' },
  // single：字母作答
  { q: { id: '3', subject: 's', title: 't', points: 5, type: 'single', options: ['Apple', 'Banana', 'Cat', 'Dog'], answer: 'Banana' }, ans: 'B' },
  // single：前后空格容错
  { q: { id: '4', subject: 's', title: 't', points: 5, type: 'single', options: ['Apple', 'Banana'], answer: 'B' }, ans: '  Banana ' },
  // single：无 options 且答案非标签
  { q: { id: '5', subject: 's', title: 't', points: 5, type: 'single', answer: 'B' }, ans: 'Banana' },
  // multiple：标签答案 + 文本乱序作答
  { q: { id: '6', subject: 's', title: 't', points: 8, type: 'multiple', options: ['1', '2', '3', '4'], answer: ['B', 'D'] }, ans: ['4', '2'] },
  { q: { id: '7', subject: 's', title: 't', points: 8, type: 'multiple', options: ['1', '2', '3', '4'], answer: ['B', 'D'] }, ans: ['2'] },
  // multiple：无 options 标签直比
  { q: { id: '8', subject: 's', title: 't', points: 8, type: 'multiple', answer: ['B', 'D'] }, ans: ['D', 'B'] },
  // multiple：空作答
  { q: { id: '9', subject: 's', title: 't', points: 8, type: 'multiple', options: ['1', '2'], answer: ['A'] }, ans: [] },
  // programming：文本异同（判分函数返回值口径需一致）
  { q: { id: '10', subject: 's', title: 't', points: 20, type: 'programming', answer: 'print("hello")' }, ans: 'print(\'hello\')' },
  { q: { id: '11', subject: 's', title: 't', points: 20, type: 'programming', answer: 'print(1)' }, ans: 'print(2)' },
  // 异常输入
  { q: { id: '12', subject: 's', title: 't', points: 5, type: 'single', options: ['A1', 'B2'], answer: 'A' }, ans: null },
  { q: { id: '13', subject: 's', title: 't', points: 5, type: 'unknown', answer: 'x' }, ans: 'x' },
];

describe('examScoring 手写副本 vs SSOT 生成物：判分口径一致', () => {
  it('isAnswerCorrect 全语料一致', () => {
    for (const { q, ans } of corpus) {
      expect([q.id, hand.isAnswerCorrect(q, ans)]).toEqual([q.id, gen.isAnswerCorrect(q, ans)]);
    }
  });

  it('gradeQuestion 全语料一致（分值 7）', () => {
    for (const { q, ans } of corpus) {
      expect([q.id, hand.gradeQuestion(q, ans, 7)]).toEqual([q.id, gen.gradeQuestion(q, ans, 7)]);
    }
  });

  it('生成物包含 SSOT 全部导出（防止 build-scoring 漏符号）', () => {
    for (const name of ['isAnswerCorrect', 'gradeQuestion', 'correctOptionIndices', 'scoreByIndices', 'formatTime']) {
      expect(typeof gen[name]).toBe('function');
    }
  });

  it('手写副本不含 SSOT 未有的额外判分行为：programming 恒不自动判分', () => {
    const prog = corpus[9].q;
    expect(hand.gradeQuestion(prog, 'print("hello")', 20)).toEqual({ is_correct: null, earned: 0, needs_manual: true });
    expect(gen.gradeQuestion(prog, 'print("hello")', 20)).toEqual({ is_correct: null, earned: 0, needs_manual: true });
  });
});
