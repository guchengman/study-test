/**
 * 考试自动交卷后台调度器（FR-204）。
 *
 * 取代「读路径内嵌全卷同步 sweep」：改由本调度器周期性、带锁、分页地兜底收卷。
 * 沿用项目既有 setInterval 定时任务先例（index.js 百度 token 刷新），不引入 node-cron。
 *
 * 单例保证（PRD §4.2「所有周期任务必须带锁」）：
 *   - 每次 tick 先取一条专用连接执行 MySQL GET_LOCK('exam_auto_sweep', 0)（非阻塞）。
 *   - 返回 1 → 持有锁，执行分页收卷；返回 0/NULL → 他实例正持有或出错，跳过本 tick。
 *   - 单机阶段防自重入；未来 S4 多实例（共享 DB 命名锁）天然防重复收卷，无需改码。
 *   - GET_LOCK 为会话级：加锁与释放必须用同一连接。
 */
import pool from '../db.js';
import { sweepExpiredAttempts } from './examSweep.js';
import log from './logger.js';

const LOCK_NAME = 'exam_auto_sweep';
const TICK_MS = Number(process.env.EXAM_SWEEP_INTERVAL_MS || 60000);
const BATCH_SIZE = Number(process.env.EXAM_SWEEP_BATCH_SIZE || 50);
const MAX_ROWS_PER_TICK = Number(process.env.EXAM_SWEEP_MAX_ROWS || 200);
const FIRST_TICK_JITTER_MAX_MS = 15000;

let startTimeoutRef = null; // 首次延迟（抖动）句柄
let intervalRef = null; // 周期 tick 句柄
let running = false; // 防重叠：上一 tick 未完成则跳过本 tick

/** 执行一次收卷 tick（含 GET_LOCK 单例守卫与分页兜底）。 */
async function runTick() {
  if (running) return; // 上一轮仍在跑，跳过（避免同一进程内堆积）
  running = true;

  let lockConn = null;
  let held = false;
  try {
    lockConn = await pool.getConnection();
    const [lockRows] = await lockConn.execute(`SELECT GET_LOCK('${LOCK_NAME}', 0) AS got`);
    held = Number(lockRows[0] ? lockRows[0].got : 0) === 1;
    if (!held) {
      return; // 他实例持有锁：本 tick 交由持锁实例处理
    }

    const processed = await sweepExpiredAttempts(null, null, null, {
      batchSize: BATCH_SIZE,
      maxRows: MAX_ROWS_PER_TICK,
    });
    if (processed > 0) {
      log.info({ msg: 'exam_sweep_tick', processed }, '后台自动交卷完成');
    }
  } catch (err) {
    log.error({ err }, 'exam_sweep_tick 执行失败');
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

/**
 * 启动调度器（进程内幂等，重复调用只生效一次）。
 * 首次 tick 前加 0–15s 随机抖动，避免重启/多实例同刻踩踏。
 * @returns {{ stop: () => void }}
 */
export function startExamSweepScheduler() {
  if (startTimeoutRef || intervalRef) return { stop: stopExamSweepScheduler };

  const jitter = Math.floor(Math.random() * FIRST_TICK_JITTER_MAX_MS);
  log.info({ msg: 'exam_sweep_scheduler_start', tickMs: TICK_MS, jitterMs: jitter }, '自动交卷调度器已启动');

  startTimeoutRef = setTimeout(() => {
    startTimeoutRef = null;
    runTick();
    intervalRef = setInterval(runTick, TICK_MS);
    if (intervalRef && intervalRef.unref) intervalRef.unref();
  }, jitter);
  if (startTimeoutRef && startTimeoutRef.unref) startTimeoutRef.unref();

  return { stop: stopExamSweepScheduler };
}

/** 停止调度器（SIGTERM 优雅退出用）。 */
export function stopExamSweepScheduler() {
  if (startTimeoutRef) clearTimeout(startTimeoutRef);
  if (intervalRef) clearInterval(intervalRef);
  startTimeoutRef = null;
  intervalRef = null;
}
