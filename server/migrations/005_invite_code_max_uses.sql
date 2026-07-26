-- 005: 邀请码使用上限 + 唯一约束加固

-- 1. 添加 max_uses 字段（默认 100 次）
ALTER TABLE invite_codes ADD COLUMN max_uses INT DEFAULT 100 AFTER used_count;

-- 2. 确保 code 字段有唯一约束（如果之前没有）
-- MySQL 中 ALTER TABLE ADD UNIQUE 如果已存在会报错，用存储过程安全处理
DELIMITER $$
CREATE PROCEDURE add_invite_code_unique_if_not_exists()
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'invite_codes'
      AND INDEX_NAME = 'code'
  ) THEN
    ALTER TABLE invite_codes ADD UNIQUE KEY (code);
  END IF;
END$$
DELIMITER ;
CALL add_invite_code_unique_if_not_exists();
DROP PROCEDURE IF EXISTS add_invite_code_unique_if_not_exists;
