/**
 * storage_usage 存储用量扫描后台调度器。
 *
 * 职责：周期性扫描 uploads/user_{id}/ 目录汇总各租户磁盘用量，UPSERT storage_usage，
 * 达阈值发告警通知 / 置熔断标记（逻辑见 storageUsageService.runStorageScan）。
 *
 * 范式：沿用 examSweepScheduler / recycleCleanupScheduler 的 setInterval + MySQL GET_LOCK 非阻塞单例守卫。
 */
import pool from '../db.js';
import log from './logger.js';
import { runStorageScan } from './storageUsageService.js';
import { uploadsRoot } from '../routes/upload.js';

const LOCK_NAME = 'storage_usage_poll';
// 默认每 6 小时一次 tick（磁盘用量变化不频繁），可用 STORAGE_USAGE_INTERVAL_MS 覆盖
const TICK_MS = Number(process.env.STORAGE_USAGE_INTERVAL_MS || 6 * 60 * 60 * 1000);
const FIRST_TICK_JITTER_MAX_MS = 30000;

let startTimeoutRef = null;
let intervalRef = null;
let running = false;

async function runTick() {
  if (running) return;
  running = true;

  let lockConn = null;
  let held = false;
  try {
    lockConn = await pool.getConnection();
    const [lockRows] = await lockConn.execute(`SELECT GET_LOCK('${LOCK_NAME}', 0) AS got`);
    held = Number(lockRows[0] ? lockRows[0].got : 0) === 1;
    if (!held) return; // 他实例持有锁

    await runStorageScan(pool, { uploadsRoot });
  } catch (err) {
    log.error({ err }, 'storage_usage_tick 执行失败');
  } finally {
    if (lockConn) {
      try {
        if (held) await lockConn.execute(`SELECT RELEASE_LOCK('${LOCK_NAME}')`);
      } catch (e) {
        log.error({ err: e }, 'RELEASE_LOCK 失败');
      }
      lockConn.release();
    }
    running = false;
  }
}

/** 启动存储用量调度器（进程内幂等，重复调用只生效一次）。 */
export function startStorageUsageScheduler() {
  if (startTimeoutRef || intervalRef) return { stop: stopStorageUsageScheduler };

  const jitter = Math.floor(Math.random() * FIRST_TICK_JITTER_MAX_MS);
  log.info({ msg: 'storage_usage_scheduler_start', tickMs: TICK_MS, jitterMs: jitter }, '存储用量调度器已启动');

  startTimeoutRef = setTimeout(() => {
    startTimeoutRef = null;
    runTick();
    intervalRef = setInterval(runTick, TICK_MS);
    if (intervalRef && intervalRef.unref) intervalRef.unref();
  }, jitter);
  if (startTimeoutRef && startTimeoutRef.unref) startTimeoutRef.unref();

  return { stop: stopStorageUsageScheduler };
}

/** 停止调度器（SIGTERM 优雅退出用）。 */
export function stopStorageUsageScheduler() {
  if (startTimeoutRef) clearTimeout(startTimeoutRef);
  if (intervalRef) clearInterval(intervalRef);
  startTimeoutRef = null;
  intervalRef = null;
}
