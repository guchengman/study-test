/**
 * Phase 2 / M1 跨租户隔离集成测试（冻结现有属主隔离，零行为变更）
 * 建两个 PERSONAL 租户(teacherA/teacherB，各带一名学员)，断言 B 读不到 A 的核心表资源。
 * 运行：先启动后端；node server/tests/isolation.integration.mjs
 *   本地建议 $env:EXAM_IT_BASE='http://127.0.0.1:3100/api'（规避 localhost→IPv6）
 * 环境变量：EXAM_IT_BASE、EXAM_IT_DB_HOST/PORT/USER/PASSWORD/NAME（见 integrationHarness；本地自动读 server/.env）
 */
import mysql from 'mysql2/promise';
import {
  resolveDbConfig, results, check, api, registerWithCode, reportExit, checkBlocked,
} from './helpers/integrationHarness.mjs';

const DB = resolveDbConfig();
const fmt = (d) => d.toISOString().slice(0, 19).replace('T', ' ');
const asArray = (x) => (Array.isArray(x) ? x : []);

async function cleanup(db) {
  const runs = [
    "DELETE FROM exam_attempts WHERE exam_id IN (SELECT id FROM exams WHERE title LIKE 'ISO_%')",
    "DELETE FROM exams WHERE title LIKE 'ISO_%'",
    "DELETE FROM question_tag_map WHERE question_id IN (SELECT id FROM questions WHERE title LIKE 'ISO_%')",
    "DELETE FROM question_tags WHERE name LIKE 'ISO_%'",
    "DELETE FROM questions WHERE title LIKE 'ISO_%'",
    "DELETE FROM mistake_records WHERE user_id IN (SELECT id FROM users WHERE username LIKE 'it_iso_%')",
    "DELETE FROM favorites WHERE user_id IN (SELECT id FROM users WHERE username LIKE 'it_iso_%')",
    "DELETE FROM study_stats WHERE user_id IN (SELECT id FROM users WHERE username LIKE 'it_iso_%')",
    "DELETE FROM subjects WHERE id LIKE 'iso_subj_%'",
    "DELETE FROM notifications WHERE user_id IN (SELECT id FROM users WHERE username LIKE 'it_iso_%')",
    "DELETE FROM org_members WHERE user_id IN (SELECT id FROM users WHERE username LIKE 'it_iso_%')",
    "DELETE FROM organizations WHERE name LIKE 'it_iso_%'",
    "DELETE FROM email_verifications WHERE email LIKE 'it_iso_%@test.com'",
    "DELETE FROM users WHERE username LIKE 'it_iso_%'",
  ];
  for (const sql of runs) { await db.query(sql).catch(() => { /* 表不存在/无行时忽略，尽力清理 */ }); }
}

async function makeTenant(db, tag, role = 'teacher', phone) {
  const username = `it_iso_${tag}`;
  const email = `${username}@test.com`;
  const payload = { username, password: 'iso123456', email, role };
  if (phone) payload.phone = phone;
  const r = await registerWithCode(db, payload);
  check(`ISO 注册 ${tag}`, r.status === 200 && r.data?.token, r.status);
  return { token: r.data?.token, id: r.data?.user?.id, username };
}

async function makeStudent(db, tag, teacherId) {
  const stu = await makeTenant(db, tag, 'student');
  await db.execute('UPDATE users SET teacher_id=? WHERE id=?', [teacherId, stu.id]);
  return stu;
}

const main = async () => {
  const db = await mysql.createConnection(DB);
  await cleanup(db);
  try {
    // ===== 夹具：两个 PERSONAL 租户 =====
    const tA = await makeTenant(db, 'teacherA', 'teacher', '13910000001');
    const tB = await makeTenant(db, 'teacherB', 'teacher', '13910000002');
    const sA = await makeStudent(db, 'stuA', tA.id);
    const sB = await makeStudent(db, 'stuB', tB.id);

    // A、B 各一私有科目（DB 直插，与 integration_exam 同法；share_scope=none 不对外共享）
    await db.execute("INSERT INTO subjects (id, name, created_by, share_scope) VALUES ('iso_subj_A', 'ISO_科目A', ?, 'none')", [tA.id]);
    await db.execute("INSERT INTO subjects (id, name, created_by, share_scope) VALUES ('iso_subj_B', 'ISO_科目B', ?, 'none')", [tB.id]);

    // A 用 API 建题（返回 data.id）
    const qA = await api('POST', '/questions', tA.token, {
      subject_id: 'iso_subj_A', type: 'single', title: 'ISO_题A', options: ['甲', '乙'], answer: '甲', explanation: 'A私有',
    });
    check('ISO A 建题', qA.status === 200 && qA.data?.id, qA.status);
    const qAId = qA.data?.id;

    // ===== questions 跨租户 =====
    checkBlocked('ISO questions B取A题(403/404)', await api('GET', `/questions/${qAId}`, tB.token));
    const listB = await api('GET', '/questions?subject_id=iso_subj_A', tB.token);
    check('ISO questions B列表不含A题',
      listB.status === 200 && !asArray(listB.data?.questions).some((q) => q.id === qAId),
      { status: listB.status });

    // ===== subjects 跨租户 =====
    const subjListB = await api('GET', '/subjects', tB.token);
    check('ISO subjects B列表不含A科目',
      subjListB.status === 200 && !asArray(subjListB.data?.subjects).some((s) => s.id === 'iso_subj_A'),
      { status: subjListB.status });
    checkBlocked('ISO subjects B改A科目(403/404)', await api('PUT', '/subjects/iso_subj_A', tB.token, { name: 'ISO_被篡改' }));
    checkBlocked('ISO subjects B删A科目(403/404)', await api('DELETE', '/subjects/iso_subj_A', tB.token));

    // ===== 后续任务在此追加 exams/attempts/practice/tags 断言 =====
    void sA; void sB; void qAId;
  } finally {
    await cleanup(db);
    await db.end();
  }
  reportExit();
};

main().catch((e) => { console.error('FATAL', e); process.exit(2); });
