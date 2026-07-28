/**
 * 双轨类型映射层（R6）
 *
 * `api.ts` 中的 *Item 类型是「网络 DTO」（后端返回形态，多为 snake_case），
 * `types.ts` 中的领域类型（Question / Subject / MistakeRecord / User …）是
 * 应用内部唯一事实源。本文件在边界处把 DTO 收敛为领域类型，消除两处字段口径
 * 不一致（例如 SubjectItem.isSystem 反向映射到 Subject.isCustom）。
 *
 * 消费方（组件 / hook）应只接触领域类型，DTO 仅在 api.ts 边界出现。
 */

import type {
  Question,
  Subject,
  SubjectId,
  QuestionType,
  MistakeRecord,
  User,
} from '../types';
import type {
  QuestionItem,
  SubjectItem,
  AuthUser,
  MistakeItem,
  FavoriteItem,
  StatsItem,
} from './api';

/** QuestionItem(snake: subject_id) → Question */
export function questionItemToQuestion(item: QuestionItem): Question {
  const type: QuestionType =
    item.type === 'single' || item.type === 'multiple' || item.type === 'programming'
      ? item.type
      : 'single';
  return {
    id: item.id,
    subject: item.subject_id as SubjectId,
    type,
    title: item.title,
    code: item.code,
    options: item.options,
    answer: item.answer,
    explanation: item.explanation,
    points: item.points,
    input: item.input,
  };
}

/** SubjectItem.isSystem 反向映射 → Subject.isCustom */
export function subjectItemToSubject(item: SubjectItem): Subject {
  return {
    id: item.id as SubjectId,
    name: item.name,
    icon: item.icon,
    welcomeTitle: item.welcomeTitle ?? '',
    welcomeDesc: item.welcomeDesc ?? '',
    isCustom: !item.isSystem,
    isEditable: !!item.isOwner,
    isShared: !!item.isShared,
    shareScope: item.shareScope,
    isOwner: !!item.isOwner,
    isSubscribed: !!item.isSubscribed,
    subscriberCount: item.subscriberCount ?? 0,
  };
}

/** AuthUser(DTO) → User(领域) */
export function authUserToUser(item: AuthUser): User {
  return {
    id: item.id,
    username: item.username,
    email: item.email,
    role: item.role,
    teacherId: item.teacher_id ?? null,
    teacherName: item.teacher_name ?? null,
    phone: item.phone ?? null,
    status: item.status,
    passwordReset: item.passwordReset,
    studentCount: item.student_count,
    helpRead: item.help_read,
  };
}

/** MistakeItem → MistakeRecord */
export function mistakeItemToMistakeRecord(item: MistakeItem): MistakeRecord {
  return {
    questionId: item.questionId,
    consecutiveCorrect: item.consecutiveCorrect,
  };
}

/** FavoriteItem → questionId（领域侧仅需题目 id 集合） */
export function favoriteItemToFavorite(item: FavoriteItem): number {
  return item.questionId;
}

/** StatsItem → 领域统计对象 */
export function statsItemToStats(item: StatsItem) {
  return {
    id: item.id,
    subject: item.subject,
    totalQuestions: item.totalQuestions,
    correctCount: item.correctCount,
    totalAttempts: item.totalAttempts,
    studyTime: item.studyTime,
    date: item.date,
  };
}
