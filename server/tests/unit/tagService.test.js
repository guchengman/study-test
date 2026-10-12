/**
 * FR-108 tagService 核心逻辑单测（标签树 CRUD + 题目绑定）。
 *
 * 策略：
 *   - db 依赖注入，按 SQL 子串路由假 pool（沿用 exportService.test 范式）。
 *   - 不涉及文件 I/O 或外部服务，纯数据库操作。
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../src/utils/logger.js', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import {
  listTags,
  createTag,
  renameTag,
  deleteTag,
  bindTags,
  unbindTag,
  getTagsForQuestion,
  getQuestionsByTag,
} from '../../src/utils/tagService.js';

/** 按 SQL 子串路由的假 db（沿用 exportService.test 范式：plain async + 自定义 calls 数组） */
function makeFakeDb(cfg = {}) {
  const {
    insertId = 1,
    tagRows = [],
    affected = 1,
    questionTagRows = [],
    mapRows = [],
  } = cfg;

  const calls = [];
  const db = {
    execute: async (sql, params = []) => {
      const trimmed = sql.trim();
      calls.push({ sql: trimmed, params });

      // getTagsForQuestion (SELECT with JOIN) — 优先匹配
      if (/^SELECT.*FROM question_tags.*JOIN question_tag_map/is.test(trimmed)) {
        return [questionTagRows];
      }
      // duplicate check in createTag (SELECT id FROM question_tags WHERE name = ?)
      if (/^SELECT id FROM question_tags WHERE/i.test(trimmed)) {
        return [[]]; // always report "no duplicate"
      }
      // SELECT listTags
      if (/^SELECT.*FROM question_tags/i.test(trimmed)) {
        return [tagRows];
      }
      // INSERT tag
      if (/^INSERT INTO question_tags/i.test(trimmed)) {
        return [{ insertId, affectedRows: 1 }];
      }
      // UPDATE rename
      if (/^UPDATE question_tags SET name/i.test(trimmed)) {
        return [{ affectedRows: affected }];
      }
      // UPDATE parent_id (promote children)
      if (/^UPDATE question_tags SET parent_id/i.test(trimmed)) {
        return [{ affectedRows: 0 }];
      }
      // DELETE tag
      if (/^DELETE FROM question_tags/i.test(trimmed)) {
        return [{ affectedRows: affected }];
      }
      // INSERT IGNORE bindTags
      if (/^INSERT IGNORE INTO question_tag_map/i.test(trimmed)) {
        return [{ affectedRows: affected }];
      }
      // DELETE unbind
      if (/^DELETE FROM question_tag_map/i.test(trimmed)) {
        return [{ affectedRows: affected }];
      }
      // SELECT question_ids by tag
      if (/^SELECT question_id FROM question_tag_map/i.test(trimmed)) {
        return [mapRows];
      }
      return [[]];
    },
    _calls: calls,
  };
  return db;
}

describe('tagService', () => {
  describe('listTags', () => {
    it('returns all tags when orgId is null', async () => {
      const tags = [{ id: 1, name: 'Math', level: 1, parent_id: null }];
      const db = makeFakeDb({ tagRows: tags });
      const result = await listTags(db, null);
      expect(result).toEqual(tags);
      expect(db._calls[0].sql).not.toMatch(/WHERE org_id/);
    });

    it('filters by orgId when provided', async () => {
      const db = makeFakeDb({ tagRows: [] });
      await listTags(db, 5);
      expect(db._calls[0].sql).toMatch(/WHERE org_id/);
      expect(db._calls[0].params).toEqual([5]);
    });
  });

  describe('createTag', () => {
    it('inserts and returns id', async () => {
      const db = makeFakeDb({ insertId: 99 });
      const result = await createTag(db, { name: 'Algebra', level: 2, parent_id: 1, org_id: 5 });
      expect(result).toEqual({ id: 99 });
      // _calls[0] = dup check SELECT, _calls[1] = INSERT
      expect(db._calls[1].sql).toMatch(/INSERT INTO question_tags/);
      expect(db._calls[1].params).toEqual(['Algebra', 1, 2, 5]);
    });

    it('handles null parent_id and org_id', async () => {
      const db = makeFakeDb({ insertId: 10 });
      const result = await createTag(db, { name: 'Root', level: 1 });
      expect(result).toEqual({ id: 10 });
      expect(db._calls[1].params).toEqual(['Root', null, 1, null]);
    });
  });

  describe('renameTag', () => {
    it('returns true on success', async () => {
      const db = makeFakeDb({ affected: 1 });
      const ok = await renameTag(db, 3, 'NewName');
      expect(ok).toBe(true);
      expect(db._calls[0].sql).toMatch(/UPDATE question_tags SET name/);
    });

    it('returns false when tag not found', async () => {
      const db = makeFakeDb({ affected: 0 });
      const ok = await renameTag(db, 999, 'X');
      expect(ok).toBe(false);
    });
  });

  describe('deleteTag', () => {
    it('promotes children then deletes', async () => {
      const db = makeFakeDb({ affected: 1 });
      const ok = await deleteTag(db, 7);
      expect(ok).toBe(true);
      // first call: UPDATE children
      expect(db._calls[0].sql).toMatch(/SET parent_id = NULL/);
      // second call: DELETE
      expect(db._calls[1].sql).toMatch(/DELETE FROM question_tags/);
    });

    it('returns false when not found', async () => {
      const db = makeFakeDb({ affected: 0 });
      const ok = await deleteTag(db, 999);
      expect(ok).toBe(false);
    });
  });

  describe('bindTags', () => {
    it('returns 0 for empty array', async () => {
      const db = makeFakeDb();
      const added = await bindTags(db, 1, []);
      expect(added).toBe(0);
    });

    it('inserts each tag_id and counts affected', async () => {
      const db = makeFakeDb({ affected: 1 });
      const added = await bindTags(db, 100, [1, 2, 3]);
      expect(added).toBe(3);
      expect(db._calls.length).toBe(3);
    });

    it('handles partial duplicates (affected=0 for existing)', async () => {
      let callIdx = 0;
      const db = {
        execute: async () => {
          callIdx++;
          return [{ affectedRows: callIdx === 2 ? 0 : 1 }];
        },
      };
      const added = await bindTags(db, 1, [10, 20, 30]);
      expect(added).toBe(2); // second was duplicate
    });
  });

  describe('unbindTag', () => {
    it('returns true when deleted', async () => {
      const db = makeFakeDb({ affected: 1 });
      const ok = await unbindTag(db, 5, 3);
      expect(ok).toBe(true);
      expect(db._calls[0].sql).toMatch(/DELETE FROM question_tag_map/);
    });

    it('returns false when not bound', async () => {
      const db = makeFakeDb({ affected: 0 });
      const ok = await unbindTag(db, 5, 99);
      expect(ok).toBe(false);
    });
  });

  describe('getTagsForQuestion', () => {
    it('returns joined tags', async () => {
      const rows = [{ id: 1, name: 'Math', level: 1, parent_id: null }];
      const db = makeFakeDb({ questionTagRows: rows });
      const result = await getTagsForQuestion(db, 42);
      expect(result).toEqual(rows);
      expect(db._calls[0].params).toEqual([42]);
    });
  });

  describe('getQuestionsByTag', () => {
    it('returns question_id array', async () => {
      const db = makeFakeDb({ mapRows: [{ question_id: 10 }, { question_id: 20 }] });
      const ids = await getQuestionsByTag(db, 5);
      expect(ids).toEqual([10, 20]);
    });

    it('returns empty for no matches', async () => {
      const db = makeFakeDb({ mapRows: [] });
      const ids = await getQuestionsByTag(db, 99);
      expect(ids).toEqual([]);
    });
  });
});
