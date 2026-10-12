-- 020：FR-701/702 通知中心 + 邮件投递（数据面）
--
-- 目标（PRD §5 + FR-701/702，规模 M）：
--   1) 新表 notifications：站内通知主表（type/title/payload/read_at），user_id 关联；
--   2) 新表 notification_deliveries：通知的多通道投递状态（site/email），支持重试计数。
--   3) 遵循 S0 编码约定「新表必带 org_id」：notifications.org_id 可空、写入即赋值、查询不过滤。
--
-- 零数据风险：仅新增表，不改存量行，不变更任何现有读路径。
-- 注意：migrate.js 按「分号+换行」拆句，语句体内不得出现行内分号。

CREATE TABLE IF NOT EXISTS notifications (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  user_id    INT NOT NULL,
  org_id     INT DEFAULT NULL COMMENT 'shadow org（S0 约定：新表带 org_id、写入即赋值、查询不过滤）',
  type       VARCHAR(50) NOT NULL COMMENT 'exam_published|score_ready|storage_alert|streak_break|system',
  title      VARCHAR(200) NOT NULL,
  payload    JSON DEFAULT NULL,
  read_at    DATETIME DEFAULT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  KEY idx_user_unread (user_id, read_at),
  KEY idx_user_created (user_id, created_at),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS notification_deliveries (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  notification_id INT NOT NULL,
  channel         ENUM('site','email') NOT NULL DEFAULT 'site',
  status          ENUM('pending','sent','failed') NOT NULL DEFAULT 'pending',
  retry_count     TINYINT NOT NULL DEFAULT 0,
  sent_at         DATETIME DEFAULT NULL,
  created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_notif_channel (notification_id, channel),
  FOREIGN KEY (notification_id) REFERENCES notifications(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
