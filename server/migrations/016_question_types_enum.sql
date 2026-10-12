-- 016：扩展 questions.type 枚举以支持 FR-101/102/103 新题型（判断/填空/简答）
--
-- 背景：001 初始 schema 曾把 type 定义为 VARCHAR(20)，但实际部署库（本地与线上）
-- 早期由一份含 ENUM 的基线导入，导致现网列为
--   ENUM('single','multiple','programming','true_false')
-- 新题型 judge/fill_in/short_answer 不在枚举内，写入会触发 1265 Data truncated。
--
-- 修复：MODIFY 为「旧值全集 + 新题型」的超集枚举。
--   * 保留 true_false（006 已将存量判断题转为 single，但枚举值保留以防残留行被截断）
--   * 新增 judge / fill_in / short_answer（与前端 QuestionType、server VALID_QUESTION_TYPES 对齐）
-- 仅追加枚举值，不改变任何存量行，零数据风险。
--
-- 注意：migrate.js 按「分号+换行」拆句，语句体内不得出现行内分号。

ALTER TABLE questions
  MODIFY COLUMN type ENUM('single','multiple','programming','true_false','judge','fill_in','short_answer')
  NOT NULL COMMENT '题型：single/multiple/programming/true_false(遗留)/judge/fill_in/short_answer';
