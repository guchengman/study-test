-- 023：FR-301/302 学情/考情看板预聚合表 stats_daily
--
-- 目标（PRD §4 学习分析）：
--   1) stats_daily：按 (user, date, metric, dim_key) 预聚合的日粒度指标；
--      metric：practiced|correct|exam_score|time_spent；
--      dim_key：标签维度（tag_id）/ 科目维度（subject_id）/ 试卷维度（exam_id），可空。
--   2) 数据源：exam_attempts.details（逐题 is_correct）、exams、study_stats、question_tag_map（FR-108）。
--      （现状无 answer_records 表，练习逐题正确性以考试答卷明细为主要可信来源。）
--   3) 遵循 S0：org_id 可空、写入即赋值、查询按 user/org 聚合。
--
-- 零数据风险：仅新增表。
-- 注意：migrate.js 按「分号+换行」拆句，语句体内不得出现行内分号。

CREATE TABLE IF NOT EXISTS stats_daily (
  id       INT AUTO_INCREMENT PRIMARY KEY,
  org_id   INT DEFAULT NULL,
  user_id  INT NOT NULL,
  date     DATE NOT NULL,
  metric   VARCHAR(30) NOT NULL COMMENT 'practiced|correct|exam_score|time_spent',
  dim_key  VARCHAR(50) DEFAULT NULL COMMENT 'tag_id / subject_id / exam_id',
  value    DECIMAL(10,2) NOT NULL DEFAULT 0,
  UNIQUE KEY uk_user_date_metric_dim (user_id, date, metric, dim_key),
  KEY idx_org_date (org_id, date),
  KEY idx_user_metric (user_id, metric),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
