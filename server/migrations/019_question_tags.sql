-- 019：FR-108 知识点标签体系（数据面 + 手动打标 API）
--
-- 目标（PRD §5 + FR-108，规模 M）：
--   1) 新表 question_tags：标签树（level 1=科目/2=章节/3=知识点，parent_id 指向本表实现层级）；
--   2) 新表 question_tag_map：题目-标签多对多关联（联合主键，级联删除）。
--   3) 遵循 S0 编码约定「新表必带 org_id」：question_tags.org_id 可空、写入即赋值、查询不过滤。
--
-- 零数据风险：仅新增表，不改存量 questions 行，不变更任何现有读路径。
-- 注意：migrate.js 按「分号+换行」拆句，语句体内不得出现行内分号。

CREATE TABLE IF NOT EXISTS question_tags (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  org_id     INT DEFAULT NULL COMMENT 'shadow org（S0 约定：新表带 org_id、写入即赋值、查询不过滤）',
  name       VARCHAR(100) NOT NULL,
  parent_id  INT DEFAULT NULL COMMENT 'NULL=顶级；指向本表 id 实现树',
  level      TINYINT NOT NULL DEFAULT 1 COMMENT '1=科目 2=章节 3=知识点',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_org_name_parent (org_id, name, parent_id),
  KEY idx_parent (parent_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS question_tag_map (
  question_id INT NOT NULL,
  tag_id      INT NOT NULL,
  PRIMARY KEY (question_id, tag_id),
  KEY idx_tag (tag_id),
  FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE,
  FOREIGN KEY (tag_id) REFERENCES question_tags(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
