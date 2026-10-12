-- 024：FR-501 Streak 连续打卡
--
-- 目标（PRD 学习激励）：
--   1) streaks：每用户一行，记录当前连续天数 current、历史最长 longest、
--      最近活跃业务日 last_active_date（UTC+8 日粒度）、补签卡 makeup_cards、
--      本月已用补签次数 makeup_used_this_month + 归属月 makeup_month(YYYY-MM，跨月重置)。
--   2) streak_events：打卡/断流/补签/发卡 事件流水（审计与回调）。
--   3) 遵循 S0：org_id 可空、写入即赋值。
--
-- 零数据风险：仅新增表。
-- 注意：migrate.js 按「分号+换行」拆句，语句体内不得出现行内分号。

CREATE TABLE IF NOT EXISTS streaks (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  current INT NOT NULL DEFAULT 0,
  longest INT NOT NULL DEFAULT 0,
  last_active_date DATE DEFAULT NULL,
  makeup_cards INT NOT NULL DEFAULT 1,
  makeup_used_this_month TINYINT NOT NULL DEFAULT 0,
  makeup_month VARCHAR(7) DEFAULT NULL COMMENT 'YYYY-MM，跨月重置计数',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  org_id INT DEFAULT NULL,
  UNIQUE KEY uk_user (user_id),
  KEY idx_last_active (last_active_date),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS streak_events (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  event ENUM('tick','break','makeup','award_card') NOT NULL,
  detail JSON DEFAULT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  KEY idx_user (user_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
