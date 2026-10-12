/**
 * FR-701/702 notificationService 核心逻辑单测。
 *
 * 策略：
 *   - db 依赖注入，按 SQL 子串路由假 pool（沿用 tagService.test 范式）。
 *   - dispatchEmail 仅测「未配置」短路路径（不触网）。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../src/utils/logger.js', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import {
  createNotification,
  listNotifications,
  getUnreadCount,
  markRead,
  markAllRead,
  dispatchEmail,
} from '../../src/utils/notificationService.js';

/** 按 SQL 子串路由的假 db */
function makeFakeDb(cfg = {}) {
  const {
    insertId = 1,
    total = 0,
    cnt = 0,
    rows = [],
    affected = 1,
  } = cfg;
  const calls = [];
  const db = {
    execute: async (sql, params = []) => {
      const trimmed = sql.trim();
      calls.push({ sql: trimmed, params });
      if (/^INSERT INTO notifications /i.test(trimmed)) {
        return [{ insertId, affectedRows: 1 }];
      }
      if (/^INSERT INTO notification_deliveries/i.test(trimmed)) {
        return [{ insertId, affectedRows: 1 }];
      }
      if (/SELECT COUNT\(\*\) AS total FROM notifications/i.test(trimmed)) {
        return [[{ total }]];
      }
      if (/SELECT COUNT\(\*\) AS cnt FROM notifications/i.test(trimmed)) {
        return [[{ cnt }]];
      }
      if (/^SELECT id, user_id, type, title, payload/i.test(trimmed)) {
        return [rows];
      }
      if (/^UPDATE notifications SET read_at/i.test(trimmed)) {
        return [{ affectedRows: affected }];
      }
      if (/^UPDATE notification_deliveries/i.test(trimmed)) {
        return [{ affectedRows: affected }];
      }
      return [[]];
    },
    _calls: calls,
  };
  return db;
}

describe('notificationService', () => {
  describe('createNotification', () => {
    it('inserts notification then site delivery record', async () => {
      const db = makeFakeDb({ insertId: 42 });
      const result = await createNotification(db, {
        user_id: 7, type: 'system', title: '你好', payload: { a: 1 }, org_id: 3,
      });
      expect(result).toEqual({ id: 42 });
      expect(db._calls[0].sql).toMatch(/INSERT INTO notifications/);
      expect(db._calls[0].params).toEqual([7, 3, 'system', '你好', JSON.stringify({ a: 1 })]);
      // 第二条：site delivery, status sent
      expect(db._calls[1].sql).toMatch(/INSERT INTO notification_deliveries/);
      expect(db._calls[1].sql).toMatch(/'site', 'sent'/);
      expect(db._calls[1].params).toEqual([42]);
    });

    it('serializes null payload as null', async () => {
      const db = makeFakeDb();
      await createNotification(db, { user_id: 1, type: 'system', title: 'x' });
      expect(db._calls[0].params).toEqual([1, null, 'system', 'x', null]);
    });
  });

  describe('listNotifications', () => {
    it('runs count then page query', async () => {
      const rows = [{ id: 1, title: 'a' }];
      const db = makeFakeDb({ total: 5, rows });
      const res = await listNotifications(db, 9, { limit: 20, offset: 0 });
      expect(res).toEqual({ rows, total: 5 });
      expect(db._calls[0].sql).toMatch(/COUNT\(\*\) AS total/);
      expect(db._calls[0].params).toEqual([9]);
      expect(db._calls[1].sql).toMatch(/LIMIT \? OFFSET \?/);
      expect(db._calls[1].params).toEqual([9, 20, 0]);
    });

    it('adds unread filter when unreadOnly', async () => {
      const db = makeFakeDb();
      await listNotifications(db, 9, { unreadOnly: true });
      expect(db._calls[0].sql).toMatch(/read_at IS NULL/);
    });
  });

  describe('getUnreadCount', () => {
    it('returns count', async () => {
      const db = makeFakeDb({ cnt: 12 });
      const c = await getUnreadCount(db, 4);
      expect(c).toBe(12);
      expect(db._calls[0].params).toEqual([4]);
    });
  });

  describe('markRead', () => {
    it('returns true when a row updated', async () => {
      const db = makeFakeDb({ affected: 1 });
      const ok = await markRead(db, 3, 7);
      expect(ok).toBe(true);
      expect(db._calls[0].sql).toMatch(/WHERE id = \? AND user_id = \? AND read_at IS NULL/);
      expect(db._calls[0].params).toEqual([3, 7]);
    });

    it('returns false when nothing matched', async () => {
      const db = makeFakeDb({ affected: 0 });
      const ok = await markRead(db, 999, 7);
      expect(ok).toBe(false);
    });
  });

  describe('markAllRead', () => {
    it('returns affected rows count', async () => {
      const db = makeFakeDb({ affected: 4 });
      const n = await markAllRead(db, 7);
      expect(n).toBe(4);
      expect(db._calls[0].sql).toMatch(/WHERE user_id = \? AND read_at IS NULL/);
    });
  });

  describe('dispatchEmail', () => {
    const saved = { ...process.env };
    beforeEach(() => {
      delete process.env.EMAILJS_SERVICE_ID;
      delete process.env.EMAILJS_PUBLIC_KEY;
      delete process.env.EMAILJS_TEMPLATE_NOTIFICATION;
      delete process.env.EMAILJS_TEMPLATE_ID;
    });
    afterEach(() => {
      process.env = { ...saved };
    });

    it('short-circuits when email not configured (no network)', async () => {
      const db = makeFakeDb();
      const res = await dispatchEmail(db, 1);
      expect(res).toEqual({ sent: false, reason: 'not_configured' });
      expect(db._calls.length).toBe(0);
    });
  });
});
