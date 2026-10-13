-- 025：FR-104 材料题（一拖 N）
--   新增 question_groups 表存「共享材料本体」；questions 加可空软引用列 group_id 标记子题归属。
--
-- 设计要点（见 docs/superpowers/specs/2026-10-13-fr104-material-questions-design.md）：
--   * group_id 不建 DB 外键：规避 ON DELETE CASCADE 绕过既有「被试卷 question_set 引用的题目禁止物理删」
--     护栏（questionLifecycle），删除材料组不会级联硬删子题或留下悬空引用。列仅作软标记 + 索引。
--   * 子题本身仍是普通题型行（single/fill_in/short_answer…），判分复用既有 gradeAttempt，SSOT 零改动。
--   * question_set 结构不变（仍扁平 {question_id, points}），组语义只在「选组=批量加子题」与「读时 JOIN 带材料」表达。
--
-- 范式对齐 013/014：幂等(CREATE TABLE IF NOT EXISTS)、utf8mb4_unicode_ci；
--   migrate.js 按「分号+换行」拆句，语句体内不得出现行内分号；按文件名在 schema_migrations 记录、每文件仅应用一次。

CREATE TABLE IF NOT EXISTS question_groups (
  id INT AUTO_INCREMENT PRIMARY KEY,
  subject_id VARCHAR(50) NOT NULL,
  material LONGTEXT NOT NULL COMMENT '共享材料本体（文本/Markdown）',
  created_by INT DEFAULT NULL,
  org_id INT DEFAULT NULL COMMENT 'shadow org（Phase 0 写入即赋值、查询不过滤）',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_qg_subject (subject_id),
  KEY idx_qg_created_by (created_by),
  KEY idx_qg_org (org_id),
  CONSTRAINT fk_qg_subject FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE,
  CONSTRAINT fk_qg_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE questions
  ADD COLUMN group_id INT DEFAULT NULL COMMENT '材料题组ID，NULL=非子题；软引用 question_groups.id（无 FK）';

ALTER TABLE questions
  ADD KEY idx_questions_group (group_id);
