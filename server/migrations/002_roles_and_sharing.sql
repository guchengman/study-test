-- ==========================================
-- 迁移脚本 002: 多角色体系 & 科目共享
-- 幂等化说明：全新库中 001_initial_schema.sql 已包含下列 users/subjects 列，
--   故用 information_schema 守卫，使「空库全量重放」(CI) 也能贯通；
--   存量库(生产/本地)已通过 schema_migrations 记录本迁移，不会重放，行为不变。
-- ==========================================

-- 1. users.role 枚举扩展（MODIFY 重复执行无副作用）
ALTER TABLE users
  MODIFY COLUMN role ENUM('admin','teacher','student','independent') DEFAULT 'student';

-- 1b. users 增量列：teacher_id / phone / status（001 已含则跳过）
SET @c = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'teacher_id');
SET @s = IF(@c = 0,
  'ALTER TABLE users ADD COLUMN teacher_id INT DEFAULT NULL AFTER role',
  'SELECT "users.teacher_id already exists" AS msg');
PREPARE st FROM @s;
EXECUTE st;
DEALLOCATE PREPARE st;

SET @c = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'phone');
SET @s = IF(@c = 0,
  'ALTER TABLE users ADD COLUMN phone VARCHAR(20) DEFAULT NULL UNIQUE AFTER email',
  'SELECT "users.phone already exists" AS msg');
PREPARE st FROM @s;
EXECUTE st;
DEALLOCATE PREPARE st;

SET @c = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'status');
SET @s = IF(@c = 0,
  'ALTER TABLE users ADD COLUMN status ENUM(''active'',''pending'') DEFAULT ''active'' AFTER phone',
  'SELECT "users.status already exists" AS msg');
PREPARE st FROM @s;
EXECUTE st;
DEALLOCATE PREPARE st;

-- 现有 student 角色用户转为 independent（无 teacher_id 的独立用户）
UPDATE users SET role = 'independent' WHERE role = 'student' AND teacher_id IS NULL;

-- 2. 新建邀请码表
CREATE TABLE IF NOT EXISTS invite_codes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(20) NOT NULL UNIQUE,
  type ENUM('registration','subject') NOT NULL COMMENT '注册码 or 科目码',
  creator_id INT NOT NULL,
  subject_id VARCHAR(50) DEFAULT NULL COMMENT '科目码对应的科目ID',
  description VARCHAR(100) DEFAULT '' COMMENT '描述（如2026春季数学班）',
  expires_at DATETIME NOT NULL COMMENT '过期时间',
  used_count INT DEFAULT 0 COMMENT '已使用次数（统计用）',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (creator_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. 新建科目订阅关系表
CREATE TABLE IF NOT EXISTS subject_subscriptions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  subject_id VARCHAR(50) NOT NULL,
  subscribed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_user_subject (user_id, subject_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. subjects 表增加共享字段 is_shared（001 已含则跳过）
SET @c = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'subjects' AND COLUMN_NAME = 'is_shared');
SET @s = IF(@c = 0,
  'ALTER TABLE subjects ADD COLUMN is_shared TINYINT(1) DEFAULT 0 AFTER is_system',
  'SELECT "subjects.is_shared already exists" AS msg');
PREPARE st FROM @s;
EXECUTE st;
DEALLOCATE PREPARE st;
