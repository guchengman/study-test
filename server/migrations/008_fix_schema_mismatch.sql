-- ==========================================
-- 迁移脚本 008: 修复代码与数据库 schema 不匹配
-- 将旧列名迁移为代码中使用的新列名
-- ==========================================

-- 1. mistake_records: 将 is_correct/wrong_count/correct_count 迁移为 consecutive_correct
-- 如果 consecutive_correct 列不存在则添加
SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'mistake_records' AND COLUMN_NAME = 'consecutive_correct');

SET @sql = IF(@col_exists = 0,
  'ALTER TABLE mistake_records ADD COLUMN consecutive_correct INT DEFAULT 0 AFTER question_id',
  'SELECT "consecutive_correct column already exists" AS msg');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 从旧列迁移数据到 consecutive_correct
-- 如果 is_correct 列存在，根据其值设置 consecutive_correct
SET @is_correct_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'mistake_records' AND COLUMN_NAME = 'is_correct');

SET @sql2 = IF(@is_correct_exists > 0,
  'UPDATE mistake_records SET consecutive_correct = CASE WHEN is_correct = 1 THEN correct_count ELSE 0 END WHERE consecutive_correct = 0',
  'SELECT "is_correct column already migrated" AS msg');
PREPARE stmt2 FROM @sql2;
EXECUTE stmt2;
DEALLOCATE PREPARE stmt2;

-- 确保 updated_at 列存在
SET @updated_at_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'mistake_records' AND COLUMN_NAME = 'updated_at');

SET @sql3 = IF(@updated_at_exists = 0,
  'ALTER TABLE mistake_records ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER created_at',
  'SELECT "updated_at column already exists" AS msg');
PREPARE stmt3 FROM @sql3;
EXECUTE stmt3;
DEALLOCATE PREPARE stmt3;

-- 2. study_stats: 重命名列以匹配代码
-- total_questions -> total_practiced
SET @col_old = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'study_stats' AND COLUMN_NAME = 'total_questions');
SET @col_new = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'study_stats' AND COLUMN_NAME = 'total_practiced');

SET @sql4 = IF(@col_old > 0 AND @col_new = 0,
  'ALTER TABLE study_stats CHANGE COLUMN total_questions total_practiced INT DEFAULT 0',
  'SELECT "total_practiced column already migrated" AS msg');
PREPARE stmt4 FROM @sql4;
EXECUTE stmt4;
DEALLOCATE PREPARE stmt4;

-- correct_count -> total_correct
SET @col_old2 = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'study_stats' AND COLUMN_NAME = 'correct_count');
SET @col_new2 = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'study_stats' AND COLUMN_NAME = 'total_correct');

SET @sql5 = IF(@col_old2 > 0 AND @col_new2 = 0,
  'ALTER TABLE study_stats CHANGE COLUMN correct_count total_correct INT DEFAULT 0',
  'SELECT "total_correct column already migrated" AS msg');
PREPARE stmt5 FROM @sql5;
EXECUTE stmt5;
DEALLOCATE PREPARE stmt5;

-- 添加 streak_days 列
SET @streak_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'study_stats' AND COLUMN_NAME = 'streak_days');

SET @sql6 = IF(@streak_exists = 0,
  'ALTER TABLE study_stats ADD COLUMN streak_days INT DEFAULT 1 AFTER total_correct',
  'SELECT "streak_days column already exists" AS msg');
PREPARE stmt6 FROM @sql6;
EXECUTE stmt6;
DEALLOCATE PREPARE stmt6;

-- 确保 last_study_at 列存在
SET @last_study_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'study_stats' AND COLUMN_NAME = 'last_study_at');

SET @sql7 = IF(@last_study_exists = 0,
  'ALTER TABLE study_stats ADD COLUMN last_study_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER total_time',
  'SELECT "last_study_at column already exists" AS msg');
PREPARE stmt7 FROM @sql7;
EXECUTE stmt7;
DEALLOCATE PREPARE stmt7;

-- 3. 同时更新 001 初始迁移，使其与代码保持一致
-- (此处无法修改历史迁移文件，仅作说明)
