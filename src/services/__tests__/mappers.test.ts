import { describe, it, expect } from 'vitest';
import {
  questionItemToQuestion,
  subjectItemToSubject,
  mistakeItemToMistakeRecord,
  authUserToUser,
} from '../api.mappers';
import type { QuestionItem, SubjectItem, MistakeItem, AuthUser } from '../api';

describe('api.mappers (R6 双轨类型映射)', () => {
  it('questionItemToQuestion: subject_id -> subject，丢弃 DTO 专属字段', () => {
    const item: QuestionItem = {
      id: 1,
      subject_id: 'math',
      type: 'single',
      title: '1+1=?',
      code: undefined,
      options: ['1', '2'],
      answer: '2',
      explanation: '常识',
      points: 5,
      input: undefined,
      shareCode: undefined,
      isOwner: true,
      userId: 7,
      createdAt: '2024-01-01',
      updatedAt: '2024-01-02',
    };
    const q = questionItemToQuestion(item);
    expect(q.subject).toBe('math');
    expect(q.type).toBe('single');
    expect(q.answer).toBe('2');
    expect(q.points).toBe(5);
    // DTO 专属字段不应泄漏到领域类型
    expect((q as unknown as Record<string, unknown>).userId).toBeUndefined();
    expect((q as unknown as Record<string, unknown>).createdAt).toBeUndefined();
  });

  it('subjectItemToSubject: isSystem 反向映射为 isCustom', () => {
    const item: SubjectItem = {
      id: 'math',
      name: '数学',
      icon: '🧮',
      isSystem: true,
      createdAt: '2024',
    };
    const s = subjectItemToSubject(item);
    expect(s.isCustom).toBe(false);
    expect(s.id).toBe('math');
    expect(s.name).toBe('数学');
  });

  it('mistakeItemToMistakeRecord: 字段映射', () => {
    const item: MistakeItem = {
      id: 9,
      questionId: 3,
      consecutiveCorrect: 2,
      createdAt: '2024',
      updatedAt: '2024',
    };
    const r = mistakeItemToMistakeRecord(item);
    expect(r).toEqual({ questionId: 3, consecutiveCorrect: 2 });
  });

  it('authUserToUser: DTO -> 领域', () => {
    const item: AuthUser = {
      id: 1,
      username: 'alice',
      email: 'a@b.com',
      role: 'teacher',
      teacher_id: 5,
      teacher_name: 'Bob',
    };
    const u = authUserToUser(item);
    expect(u.id).toBe(1);
    expect(u.role).toBe('teacher');
    expect(u.teacherId).toBe(5);
  });
});
