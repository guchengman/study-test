/**
 * FR-206 导出任务兜底调度器。
 *
 * 职责：轮询 status='queued' 的 export_jobs（若进程崩溃 / 快速路径失败导致未被处理），
 * 逐条调用 processJob 认领并执行。
 *
 * 范式：沿用 examSweepScheduler / recycleCleanupScheduler 的 setInterval + MySQL GET_LOCK 非阻塞单例守卫。
 */
import pool from '../db.js';
import { findQueuedJobs, processJob } from './exportService.js';
import log from './logger.js';

const LOCK_NAME = 'export_job_worker';
const TICK_MS = Number(process.env.EXPORT_TICK_MS || 30_000); // 30s（兜底，主路径在 route 即时处理）
const BATCH_LIMIT = Number(process.env.EXPORT_BATCH || 5);
const FIRST_TICK_JITTER_MAX_MS = 10_000;

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

    const ids = await findQueuedJobs(pool, { limit: BATCH_LIMIT });
    if (ids.length > 0) {
      let done = 0;
      let failed = 0;
      for (const id of ids) {
        const claimed = await processJob(pool, id);
        if (claimed) done++;
      }
      log.info({ msg: 'export_job_tick', queued: ids.length, processed: done }, '导出调度器 tick');
    }
  } catch (err) {
    log.error({ err }, 'export_job_tick 执行失败');
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

/** 启动导出调度器（进程内幂等）。 */
export function startExportJobScheduler() {
  if (startTimeoutRef || intervalRef) return { stop: stopExportJobScheduler };

  const jitter = Math.floor(Math.random() * FIRST_TICK_JITTER_MAX_MS);
  log.info({ msg: 'export_job_scheduler_start', tickMs: TICK_MS, jitterMs: jitter }, '导出任务调度器已启动');

  startTimeoutRef = setTimeout(() => {
    startTimeoutRef = null;
    runTick();
    intervalRef = setInterval(runTick, TICK_MS);
    if (intervalRef && intervalRef.unref) intervalRef.unref();
  }, jitter);
  if (startTimeoutRef && startTimeoutRef.unref) startTimeoutRef.unref();

  return { stop: stopExportJobScheduler };
}

/** 停止调度器（SIGTERM 优雅退出用）。 */
export function stopExportJobScheduler() {
  if (startTimeoutRef) clearTimeout(startTimeoutRef);
  if (intervalRef) clearInterval(intervalRef);
  startTimeoutRef = null;
  intervalRef = null;
}
