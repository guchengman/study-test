import mysql from 'mysql2/promise';

(async () => {
  const pool = mysql.createPool({
    host: 'localhost',
    port: 3306,
    user: 'studyapp',
    password: 'StudyApp@2026!',
    database: 'study_test'
  });
  const conn = await pool.getConnection();

  // 1. 查询admin用户
  console.log('=== 1. Admin用户信息 ===');
  const [users] = await conn.execute("SELECT id, username, role FROM users WHERE role = 'admin'");
  console.table(users);

  if (users.length === 0) {
    console.log('没有找到admin用户');
    conn.release();
    await pool.end();
    return;
  }

  const adminId = users[0].id;
  console.log(`\nAdmin ID: ${adminId}\n`);

  // 2. 查询admin用户的科目列表（按当前逻辑）
  console.log('=== 2. Admin能看到的科目（含重复检查） ===');
  const [subjects] = await conn.execute(
    `SELECT s.id, s.name, s.is_system, s.created_by, s.share_scope,
            CASE WHEN ss.id IS NOT NULL THEN 1 ELSE 0 END as is_subscribed,
            ss.status as subscription_status
     FROM subjects s
     LEFT JOIN subject_subscriptions ss ON ss.subject_id = s.id AND ss.user_id = ?
     WHERE s.created_by = ?
        OR (ss.id IS NOT NULL AND ss.status = 'approved')
     ORDER BY s.id`,
    [adminId, adminId]
  );
  console.table(subjects);

  // 3. 检查重复
  console.log('\n=== 3. 重复检查 ===');
  const subjectMap = new Map();
  let duplicates = [];
  subjects.forEach(s => {
    if (subjectMap.has(s.id)) {
      duplicates.push(s.id);
    } else {
      subjectMap.set(s.id, s);
    }
  });

  if (duplicates.length > 0) {
    console.log(`❌ 发现 ${duplicates.length} 个重复科目:`);
    duplicates.forEach(id => console.log(`   - ${id}`));
  } else {
    console.log('✅ 没有重复科目');
  }

  // 4. 统计
  console.log('\n=== 4. 统计 ===');
  console.log(`总科目数: ${subjects.length}`);
  const uniqueCount = subjectMap.size;
  console.log(`去重后: ${uniqueCount}`);

  const systemSubjects = subjects.filter(s => s.is_system === 1);
  console.log(`系统科目数: ${systemSubjects.length}`);
  if (systemSubjects.length > 0) {
    console.log('系统科目:');
    systemSubjects.forEach(s => console.log(`  - ${s.id}: ${s.name}`));
  }

  conn.release();
  await pool.end();
})().catch(e => { console.error(e); process.exit(1); });
