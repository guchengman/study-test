import { describe, it, expect } from 'vitest';
import { validateGroupPayload, VALID_QUESTION_TYPES } from '../../src/utils/questionGroups.js';

const VALID_Q = (over = {}) => ({ type: 'single', title: 't', answer: 'A', options: ['A', 'B'], ...over });

describe('validateGroupPayload (FR-104)', () => {
  it('合法：subject_id + material 非空 + 子题数组 → ok', () => {
    const r = validateGroupPayload({
      subject_id: 's',
      material: '阅读下面短文…',
      questions: [VALID_Q(), VALID_Q({ type: 'fill_in', answer: 'x' })],
    });
    expect(r.ok).toBe(true);
    expect(r.errors).toEqual([]);
  });

  it('material 缺失或空白 → 不 ok', () => {
    expect(validateGroupPayload({ subject_id: 's', material: '   ', questions: [VALID_Q()] }).ok).toBe(false);
    expect(validateGroupPayload({ subject_id: 's', questions: [VALID_Q()] }).ok).toBe(false);
  });

  it('subject_id 缺失 → 不 ok', () => {
    expect(validateGroupPayload({ material: 'm', questions: [VALID_Q()] }).ok).toBe(false);
  });

  it('questions 非数组或空 → 不 ok', () => {
    expect(validateGroupPayload({ subject_id: 's', material: 'm', questions: [] }).ok).toBe(false);
    expect(validateGroupPayload({ subject_id: 's', material: 'm' }).ok).toBe(false);
  });

  it('子题题型非法 → 不 ok 并定位序号', () => {
    const r = validateGroupPayload({ subject_id: 's', material: 'm', questions: [VALID_Q(), VALID_Q({ type: 'essay' })] });
    expect(r.ok).toBe(false);
    expect(r.errors.join(' ')).toMatch(/第 2/);
  });

  it('子题缺 title 或 answer → 不 ok', () => {
    expect(validateGroupPayload({ subject_id: 's', material: 'm', questions: [VALID_Q({ title: '' })] }).ok).toBe(false);
    expect(validateGroupPayload({ subject_id: 's', material: 'm', questions: [VALID_Q({ answer: '' })] }).ok).toBe(false);
  });

  it('VALID_QUESTION_TYPES 与判分口径一致（含六类）', () => {
    expect(VALID_QUESTION_TYPES).toEqual(
      expect.arrayContaining(['single', 'multiple', 'programming', 'judge', 'fill_in', 'short_answer']),
    );
  });
});
