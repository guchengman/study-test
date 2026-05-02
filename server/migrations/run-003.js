const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

async function run() {
  const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'study_quiz',
    multipleStatements: true,
  });

  try {
    console.log('开始执行 003_share_scope 迁移...');

    // 检查 share_scope 字段是否已存在
    const [columns] = await pool.execute(
      "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'subjects' AND COLUMN_NAME = 'share_scope'"
    );
    if (columns.length === 0) {
      console.log('1. 添加 subjects.share_scope 字段...');
      await pool.execute("ALTER TABLE subjects ADD COLUMN share_scope VARCHAR(10) DEFAULT 'none' AFTER is_shared");
      await pool.execute("UPDATE subjects SET share_scope = 'all' WHERE is_shared = 1");
      console.log('   ✓ share_scope 字段添加完成');
    } else {
      console.log('1. share_scope 字段已存在，跳过');
    }

    // 检查 subject_student_access 表是否存在
    const [tables] = await pool.execute(
      "SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'subject_student_access'"
    );
    if (tables.length === 0) {
      console.log('2. 创建 subject_student_access 表...');
      await pool.execute(`
        CREATE TABLE subject_student_access (
          id INT AUTO_INCREMENT PRIMARY KEY,
          subject_id VARCHAR(50) NOT NULL,
          student_user_id INT NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE KEY uk_subject_student (subject_id, student_user_id),
          KEY idx_subject (subject_id),
          KEY idx_student (student_user_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);
      console.log('   ✓ subject_student_access 表创建完成');
    } else {
      console.log('2. subject_student_access 表已存在，跳过');
    }

    // 检查 invite_codes.scope 字段是否已存在
    const [icColumns] = await pool.execute(
      "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'invite_codes' AND COLUMN_NAME = 'scope'"
    );
    if (icColumns.length === 0) {
      console.log('3. 添加 invite_codes.scope 字段...');
      await pool.execute("ALTER TABLE invite_codes ADD COLUMN scope VARCHAR(10) DEFAULT 'all' AFTER type");
      await pool.execute("UPDATE invite_codes SET scope = 'all' WHERE type = 'subject'");
      console.log('   ✓ scope 字段添加完成');
    } else {
      console.log('3. invite_codes.scope 字段已存在，跳过');
    }

    console.log('\n003_share_scope 迁移完成！');
  } catch (err) {
    console.error('迁移错误:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

run();
