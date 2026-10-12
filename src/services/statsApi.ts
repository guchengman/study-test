/**
 * FR-301/302 学情/考情看板前端 API
 *
 * 端点：/api/stats
 */
import client from './api';

// ─── 类型 ──────────────────────────────────────────────────

export type StatsMetric = 'practiced' | 'correct' | 'time_spent' | 'exam_score';

export interface TrendPoint {
  date: string;
  value: number;
}

export interface MasteryItem {
  tag_id: number;
  tag_name: string;
  practiced: number;
  correct: number;
  mastery: number; // 0-100
}

export interface DistBucket {
  label: string;
  count: number;
}

export interface DiscriminationItem {
  question_id: number;
  topRate: number;
  bottomRate: number;
  discrimination: number;
}

export interface DistractorItem {
  question_id: number;
  correct_answer: string | null;
  wrong_picks: { option: string; count: number }[];
}

export interface ExamAnalysis {
  examId: number;
  title: string;
  total_points: number;
  pass_score: number;
  referenceCount: number;
  distribution: DistBucket[];
  sampleSize: number;
  minSample: number;
  sample_insufficient: boolean;
  discrimination: DiscriminationItem[] | null;
  distractors: DistractorItem[] | null;
}

export interface ClassStudent {
  user_id: number;
  username: string;
  practiced: number;
  correct: number;
  accuracy: number;
}

// ─── API ───────────────────────────────────────────────────

export const statsApi = {
  /** GET /api/stats/me/trend — 本人指标日趋势 */
  trend: (metric: StatsMetric, days = 30, signal?: AbortSignal) =>
    client.get<{ metric: StatsMetric; days: number; trend: TrendPoint[] }>(
      `/stats/me/trend?metric=${metric}&days=${days}`,
      signal
    ),

  /** GET /api/stats/me/mastery — 本人标签掌握度 */
  mastery: (signal?: AbortSignal) =>
    client.get<{ mastery: MasteryItem[] }>('/stats/me/mastery', signal),

  /** GET /api/stats/exam/:id/analysis — 深度考情 */
  examAnalysis: (examId: number, signal?: AbortSignal) =>
    client.get<{ analysis: ExamAnalysis }>(`/stats/exam/${examId}/analysis`, signal),

  /** GET /api/stats/class/compare — 班级横向 */
  classCompare: (teacherId?: number, signal?: AbortSignal) =>
    client.get<{ students: ClassStudent[] }>(
      `/stats/class/compare${teacherId ? `?teacher_id=${teacherId}` : ''}`,
      signal
    ),

  /** POST /api/stats/admin/aggregate — 手动聚合（管理员） */
  aggregate: (date?: string) =>
    client.post<{ ok: boolean; date: string; attempts: number; rows: number }>(
      `/stats/admin/aggregate${date ? `?date=${date}` : ''}`
    ),
};
