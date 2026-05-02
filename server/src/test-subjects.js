const mysql = require('mysql2/promise');
const dotenv = require('dotenv');
dotenv.config();

(async () => {
  const pool = mysql.createPool({
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
  });
  const conn = await pool.getConnection();

  // admin 用户 ID
  const [users] = await conn.execute("SELECT id, username, role FROM users WHERE role = 'admin' LIMIT 1");
  const adminId = users[0]?.id;
  console.log('Admin user:', JSON.stringify(users[0]));

  if (adminId) {
    // 模拟 admin 查询
    const [rows] = await conn.execute(
      `SELECT s.*, (SELECT COUNT(*) FROM questions WHERE subject_id = s.id) as question_count,
              (SELECT COUNT(*) FROM subject_subscriptions WHERE subject_id = s.id) as subscriber_count,
              CASE WHEN ss.id IS NOT NULL THEN 1 ELSE 0 END as is_subscribed
       FROM subjects s
       LEFT JOIN subject_subscriptions ss ON ss.subject_id = s.id AND ss.user_id = ?
       ORDER BY s.is_system DESC, s.is_shared DESC, s.created_at`,
      [adminId]
    );
    rows.forEach(r => {
      r.is_owner = (r.created_by === adminId);
    });
    console.log('Subjects count:', rows.length);
    rows.forEach(r => {
      console.log(`  id=${r.id}, name=${r.name}, is_shared=${r.is_shared}, is_owner=${r.is_owner}, is_subscribed=${r.is_subscribed}, created_by=${r.created_by}`);
    });
  }

  conn.release();
  pool.end();
})().catch(e => { console.error(e); process.exit(1); });
