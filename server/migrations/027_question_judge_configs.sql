-- 027：FR-106 编程题在线判题 —— 判题配置（1:1 软引用 questions）
--   language/time_limit_ms/memory_limit_mb/starter_code/test_cases(JSON 数组)。
--   test_cases 元素：{ "input": string, "expected_output": string, "is_sample": boolean }
--   question_id 不设 DB 外键：与 025/026 软引用一致，删题不级联硬删配置（YAGNI：本增量不做级联清理）。
--   范式对齐 013/014/025：幂等 CREATE TABLE IF NOT EXISTS、utf8mb4_unicode_ci；migrate.js 按「分号+换行」拆句，语句体内不得行内分号。

CREATE TABLE IF NOT EXISTS question_judge_configs (
  question_id INT NOT NULL,
  language VARCHAR(32) NOT NULL DEFAULT 'python',
  time_limit_ms INT NOT NULL DEFAULT 2000,
  memory_limit_mb INT NOT NULL DEFAULT 128,
  starter_code LONGTEXT NULL,
  test_cases JSON NOT NULL,
  created_by INT DEFAULT NULL,
  org_id INT DEFAULT NULL COMMENT 'shadow org（Phase 0 写入即赋值、查询不过滤）',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (question_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
