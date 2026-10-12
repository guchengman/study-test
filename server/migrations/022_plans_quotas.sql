-- 022：FR-606 配额框架（plans / quotas / quota_usage / byo_key_registry）
--
-- 目标（PRD §6 商业化配额）：
--   1) plans：订阅计划字典（当前仅 FREE）；
--   2) quotas：按 (plan_code, resource_type, period) 定义限额，limit=-1 表示无限（仅付费）；
--   3) quota_usage：滚动用量计数（月/年/累计），checkQuota/recordUsage 读写；
--   4) byo_key_registry：用户自带 AI Key 的审计登记（仅存 sha256 前缀指纹，不落明文）；
--   5) organizations.plan：列已在 013 存在（默认 'free'），此处规范化为 'FREE' 并调整默认值，
--      不重复 ADD COLUMN（避免列已存在报错）。
--
-- 零数据风险：仅新增表 + 规范化既有列默认值/取值。
-- 注意：migrate.js 按「分号+换行」拆句，语句体内不得出现行内分号；limit 为保留字需反引号。

CREATE TABLE IF NOT EXISTS plans (
  code    VARCHAR(20) PRIMARY KEY,
  name    VARCHAR(100) NOT NULL,
  enabled TINYINT(1) DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO plans (code, name, enabled) VALUES ('FREE', '免费版', 1)
  ON DUPLICATE KEY UPDATE name = VALUES(name), enabled = VALUES(enabled);

CREATE TABLE IF NOT EXISTS quotas (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  plan_code     VARCHAR(20) NOT NULL,
  resource_type VARCHAR(50) NOT NULL COMMENT 'upload_bytes|file_count|exam_count|ai_calls|export_rows',
  period        ENUM('monthly','yearly','total','per_request') NOT NULL DEFAULT 'monthly',
  `limit`       BIGINT NOT NULL COMMENT '-1=无限(仅付费)',
  UNIQUE KEY uk_plan_resource (plan_code, resource_type, period),
  FOREIGN KEY (plan_code) REFERENCES plans(code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- FREE 默认限额
INSERT INTO quotas (plan_code, resource_type, period, `limit`) VALUES
  ('FREE', 'upload_bytes', 'monthly', 5368709120),
  ('FREE', 'file_count', 'total', 2000),
  ('FREE', 'exam_count', 'yearly', 200),
  ('FREE', 'ai_calls', 'monthly', 500),
  ('FREE', 'export_rows', 'per_request', 5000)
  ON DUPLICATE KEY UPDATE `limit` = VALUES(`limit`), period = VALUES(period);

CREATE TABLE IF NOT EXISTS quota_usage (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  org_id        INT NOT NULL,
  resource_type VARCHAR(50) NOT NULL,
  period_key    VARCHAR(20) NOT NULL COMMENT 'monthly=YYYY-MM, yearly=YYYY, total/其它=TOTAL',
  used          BIGINT NOT NULL DEFAULT 0,
  updated_at    DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_org_res_period (org_id, resource_type, period_key),
  KEY idx_org_res (org_id, resource_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS byo_key_registry (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  user_id     INT NOT NULL,
  provider    VARCHAR(30) NOT NULL COMMENT 'gemini|paddle_ocr',
  key_hash    VARCHAR(64) NOT NULL COMMENT 'sha256 of key snippet for audit',
  verified_at DATETIME DEFAULT NULL,
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_user_provider (user_id, provider),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- organizations.plan 已存在（013：VARCHAR(32) NOT NULL DEFAULT 'free'）
-- 规范化：默认值改为 'FREE'，并将存量取值对齐（大小写不敏感 JOIN 由服务层 UPPER 兜底）。
ALTER TABLE organizations ALTER COLUMN plan SET DEFAULT 'FREE';
UPDATE organizations SET plan = 'FREE' WHERE plan IS NULL OR plan = '' OR plan = 'free';
