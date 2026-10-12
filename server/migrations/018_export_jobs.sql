-- 018：FR-206 成绩导出（异步任务）数据面
--
-- 目标（PRD FR-206，规模 M；§「所有列表 API 强制分页上限、导出走异步任务防大查询打挂库」）：
--   1) 新表 export_jobs 承载「导出任务」：创建即入队(queued)，后台带锁调度器原子认领处理(running→done/failed)；
--   2) owner 导出单场全体学员成绩(scope='exam', exam_id 指定)，学生自助导出本人历次成绩(scope='self', exam_id 为空)；
--   3) 产物落服务端文件(file_path)，前端轮询 status 后经鉴权端点下载。
--   4) 遵循 S0 编码约定「新表必带 org_id」：org_id 可空、写入即赋值、查询不过滤。
--
-- 零数据风险：仅新增表，不改存量、不动现有读路径口径。
-- 注意：migrate.js 按「分号+换行」拆句，语句体内不得出现行内分号。

CREATE TABLE IF NOT EXISTS export_jobs (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  org_id        INT DEFAULT NULL COMMENT 'shadow org（S0 约定：新表带 org_id、写入即赋值、查询不过滤）',
  requested_by  INT NOT NULL,                       -- 发起人（owner 或学生本人）
  exam_id       INT DEFAULT NULL COMMENT 'scope=exam 时的目标考试；scope=self（学生自助）为 NULL',
  scope         ENUM('exam','self') NOT NULL,       -- 导出范围：本场全体 / 本人历次
  format        ENUM('csv') NOT NULL DEFAULT 'csv', -- 产物格式（服务端 CSV，可后续扩展 xlsx）
  status        ENUM('queued','running','done','failed') NOT NULL DEFAULT 'queued',
  row_count     INT DEFAULT NULL,                   -- 实际导出行数（受单任务上限约束）
  file_path     VARCHAR(255) DEFAULT NULL,          -- 产物相对 uploads 根的路径
  error         TEXT DEFAULT NULL,                  -- 失败原因
  created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  completed_at  DATETIME DEFAULT NULL,
  KEY idx_status_created (status, created_at),
  KEY idx_requester (requested_by),
  FOREIGN KEY (requested_by) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (exam_id)      REFERENCES exams(id)  ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
