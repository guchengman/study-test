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

const judge: Question = {
  id: 4,
  subject: 'math',
  type: 'judge',
  title: '1+1=2 ?',
  options: ['正确', '错误'],
  answer: '正确',
  points: 5,
};

const fillSingle: Question = {
  id: 5,
  subject: 'english',
  type: 'fill_in',
  title: '拼写 apple',
  answer: 'apple,Apple',
  points: 6,
};

const fillMulti: Question = {
  id: 6,
  subject: 'math',
  type: 'fill_in',
  title: '两空',
  answer: ['2,二', '4,四'],
  points: 10,
};

const shortAnswer: Question = {
  id: 7,
  subject: 'chinese',
  type: 'short_answer',
  title: '简述静夜思意境',
  answer: '参考答案：思乡',
  points: 15,
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

  it('judge: 真值 token 归一（对/√/true/A 皆真，错/×/false/B 皆假）', () => {
    expect(isAnswerCorrect(judge, '正确')).toBe(true);
    expect(isAnswerCorrect(judge, '对')).toBe(true);
    expect(isAnswerCorrect(judge, '√')).toBe(true);
    expect(isAnswerCorrect(judge, 'A')).toBe(true); // A→真、B→假（判断题约定）
    expect(isAnswerCorrect(judge, '错误')).toBe(false);
    expect(isAnswerCorrect(judge, 'B')).toBe(false);
    expect(isAnswerCorrect({ ...judge, answer: '错误' }, '×')).toBe(true);
  });

  it('fill_in: 同义项 + 大小写/全半角等价', () => {
    expect(isAnswerCorrect(fillSingle, 'apple')).toBe(true);
    expect(isAnswerCorrect(fillSingle, 'APPLE')).toBe(true); // 大小写不敏感
    expect(isAnswerCorrect(fillSingle, 'ＡＰＰＬＥ')).toBe(true); // 全角→半角等价
    expect(isAnswerCorrect(fillSingle, 'Ａｐｐｌｅ ')).toBe(true); // 全角+空格
    expect(isAnswerCorrect(fillSingle, 'pear')).toBe(false);
    expect(isAnswerCorrect(fillSingle, 'Banana')).toBe(false);
  });

  it('fill_in: 多空需全部正确才判 true', () => {
    expect(isAnswerCorrect(fillMulti, ['2', '4'])).toBe(true);
    expect(isAnswerCorrect(fillMulti, ['二', '四'])).toBe(true); // 同义项
    expect(isAnswerCorrect(fillMulti, ['2', '5'])).toBe(false); // 一空错
    expect(isAnswerCorrect(fillMulti, ['2'])).toBe(false); // 缺第二空
  });

  it('short_answer: 自动口径一律 false（需人工判分）', () => {
    expect(isAnswerCorrect(shortAnswer, '思乡之情')).toBe(false);
  });
});

describe('gradeQuestion 新题型', () => {
  it('judge: 命中满分/未命中 0，needs_manual=false', () => {
    expect(gradeQuestion(judge, '对', 5)).toEqual({ is_correct: true, earned: 5, needs_manual: false });
    expect(gradeQuestion(judge, '错', 5)).toEqual({ is_correct: false, earned: 0, needs_manual: false });
  });

  it('fill_in: 逐空部分得分（四舍五入）', () => {
    // 两空各占一半分：全对=10，一对一错=5，全错=0
    expect(gradeQuestion(fillMulti, ['2', '4'], 10)).toEqual({ is_correct: true, earned: 10, needs_manual: false });
    expect(gradeQuestion(fillMulti, ['2', '9'], 10)).toEqual({ is_correct: false, earned: 5, needs_manual: false });
    expect(gradeQuestion(fillMulti, ['9', '8'], 10)).toEqual({ is_correct: false, earned: 0, needs_manual: false });
    // 单空同义 + 全半角等价满分
    expect(gradeQuestion(fillSingle, 'ＡＰＰＬＥ', 6)).toEqual({ is_correct: true, earned: 6, needs_manual: false });
  });

  it('short_answer: needs_manual=true、is_correct=null、earned=0', () => {
    const r = gradeQuestion(shortAnswer, '我的作答', 15);
    expect(r).toEqual({ is_correct: null, earned: 0, needs_manual: true });
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
