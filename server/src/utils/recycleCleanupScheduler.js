/**
 * 回收站过期清理后台调度器（FR-107）。
 *
 * 周期物理删除「软删超过 retentionDays（默认 30 天）且未被考试引用」的题目；
 * question_versions 由 FK ON DELETE CASCADE 自动级联清理。
 *
 * 沿用 examSweepScheduler 的 setInterval + MySQL GET_LOCK 单例守卫范式
 * （PRD §4.2「所有周期任务必须带锁」，单机防自重入、多实例防重复）。
 */
import pool from '../db.js';
import { purgeExpiredDeleted } from './questionLifecycle.js';
import log from './logger.js';

const LOCK_NAME = 'recycle_bin_cleanup';
// 清理不必频繁：默认每 6 小时一次 tick（30 天粒度下绰绰有余），可用 RECYCLE_CLEANUP_INTERVAL_MS 覆盖
const TICK_MS = Number(process.env.RECYCLE_CLEANUP_INTERVAL_MS || 6 * 60 * 60 * 1000);
const RETENTION_DAYS = Number(process.env.RECYCLE_RETENTION_DAYS || 30);
const BATCH_SIZE = Number(process.env.RECYCLE_CLEANUP_BATCH_SIZE || 100);
const FIRST_TICK_JITTER_MAX_MS = 20000;

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

    const { deleted, skipped } = await purgeExpiredDeleted(pool, { retentionDays: RETENTION_DAYS, batchSize: BATCH_SIZE });
    if (deleted > 0 || skipped > 0) {
      log.info({ msg: 'recycle_cleanup_tick', deleted, skipped, retentionDays: RETENTION_DAYS }, '回收站过期清理完成');
    }
  } catch (err) {
    log.error({ err }, 'recycle_cleanup_tick 执行失败');
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

/** 启动清理调度器（进程内幂等，重复调用只生效一次）。 */
export function startRecycleCleanupScheduler() {
  if (startTimeoutRef || intervalRef) return { stop: stopRecycleCleanupScheduler };

  const jitter = Math.floor(Math.random() * FIRST_TICK_JITTER_MAX_MS);
  log.info({ msg: 'recycle_cleanup_scheduler_start', tickMs: TICK_MS, retentionDays: RETENTION_DAYS, jitterMs: jitter }, '回收站清理调度器已启动');

  startTimeoutRef = setTimeout(() => {
    startTimeoutRef = null;
    runTick();
    intervalRef = setInterval(runTick, TICK_MS);
    if (intervalRef && intervalRef.unref) intervalRef.unref();
  }, jitter);
  if (startTimeoutRef && startTimeoutRef.unref) startTimeoutRef.unref();

  return { stop: stopRecycleCleanupScheduler };
}

/** 停止调度器（SIGTERM 优雅退出用）。 */
export function stopRecycleCleanupScheduler() {
  if (startTimeoutRef) clearTimeout(startTimeoutRef);
  if (intervalRef) clearInterval(intervalRef);
  startTimeoutRef = null;
  intervalRef = null;
}
