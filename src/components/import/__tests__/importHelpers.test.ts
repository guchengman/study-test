// T4a 安全网：ImportModal 抽取的纯函数（subjectName / questionConvert）
import { describe, it, expect } from 'vitest';
import { getSubjectDisplayName, getSubjectDisplayNameById, myOwnedSubjects } from '../subjectName';
import { convertParsedQuestions } from '../questionConvert';
import type { Subject } from '../../../types';
import type { ParsedQuestion } from '../../../services/extract/types';

const SUBJECTS: Subject[] = [
  { id: 'python', name: 'Python', icon: '🐍', welcomeTitle: '代码如诗', welcomeDesc: 'Python', isOwner: true },
  { id: 'math_2', name: '数学(2)', icon: '📐', welcomeTitle: '以数启智', welcomeDesc: '数学', isOwner: true },
  { id: 'shared_eng', name: '英语(共享)', icon: '🔤', welcomeTitle: '语通世界', welcomeDesc: '英语', isOwner: false },
];

describe('subjectName', () => {
  it('getSubjectDisplayName 按 id 精确匹配', () => {
    expect(getSubjectDisplayName(SUBJECTS, 'python')).toBe('Python');
  });

  it('getSubjectDisplayName 命中末级 id 后缀', () => {
    expect(getSubjectDisplayName(SUBJECTS, 'math_2')).toBe('数学(2)');
  });

  it('getSubjectDisplayName 按名称包含匹配', () => {
    expect(getSubjectDisplayName(SUBJECTS, '数学')).toBe('数学(2)');
  });

  it('getSubjectDisplayName 未知名称走兜底', () => {
    expect(getSubjectDisplayName(SUBJECTS, 'python')).toBe('Python');
    expect(getSubjectDisplayName(SUBJECTS, 'unknown_xx')).toBe('unknown_xx');
    expect(getSubjectDisplayName(SUBJECTS, null)).toBe('未知');
  });

  it('getSubjectDisplayNameById 按 id 匹配，未知走兜底', () => {
    expect(getSubjectDisplayNameById(SUBJECTS, 'python')).toBe('Python');
    expect(getSubjectDisplayNameById(SUBJECTS, 'math_2')).toBe('数学(2)');
    expect(getSubjectDisplayNameById(SUBJECTS, null)).toBe('未知');
  });

  it('myOwnedSubjects 过滤掉共享科目', () => {
    const owned = myOwnedSubjects(SUBJECTS);
    expect(owned.map((s) => s.id)).toEqual(['python', 'math_2']);
  });
});

describe('questionConvert', () => {
  const parsed: ParsedQuestion[] = [
    { type: 'single', title: 'Q1', answer: 'A', options: ['A', 'B'], points: 5 },
    { type: 'multiple', title: 'Q2', answer: ['A', 'C'], options: ['A', 'B', 'C'], points: 8 },
    { type: 'programming', title: 'Q3', answer: 'print', code: 'x', input: 'y', points: 10 },
  ];

  it('映射字段 + 默认科目 + 默认分值', () => {
    const qs = convertParsedQuestions(parsed, 'math_2');
    expect(qs).toHaveLength(3);
    expect(qs[0].subject).toBe('math_2');
    expect(qs[0].type).toBe('single');
    expect(qs[0].answer).toBe('A');
    expect(qs[0].points).toBe(5);
    expect(qs[2].code).toBe('x');
    expect(qs[2].input).toBe('y');
  });

  it('缺省科目回退 python，缺省分值回退 5', () => {
    const single: ParsedQuestion[] = [{ type: 'single', title: 'Q', answer: 'A' }];
    const qs = convertParsedQuestions(single);
    expect(qs[0].subject).toBe('python');
    expect(qs[0].points).toBe(5);
    expect(qs[0].options).toBeUndefined();
  });

  it('空答案/缺字段不崩溃', () => {
    const qs = convertParsedQuestions([{ type: 'single', title: 'Q', answer: '' }]);
    expect(qs[0].title).toBe('Q');
    expect(qs[0].answer).toBe('');
  });
});
