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
    console.log('开始执行 006_truefalse_to_single 迁移...');

    // 检查是否有 true/false 类型的题目
    const [rows] = await pool.execute(
      "SELECT COUNT(*) as cnt FROM questions WHERE type = 'true/false'"
    );
    const count = rows[0].cnt;
    console.log(`1. 发现 ${count} 条 true/false 类型题目`);

    if (count > 0) {
      console.log('2. 将 true/false 类型转为 single + options=["正确","错误"]...');
      await pool.execute(`
        UPDATE questions 
        SET type = 'single',
            options = '["正确", "错误"]',
            answer = CASE 
              WHEN JSON_UNQUOTE(answer) IN ('"正确"', '"true"', '"对"', '"yes"', '"√"', '"是"', '"A"', '"a"', '"1"') THEN '"A"'
              WHEN JSON_UNQUOTE(answer) IN ('"错误"', '"false"', '"错"', '"no"', '"×"', '"否"', '"B"', '"b"', '"0"') THEN '"B"'
              ELSE '"A"'
            END
        WHERE type = 'true/false'
      `);
      console.log(`   ✓ 已将 ${count} 条 true/false 题目转为 single 类型`);
    } else {
      console.log('2. 无需迁移，没有 true/false 类型题目');
    }

    console.log('\n006_truefalse_to_single 迁移完成！');
  } catch (err) {
    console.error('迁移错误:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

run();
