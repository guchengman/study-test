-- 013_organizations.sql
-- S0 shadow schema（PRD §5.3-①）：建 organizations / org_members 两张新表，
-- 并为存量每个用户自动建 PERSONAL 租户 + 写入成员关系（按 §5.2 角色映射）。
--
-- 设计说明：
--   * shadow 阶段：本阶段只建表与回填，不改变任何现有查询行为。
--   * role 枚举定案：§5 表定义与 §5.2 映射存在出入（admin→platform_admin 不在
--     §5 枚举内）。定案为枚举增加 platform_admin，§5.2 优先。admin 用户仅
--     1 个（平台方自身），其 PERSONAL 租户成员关系记 platform_admin。
--   * 幂等：organizations 有 UNIQUE(type,name)，INSERT IGNORE 可重放；
--     org_members 有 UNIQUE(org_id,user_id)。
--   * 显式 COLLATE=utf8mb4_unicode_ci，与 010_exams.sql 同样的排序规则考量。
--   * migrate.js 按「分号+换行」拆句，语句体内不得出现行内分号。

CREATE TABLE IF NOT EXISTS organizations (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  type       ENUM('SCHOOL','ENTERPRISE','PERSONAL') NOT NULL DEFAULT 'PERSONAL',
  name       VARCHAR(100) NOT NULL,
  plan       VARCHAR(32)  NOT NULL DEFAULT 'free',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_type_name (type, name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS org_members (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  org_id     INT NOT NULL,
  user_id    INT NOT NULL,
  role       ENUM('platform_admin','org_admin','content_author','examinee','reader') NOT NULL,
  dept_id    INT DEFAULT NULL COMMENT 'departments 表 Phase 2 建，此列先留空',
  joined_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_org_user (org_id, user_id),
  KEY idx_user (user_id),
  FOREIGN KEY (org_id)  REFERENCES organizations(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id)         ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 回填-1：为每个存量用户建 PERSONAL 租户（name=username，全局唯一性由 users.username UNIQUE 保证）
INSERT IGNORE INTO organizations (type, name)
SELECT 'PERSONAL', u.username FROM users u;

-- 回填-2：写成员关系，§5.2 映射：admin→platform_admin、teacher→content_author、student/independent→examinee
INSERT IGNORE INTO org_members (org_id, user_id, role)
SELECT o.id, u.id,
  CASE u.role
    WHEN 'admin'       THEN 'platform_admin'
    WHEN 'teacher'     THEN 'content_author'
    ELSE 'examinee'
  END
FROM users u
JOIN organizations o ON o.type = 'PERSONAL' AND o.name = u.username;

-- 对账（行数核验，随迁移日志输出）
SELECT 'organizations_total' AS metric, COUNT(*) AS cnt FROM organizations;
SELECT 'org_members_total'   AS metric, COUNT(*) AS cnt FROM org_members;
SELECT 'users_without_personal_org' AS metric, COUNT(*) AS cnt
FROM users u
WHERE NOT EXISTS (
  SELECT 1 FROM organizations o
  WHERE o.type = 'PERSONAL' AND o.name = u.username
);
