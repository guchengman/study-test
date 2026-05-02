const mysql = require('mysql2/promise');

async function run() {
  const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'study_quiz',
    multipleStatements: true,
  });

  try {
    console.log('开始执行 004_subscription_approval 迁移...');

    // 检查 status 字段是否已存在
    const [columns] = await pool.execute(
      "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'subject_subscriptions' AND COLUMN_NAME = 'status'"
    );
    if (columns.length === 0) {
      console.log('1. 添加 subject_subscriptions.status 字段...');
      await pool.execute("ALTER TABLE subject_subscriptions ADD COLUMN status VARCHAR(10) DEFAULT 'approved' AFTER subscribed_at");
      await pool.execute("UPDATE subject_subscriptions SET status = 'approved' WHERE status IS NULL");
      console.log('   ✓ status 字段添加完成，现有订阅已设为 approved');
    } else {
      console.log('1. status 字段已存在，跳过');
    }

    console.log('\n004_subscription_approval 迁移完成！');
  } catch (err) {
    console.error('迁移错误:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

run();
