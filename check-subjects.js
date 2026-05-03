import db from './server/src/db.js';

async function check() {
  const conn = await db.getConnection();
  
  const [subjects] = await conn.execute('SELECT id, name, user_id, is_owner FROM subjects');
  console.log('=== 科目表 ===');
  subjects.forEach(s => console.log('ID: ' + s.id + ', Name: ' + s.name + ', UserID: ' + s.user_id + ', IsOwner: ' + s.is_owner));
  
  console.log('');
  console.log('=== 统计各科目的题目数量 ===');
  const [counts] = await conn.execute('SELECT subject, COUNT(*) as count FROM questions GROUP BY subject ORDER BY subject');
  counts.forEach(c => console.log('Subject: ' + c.subject + ', Count: ' + c.count));
  
  console.log('');
  console.log('=== 检查题目subject值是否与科目表匹配 ===');
  const [questions] = await conn.execute('SELECT DISTINCT subject FROM questions ORDER BY subject');
  const validSubjects = subjects.map(s => s.name);
  const validIds = subjects.map(s => String(s.id));
  
  let hasMismatch = false;
  questions.forEach(q => {
    const subject = q.subject;
    const nameMatch = validSubjects.includes(subject);
    const idMatch = validIds.includes(subject);
    if (!nameMatch && !idMatch) {
      console.log('❌ 题目subject="' + subject + '" 无法匹配任何科目！');
      hasMismatch = true;
    }
  });
  
  if (!hasMismatch) {
    console.log('✅ 所有题目的subject都能匹配到科目');
  }
  
  console.log('');
  console.log('=== 没有题目的科目 ===');
  const [questionSubjects] = await conn.execute('SELECT DISTINCT subject FROM questions');
  const questionSubjectSet = new Set(questionSubjects.map(q => q.subject));
  const emptySubjects = subjects.filter(s => 
    !questionSubjectSet.has(s.name) && !questionSubjectSet.has(String(s.id))
  );
  if (emptySubjects.length === 0) {
    console.log('  所有科目都有题目');
  } else {
    emptySubjects.forEach(s => console.log('  ' + s.name + ' (ID: ' + s.id + ') - 无题目'));
  }
  
  await conn.release();
  await db.end();
}

check().catch(console.error);
