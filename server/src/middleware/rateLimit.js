/**
 * 统一限流中间件工厂（基于 express-rate-limit）
 * 用于 /api/questions、/api/subjects、/api/practice、/api/sync、/api/upload 等路由。
 */
import rateLimit from 'express-rate-limit';

/**
 * 创建限流中间件
 * @param {object} [opts]
 * @param {number} [opts.windowMs] 时间窗口（毫秒），默认 15 分钟
 * @param {number} [opts.max] 窗口内最大请求数
 * @param {string} [opts.message] 触发限流时返回的错误信息
 */
export function createLimiter({
  windowMs = 15 * 60 * 1000,
  max = 300,
  message = '请求过于频繁，请稍后再试',
} = {}) {
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: message },
  });
}

/** 通用 API 限流：15 分钟内每 IP 最多 300 次 */
export const apiLimiter = createLimiter({ max: 300, message: 'API 请求过于频繁，请稍后再试' });
