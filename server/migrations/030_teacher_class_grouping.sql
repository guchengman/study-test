-- 030_teacher_class_grouping.sql
-- M3 数据地基：落地「师生同属一个共享组织」（PRD §5.2 建模）。写侧数据，读路径不过滤 —— 行为零变更。
-- migrate.js 按「分号+换行」拆句，体内禁行内分号；全部 INSERT IGNORE / UPDATE WHERE 幂等，可重放。
-- 回滚见 server/migrations/rollback/030r_undo_teacher_class_grouping.sql（手工，不进自动迁移）。

-- 1) 为每位「有学生的老师」建 class 组织（UNIQUE(type,name) 幂等）
INSERT IGNORE INTO organizations (type, name)
SELECT 'SCHOOL', CONCAT('class:', t.username)
FROM users t
WHERE t.role = 'teacher'
  AND EXISTS (SELECT 1 FROM users st WHERE st.teacher_id = t.id);

-- 2a) 老师进 class 组织，角色 content_author
INSERT IGNORE INTO org_members (org_id, user_id, role)
SELECT o.id, t.id, 'content_author'
FROM users t
JOIN organizations o ON o.type = 'SCHOOL' AND o.name = CONCAT('class:', t.username)
WHERE t.role = 'teacher';

-- 2b) 学生进其老师的 class 组织，角色 examinee
INSERT IGNORE INTO org_members (org_id, user_id, role)
SELECT o.id, st.id, 'examinee'
FROM users st
JOIN users t ON t.id = st.teacher_id
JOIN organizations o ON o.type = 'SCHOOL' AND o.name = CONCAT('class:', t.username);

-- 3a) 老师创建的科目重指到 class 组织
UPDATE subjects s
JOIN users t ON t.id = s.created_by AND t.role = 'teacher'
JOIN organizations c ON c.type = 'SCHOOL' AND c.name = CONCAT('class:', t.username)
SET s.org_id = c.id
WHERE s.org_id IS NOT NULL;

-- 3b) 老师创建的题目重指到 class 组织
UPDATE questions q
JOIN users t ON t.id = q.created_by AND t.role = 'teacher'
JOIN organizations c ON c.type = 'SCHOOL' AND c.name = CONCAT('class:', t.username)
SET q.org_id = c.id
WHERE q.org_id IS NOT NULL;

-- 3c) 老师创建的考试重指到 class 组织
UPDATE exams e
JOIN users t ON t.id = e.created_by AND t.role = 'teacher'
JOIN organizations c ON c.type = 'SCHOOL' AND c.name = CONCAT('class:', t.username)
SET e.org_id = c.id
WHERE e.org_id IS NOT NULL;

-- 对账
SELECT 'class_orgs' AS metric, COUNT(*) AS cnt FROM organizations WHERE type = 'SCHOOL' AND name LIKE 'class:%';
SELECT 'members_in_class' AS metric, COUNT(*) AS cnt
FROM org_members m JOIN organizations o ON o.id = m.org_id
WHERE o.type = 'SCHOOL' AND o.name LIKE 'class:%';
SELECT 'teachers_without_class' AS metric, COUNT(*) AS cnt
FROM users t WHERE t.role = 'teacher'
  AND EXISTS (SELECT 1 FROM users st WHERE st.teacher_id = t.id)
  AND NOT EXISTS (SELECT 1 FROM organizations o WHERE o.type = 'SCHOOL' AND o.name = CONCAT('class:', t.username));
