-- 026：FR-105 听力题（音频挂载）
--   questions 加可空软引用列 audio_url，存上传返回的相对路径（/api/uploads/...）。
--   非新题型：听力题仍是普通题（single/fill_in/…），音频仅题干刺激物，判分复用既有 gradeAttempt，SSOT 零改动。
--   audio_url 是「软引用」上传文件而非表引用，不设 FK/CASCADE；删除文件不影响题目行（YAGNI，本增量不做级联清理）。
--   范式对齐 013/014/025：utf8mb4_unicode_ci；migrate.js 按「分号+换行」拆句，语句体内不得出现行内分号；每文件仅应用一次。

ALTER TABLE questions
  ADD COLUMN audio_url VARCHAR(300) DEFAULT NULL COMMENT 'FR-105 听力题音频相对路径(/api/uploads/...)，NULL=非音频题；软引用上传文件，无 FK';
