-- 017：FR-107 题目回收站与版本历史（数据面）
--
-- 目标（PRD §5 + FR-107，规模 S）：
--   1) questions 增 deleted_at（软删除标记），删除改软删、回收站可恢复、30 天后自动物理清理；
--   2) 新表 question_versions 留存编辑历史快照（seq 递增），支持查看/回退；
--      随题目物理删除级联清理（FK ON DELETE CASCADE）。
--   3) 遵循 S0 编码约定「新表必带 org_id」：question_versions.org_id 可空、写入即赋值、查询不过滤。
--
-- 零数据风险：deleted_at 可空默认 NULL（存量题视为未删除）；仅新增列/新表，不改存量行、不动现有读路径口径。
-- 注意：migrate.js 按「分号+换行」拆句，语句体内不得出现行内分号。

ALTER TABLE questions
  ADD COLUMN deleted_at DATETIME DEFAULT NULL COMMENT '软删除时间；NULL=未删除（FR-107 回收站）';

ALTER TABLE questions
  ADD KEY idx_questions_deleted (deleted_at);

CREATE TABLE IF NOT EXISTS question_versions (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  question_id INT NOT NULL,                       -- 关联题目
  seq         INT NOT NULL,                        -- 版本序号，自 1 递增（每次编辑前快照旧内容）
  payload     JSON NOT NULL,                       -- 该版本题目快照 {subject_id,type,title,code,options,answer,explanation,points}
  org_id      INT DEFAULT NULL COMMENT 'shadow org（S0 约定：新表带 org_id、写入即赋值、查询不过滤）',
  created_by  INT DEFAULT NULL,                    -- 触发该快照的编辑者
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_question_seq (question_id, seq),
  KEY idx_question (question_id),
  FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by)  REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
