-- ==========================================
-- 初始化建表脚本 001: 全科题库系统
-- 逆向自现有代码 + 迁移脚本 002/003/004
-- ==========================================

-- 字符集
SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- 1. 访问计数器
CREATE TABLE IF NOT EXISTS visit_counter (
  id INT PRIMARY KEY DEFAULT 1,
  count INT DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
INSERT IGNORE INTO visit_counter (id, count) VALUES (1, 0);

-- 2. 用户表
CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(50) NOT NULL UNIQUE,
  email VARCHAR(100) DEFAULT '',
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('admin','teacher','student','independent') DEFAULT 'student',
  teacher_id INT DEFAULT NULL,
  phone VARCHAR(20) DEFAULT NULL UNIQUE,
  status ENUM('active','pending') DEFAULT 'active',
  password_reset TINYINT(1) DEFAULT 0,
  help_read TINYINT(1) DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_teacher (teacher_id),
  KEY idx_role (role),
  FOREIGN KEY (teacher_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 3. 科目表
CREATE TABLE IF NOT EXISTS subjects (
  id VARCHAR(50) NOT NULL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  icon VARCHAR(10) DEFAULT '📚',
  welcome_title VARCHAR(200) DEFAULT '',
  welcome_desc VARCHAR(500) DEFAULT '',
  is_system TINYINT(1) DEFAULT 0,
  is_shared TINYINT(1) DEFAULT 0,
  share_scope VARCHAR(10) DEFAULT 'none' COMMENT 'none/all/students',
  created_by INT DEFAULT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_created_by (created_by),
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 4. 题目表
CREATE TABLE IF NOT EXISTS questions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  subject_id VARCHAR(50) NOT NULL,
  type VARCHAR(20) NOT NULL COMMENT 'single/multiple/programming',
  title TEXT NOT NULL,
  code TEXT DEFAULT NULL COMMENT '编程题代码',
  options JSON DEFAULT NULL COMMENT '选项列表',
  answer JSON NOT NULL COMMENT '答案',
  explanation TEXT DEFAULT NULL COMMENT '解析',
  points INT DEFAULT 1,
  share_code VARCHAR(50) DEFAULT NULL UNIQUE,
  created_by INT DEFAULT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_subject (subject_id),
  KEY idx_created_by (created_by),
  KEY idx_type (type),
  FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 5. 错题记录
CREATE TABLE IF NOT EXISTS mistake_records (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  question_id INT NOT NULL,
  consecutive_correct INT DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_user_question (user_id, question_id),
  KEY idx_user (user_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 6. 收藏夹
CREATE TABLE IF NOT EXISTS favorites (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  question_id INT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_user_question (user_id, question_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 7. 学习统计
CREATE TABLE IF NOT EXISTS study_stats (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  subject_id VARCHAR(50) NOT NULL,
  total_practiced INT DEFAULT 0,
  total_correct INT DEFAULT 0,
  streak_days INT DEFAULT 1,
  total_time INT DEFAULT 0 COMMENT '总用时(秒)',
  last_study_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_user_subject (user_id, subject_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 8. 邀请码表
CREATE TABLE IF NOT EXISTS invite_codes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(20) NOT NULL UNIQUE,
  type ENUM('registration','subject') NOT NULL COMMENT '注册码 or 科目码',
  scope VARCHAR(10) DEFAULT 'all' COMMENT 'all/students',
  creator_id INT NOT NULL,
  subject_id VARCHAR(50) DEFAULT NULL COMMENT '科目码对应的科目ID',
  description VARCHAR(100) DEFAULT '' COMMENT '描述',
  expires_at DATETIME NOT NULL COMMENT '过期时间',
  used_count INT DEFAULT 0 COMMENT '已使用次数',
  max_uses INT DEFAULT 100 COMMENT '最大使用次数',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (creator_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 9. 科目订阅关系表
CREATE TABLE IF NOT EXISTS subject_subscriptions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  subject_id VARCHAR(50) NOT NULL,
  status VARCHAR(10) DEFAULT 'approved' COMMENT 'pending/approved/rejected',
  subscribed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_user_subject (user_id, subject_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 10. 科目-学生授权表（白名单模式，空表=全体学生）
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

SET FOREIGN_KEY_CHECKS = 1;

-- 种子数据：管理员账号
-- 默认密码: admin123 (首次登录后必须修改)
-- 以下 hash 需要在部署前通过 node -e "console.log(require('bcryptjs').hashSync('admin123',10))" 生成并替换
-- 或者启动服务后通过 API 创建管理员
INSERT IGNORE INTO users (username, email, password_hash, role, status, password_reset)
VALUES ('admin', 'admin@study.com', '$2a$10$REPLACE_WITH_REAL_HASH_ON_DEPLOY', 'admin', 'active', 1);
