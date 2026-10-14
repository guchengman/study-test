import { describe, it, expect } from 'vitest';
import { isAnswerableType, buildAnswersPayload, singleSelect } from '../publicShareView';

describe('publicShareView helpers', () => {
  it('仅 single/multiple 可作答', () => {
    expect(isAnswerableType('single')).toBe(true);
    expect(isAnswerableType('multiple')).toBe(true);
    expect(isAnswerableType('programming')).toBe(false);
  });

  it('answers payload 键转字符串、值原样', () => {
    const p = buildAnswersPayload({ 1: 'B', 2: ['A', 'C'] });
    expect(p).toEqual({ '1': 'B', '2': ['A', 'C'] });
  });

  it('singleSelect：单选替换、多选切换并排序', () => {
    const q = { id: 1, type: 'single' as const, title: '', options: [] };
    expect(singleSelect({}, q, 'B')).toEqual({ 1: 'B' });
    const mq = { id: 2, type: 'multiple' as const, title: '', options: [] };
    expect(singleSelect({}, mq, 'A')).toEqual({ 2: ['A'] });
    expect(singleSelect({ 2: ['A'] }, mq, 'C')).toEqual({ 2: ['A', 'C'] });
    expect(singleSelect({ 2: ['A', 'C'] }, mq, 'A')).toEqual({ 2: ['C'] });
  });
});
