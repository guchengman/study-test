-- 015_exam_attempts_seed.sql
-- S0 shadow schema（PRD §5.3-③，原 M9）：exam_attempts 加乱序种子两列，
-- 为 FR-202（试题/选项乱序）铺数据面。本阶段仅加列，无读写路径改动。
--   * shuffle_seed : 发卷时写入的 PRNG 种子，NULL=未乱序（存量卷语义）
--   * option_order : 选项重排后的原始下标序列，如 [2,0,3,1]（JSON 数组）
-- 注意：migrate.js 按「分号+换行」拆句，语句体内不得出现行内分号。

ALTER TABLE exam_attempts
  ADD COLUMN shuffle_seed INT DEFAULT NULL COMMENT 'FR-202 乱序种子（Phase 0 仅加列）',
  ADD COLUMN option_order JSON DEFAULT NULL COMMENT 'FR-202 选项顺序映射（Phase 0 仅加列）';

-- 对账：列存在性核验
SELECT column_name, data_type, is_nullable FROM information_schema.columns
WHERE table_schema = DATABASE() AND table_name = 'exam_attempts'
  AND column_name IN ('shuffle_seed', 'option_order');
