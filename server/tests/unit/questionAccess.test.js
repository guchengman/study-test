/**
 * canViewQuestion 谓词单测（假 db，按存在性返回行）。
 * 分支语义（属主/订阅/share）与 questions/:id 同源，这里验证：
 *   - 传参序为 [id, 5×userId]（与镜像对象一致）
 *   - SQL 覆盖关键子句（share_scope=all/students、subject_subscriptions、deleted_at 软删过滤）
 *   - 命中→true、空→false
 */
process.env.JWT_SECRET = 'test_secret_for_unit_0123456789';
import { describe, it, expect } from 'vitest';
import { canViewQuestion } from '../../src/utils/questionAccess.js';

function fakeDb(rows) {
  const calls = [];
  return {
    _calls: calls,
    async execute(sql, params = []) {
      calls.push({ sql: sql.trim(), params });
      return [rows];
    },
  };
}

describe('canViewQuestion', () => {
  it('可见命中 → true，且按 questions/:id 同参数序 [id, 5×userId] 传参', async () => {
    const db = fakeDb([{ ok: 1 }]);
    const ok = await canViewQuestion(db, 42, 7);
    expect(ok).toBe(true);
    expect(db._calls[0].params).toEqual([42, 7, 7, 7, 7, 7]);
    const sql = db._calls[0].sql;
    expect(sql).toMatch(/deleted_at IS NULL/);
    expect(sql).toMatch(/subject_subscriptions/);
    expect(sql).toMatch(/share_scope = 'all'/);
    expect(sql).toMatch(/share_scope = 'students'/);
    expect(sql).toMatch(/subject_student_access/);
  });

  it('不可见 / 不存在 / 软删 → false', async () => {
    const db = fakeDb([]);
    const ok = await canViewQuestion(db, 42, 7);
    expect(ok).toBe(false);
  });
});
