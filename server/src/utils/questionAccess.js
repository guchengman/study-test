/**
 * 题目可见性谓词（单一事实源，镜像 GET /questions/:id 的判定）。
 *
 * 供 tags 等"读某题的子资源"端点复用：谁能看到这道题，就能看到它的标签等附属信息。
 * 规则：属主 OR 已订阅(approved) OR share_scope='all'(题主为该用户的 teacher)
 *       OR share_scope='students'(题主为 teacher 且受 subject_student_access 白名单约束)。
 * 无 admin 旁路 —— 与 questions/:id 读可见保持一致。
 */
import pool from '../db.js';

/**
 * @param {object} db 注入的 pool/conn（默认全局 pool）
 * @param {number|string} questionId
 * @param {number} userId
 * @returns {Promise<boolean>} 该用户是否可见此（未软删）题目
 */
export async function canViewQuestion(db = pool, questionId, userId) {
  const [rows] = await db.execute(
    `SELECT 1 AS ok FROM questions q
     WHERE q.id = ? AND q.deleted_at IS NULL AND (
       q.created_by = ?
       OR q.subject_id IN (SELECT ss.subject_id FROM subject_subscriptions ss WHERE ss.user_id = ? AND ss.status = 'approved')
       OR q.subject_id IN (SELECT s.id FROM subjects s WHERE s.share_scope = 'all' AND s.created_by IN (SELECT teacher_id FROM users WHERE id = ?))
       OR q.subject_id IN (SELECT s.id FROM subjects s WHERE s.share_scope = 'students' AND s.created_by IN (SELECT teacher_id FROM users WHERE id = ?)
         AND (NOT EXISTS (SELECT 1 FROM subject_student_access sa WHERE sa.subject_id = s.id) OR EXISTS (SELECT 1 FROM subject_student_access sa WHERE sa.subject_id = s.id AND sa.student_user_id = ?)))
     ) LIMIT 1`,
    [questionId, userId, userId, userId, userId, userId]
  );
  return rows.length > 0;
}
