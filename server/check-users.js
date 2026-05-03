const mysql = require('mysql2');
require('dotenv').config();

const connection = mysql.createConnection({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME
});

connection.connect((err) => {
  if (err) {
    console.error('数据库连接错误:', err.message);
    process.exit(1);
  }
  
  // 查询用户基本信息
  connection.query('SELECT id, email, name, role, created_at FROM users ORDER BY created_at DESC', (error, results) => {
    if (error) {
      console.error('查询错误:', error.message);
    } else {
      console.log('当前用户列表:');
      console.log('ID\tEmail\t\t\tName\t\tRole\t\tCreated At');
      console.log('-----------------------------------------------------------------------------------------------');
      results.forEach(row => {
        console.log(`${row.id}\t${row.email}\t${row.name || 'N/A'}\t\t${row.role}\t\t${row.created_at}`);
      });
      
      // 查询密码哈希
      connection.query('SELECT id, email, password FROM users', (error2, results2) => {
        if (error2) {
          console.error('密码查询错误:', error2.message);
        } else {
          console.log('\n密码哈希信息:');
          results2.forEach(row => {
            console.log(`User ${row.id} (${row.email}): ${row.password.substring(0, 50)}...`);
          });
        }
        connection.end();
      });
    }
  });
});