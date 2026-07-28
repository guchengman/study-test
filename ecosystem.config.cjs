/**
 * PM2 进程管理配置（Ecosystem File）
 *
 * 设计要点（可移植）：
 * - 用 __dirname 推导仓库根绝对路径，不再硬编码 Windows 路径，Windows / Linux / macOS 通用
 * - 一个命令同时拉起前端（Vite）与后端（Node 服务）
 * - 百度 OCR 密钥通过 env 注入【后端进程】：后端 server/src/index.js 实际消费 server/.env，
 *   此处从部署环境（PM2 / CI / shell export）继承，便于统一注入真实密钥
 *
 * 部署：
 *   pm2 start ecosystem.config.cjs
 *   pm2 save            # 开机自启持久化
 *
 * ⚠️ 端口冲突提醒：
 *   若后端已在以其他方式（systemd / 手动 node server/src/index.js）监听 3100，
 *   请勿重复启动下方 backend app，否则端口冲突。此时可删除 backend 这一段。
 */

const path = require('path')
const ROOT = __dirname // ecosystem.config.cjs 所在目录 = 仓库根（跨平台绝对路径）

module.exports = {
  apps: [
    {
      name: 'study-quiz-frontend',
      script: path.join(ROOT, 'node_modules/vite/bin/vite.js'),
      args: '--port=5173 --host',
      cwd: ROOT,
      watch: false,
      autorestart: true,
      max_memory_restart: '500M',
    },
    {
      name: 'study-quiz-backend',
      script: path.join(ROOT, 'server/src/index.js'),
      cwd: path.join(ROOT, 'server'),
      watch: false,
      autorestart: true,
      max_memory_restart: '500M',
      env: {
        // 百度 OCR 密钥：后端真正消费。后端优先读 server/.env（dotenv），
        // 此处从部署环境继承，便于 PM2 / CI 注入真实密钥。前端不使用。
        BAIDU_API_KEY: process.env.BAIDU_API_KEY || '',
        BAIDU_SECRET_KEY: process.env.BAIDU_SECRET_KEY || '',
      },
    },
  ],
}
