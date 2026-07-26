-- 009: 向 users 表添加 help_read 字段（标记用户是否已阅读帮助手册）
-- 该字段在 auth 路由中被查询和更新，但之前缺少对应的迁移脚本

SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'help_read');

SET @sql = IF(@col_exists = 0,
  'ALTER TABLE users ADD COLUMN help_read TINYINT(1) DEFAULT 0 AFTER password_reset',
  'SELECT "help_read column already exists" AS msg');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
