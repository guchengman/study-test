-- 003: 共享范围优化 - share_scope + 学生选择 + 邀请码范围
-- 幂等化：全新库 001 已含 share_scope/scope 列，用守卫保证空库全量重放可贯通；存量库不重放。

-- 1. subjects 表增加 share_scope 字段（001 已含则跳过）
SET @c = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'subjects' AND COLUMN_NAME = 'share_scope');
SET @s = IF(@c = 0,
  'ALTER TABLE subjects ADD COLUMN share_scope VARCHAR(10) DEFAULT ''none'' AFTER is_shared',
  'SELECT "subjects.share_scope already exists" AS msg');
PREPARE st FROM @s;
EXECUTE st;
DEALLOCATE PREPARE st;

-- 2. 迁移现有数据：is_shared=1 的记录设为 share_scope='all'
UPDATE subjects SET share_scope = 'all' WHERE is_shared = 1;

-- 3. 创建科目-学生授权表（白名单模式，空表=全体学生）
CREATE TABLE IF NOT EXISTS subject_student_access (
  id INT AUTO_INCREMENT PRIMARY KEY,
  subject_id VARCHAR(50) NOT NULL,
  student_user_id INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_subject_student (subject_id, student_user_id),
  KEY idx_subject (subject_id),
  KEY idx_student (student_user_id),
  FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE,
  FOREIGN KEY (student_user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. invite_codes 表增加 scope 字段（001 已含则跳过）
SET @c = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'invite_codes' AND COLUMN_NAME = 'scope');
SET @s = IF(@c = 0,
  'ALTER TABLE invite_codes ADD COLUMN scope VARCHAR(10) DEFAULT ''all'' AFTER type',
  'SELECT "invite_codes.scope already exists" AS msg');
PREPARE st FROM @s;
EXECUTE st;
DEALLOCATE PREPARE st;

-- 5. 迁移现有邀请码：type='subject' 的设为 scope='all'
UPDATE invite_codes SET scope = 'all' WHERE type = 'subject';
