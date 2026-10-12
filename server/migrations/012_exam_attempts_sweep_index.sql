-- 012_exam_attempts_sweep_index.sql
-- FR-204 自动交卷重构：为后台调度器的过期候选扫描补复合索引。
-- 调度器每 tick 执行 `WHERE status='in_progress' AND deadline < NOW() ORDER BY deadline`，
-- 原表仅有 idx_exam / idx_user，候选查询走全表扫描；本索引使收卷扫描 O(log n)。
-- 幂等：migrate.js 通过 schema_migrations 追踪版本，本文件仅首次未应用时执行一次。
ALTER TABLE exam_attempts ADD INDEX idx_sweep (status, deadline);
