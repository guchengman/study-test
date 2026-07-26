-- ==========================================
-- 迁移脚本 002: 多角色体系 & 科目共享
-- ==========================================

-- 1. 修改 users 表：增加角色、老师关联、手机号、状态
ALTER TABLE users 
  MODIFY COLUMN role ENUM('admin','teacher','student','independent') DEFAULT 'student',
  ADD COLUMN teacher_id INT DEFAULT NULL AFTER role,
  ADD COLUMN phone VARCHAR(20) DEFAULT NULL UNIQUE AFTER email,
  ADD COLUMN status ENUM('active','pending') DEFAULT 'active' AFTER phone;

-- 现有 student 角色用户转为 independent（无 teacher_id 的独立用户）
UPDATE users SET role = 'independent' WHERE role = 'student' AND teacher_id IS NULL;

-- 现有 admin 保持不变

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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 3. 新建科目订阅关系表
CREATE TABLE IF NOT EXISTS subject_subscriptions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  subject_id VARCHAR(50) NOT NULL,
  subscribed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_user_subject (user_id, subject_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 4. subjects 表增加共享字段
ALTER TABLE subjects 
  ADD COLUMN is_shared TINYINT(1) DEFAULT 0 AFTER is_system;
