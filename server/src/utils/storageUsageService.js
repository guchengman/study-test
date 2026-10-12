/**
 * storage_usage 存储用量统计与告警核心逻辑。
 *
 * 设计：
 *   - db / fs 依赖注入（默认 pool / node fs），沿用可测范式（单测 mock fs.readdirSync）。
 *   - 扫描 uploads/user_<id>/ 目录，按 user 汇总字节与文件数 → 解析其 PERSONAL 租户 org。
 *   - UPSERT storage_usage（UNIQUE org_id）。
 *   - 对比配额（默认 5GB，env STORAGE_QUOTA_BYTES 覆盖；FR-606 落地后改读 quotas 表）：
 *       ≥80% → 站内通知 type='storage_alert'（24h 内不重复）；
 *       ≥95% → 置 circuit_broken=1（供 FR-606 checkQuota 读此返回 429），否则 0。
 *   - fs / path 注入便于单测脱离真实文件系统。
 */
import fs from 'fs';
import path from 'path';
import pool from '../db.js';
import log from './logger.js';
import { resolvePersonalOrgId } from './personalOrg.js';
import { createNotification } from './notificationService.js';

/** 默认配额 5GB */
export const DEFAULT_QUOTA_BYTES = 5 * 1024 * 1024 * 1024;
/** 告警阈值 */
export const WARN_RATIO = 0.80;
/** 熔断阈值 */
export const CRITICAL_RATIO = 0.95;

const USER_DIR_RE = /^user_(\d+)$/;

/**
 * 扫描上传根目录，返回 userId → {bytes, count} 映射（纯函数，fs 可注入）。
 * @param {string} uploadsRoot
 * @param {object} fsImpl
 * @returns {Map<number,{bytes:number,count:number}>}
 */
export function scanUserDirs(uploadsRoot, fsImpl = fs) {
  const result = new Map();
  let entries = [];
  try {
    entries = fsImpl.readdirSync(uploadsRoot);
  } catch {
    return result; // 目录不存在：返回空
  }
  for (const name of entries) {
    const m = USER_DIR_RE.exec(name);
    if (!m) continue;
    const userId = Number(m[1]);
    const dir = path.join(uploadsRoot, name);
    let files = [];
    try {
      files = fsImpl.readdirSync(dir);
    } catch {
      continue;
    }
    let bytes = 0;
    let count = 0;
    for (const f of files) {
      try {
        const st = fsImpl.statSync(path.join(dir, f));
        if (st.isFile()) {
          bytes += st.size;
          count += 1;
        }
      } catch {
        /* 忽略不可 stat 的文件 */
      }
    }
    result.set(userId, { bytes, count });
  }
  return result;
}

/**
 * UPSERT 某 org 的存储用量。
 * @param {object} db
 */
export async function upsertStorageUsage(db = pool, orgId, bytesUsed, fileCount) {
  await db.execute(
    `INSERT INTO storage_usage (org_id, bytes_used, file_count)
     VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE bytes_used = VALUES(bytes_used), file_count = VALUES(file_count), updated_at = NOW()`,
    [orgId, bytesUsed, fileCount]
  );
}

/**
 * 设置/清除熔断标记。
 * @param {object} db
 */
export async function setCircuitBroken(db = pool, orgId, broken) {
  await db.execute('UPDATE storage_usage SET circuit_broken = ? WHERE org_id = ?', [broken ? 1 : 0, orgId]);
}

/**
 * 判断是否需要发告警（24h 内无同类告警才发），并发送。
 * @returns {Promise<boolean>} 是否实际发送
 */
export async function maybeSendAlert(db = pool, userId, orgId, bytesUsed, quotaBytes, pct) {
  const [recent] = await db.execute(
    `SELECT id FROM notifications
     WHERE user_id = ? AND type = 'storage_alert' AND created_at > DATE_SUB(NOW(), INTERVAL 1 DAY)
     LIMIT 1`,
    [userId]
  );
  if (recent.length > 0) return false;
  const pctText = Math.round(pct * 100);
  await createNotification(db, {
    user_id: userId,
    org_id: orgId,
    type: 'storage_alert',
    title: `存储用量已达 ${pctText}%（${formatMB(bytesUsed)} / ${formatMB(quotaBytes)}）`,
    payload: { bytes_used: bytesUsed, quota_bytes: quotaBytes, ratio: pctText / 100 },
  });
  return true;
}

/** 字节转 MB（1 位小数），用于标题展示 */
function formatMB(bytes) {
  return (bytes / (1024 * 1024)).toFixed(1) + 'MB';
}

/**
 * 编排一次全量扫描：scan → 逐 org UPSERT → 阈值告警 / 熔断。
 * @param {object} db
 * @param {{uploadsRoot: string, fsImpl?: object, quotaBytes?: number}} opts
 * @returns {Promise<{users:number, alerts:number, broken:number}>}
 */
export async function runStorageScan(db = pool, { uploadsRoot, fsImpl = fs, quotaBytes = Number(process.env.STORAGE_QUOTA_BYTES) || DEFAULT_QUOTA_BYTES } = {}) {
  const scan = scanUserDirs(uploadsRoot, fsImpl);
  const summary = { users: 0, alerts: 0, broken: 0 };
  for (const [userId, { bytes, count }] of scan) {
    const orgId = await resolvePersonalOrgId(db, userId);
    if (orgId == null) continue; // 无个人租户：跳过（历史容错）
    summary.users += 1;
    await upsertStorageUsage(db, orgId, bytes, count);
    const pct = quotaBytes > 0 ? bytes / quotaBytes : 0;
    const broken = pct >= CRITICAL_RATIO;
    await setCircuitBroken(db, orgId, broken);
    if (broken) summary.broken += 1;
    if (pct >= WARN_RATIO) {
      const sent = await maybeSendAlert(db, userId, orgId, bytes, quotaBytes, pct);
      if (sent) summary.alerts += 1;
    }
  }
  log.info({ msg: 'storage_scan_done', ...summary }, '存储用量扫描完成');
  return summary;
}

/**
 * 平台管理员视图：全部租户用量（含 org 名与熔断标记）。
 * @param {object} db
 */
export async function listAllUsage(db = pool) {
  const [rows] = await db.execute(
    `SELECT su.org_id, o.name AS org_name, su.bytes_used, su.file_count, su.circuit_broken, su.updated_at
     FROM storage_usage su
     LEFT JOIN organizations o ON o.id = su.org_id
     ORDER BY su.bytes_used DESC`
  );
  return rows;
}
