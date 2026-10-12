/**
 * FR-501 Streak 断流检测后台调度器。
 *
 * 职责：周期性检测「活跃停留在昨日之前且仍计数」的 streak 行，归零并下发 streak_break 通知
 *       （逻辑见 streakService.checkBroken）。
 * 范式：沿用 storageUsageScheduler / statsAggregationScheduler 的 setInterval + MySQL GET_LOCK 非阻塞单例守卫。
 */
import pool from '../db.js';
import log from './logger.js';
import { checkBroken } from './streakService.js';

const LOCK_NAME = 'streak_break_check';
// 默认每 6 小时一次 tick（跨日断流检测），可用 STREAK_CHECK_INTERVAL_MS 覆盖
const TICK_MS = Number(process.env.STREAK_CHECK_INTERVAL_MS || 6 * 60 * 60 * 1000);
const FIRST_TICK_JITTER_MAX_MS = 45000;

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

    await checkBroken(pool);
  } catch (err) {
    log.error({ err }, 'streak_break_tick 执行失败');
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

/** 启动 Streak 断流调度器（进程内幂等，重复调用只生效一次）。 */
export function startStreakBreakScheduler() {
  if (startTimeoutRef || intervalRef) return { stop: stopStreakBreakScheduler };

  const jitter = Math.floor(Math.random() * FIRST_TICK_JITTER_MAX_MS);
  log.info({ msg: 'streak_break_scheduler_start', tickMs: TICK_MS, jitterMs: jitter }, 'Streak 断流调度器已启动');

  startTimeoutRef = setTimeout(() => {
    startTimeoutRef = null;
    runTick();
    intervalRef = setInterval(runTick, TICK_MS);
    if (intervalRef && intervalRef.unref) intervalRef.unref();
  }, jitter);
  if (startTimeoutRef && startTimeoutRef.unref) startTimeoutRef.unref();

  return { stop: stopStreakBreakScheduler };
}

/** 停止调度器（优雅退出用）。 */
export function stopStreakBreakScheduler() {
  if (startTimeoutRef) clearTimeout(startTimeoutRef);
  if (intervalRef) clearInterval(intervalRef);
  startTimeoutRef = null;
  intervalRef = null;
}
