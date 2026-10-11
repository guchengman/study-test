/**
 * 结构化日志（P1-7 可观测性）：pino 单例
 *  - 生产：JSON 行输出到 stdout，由 pm2 / pm2-logrotate 落盘与轮转
 *  - 开发：pino-pretty 彩色单行（NODE_ENV=production 或 LOG_PRETTY=0 时自动关闭）
 *  - 级别：LOG_LEVEL（fatal|error|warn|info|debug|trace），默认 info
 * 注意：ESM import 提升导致本模块可能先于 index.js 的 dotenv.config() 执行，
 * 故自行兜底加载 server/.env（dotenv 不覆盖已有变量，重复加载无副作用）。
 */
import dotenv from 'dotenv';
import path from 'path';
import { existsSync } from 'fs';
import { fileURLToPath } from 'url';
import pino from 'pino';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.resolve(__dirname, '../../.env');
if (existsSync(envPath)) dotenv.config({ path: envPath });

const isProd = process.env.NODE_ENV === 'production';
const usePretty = !isProd && process.env.LOG_PRETTY !== '0' && !process.env.VITEST;

export const logger = pino(
  usePretty
    ? {
        level: process.env.LOG_LEVEL || 'info',
        transport: {
          target: 'pino-pretty',
          options: { colorize: true, translateTime: 'HH:MM:ss', ignore: 'pid,hostname,module' },
        },
      }
    : { level: process.env.LOG_LEVEL || 'info' },
);

/** 按模块创建子 logger：logger.child({ module: 'auth' }) 的快捷方式 */
export function childLogger(module) {
  return logger.child({ module });
}

export default logger;
