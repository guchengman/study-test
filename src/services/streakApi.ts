/**
 * FR-501 Streak 连续打卡前端 API
 *
 * 端点：/api/streak
 */
import client from './api';

// ─── 类型 ──────────────────────────────────────────────────

export interface StreakStatus {
  current: number;
  longest: number;
  last_active_date: string | null;
  active_today: boolean;
  can_makeup: boolean;
  makeup_cards: number;
  makeup_used_this_month: number;
  makeup_month: string | null;
}

// ─── API ───────────────────────────────────────────────────

export const streakApi = {
  /** GET /api/streak — 本人 streak 状态 */
  get: (signal?: AbortSignal) =>
    client.get<{ streak: StreakStatus }>('/streak', signal),

  /** POST /api/streak/makeup — 使用一张补签卡修复紧邻断点 */
  makeup: () =>
    client.post<{ ok: boolean; streak: StreakStatus }>('/streak/makeup'),
};
