-- 021：storage_usage 存储用量统计与告警（数据面）
--
-- 目标（PRD §5 + 存储用量告警）：
--   1) 新表 storage_usage：按 org 汇总的磁盘用量（bytes_used / file_count），UNIQUE(org_id) UPSERT；
--   2) circuit_broken：达配额 95% 置熔断标记，供后续 FR-606 checkQuota 读取返回 429。
--   3) 遵循 S0 编码约定：org_id NOT NULL（每行即某租户用量），调度器写入。
--
-- 零数据风险：仅新增表，不改存量行。
-- 注意：migrate.js 按「分号+换行」拆句，语句体内不得出现行内分号。

CREATE TABLE IF NOT EXISTS storage_usage (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  org_id         INT NOT NULL,
  bytes_used     BIGINT NOT NULL DEFAULT 0,
  file_count     INT NOT NULL DEFAULT 0,
  circuit_broken TINYINT(1) NOT NULL DEFAULT 0 COMMENT '1=用量达 95% 熔断，FR-606 checkQuota 读此返回 429',
  updated_at     DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_org (org_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
