import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config();

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME
});

const conn = await pool.getConnection();

// 1. 查找zengxiao用户
const [users] = await conn.execute('SELECT id, username, role, teacher_id, status FROM users WHERE username = ?', ['zengxiao']);
console.log('zengxiao user:', JSON.stringify(users));

// 2. 查找所有引用users表的外键
const [fks] = await conn.execute(
  `SELECT TABLE_NAME, COLUMN_NAME, REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME 
   FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE 
   WHERE REFERENCED_TABLE_NAME = 'users' AND TABLE_SCHEMA = ?`,
  [process.env.DB_NAME]
);
console.log('Foreign keys referencing users:', JSON.stringify(fks));

// 3. 检查哪些表有数据引用了该用户
if (users.length > 0) {
  const userId = users[0].id;
  for (const fk of fks) {
    try {
      const [rows] = await conn.execute(
        `SELECT COUNT(*) as cnt FROM ${fk.TABLE_NAME} WHERE ${fk.COLUMN_NAME} = ?`,
        [userId]
      );
      if (rows[0].cnt > 0) {
        console.log(`  ${fk.TABLE_NAME}.${fk.COLUMN_NAME} has ${rows[0].cnt} rows referencing user ${userId}`);
      }
    } catch (e) {
      console.log(`  Error checking ${fk.TABLE_NAME}: ${e.message}`);
    }
  }
}

conn.release();
pool.end();
