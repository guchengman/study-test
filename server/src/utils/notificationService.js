/**
 * FR-701/702 通知中心核心逻辑（站内通知创建/查询/已读 + 邮件投递）。
 *
 * 设计：
 *   - db 依赖注入（默认 pool），沿用 tagService.js 的可测范式。
 *   - createNotification：写 notifications + 自动 INSERT delivery(site, sent)。
 *   - 普通通知仅站内（site）；仅「管理员日汇总」「账号安全事件」经 dispatchEmail 发邮件。
 *   - 邮件复用 emailVerification.js 的 EmailJS REST fetch 模式，密钥仅存服务端。
 *   - org_id 写入即赋值、查询按 user_id 过滤（通知天然私有，非 org 维度）。
 */
import pool from '../db.js';
import log from './logger.js';

/** 通知类型白名单 */
export const NOTIFICATION_TYPES = ['exam_published', 'score_ready', 'storage_alert', 'streak_break', 'system'];

/**
 * 创建站内通知（自动写入 site 投递记录，状态 sent）。
 * @param {object} db
 * @param {{user_id:number, type:string, title:string, payload?:object|null, org_id?:number|null}} opts
 * @returns {Promise<{id:number}>}
 */
export async function createNotification(db = pool, { user_id, type, title, payload = null, org_id = null }) {
  const payloadJson = payload == null ? null : JSON.stringify(payload);
  const [result] = await db.execute(
    'INSERT INTO notifications (user_id, org_id, type, title, payload) VALUES (?, ?, ?, ?, ?)',
    [user_id, org_id, type, title, payloadJson]
  );
  const notificationId = result.insertId;
  // 站内通道视为即时送达
  await db.execute(
    "INSERT INTO notification_deliveries (notification_id, channel, status, sent_at) VALUES (?, 'site', 'sent', NOW())",
    [notificationId]
  );
  return { id: notificationId };
}

/**
 * 分页查询某用户的通知（可按未读过滤）。
 * @param {object} db
 * @param {number} userId
 * @param {{limit?:number, offset?:number, unreadOnly?:boolean}} opts
 * @returns {Promise<{rows:Array, total:number}>}
 */
export async function listNotifications(db = pool, userId, { limit = 20, offset = 0, unreadOnly = false } = {}) {
  const where = ['user_id = ?'];
  const params = [userId];
  if (unreadOnly) where.push('read_at IS NULL');
  const whereSql = where.join(' AND ');

  const [countRows] = await db.execute(
    `SELECT COUNT(*) AS total FROM notifications WHERE ${whereSql}`,
    params
  );
  const total = countRows[0].total;
  const [rows] = await db.execute(
    `SELECT id, user_id, type, title, payload, read_at, created_at
     FROM notifications WHERE ${whereSql}
     ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`,
    [...params, Number(limit), Number(offset)]
  );
  return { rows, total };
}

/**
 * 未读数。
 * @param {object} db
 * @param {number} userId
 * @returns {Promise<number>}
 */
export async function getUnreadCount(db = pool, userId) {
  const [rows] = await db.execute(
    'SELECT COUNT(*) AS cnt FROM notifications WHERE user_id = ? AND read_at IS NULL',
    [userId]
  );
  return rows[0].cnt;
}

/**
 * 标记单条已读（仅限本人、且当前未读）。
 * @param {object} db
 * @param {number} notificationId
 * @param {number} userId
 * @returns {Promise<boolean>} 是否更新成功
 */
export async function markRead(db = pool, notificationId, userId) {
  const [result] = await db.execute(
    'UPDATE notifications SET read_at = NOW() WHERE id = ? AND user_id = ? AND read_at IS NULL',
    [notificationId, userId]
  );
  return result.affectedRows > 0;
}

/**
 * 全部标记已读。
 * @param {object} db
 * @param {number} userId
 * @returns {Promise<number>} 受影响行数
 */
export async function markAllRead(db = pool, userId) {
  const [result] = await db.execute(
    'UPDATE notifications SET read_at = NOW() WHERE user_id = ? AND read_at IS NULL',
    [userId]
  );
  return result.affectedRows;
}

/** 邮件投递配置是否齐备（专用模板缺省时回退到通用验证码模板 ID） */
function isEmailConfigured() {
  return !!(process.env.EMAILJS_SERVICE_ID && process.env.EMAILJS_PUBLIC_KEY
    && (process.env.EMAILJS_TEMPLATE_NOTIFICATION || process.env.EMAILJS_TEMPLATE_ID));
}

/**
 * 派发邮件通知（仅用于管理员日汇总 / 账号安全事件；普通通知不走此路径）。
 * 读 notifications + users.email，创建 email 投递记录并调 EmailJS REST。
 * 失败仅置投递记录 status=failed 并累加 retry_count，不抛出（不阻断主流程）。
 * @param {object} db
 * @param {number} notificationId
 * @returns {Promise<{sent:boolean, reason?:string}>}
 */
export async function dispatchEmail(db = pool, notificationId) {
  if (!isEmailConfigured()) {
    return { sent: false, reason: 'not_configured' };
  }
  const [rows] = await db.execute(
    `SELECT n.title, n.type, u.email
     FROM notifications n JOIN users u ON u.id = n.user_id
     WHERE n.id = ?`,
    [notificationId]
  );
  if (rows.length === 0) return { sent: false, reason: 'not_found' };
  const { title, type, email } = rows[0];
  if (!email) return { sent: false, reason: 'no_email' };

  // 建立/复用 email 投递记录（pending）
  await db.execute(
    `INSERT INTO notification_deliveries (notification_id, channel, status)
     VALUES (?, 'email', 'pending')
     ON DUPLICATE KEY UPDATE status = 'pending'`,
    [notificationId]
  );

  const { EMAILJS_SERVICE_ID, EMAILJS_PUBLIC_KEY } = process.env;
  const templateId = process.env.EMAILJS_TEMPLATE_NOTIFICATION || process.env.EMAILJS_TEMPLATE_ID;
  try {
    const resp = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        service_id: EMAILJS_SERVICE_ID,
        template_id: templateId,
        user_id: EMAILJS_PUBLIC_KEY,
        template_params: { to_email: email, subject: '站内通知', message: title, notification_type: type, from_name: 'Study-test' },
      }),
    });
    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      await db.execute(
        `UPDATE notification_deliveries SET status = 'failed', retry_count = retry_count + 1
         WHERE notification_id = ? AND channel = 'email'`,
        [notificationId]
      );
      log.warn(`[notification] 邮件派发失败(${resp.status}): ${text.slice(0, 120)}`);
      return { sent: false, reason: 'send_failed' };
    }
    await db.execute(
      `UPDATE notification_deliveries SET status = 'sent', sent_at = NOW()
       WHERE notification_id = ? AND channel = 'email'`,
      [notificationId]
    );
    return { sent: true };
  } catch (err) {
    await db.execute(
      `UPDATE notification_deliveries SET status = 'failed', retry_count = retry_count + 1
       WHERE notification_id = ? AND channel = 'email'`,
      [notificationId]
    );
    log.error({ err }, '[notification] 邮件派发异常');
    return { sent: false, reason: 'exception' };
  }
}
