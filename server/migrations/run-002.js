/**
 * 数据库迁移脚本 002: 多角色体系 & 科目共享
 * 用法: node server/migrations/run-002.js
 */
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config({ path: './server/.env' });

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '3306'),
  user: process.env.DB_USER || 'studyapp',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'study_test',
  charset: 'utf8mb4',
  multipleStatements: true,
});

async function migrate() {
  const conn = await pool.getConnection();
  try {
    console.log('开始迁移 002_roles_and_sharing...');

    // 1. 修改 users 表
    console.log('1. 修改 users 表...');
    // 先检查字段是否已存在
    const [userCols] = await conn.execute("SHOW COLUMNS FROM users LIKE 'teacher_id'");
    if (userCols.length === 0) {
      await conn.execute(`
        ALTER TABLE users 
          MODIFY COLUMN role ENUM('admin','teacher','student','independent') DEFAULT 'student',
          ADD COLUMN teacher_id INT DEFAULT NULL AFTER role,
          ADD COLUMN phone VARCHAR(20) DEFAULT NULL UNIQUE AFTER email,
          ADD COLUMN status ENUM('active','pending') DEFAULT 'active' AFTER phone
      `);
      console.log('   ✓ users 表字段添加完成');
    } else {
      console.log('   - users 表字段已存在，跳过');
    }

    // 2. 新建 invite_codes 表
    console.log('2. 创建 invite_codes 表...');
    const [icTables] = await conn.execute("SHOW TABLES LIKE 'invite_codes'");
    if (icTables.length === 0) {
      await conn.execute(`
        CREATE TABLE invite_codes (
          id INT AUTO_INCREMENT PRIMARY KEY,
          code VARCHAR(20) NOT NULL UNIQUE,
          type ENUM('registration','subject') NOT NULL COMMENT '注册码 or 科目码',
          creator_id INT NOT NULL,
          subject_id VARCHAR(50) DEFAULT NULL COMMENT '科目码对应的科目ID',
          description VARCHAR(100) DEFAULT '' COMMENT '描述',
          expires_at DATETIME NOT NULL COMMENT '过期时间',
          used_count INT DEFAULT 0 COMMENT '已使用次数',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (creator_id) REFERENCES users(id) ON DELETE CASCADE,
          FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);
      console.log('   ✓ invite_codes 表创建完成');
    } else {
      console.log('   - invite_codes 表已存在，跳过');
    }

    // 3. 新建 subject_subscriptions 表
    console.log('3. 创建 subject_subscriptions 表...');
    const [ssTables] = await conn.execute("SHOW TABLES LIKE 'subject_subscriptions'");
    if (ssTables.length === 0) {
      await conn.execute(`
        CREATE TABLE subject_subscriptions (
          id INT AUTO_INCREMENT PRIMARY KEY,
          user_id INT NOT NULL,
          subject_id VARCHAR(50) NOT NULL,
          subscribed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          UNIQUE KEY uk_user_subject (user_id, subject_id),
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
          FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);
      console.log('   ✓ subject_subscriptions 表创建完成');
    } else {
      console.log('   - subject_subscriptions 表已存在，跳过');
    }

    // 4. subjects 表增加 is_shared 字段
    console.log('4. 修改 subjects 表...');
    const [subCols] = await conn.execute("SHOW COLUMNS FROM subjects LIKE 'is_shared'");
    if (subCols.length === 0) {
      await conn.execute(`ALTER TABLE subjects ADD COLUMN is_shared TINYINT(1) DEFAULT 0 AFTER is_system`);
      console.log('   ✓ subjects.is_shared 字段添加完成');
    } else {
      console.log('   - subjects.is_shared 字段已存在，跳过');
    }

    // 5. 更新现有 student 角色用户为 independent（无 teacher_id 的）
    console.log('5. 更新现有用户角色...');
    const [result] = await conn.execute(
      "UPDATE users SET role = 'independent' WHERE role = 'student' AND teacher_id IS NULL"
    );
    console.log(`   ✓ ${result.affectedRows} 个 student 用户已转为 independent`);

    console.log('\n迁移 002 完成！');
  } catch (err) {
    console.error('迁移失败:', err);
    throw err;
  } finally {
    conn.release();
    await pool.end();
  }
}

migrate().catch(err => {
  console.error(err);
  process.exit(1);
});
