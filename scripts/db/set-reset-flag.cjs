/**
 * 重置指定用户的 password_reset 标记（运维脚本）
 * 所有敏感信息均从环境变量读取，禁止在源码中硬编码。
 *
 * 用法（项目根目录执行）：
 *   DB_USER=studyapp DB_PASSWORD='***' DB_NAME=study_test TARGET_USER=zengxiao node scripts/db/set-reset-flag.cjs
 */
const { execSync } = require('child_process');

const DB_USER = process.env.DB_USER || 'studyapp';
const DB_PASSWORD = process.env.DB_PASSWORD || '';
const DB_NAME = process.env.DB_NAME || 'study_test';
const TARGET_USER = process.env.TARGET_USER || 'zengxiao';

// 仅允许字母/数字/下划线，防止 SQL 注入
if (!/^[A-Za-z0-9_]+$/.test(TARGET_USER)) {
  console.error('TARGET_USER 包含非法字符');
  process.exit(1);
}

const passwordArg = DB_PASSWORD ? `-p"${DB_PASSWORD}"` : '';
const cmd =
  `mysql -u ${DB_USER} ${passwordArg} ${DB_NAME} ` +
  `-e "UPDATE users SET password_reset = 1 WHERE username = '${TARGET_USER}'; ` +
  `SELECT id, username, password_reset FROM users;"`;

try {
  const result = execSync(cmd, { shell: '/bin/bash' }).toString();
  console.log(result);
} catch (err) {
  console.error('执行失败:', err.message);
  process.exit(1);
}
