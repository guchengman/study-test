/**
 * storage_usage 存储用量核心逻辑单测（扫描 + UPSERT + 阈值告警/熔断）。
 *
 * 策略：
 *   - fs / db 均依赖注入，用假 fs（readdirSync/statSync）与假 db（按 SQL 子串路由）。
 *   - 不触真实文件系统，不触网。
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../src/utils/logger.js', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import {
  scanUserDirs,
  upsertStorageUsage,
  runStorageScan,
  WARN_RATIO,
  CRITICAL_RATIO,
} from '../../src/utils/storageUsageService.js';

/** 假 fs：tree = { rootName: { fileName: size } }；目录名非 user_* 忽略 */
function makeFakeFs(tree) {
  const root = '/uploads';
  return {
    readdirSync: (p) => {
      if (p === root) return Object.keys(tree);
      const dirName = p.split(/[\\/]/).pop();
      if (tree[dirName]) return Object.keys(tree[dirName]);
      throw new Error('ENOENT ' + p);
    },
    statSync: (p) => {
      const parts = p.split(/[\\/]/);
      const fileName = parts.pop();
      const dirName = parts.pop();
      const size = tree[dirName]?.[fileName];
      if (size == null) throw new Error('ENOENT ' + p);
      return { isFile: () => true, size };
    },
  };
}

/** 假 db：按 SQL 子串路由，记录 calls；orgId 固定返回 */
function makeFakeDb({ orgId = 100, recentAlerts = [] } = {}) {
  const calls = [];
  const db = {
    execute: async (sql, params = []) => {
      const t = sql.trim();
      calls.push({ sql: t, params });
      if (/FROM org_members/.test(t)) return [[{ org_id: orgId }]];
      if (/^SELECT id FROM notifications/.test(t)) return [recentAlerts];
      if (/^INSERT INTO notifications /.test(t)) return [{ insertId: 555 }];
      if (/^INSERT INTO notification_deliveries/.test(t)) return [{ insertId: 555 }];
      if (/^INSERT INTO storage_usage/.test(t)) return [{ affectedRows: 1 }];
      if (/^UPDATE storage_usage SET circuit_broken/.test(t)) return [{ affectedRows: 1 }];
      return [[]];
    },
    _calls: calls,
  };
  return db;
}

const GB = 1024 * 1024 * 1024;

describe('storageUsageService', () => {
  describe('scanUserDirs', () => {
    it('sums sizes per user dir and ignores non-user dirs', () => {
      const fs = makeFakeFs({
        user_5: { 'a.png': 100, 'b.png': 200 },
        user_6: { 'c.png': 50 },
        temp: { 'x.png': 9999 },
      });
      const res = scanUserDirs('/uploads', fs);
      expect(res.get(5)).toEqual({ bytes: 300, count: 2 });
      expect(res.get(6)).toEqual({ bytes: 50, count: 1 });
      expect(res.has(9999)).toBe(false);
      expect(res.size).toBe(2);
    });

    it('returns empty map when root missing', () => {
      const fs = { readdirSync: () => { throw new Error('ENOENT'); } };
      const res = scanUserDirs('/nope', fs);
      expect(res.size).toBe(0);
    });
  });

  describe('upsertStorageUsage', () => {
    it('runs INSERT ... ON DUPLICATE KEY UPDATE', async () => {
      const db = makeFakeDb();
      await upsertStorageUsage(db, 7, 123, 4);
      expect(db._calls[0].sql).toMatch(/INSERT INTO storage_usage/);
      expect(db._calls[0].sql).toMatch(/ON DUPLICATE KEY UPDATE/);
      expect(db._calls[0].params).toEqual([7, 123, 4]);
    });
  });

  describe('runStorageScan', () => {
    it('warn tier (>=80%) upserts and sends alert, not circuit-broken', async () => {
      // quota 1GB, user 5 uses 0.9GB → 90% warn
      const fs = makeFakeFs({ user_5: { 'big.bin': Math.floor(0.9 * GB) } });
      const db = makeFakeDb({ orgId: 42 });
      const summary = await runStorageScan(db, { uploadsRoot: '/uploads', fsImpl: fs, quotaBytes: GB });
      expect(summary.users).toBe(1);
      expect(summary.alerts).toBe(1);
      expect(summary.broken).toBe(0);
      // UPSERT 42
      const upsert = db._calls.find((c) => /INSERT INTO storage_usage/.test(c.sql));
      expect(upsert.params[0]).toBe(42);
      // circuit set 0
      const circuit = db._calls.find((c) => /SET circuit_broken/.test(c.sql));
      expect(circuit.params).toEqual([0, 42]);
      // alert notification created
      const notif = db._calls.find((c) => /INSERT INTO notifications /.test(c.sql));
      expect(notif).toBeTruthy();
    });

    it('critical tier (>=95%) sets circuit_broken=1', async () => {
      expect(WARN_RATIO).toBe(0.80);
      expect(CRITICAL_RATIO).toBe(0.95);
      const fs = makeFakeFs({ user_5: { 'big.bin': Math.floor(0.96 * GB) } });
      const db = makeFakeDb({ orgId: 9 });
      const summary = await runStorageScan(db, { uploadsRoot: '/uploads', fsImpl: fs, quotaBytes: GB });
      expect(summary.broken).toBe(1);
      const circuit = db._calls.find((c) => /SET circuit_broken/.test(c.sql));
      expect(circuit.params).toEqual([1, 9]);
    });

    it('suppresses duplicate alert within 24h', async () => {
      const fs = makeFakeFs({ user_5: { 'big.bin': Math.floor(0.85 * GB) } });
      const db = makeFakeDb({ orgId: 3, recentAlerts: [{ id: 1 }] });
      const summary = await runStorageScan(db, { uploadsRoot: '/uploads', fsImpl: fs, quotaBytes: GB });
      expect(summary.alerts).toBe(0); // 已存在近期告警 → 不重复发
      const notif = db._calls.find((c) => /INSERT INTO notifications /.test(c.sql));
      expect(notif).toBeUndefined();
    });

    it('skips users without personal org', async () => {
      const fs = makeFakeFs({ user_5: { 'a': 100 } });
      const db = makeFakeDb({ orgId: null });
      // orgId null → resolvePersonalOrgId returns rows with org_id null → skipped
      db.execute = async (sql, params = []) => {
        const t = sql.trim();
        db._calls.push({ sql: t, params });
        if (/FROM org_members/.test(t)) return [[{ org_id: null }]];
        return [[]];
      };
      const summary = await runStorageScan(db, { uploadsRoot: '/uploads', fsImpl: fs, quotaBytes: GB });
      expect(summary.users).toBe(0);
    });
  });
});
