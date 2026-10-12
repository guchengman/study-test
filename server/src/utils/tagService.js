/**
 * FR-108 知识点标签体系核心逻辑（标签树 CRUD + 题目绑定）。
 *
 * 设计：
 *   - db 依赖注入（默认 pool），沿用 questionLifecycle.js 的可测范式。
 *   - 标签树三级：level 1=科目 2=章节 3=知识点；parent_id 指向本表。
 *   - question_tag_map 联合主键(question_id, tag_id)，级联删除。
 *   - org_id 写入即赋值、查询不过滤（S0 约定）。
 */
import pool from '../db.js';

/**
 * 获取标签树（扁平列表，前端/调用方自行组装树）。
 * @param {object} db
 * @param {number|null} orgId - null 则返回所有
 * @returns {Promise<Array<{id,name,parent_id,level}>>}
 */
export async function listTags(db = pool, orgId = null) {
  let sql = 'SELECT id, org_id, name, parent_id, level, created_at FROM question_tags';
  const params = [];
  if (orgId !== null) {
    sql += ' WHERE org_id = ?';
    params.push(orgId);
  }
  sql += ' ORDER BY level ASC, name ASC';
  const [rows] = await db.execute(sql, params);
  return rows;
}

/**
 * 创建标签（应用层去重：MySQL UNIQUE 不约束 NULL）。
 * @param {object} db
 * @param {{name: string, parent_id?: number|null, level: number, org_id?: number|null}} opts
 * @returns {Promise<{id: number}>}
 */
export async function createTag(db = pool, { name, parent_id = null, level, org_id = null }) {
  // 应用层去重检查
  let checkSql = 'SELECT id FROM question_tags WHERE name = ? AND level = ?';
  const checkParams = [name, level];
  if (parent_id !== null) {
    checkSql += ' AND parent_id = ?';
    checkParams.push(parent_id);
  } else {
    checkSql += ' AND parent_id IS NULL';
  }
  if (org_id !== null) {
    checkSql += ' AND org_id = ?';
    checkParams.push(org_id);
  } else {
    checkSql += ' AND org_id IS NULL';
  }
  const [existing] = await db.execute(checkSql, checkParams);
  if (existing.length > 0) {
    const err = new Error('duplicate');
    err.code = 'ER_DUP_ENTRY';
    throw err;
  }
  const [result] = await db.execute(
    'INSERT INTO question_tags (name, parent_id, level, org_id) VALUES (?, ?, ?, ?)',
    [name, parent_id, level, org_id]
  );
  return { id: result.insertId };
}

/**
 * 重命名标签。
 * @param {object} db
 * @param {number} tagId
 * @param {string} newName
 * @returns {Promise<boolean>} 是否成功（affectedRows > 0）
 */
export async function renameTag(db = pool, tagId, newName) {
  const [result] = await db.execute(
    'UPDATE question_tags SET name = ? WHERE id = ?',
    [newName, tagId]
  );
  return result.affectedRows > 0;
}

/**
 * 删除标签（级联清 map + 子标签 parent_id 置 NULL）。
 * @param {object} db
 * @param {number} tagId
 * @returns {Promise<boolean>}
 */
export async function deleteTag(db = pool, tagId) {
  // 先将子标签提升一级（parent_id 指向被删节点的改为 NULL）
  await db.execute(
    'UPDATE question_tags SET parent_id = NULL, level = 1 WHERE parent_id = ?',
    [tagId]
  );
  const [result] = await db.execute(
    'DELETE FROM question_tags WHERE id = ?',
    [tagId]
  );
  return result.affectedRows > 0;
}

/**
 * 为题目绑定标签（幂等 INSERT IGNORE）。
 * @param {object} db
 * @param {number} questionId
 * @param {number[]} tagIds
 * @returns {Promise<number>} 实际新增绑定数
 */
export async function bindTags(db = pool, questionId, tagIds) {
  if (!tagIds || tagIds.length === 0) return 0;
  let added = 0;
  for (const tagId of tagIds) {
    const [result] = await db.execute(
      'INSERT IGNORE INTO question_tag_map (question_id, tag_id) VALUES (?, ?)',
      [questionId, tagId]
    );
    added += result.affectedRows;
  }
  return added;
}

/**
 * 解绑单个标签。
 * @param {object} db
 * @param {number} questionId
 * @param {number} tagId
 * @returns {Promise<boolean>}
 */
export async function unbindTag(db = pool, questionId, tagId) {
  const [result] = await db.execute(
    'DELETE FROM question_tag_map WHERE question_id = ? AND tag_id = ?',
    [questionId, tagId]
  );
  return result.affectedRows > 0;
}

/**
 * 获取题目的所有标签。
 * @param {object} db
 * @param {number} questionId
 * @returns {Promise<Array<{id,name,level}>>}
 */
export async function getTagsForQuestion(db = pool, questionId) {
  const [rows] = await db.execute(
    `SELECT t.id, t.name, t.level, t.parent_id
     FROM question_tags t
     JOIN question_tag_map m ON m.tag_id = t.id
     WHERE m.question_id = ?
     ORDER BY t.level, t.name`,
    [questionId]
  );
  return rows;
}

/**
 * 按标签获取题目 ID 列表。
 * @param {object} db
 * @param {number} tagId
 * @returns {Promise<number[]>}
 */
export async function getQuestionsByTag(db = pool, tagId) {
  const [rows] = await db.execute(
    'SELECT question_id FROM question_tag_map WHERE tag_id = ?',
    [tagId]
  );
  return rows.map((r) => r.question_id);
}
