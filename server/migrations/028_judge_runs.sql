-- 028：FR-106 编程题在线判题 —— 判题运行账本（异步状态机 + 审计）
--   status: queued/running/done/failed/skipped；verdict: AC/WA/TLE/MLE/RE/CE。
--   分数真相仍在 exam_attempts.details；本表只做状态/日志/重跑审计。attempt_id/question_id 软引用不设 FK。
--   范式对齐：幂等、utf8mb4_unicode_ci；migrate.js 按「分号+换行」拆句；MySQL5.7 下 TEXT/JSON 列不写 DEFAULT NULL。

CREATE TABLE IF NOT EXISTS judge_runs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  attempt_id INT NOT NULL,
  question_id INT NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'queued',
  verdict VARCHAR(16) DEFAULT NULL,
  passed INT DEFAULT NULL,
  total INT DEFAULT NULL,
  time_ms INT DEFAULT NULL,
  mem_kb INT DEFAULT NULL,
  log TEXT NULL,
  created_by INT DEFAULT NULL,
  org_id INT DEFAULT NULL COMMENT 'shadow org（Phase 0 写入即赋值、查询不过滤）',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_attempt_question (attempt_id, question_id),
  KEY idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
