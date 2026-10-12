/**
 * FR-301/302 学情日聚合后台调度器。
 *
 * 职责：周期性把前一业务日（UTC+8）的 exam_attempts 明细聚合进 stats_daily（逻辑见 statsService.aggregateForDate）。
 * 范式：沿用 storageUsageScheduler 的 setInterval + MySQL GET_LOCK 非阻塞单例守卫。
 */
import pool from '../db.js';
import log from './logger.js';
import { aggregateForDate, yesterdayStr } from './statsService.js';

const LOCK_NAME = 'stats_daily_agg';
// 默认每 24 小时一次 tick（日粒度预聚合），可用 STATS_AGG_INTERVAL_MS 覆盖
const TICK_MS = Number(process.env.STATS_AGG_INTERVAL_MS || 24 * 60 * 60 * 1000);
const FIRST_TICK_JITTER_MAX_MS = 60000;

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

    await aggregateForDate(pool, yesterdayStr());
  } catch (err) {
    log.error({ err }, 'stats_agg_tick 执行失败');
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

/** 启动学情聚合调度器（进程内幂等，重复调用只生效一次）。 */
export function startStatsAggScheduler() {
  if (startTimeoutRef || intervalRef) return { stop: stopStatsAggScheduler };

  const jitter = Math.floor(Math.random() * FIRST_TICK_JITTER_MAX_MS);
  log.info({ msg: 'stats_agg_scheduler_start', tickMs: TICK_MS, jitterMs: jitter }, '学情日聚合调度器已启动');

  startTimeoutRef = setTimeout(() => {
    startTimeoutRef = null;
    runTick();
    intervalRef = setInterval(runTick, TICK_MS);
    if (intervalRef && intervalRef.unref) intervalRef.unref();
  }, jitter);
  if (startTimeoutRef && startTimeoutRef.unref) startTimeoutRef.unref();

  return { stop: stopStatsAggScheduler };
}

/** 停止调度器（优雅退出用）。 */
export function stopStatsAggScheduler() {
  if (startTimeoutRef) clearTimeout(startTimeoutRef);
  if (intervalRef) clearInterval(intervalRef);
  startTimeoutRef = null;
  intervalRef = null;
}
