-- 010_exams.sql
-- 正式考试模块：新增 exams（试卷定义）与 exam_attempts（学员答卷）两张表。
-- 幂等（IF NOT EXISTS），由 server/src/migrate.js 按序应用。
--
-- 设计要点（已确认修订）：
--   * 允许多次参考、取最高分 => exam_attempts 移除 UNIQUE(exam_id, user_id)，
--     仅保留 KEY idx_exam / KEY idx_user（非唯一索引）。
--   * 评分权威在服务端：提交时后端按 question_id 从 questions 表取答案逐题评分。
--   * 编程题不自动判分：type='programming' 时 is_correct=null、earned=0、needs_manual=true。
--   * 显式 COLLATE=utf8mb4_unicode_ci：连接层排序规则可能为 gbk / utf8mb4_0900_ai_ci，
--     若只写 DEFAULT CHARSET=utf8mb4，列实际 collation 会与 subjects.id(utf8mb4_unicode_ci)
--     不一致，导致外键 exams_ibfk_1 报 "are incompatible"。显式指定与现有表保持一致。

SET FOREIGN_KEY_CHECKS = 0;

-- 3.1 exams 表（试卷定义）
CREATE TABLE IF NOT EXISTS exams (
  id               INT AUTO_INCREMENT PRIMARY KEY,
  subject_id       VARCHAR(50)  NOT NULL,                 -- 归属科目，决定可见学员范围
  title            VARCHAR(200) NOT NULL,
  description      TEXT,
  created_by       INT          NOT NULL,                 -- owner（subjects.created_by 或 admin/teacher）
  question_set     JSON         NOT NULL,                 -- 固定题集: [{"question_id":int,"points":int}, ...]
  total_points     INT          NOT NULL DEFAULT 100,     -- = SUM(points)
  duration_minutes INT          NOT NULL DEFAULT 60,      -- 限时（分钟）
  start_time       DATETIME     DEFAULT NULL,             -- 开放开始；NULL=发布即开放
  end_time         DATETIME     DEFAULT NULL,             -- 开放结束；NULL=长期
  pass_score       INT          NOT NULL DEFAULT 60,      -- 及格分（用于及格率）
  status           ENUM('draft','published','closed') NOT NULL DEFAULT 'draft',
  created_at       DATETIME     DEFAULT CURRENT_TIMESTAMP,
  updated_at       DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_subject (subject_id),
  KEY idx_created_by (created_by),
  KEY idx_status (status),
  FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3.2 exam_attempts 表（学员答卷/作答记录）
CREATE TABLE IF NOT EXISTS exam_attempts (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  exam_id       INT          NOT NULL,
  user_id       INT          NOT NULL,
  status        ENUM('in_progress','submitted','auto_submitted') NOT NULL DEFAULT 'in_progress',
  answers       JSON         DEFAULT NULL,               -- {"question_id": userAnswer}
  details       JSON         DEFAULT NULL,               -- 提交时由服务端计算并落库（错题回顾/分析数据源）
  score         INT          DEFAULT 0,                  -- 实际得分（SUM earned，不含编程题人工分）
  correct_count INT          DEFAULT 0,
  total_count   INT          DEFAULT 0,
  started_at    DATETIME     DEFAULT CURRENT_TIMESTAMP,
  submitted_at  DATETIME     DEFAULT NULL,
  deadline      DATETIME     DEFAULT NULL,               -- started_at + duration_minutes（服务端计时基准）
  created_at    DATETIME     DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  -- 已确认修订：移除 UNIQUE(exam_id,user_id)，允许同一学员多次参考、取最高分
  KEY idx_exam (exam_id),                                -- 非唯一索引
  KEY idx_user (user_id),                               -- 非唯一索引
  FOREIGN KEY (exam_id)  REFERENCES exams(id)  ON DELETE CASCADE,
  FOREIGN KEY (user_id)  REFERENCES users(id)  ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;
