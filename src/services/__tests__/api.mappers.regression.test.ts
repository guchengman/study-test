/**
 * 双轨类型映射层回归测试（R6）
 *
 * 补充 src/services/__tests__/mappers.test.ts 未覆盖的两个映射
 * （favoriteItemToFavorite / statsItemToStats），并显式验证「往返一致性」：
 * 本层为 DTO → 领域 单向收敛，没有 toApi 反向函数，因此“往返”以
 * 可反向推导的不变式来表达（如 Subject.isCustom === !SubjectItem.isSystem、
 * Question.subject === QuestionItem.subject_id）。
 */
import { describe, it, expect } from 'vitest';
import {
  questionItemToQuestion,
  subjectItemToSubject,
  authUserToUser,
  mistakeItemToMistakeRecord,
  favoriteItemToFavorite,
  statsItemToStats,
} from '../api.mappers';

describe('questionItemToQuestion (R6)', () => {
  const item = {
    id: 1,
    subject_id: 'math',
    type: 'single',
    title: '1+1=?',
    code: 'x=1',
    options: ['1', '2'],
    answer: '2',
    explanation: '常识',
    points: 5,
    input: 'y',
    shareCode: 'abc',
    isOwner: true,
    userId: 7,
    createdAt: '2024-01-01',
    updatedAt: '2024-01-02',
  } as Record<string, unknown>;

  it('subject_id → subject（往返不变式）', () => {
    const q = questionItemToQuestion(item as never);
    expect(q.subject).toBe('math');
    // 反向推导：领域 subject 严格等于 DTO subject_id
    expect((q as Record<string, unknown>).subject).toBe((item as Record<string, unknown>).subject_id);
  });

  it('未知题型回退 single', () => {
    const q = questionItemToQuestion({ ...(item as object), type: 'weird' } as never);
    expect(q.type).toBe('single');
  });

  it('字段完整映射', () => {
    const q = questionItemToQuestion(item as never);
    expect(q).toMatchObject({
      id: 1,
      type: 'single',
      title: '1+1=?',
      code: 'x=1',
      options: ['1', '2'],
      answer: '2',
      explanation: '常识',
      points: 5,
      input: 'y',
    });
  });

  it('DTO 专属字段不得泄漏到领域类型', () => {
    const q = questionItemToQuestion(item as never) as Record<string, unknown>;
    expect(q.userId).toBeUndefined();
    expect(q.createdAt).toBeUndefined();
    expect(q.shareCode).toBeUndefined();
    expect(q.isOwner).toBeUndefined();
  });
});

describe('subjectItemToSubject (R6) —— isSystem 反向映射', () => {
  it('isSystem=true → isCustom=false（可反向推导不变式）', () => {
    const s = subjectItemToSubject({
      id: 'math',
      name: '数学',
      icon: '🧮',
      isSystem: true,
      isOwner: true,
      isShared: false,
      shareScope: 'class',
      subscriberCount: 5,
    } as never);
    expect(s.isCustom).toBe(false);
    expect(s.isCustom).toBe(!(true)); // isCustom === !isSystem
    expect(s.isEditable).toBe(true);
    expect(s.isOwner).toBe(true);
    expect(s.isShared).toBe(false);
    expect(s.shareScope).toBe('class');
    expect(s.subscriberCount).toBe(5);
  });

  it('isSystem=false → isCustom=true（反向一致）', () => {
    const s = subjectItemToSubject({
      id: 'my_sub',
      name: '我的',
      isSystem: false,
    } as never);
    expect(s.isCustom).toBe(true);
    expect(s.isCustom).toBe(!(false));
  });

  it('缺省字段走兜底（welcomeTitle/Desc 空串，subscriberCount 0）', () => {
    const s = subjectItemToSubject({ id: 'x', name: 'X', isSystem: true } as never);
    expect(s.welcomeTitle).toBe('');
    expect(s.welcomeDesc).toBe('');
    expect(s.subscriberCount).toBe(0);
    expect(s.isSubscribed).toBe(false);
  });
});

describe('authUserToUser (R6)', () => {
  it('DTO → 领域字段映射 + 空值兜底', () => {
    const u = authUserToUser({
      id: 1,
      username: 'alice',
      email: 'a@b.com',
      role: 'teacher',
      teacher_id: 5,
      teacher_name: 'Bob',
      phone: '138',
      status: 'active',
      passwordReset: false,
      student_count: 3,
      help_read: true,
    } as never);
    expect(u).toMatchObject({
      id: 1,
      username: 'alice',
      email: 'a@b.com',
      role: 'teacher',
      teacherId: 5,
      teacherName: 'Bob',
      phone: '138',
      status: 'active',
      passwordReset: false,
      studentCount: 3,
      helpRead: true,
    });
  });

  it('teacher_id / teacher_name 缺省兜底 null', () => {
    const u = authUserToUser({ id: 2, username: 'bob', role: 'student' } as never);
    expect(u.teacherId).toBeNull();
    expect(u.teacherName).toBeNull();
  });
});

describe('mistakeItemToMistakeRecord / favoriteItemToFavorite / statsItemToStats', () => {
  it('mistakeItemToMistakeRecord 映射', () => {
    expect(
      mistakeItemToMistakeRecord({ id: 9, questionId: 3, consecutiveCorrect: 2 } as never),
    ).toEqual({ questionId: 3, consecutiveCorrect: 2 });
  });

  it('favoriteItemToFavorite 仅取 questionId', () => {
    expect(favoriteItemToFavorite({ id: 1, questionId: 42 } as never)).toBe(42);
  });

  it('statsItemToStats 全字段映射', () => {
    const s = statsItemToStats({
      id: 1,
      subject: 'math',
      totalQuestions: 100,
      correctCount: 80,
      totalAttempts: 120,
      studyTime: 3600,
      date: '2024-05-01',
    } as never);
    expect(s).toEqual({
      id: 1,
      subject: 'math',
      totalQuestions: 100,
      correctCount: 80,
      totalAttempts: 120,
      studyTime: 3600,
      date: '2024-05-01',
    });
  });
});
