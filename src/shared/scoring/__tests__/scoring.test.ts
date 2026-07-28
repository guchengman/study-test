import { describe, it, expect } from 'vitest';
import {
  isAnswerCorrect,
  scoreByIndices,
  correctOptionIndices,
  gradeQuestion,
  formatTime,
} from '../index';
import type { Question } from '../../../types';

const single: Question = {
  id: 1,
  subject: 'math',
  type: 'single',
  title: '1+1=?',
  options: ['Apple', 'Banana', 'Cat', 'Dog'],
  answer: 'B',
  points: 5,
};

const multiple: Question = {
  id: 2,
  subject: 'math',
  type: 'multiple',
  title: '哪些是偶数?',
  options: ['1', '2', '3', '4'],
  answer: ['B', 'D'],
  points: 10,
};

const programming: Question = {
  id: 3,
  subject: 'python',
  type: 'programming',
  title: '打印 1',
  answer: 'print(1)',
  points: 20,
};

describe('isAnswerCorrect (R4 单一事实源)', () => {
  it('single: 文本判等', () => {
    expect(isAnswerCorrect({ ...single, answer: 'Banana' }, 'Banana')).toBe(true);
    expect(isAnswerCorrect(single, 'Apple')).toBe(false);
  });

  it('single: A-Z 标签 -> 选项文本回退', () => {
    expect(isAnswerCorrect(single, 'Banana')).toBe(true); // 答案 'B' 映射到 options[1]='Banana'
  });

  it('multiple: 排序无关 + 选项文本比对', () => {
    expect(isAnswerCorrect(multiple, ['2', '4'])).toBe(true);
    expect(isAnswerCorrect(multiple, ['4', '2'])).toBe(true);
    expect(isAnswerCorrect(multiple, ['2'])).toBe(false);
  });

  it('programming: 归一化比对', () => {
    expect(isAnswerCorrect(programming, 'print( 1 )')).toBe(true);
    expect(isAnswerCorrect(programming, 'print(2)')).toBe(false);
  });
});

describe('scoreByIndices / correctOptionIndices (扩展端内核)', () => {
  it('correctOptionIndices 解析正确答案索引', () => {
    expect(correctOptionIndices(single)).toEqual([1]);
    expect(correctOptionIndices(multiple)).toEqual([1, 3]);
  });

  it('scoreByIndices: 单选命中/未命中', () => {
    expect(scoreByIndices(single, [1])).toBe(true);
    expect(scoreByIndices(single, [0])).toBe(false);
  });

  it('scoreByIndices: 多选集合比对', () => {
    expect(scoreByIndices(multiple, [1, 3])).toBe(true);
    expect(scoreByIndices(multiple, [3, 1])).toBe(true);
    expect(scoreByIndices(multiple, [1])).toBe(false);
  });
});

describe('gradeQuestion', () => {
  it('客观题：命中得满分，未命中 0 分', () => {
    expect(gradeQuestion(single, 'Banana', 5)).toEqual({ is_correct: true, earned: 5, needs_manual: false });
    expect(gradeQuestion(single, 'Apple', 5)).toEqual({ is_correct: false, earned: 0, needs_manual: false });
  });

  it('编程题：needs_manual=true，不自动判分', () => {
    const r = gradeQuestion(programming, 'print(1)', 20);
    expect(r.needs_manual).toBe(true);
    expect(r.is_correct).toBeNull();
    expect(r.earned).toBe(0);
  });
});

describe('formatTime', () => {
  it('秒数 -> m:ss', () => {
    expect(formatTime(65)).toBe('1:05');
    expect(formatTime(5)).toBe('0:05');
    expect(formatTime(0)).toBe('0:00');
  });
});
