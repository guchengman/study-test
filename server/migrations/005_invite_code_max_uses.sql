-- 005: 邀请码使用上限 + 唯一约束加固
-- 幂等化：全新库 001 已含 invite_codes.max_uses 列与 code 唯一索引；改用 information_schema 守卫。
--   原「DELIMITER $$ + 存储过程」写法会被 migrate.js 的分号+换行切分器打碎成非法 SQL（见 015 注释约定：
--   语句体内不得出现行内分号/DELIMITER），故移除。存量库已记录本迁移，不重放，行为不变。

-- 1. 添加 max_uses 字段（默认 100 次，001 已含则跳过）
SET @c = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'invite_codes' AND COLUMN_NAME = 'max_uses');
SET @s = IF(@c = 0,
  'ALTER TABLE invite_codes ADD COLUMN max_uses INT DEFAULT 100 AFTER used_count',
  'SELECT "invite_codes.max_uses already exists" AS msg');
PREPARE st FROM @s;
EXECUTE st;
DEALLOCATE PREPARE st;

-- 2. 确保 code 字段有唯一约束（不存在才加）
SET @i = (SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'invite_codes' AND INDEX_NAME = 'code');
SET @s = IF(@i = 0,
  'ALTER TABLE invite_codes ADD UNIQUE KEY (code)',
  'SELECT "invite_codes.code unique index already exists" AS msg');
PREPARE st FROM @s;
EXECUTE st;
DEALLOCATE PREPARE st;
