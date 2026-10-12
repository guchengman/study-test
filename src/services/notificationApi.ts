/**
 * FR-701/702 通知中心前端 API
 *
 * 端点：/api/notifications
 */
import client from './api';

// ─── 类型 ──────────────────────────────────────────────────

export interface NotificationItem {
  id: number;
  user_id: number;
  type: string;
  title: string;
  payload: Record<string, unknown> | string | null;
  read_at: string | null;
  created_at: string;
}

// ─── API ───────────────────────────────────────────────────

export const notificationApi = {
  /** GET /api/notifications — 通知列表（分页 + 未读过滤） */
  list: (params?: { page?: number; limit?: number; unread?: boolean }) => {
    const query = new URLSearchParams();
    if (params?.page) query.set('page', String(params.page));
    if (params?.limit) query.set('limit', String(params.limit));
    if (params?.unread) query.set('unread', '1');
    const qs = query.toString();
    return client.get<{ notifications: NotificationItem[]; total: number; page: number; limit: number }>(
      `/notifications${qs ? '?' + qs : ''}`
    );
  },

  /** GET /api/notifications/unread-count — 未读数 */
  unreadCount: () => client.get<{ count: number }>('/notifications/unread-count'),

  /** PUT /api/notifications/:id/read — 单条标记已读 */
  markRead: (id: number) => client.put<{ ok: boolean }>(`/notifications/${id}/read`),

  /** PUT /api/notifications/read-all — 全部标记已读 */
  markAllRead: () => client.put<{ ok: boolean; affected: number }>('/notifications/read-all'),
};
