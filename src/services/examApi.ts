/**
 * 正式考试模块 API 客户端封装
 *
 * 统一封装 /api/exams 的全部端点，使用 src/services/api.ts 导出的 client
 * （自动携带 JWT、统一错误结构）。类型与后端契约严格对齐（见 src/types.ts）。
 */
import client from './api';
import type {
  Exam,
  ExamStatus,
  ExamAvailableItem,
  ExamStartResponse,
  ExamSubmitResponse,
  ExamAttempt,
  ExamAttemptQuestion,
  ExamHistoryItem,
  ExamAnalysis,
  ExamCreatePayload,
  ExamUpdatePayload,
} from '../types';

export const examApi = {
  /** POST /api/exams — 创建试卷（draft） */
  create: (payload: ExamCreatePayload) =>
    client.post<{ id: number; status: ExamStatus }>('/exams', payload),

  /** PUT /api/exams/:id — 更新试卷 */
  update: (id: number, payload: ExamUpdatePayload) =>
    client.put<{ message: string }>(`/exams/${id}`, payload),

  /** DELETE /api/exams/:id — 删除试卷（级联删除 attempts） */
  remove: (id: number) =>
    client.delete<{ message: string }>(`/exams/${id}`),

  /** GET /api/exams — 我的试卷列表（含 attempt_count / avg_score 简报） */
  listMine: () =>
    client.get<{ exams: Exam[] }>('/exams'),

  /** GET /api/exams/available — 可参加列表（published + 窗口内 + 科目可访问） */
  listAvailable: () =>
    client.get<{ exams: ExamAvailableItem[] }>('/exams/available'),

  /** GET /api/exams/:id — 试卷详情（解析题集为含答案的完整 questions） */
  getDetail: (id: number) =>
    client.get<{ exam: Exam }>(`/exams/${id}`),

  /** POST /api/exams/:id/start — 开始作答（复用或新建 attempt，返回剥离答案的试卷） */
  start: (id: number) =>
    client.post<ExamStartResponse>(`/exams/${id}/start`),

  /** POST /api/exams/:id/submit — 提交评分 */
  submit: (id: number, attemptId: number, answers: Record<number, string | string[]>) =>
    client.post<ExamSubmitResponse>(`/exams/${id}/submit`, { attemptId, answers }),

  /** GET /api/exams/attempts/:attemptId — 查看某次答卷（透出 correct_answer + explanation） */
  getAttempt: (attemptId: number) =>
    client.get<{ attempt: ExamAttempt; questions: ExamAttemptQuestion[] }>(
      `/exams/attempts/${attemptId}`,
    ),

  /** GET /api/exams/my-history — 我的历史成绩（全部 attempt + 每场 bestScores） */
  myHistory: () =>
    client.get<{ history: ExamHistoryItem[]; bestScores: Record<number, number> }>(
      '/exams/my-history',
    ),

  /** GET /api/exams/:id/analysis — 考试分析（口径 = 每学生最高分 attempt） */
  analysis: (id: number) =>
    client.get<{ analysis: ExamAnalysis }>(`/exams/${id}/analysis`),

  /** GET /api/exams/:id/attempts — 本卷全部答卷列表（下钻） */
  listAttempts: (id: number) =>
    client.get<{ attempts: ExamAttempt[] }>(`/exams/${id}/attempts`),

  /** POST /api/exams/:id/sweep — 批量强制自动交卷（owner / 外部 cron） */
  sweep: (id: number) =>
    client.post<{ autoSubmitted: number }>(`/exams/${id}/sweep`),
};

export default examApi;
