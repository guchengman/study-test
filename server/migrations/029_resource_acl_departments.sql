-- 029_resource_acl_departments.sql
-- M3 数据地基：建两张新模型目标表，本阶段仅建表，不接入任何读写路径 —— 行为零变更。
--   * departments：班级(kind=CLASS)/部门(kind=DEPT)，org_members.dept_id 的目标（013 预留列）。
--   * resource_acl：跨租户资源共享授权，是 subject_subscriptions / subject_student_access 的落点
--     （订阅类跨组织共享的迁移属后续计划，本处只建表）。
-- MySQL 5.7：utf8mb4_unicode_ci；migrate.js 按「分号+换行」拆句，体内禁行内分号。

CREATE TABLE IF NOT EXISTS departments (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  org_id     INT NOT NULL,
  name       VARCHAR(100) NOT NULL,
  kind       ENUM('CLASS','DEPT') NOT NULL DEFAULT 'DEPT',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_org_name_kind (org_id, name, kind),
  KEY idx_org (org_id),
  FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS resource_acl (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  resource     ENUM('subject','exam','question_group') NOT NULL,
  resource_id  INT NOT NULL,
  org_id       INT NOT NULL,
  grantee_type ENUM('user','org','dept') NOT NULL,
  grantee_id   INT NOT NULL,
  perm         ENUM('read','practice','manage') NOT NULL DEFAULT 'read',
  granted_by   INT DEFAULT NULL,
  created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_res_grantee_perm (resource, resource_id, grantee_type, grantee_id, perm),
  KEY idx_org (org_id),
  KEY idx_grantee (grantee_type, grantee_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SELECT 'departments_total' AS metric, COUNT(*) AS cnt FROM departments;
SELECT 'resource_acl_total' AS metric, COUNT(*) AS cnt FROM resource_acl;
