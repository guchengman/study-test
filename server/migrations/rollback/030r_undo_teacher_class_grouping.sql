-- 030r：回滚 030 师生分组（手工执行，不进自动迁移）
-- 把 class 内容 org_id 复原为老师 PERSONAL 组织，再删 class 组织（CASCADE 清成员）。
-- 注意：仅回滚「内容重指」；org_members 里的 class 成员随 DELETE organizations 由外键 CASCADE 清除。

UPDATE subjects s
JOIN users t ON t.id = s.created_by AND t.role = 'teacher'
JOIN organizations p ON p.type = 'PERSONAL' AND p.name = t.username
JOIN organizations c ON c.type = 'SCHOOL' AND c.name = CONCAT('class:', t.username)
SET s.org_id = p.id WHERE s.org_id = c.id;

UPDATE questions q
JOIN users t ON t.id = q.created_by AND t.role = 'teacher'
JOIN organizations p ON p.type = 'PERSONAL' AND p.name = t.username
JOIN organizations c ON c.type = 'SCHOOL' AND c.name = CONCAT('class:', t.username)
SET q.org_id = p.id WHERE q.org_id = c.id;

UPDATE exams e
JOIN users t ON t.id = e.created_by AND t.role = 'teacher'
JOIN organizations p ON p.type = 'PERSONAL' AND p.name = t.username
JOIN organizations c ON c.type = 'SCHOOL' AND c.name = CONCAT('class:', t.username)
SET e.org_id = p.id WHERE e.org_id = c.id;

DELETE FROM organizations WHERE type = 'SCHOOL' AND name LIKE 'class:%';
