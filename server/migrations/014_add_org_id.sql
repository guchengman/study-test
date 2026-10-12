-- 014_add_org_id.sql
-- S0 shadow schema（PRD §5.3-②）：7 张存量核心表加可空 org_id 并回填存量数据。
-- shadow 约定：本阶段「写入即赋值、查询不过滤」，不改变任何现有读路径。
--
-- 回填规则（对账依据，写死在本文件）：
--   * questions / exams        : org_id = created_by 用户的 PERSONAL 租户
--   * subjects                 : org_id = created_by 用户的 PERSONAL 租户
--   * exam_attempts / mistake_records / favorites / study_stats : user_id 的 PERSONAL 租户
--   * created_by IS NULL 的孤儿科目（历史遗留、其下已无带创建者的题目）
--     保持 NULL，Phase 2 租户化时人工确认归属（PRD §6 Phase 2「只补历史数据」）
-- 不建 FK：organizations 在 Phase 2 会重建/合并， shadow 列仅逻辑关联；
-- 也不建索引：本阶段无 org 维度查询，Phase 2 上过滤时再按真实查询形态加。
--
-- 注意：migrate.js 按「分号+换行」拆句，语句体内不得出现行内分号。

ALTER TABLE questions     ADD COLUMN org_id INT DEFAULT NULL COMMENT 'shadow org（Phase 0 写入即赋值、查询不过滤）';
ALTER TABLE subjects      ADD COLUMN org_id INT DEFAULT NULL COMMENT 'shadow org（Phase 0 写入即赋值、查询不过滤）';
ALTER TABLE exams         ADD COLUMN org_id INT DEFAULT NULL COMMENT 'shadow org（Phase 0 写入即赋值、查询不过滤）';
ALTER TABLE exam_attempts ADD COLUMN org_id INT DEFAULT NULL COMMENT 'shadow org（Phase 0 写入即赋值、查询不过滤）';
ALTER TABLE mistake_records ADD COLUMN org_id INT DEFAULT NULL COMMENT 'shadow org（Phase 0 写入即赋值、查询不过滤）';
ALTER TABLE favorites     ADD COLUMN org_id INT DEFAULT NULL COMMENT 'shadow org（Phase 0 写入即赋值、查询不过滤）';
ALTER TABLE study_stats   ADD COLUMN org_id INT DEFAULT NULL COMMENT 'shadow org（Phase 0 写入即赋值、查询不过滤）';

-- 回填：created_by 归属类表（questions / exams）
UPDATE questions q
JOIN users u ON u.id = q.created_by
JOIN organizations o ON o.type = 'PERSONAL' AND o.name = u.username
SET q.org_id = o.id
WHERE q.org_id IS NULL;

UPDATE exams e
JOIN users u ON u.id = e.created_by
JOIN organizations o ON o.type = 'PERSONAL' AND o.name = u.username
SET e.org_id = o.id
WHERE e.org_id IS NULL;

-- 回填：subjects 按 created_by（created_by IS NULL 的孤儿留 NULL，Phase 2 人工确认）
UPDATE subjects s
JOIN users u ON u.id = s.created_by
JOIN organizations o ON o.type = 'PERSONAL' AND o.name = u.username
SET s.org_id = o.id
WHERE s.org_id IS NULL;

-- 回填：user 归属类表（exam_attempts / mistake_records / favorites / study_stats）
UPDATE exam_attempts ea
JOIN users u ON u.id = ea.user_id
JOIN organizations o ON o.type = 'PERSONAL' AND o.name = u.username
SET ea.org_id = o.id
WHERE ea.org_id IS NULL;

UPDATE mistake_records mr
JOIN users u ON u.id = mr.user_id
JOIN organizations o ON o.type = 'PERSONAL' AND o.name = u.username
SET mr.org_id = o.id
WHERE mr.org_id IS NULL;

UPDATE favorites f
JOIN users u ON u.id = f.user_id
JOIN organizations o ON o.type = 'PERSONAL' AND o.name = u.username
SET f.org_id = o.id
WHERE f.org_id IS NULL;

UPDATE study_stats ss
JOIN users u ON u.id = ss.user_id
JOIN organizations o ON o.type = 'PERSONAL' AND o.name = u.username
SET ss.org_id = o.id
WHERE ss.org_id IS NULL;

-- 对账：各表总数 / 已赋 org_id 数 / 仍为 NULL 数（NULL 明细见最后一行）
SELECT 'questions' AS table_name, COUNT(*) AS total, SUM(org_id IS NOT NULL) AS with_org, SUM(org_id IS NULL) AS null_org FROM questions
UNION ALL SELECT 'subjects', COUNT(*), SUM(org_id IS NOT NULL), SUM(org_id IS NULL) FROM subjects
UNION ALL SELECT 'exams', COUNT(*), SUM(org_id IS NOT NULL), SUM(org_id IS NULL) FROM exams
UNION ALL SELECT 'exam_attempts', COUNT(*), SUM(org_id IS NOT NULL), SUM(org_id IS NULL) FROM exam_attempts
UNION ALL SELECT 'mistake_records', COUNT(*), SUM(org_id IS NOT NULL), SUM(org_id IS NULL) FROM mistake_records
UNION ALL SELECT 'favorites', COUNT(*), SUM(org_id IS NOT NULL), SUM(org_id IS NULL) FROM favorites
UNION ALL SELECT 'study_stats', COUNT(*), SUM(org_id IS NOT NULL), SUM(org_id IS NULL) FROM study_stats;
