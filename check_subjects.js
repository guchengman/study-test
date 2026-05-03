const mysql = require('mysql2/promise');
async function main() {
  const passwords = ['studyapp', 'Study@2025!', 'Study2025', 'study2025', '', 'root'];
  const user = 'studyapp';
  const host = 'localhost';
  const db = 'study_test';
  for (const pwd of passwords) {
    try {
      const conn = await mysql.createConnection({ host, user, password: pwd, database: db });
      const [rows] = await conn.execute('SELECT id, name, created_by, is_shared, share_scope FROM subjects ORDER BY id');
      console.log('SUCCESS with password: ' + pwd);
      rows.forEach(r => console.log(JSON.stringify(r)));
      await conn.end();
      break;
    } catch(e) {
      console.log('FAIL: ' + pwd + ' - ' + e.code);
    }
  }
}
main();
