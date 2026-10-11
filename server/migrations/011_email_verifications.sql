-- 011_email_verifications.sql
-- 邮箱验证码服务端化（P0 安全修复）：验证码由服务端生成、存储哈希、服务端校验
-- 幂等：IF NOT EXISTS，由 migrate.js 按序应用
CREATE TABLE IF NOT EXISTS email_verifications (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  email       VARCHAR(190) NOT NULL,
  purpose     ENUM('register','reset') NOT NULL,
  code_hash   CHAR(64)     NOT NULL COMMENT 'sha256(code)，不存明文',
  expires_at  DATETIME     NOT NULL COMMENT '创建后 5 分钟',
  attempts    TINYINT      NOT NULL DEFAULT 0 COMMENT '校验尝试次数，超过 5 次作废',
  consumed    TINYINT      NOT NULL DEFAULT 0 COMMENT '1=已使用(一次性)',
  created_at  DATETIME     DEFAULT CURRENT_TIMESTAMP,
  KEY idx_email_purpose (email, purpose, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
