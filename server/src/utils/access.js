/**
 * 科目可见性 / 可管理性判定（重构自 practice.js 的题目可见性 SQL，避免重复）。
 *
 * 复用 practice.js 的科目可见性口径：
 *   可见 = 科目创建者是自己
 *        OR 已订阅该科目（subject_subscriptions approved）
 *        OR share_scope='all' 且科目创建者是当前用户的老师
 *        OR share_scope='students' 且科目创建者是当前用户的老师
 *           且（科目无白名单 或 当前用户在 subject_student_access 白名单）
 */
import pool from '../db.js';

/**
 * 判断某科目对指定用户是否可见（可参加）。
 * @param {number} userId 用户 ID
 * @param {string} subjectId 科目 ID
 * @returns {Promise<boolean>}
 */
export async function canAccessSubject(userId, subjectId) {
  const [rows] = await pool.execute(
    `SELECT 1 FROM subjects s WHERE s.id = ? AND (
       s.created_by = ?
       OR s.id IN (SELECT ss.subject_id FROM subject_subscriptions ss WHERE ss.user_id = ? AND ss.status = 'approved')
       OR (s.share_scope = 'all' AND s.created_by IN (SELECT teacher_id FROM users WHERE id = ?))
       OR (s.share_scope = 'students' AND s.created_by IN (SELECT teacher_id FROM users WHERE id = ?)
         AND (NOT EXISTS (SELECT 1 FROM subject_student_access sa WHERE sa.subject_id = s.id)
              OR EXISTS (SELECT 1 FROM subject_student_access sa WHERE sa.subject_id = s.id AND sa.student_user_id = ?)))
     )`,
    [subjectId, userId, userId, userId, userId, userId]
  );
  return rows.length > 0;
}

/**
 * 判断指定用户是否可管理某科目（出题 / 组卷）。
 * 可管理 = 科目创建者是自己 OR 用户是 admin/teacher。
 * @param {number} userId 用户 ID
 * @param {string} subjectId 科目 ID
 * @returns {Promise<boolean>}
 */
export async function canManageSubject(userId, subjectId) {
  const [rows] = await pool.execute(
    `SELECT 1 FROM subjects s WHERE s.id = ? AND (
       s.created_by = ?
       OR EXISTS (SELECT 1 FROM users u WHERE u.id = ? AND u.role IN ('admin','teacher'))
     )`,
    [subjectId, userId, userId]
  );
  return rows.length > 0;
}

export default { canAccessSubject, canManageSubject };
