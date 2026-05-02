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

// 检查外键的 ON DELETE 规则
const [fks] = await conn.execute(
  `SELECT CONSTRAINT_NAME, TABLE_NAME, REFERENCED_TABLE_NAME, DELETE_RULE, UPDATE_RULE
   FROM INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS 
   WHERE REFERENCED_TABLE_NAME = 'users' AND CONSTRAINT_SCHEMA = ?`,
  [process.env.DB_NAME]
);
console.log('FK delete rules:', JSON.stringify(fks, null, 2));

// subjects表里那个引用是什么
const [subs] = await conn.execute('SELECT id, name, created_by FROM subjects WHERE created_by = 9');
console.log('Subjects by user 9:', JSON.stringify(subs));

conn.release();
pool.end();
