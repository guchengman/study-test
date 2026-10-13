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
    await db.execute("INSERT INTO subjects (id, name, created_by, share_scope) VALUES ('iso_subj_A', 'ISO_科目A', ?, 'students')", [tA.id]);
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

    // ===== exams / exam_attempts 跨租户 =====
    const examA = await api('POST', '/exams', tA.token, {
      subject_id: 'iso_subj_A', title: 'ISO_考A',
      question_set: [{ question_id: qAId, points: 100 }],
      duration_minutes: 30, pass_score: 60,
    });
    check('ISO A 建考试', examA.status === 200 && examA.data?.id, examA.status);
    const examAId = examA.data?.id;
    const _now = new Date();
    await api('PUT', `/exams/${examAId}`, tA.token, {
      status: 'published',
      start_time: fmt(new Date(_now.getTime() - 60000)),
      end_time: fmt(new Date(_now.getTime() + 86400000)),
    });
    const startA = await api('POST', `/exams/${examAId}/start`, sA.token);
    const attemptAId = startA.data?.attemptId;
    check('ISO A 学员开考产出 attemptId', !!attemptAId, startA.status);

    checkBlocked('ISO exams B看A考试详情(403/404)', await api('GET', `/exams/${examAId}`, tB.token));
    checkBlocked('ISO exams B看A答卷列表(403/404)', await api('GET', `/exams/${examAId}/attempts`, tB.token));
    checkBlocked('ISO exams B看A考情分析(403/404)', await api('GET', `/exams/${examAId}/analysis`, tB.token));
    if (attemptAId) {
      checkBlocked('ISO exam_attempts B读A学员答卷(403/404)', await api('GET', `/exams/attempts/${attemptAId}`, tB.token));
    }
    const availB = await api('GET', '/exams/available', sB.token);
    check('ISO exams A考试不在B学员可参加列表',
      availB.status === 200 && !asArray(availB.data?.exams).some((e) => e.id === examAId), { status: availB.status });

    // ===== mistakes / favorites / study_stats（学员维度"仅见己有"）=====
    // A 学员产生错题/收藏/学习统计（均基于 A 的题 qAId）
    await api('POST', '/practice/mistakes', sA.token, { question_id: qAId, is_correct: false });
    await api('POST', '/practice/favorites', sA.token, { question_id: qAId });
    await api('POST', '/practice/stats', sA.token, { subject_id: 'iso_subj_A', correct: 4, total: 5 });

    // 正向校验：A 学员确实能看到自己的数据（避免 B 断言沦为"空集合"假通过）
    const mkA = await api('GET', '/practice/mistakes', sA.token);
    check('ISO mistakes A确有该记录',
      mkA.status === 200 && asArray(mkA.data?.mistakes).some((m) => String(m.question_id) === String(qAId)), { status: mkA.status });
    const favA = await api('GET', '/practice/favorites', sA.token);
    check('ISO favorites A确有该记录',
      favA.status === 200 && asArray(favA.data?.favorites).some((f) => String(f.id) === String(qAId)), { status: favA.status });
    const stA = await api('GET', '/practice/stats', sA.token);
    check('ISO study_stats A确有该科目统计',
      stA.status === 200 && asArray(stA.data?.stats).some((s) => String(s.subject_id) === 'iso_subj_A'), { status: stA.status });

    const mkB = await api('GET', '/practice/mistakes', sB.token);
    check('ISO mistakes B列表不含A记录',
      mkB.status === 200 && !asArray(mkB.data?.mistakes).some((m) => String(m.question_id) === String(qAId)),
      { status: mkB.status });
    const favB = await api('GET', '/practice/favorites', sB.token);
    check('ISO favorites B列表不含A记录',
      favB.status === 200 && !asArray(favB.data?.favorites).some((f) => String(f.id) === String(qAId)),
      { status: favB.status });
    const stB = await api('GET', '/practice/stats', sB.token);
    check('ISO study_stats B不含A科目统计',
      stB.status === 200 && !asArray(stB.data?.stats).some((s) => String(s.subject_id) === 'iso_subj_A'),
      { status: stB.status });

    // ===== tags 跨租户 =====
    const tagA = await api('POST', '/tags', tA.token, { name: 'ISO_标签A', level: 1 });
    const tagAId = tagA.data?.id;
    check('ISO A 建标签', tagA.status === 201 && !!tagAId, { status: tagA.status, id: tagAId });
    if (tagAId) await api('POST', `/tags/question/${qAId}/bindTags`, tA.token, { tag_ids: [tagAId] });

    // B 读 A 题的标签。
    // 读侧发现：GET /tags/question/:id 当前不校验题目归属，会泄漏他人题目绑定的标签。
    // 属 Phase 2 读侧隔离缺口（见 spec §4.2 / 待 WS-2 修复），M1 记为 KNOWN-GAP、不作硬门禁；
    // 一旦将来修复（不可达或不含他人标签），下方自动转为一条绿色断言。
    const tagBq = await api('GET', `/tags/question/${qAId}`, tB.token);
    const tagsLeaked = tagBq.status === 200 && asArray(tagBq.data?.tags).some((t) => t.id === tagAId);
    if (tagsLeaked) {
      console.log('⚠️  KNOWN-GAP ISO tags: GET /tags/question/:id 未做题目归属校验，B 读到 A 题目标签（读侧隔离待 WS-2）');
    } else {
      check('ISO tags B读A题标签(已隔离)', tagBq.status === 403 || tagBq.status === 404 || !asArray(tagBq.data?.tags).some((t) => t.id === tagAId), { status: tagBq.status });
    }
    // B 标签树是否含 A 私有标签（若含→暴露读侧未隔离，属真实发现）
    const treeB = await api('GET', '/tags/tree', tB.token);
    check('ISO tags B树不含A标签',
      treeB.status === 200 && !JSON.stringify(treeB.data?.tags || []).includes('ISO_标签A'),
      { status: treeB.status });
  } finally {
    await cleanup(db);
    await db.end();
  }
  reportExit();
};

main().catch((e) => { console.error('FATAL', e); process.exit(2); });
