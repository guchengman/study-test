/**
 * 正式考试模块 - 端到端集成联调脚本
 * 覆盖：注册 teacher/student -> 组卷发布 -> 学员参试(试卷脱敏) -> 提交(服务端判分/编程题待定/透出答案解析)
 *       -> 历史最高分 -> 分析聚合 -> 多作答取最高分 -> 超时 sweep 自动交卷
 *       -> FR-204：owner 读路径(analysis)不再同步全场收卷；getAttempt 仅定向收单份
 *
 * 运行：node server/tests/integration_exam.mjs  （需先启动后端，默认 http://localhost:3100/api；可用 EXAM_IT_BASE 覆盖）
 * 说明：使用 studyapp 直连库做种子与清理（可用 EXAM_IT_DB_HOST/PORT 覆盖）；通过真实 HTTP 调用 /api/exams 全链路。
 */
import mysql from 'mysql2/promise';
import crypto from 'crypto';

const BASE = process.env.EXAM_IT_BASE || 'http://localhost:3100/api';
const DB = {
  host: process.env.EXAM_IT_DB_HOST || 'localhost',
  port: Number(process.env.EXAM_IT_DB_PORT || 3306),
  user: 'studyapp',
  password: '<REDACTED_DB_PASSWORD>',
  database: 'study_test',
};

const results = [];
function check(name, cond, extra) {
  results.push({ name, ok: !!cond });
  console.log(`${cond ? '✅' : '❌'} ${name}${extra !== undefined ? '  ' + JSON.stringify(extra) : ''}`);
}

async function api(method, path, token, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch {}
  return { status: res.status, data };
}

const fmt = (d) => d.toISOString().slice(0, 19).replace('T', ' ');

async function cleanup(db) {
  await db.execute("DELETE FROM exam_attempts WHERE exam_id IN (SELECT id FROM exams WHERE title LIKE 'IT_%')");
  await db.execute("DELETE FROM exams WHERE title LIKE 'IT_%'");
  await db.execute("DELETE FROM questions WHERE subject_id='it_subj_01'");
  await db.execute("DELETE FROM subjects WHERE id='it_subj_01'");
  await db.execute("DELETE FROM users WHERE username IN ('it_teacher','it_student','it_student2')");
  await db.execute("DELETE FROM email_verifications WHERE email IN ('it_teacher@test.com','it_student@test.com','it_student2@test.com')");
}

/**
 * 注册（兼容邮箱验证码强校验）：服务端 NODE_ENV=production 时 register 必须带 6 位验证码，
 * 而集成测试无法收邮件，故直接向 email_verifications 种入 sha256(码) 哈希再带码注册。
 * 若环境未强制校验，种入的码会被忽略，两种情况皆兼容。
 */
async function registerWithCode(db, payload) {
  const code = '654321';
  await db.execute("UPDATE email_verifications SET consumed = 1 WHERE email = ? AND purpose = 'register' AND consumed = 0", [payload.email]);
  await db.execute(
    "INSERT INTO email_verifications (email, purpose, code_hash, expires_at) VALUES (?, 'register', ?, DATE_ADD(NOW(), INTERVAL 5 MINUTE))",
    [payload.email, crypto.createHash('sha256').update(code).digest('hex')]
  );
  return api('POST', '/auth/register', null, { ...payload, emailCode: code });
}

const main = async () => {
  const db = await mysql.createConnection(DB);
  await cleanup(db);

  // 1) 注册 teacher / student（种验证码兼容生产环境强校验，见 registerWithCode）
  let r = await registerWithCode(db, { username: 'it_teacher', password: 'it123456', email: 'it_teacher@test.com', role: 'teacher', phone: '13800000001' });
  check('teacher 注册', r.status === 200 && r.data.token, r.status);
  const tToken = r.data.token, tId = r.data.user.id;

  r = await registerWithCode(db, { username: 'it_student', password: 'it123456', email: 'it_student@test.com', role: 'student' });
  check('student 注册', r.status === 200 && r.data.token, r.status);
  const sToken = r.data.token, sId = r.data.user.id;

  // 学生归属该 teacher（让 share_scope='all' 科目对其可见）
  await db.execute('UPDATE users SET teacher_id=? WHERE id=?', [tId, sId]);

  // 2) 种子科目 + 题目（答案直接存选项文本，避开标签映射歧义）
  await db.execute("INSERT INTO subjects (id,name,created_by,share_scope) VALUES ('it_subj_01','集成测试科目',?,'all')", [tId]);
  const [qa] = await db.execute(
    "INSERT INTO questions (subject_id,type,title,options,answer,explanation,created_by) VALUES ('it_subj_01','single','水果题',?,'\"苹果\"','苹果是水果',?)",
    [JSON.stringify(['苹果', '香蕉', '橙子', '西瓜']), tId]
  );
  const qA = qa.insertId;
  const [qb] = await db.execute(
    "INSERT INTO questions (subject_id,type,title,options,answer,explanation,created_by) VALUES ('it_subj_01','multiple','城市题',?,'[\"北京\",\"上海\"]','北上',?)",
    [JSON.stringify(['北京', '上海', '广州', '深圳']), tId]
  );
  const qB = qb.insertId;
  const [qc] = await db.execute(
    "INSERT INTO questions (subject_id,type,title,options,answer,explanation,created_by) VALUES ('it_subj_01','programming','编程题',NULL,'\"print(1)\"','输出1',?)",
    [tId]
  );
  const qC = qc.insertId;

  // 3) teacher 创建试卷（draft）
  r = await api('POST', '/exams', tToken, {
    subject_id: 'it_subj_01', title: 'IT_模拟考',
    question_set: [{ question_id: qA, points: 40 }, { question_id: qB, points: 40 }, { question_id: qC, points: 20 }],
    duration_minutes: 30, pass_score: 60,
  });
  check('创建试卷', r.status === 200 && r.data.id, r.status);
  const examId = r.data.id;

  // 4) 发布（时间窗：过去1分钟 ~ 未来1天）
  const now = new Date();
  r = await api('PUT', `/exams/${examId}`, tToken, { status: 'published', start_time: fmt(new Date(now.getTime() - 60000)), end_time: fmt(new Date(now.getTime() + 86400000)) });
  check('发布试卷', r.status === 200, r.status);

  // 5) student 可参加列表
  r = await api('GET', '/exams/available', sToken);
  const avail = r.data.exams.find((e) => e.id === examId);
  check('可参加列表含本卷(attempt_state=none)', !!avail && avail.attempt_state === 'none', { state: avail && avail.attempt_state });

  // 6) student 开始 -> 试卷必须脱敏
  r = await api('POST', `/exams/${examId}/start`, sToken);
  check('start 返回 attemptId + questions', r.status === 200 && r.data.attemptId && Array.isArray(r.data.questions), r.status);
  const attemptId = r.data.attemptId;
  const stripped = r.data.questions.every((q) => !('answer' in q) && !('explanation' in q));
  check('试卷已剥离 answer/explanation', stripped);
  check('start total_points=100', r.data.total_points === 100, r.data.total_points);

  // 7) student 提交（单选+多选正确，编程题随便写）
  r = await api('POST', `/exams/${examId}/submit`, sToken, { attemptId, answers: { [qA]: '苹果', [qB]: ['北京', '上海'], [qC]: 'print(2)' } });
  check('提交成功', r.status === 200, r.status);
  const sub = r.data;
  check('score=80 (编程题不计分)', sub.score === 80, sub.score);
  check('total_points=100', sub.total_points === 100, sub.total_points);
  check('correct_count=2', sub.correct_count === 2, sub.correct_count);
  const dA = sub.details.find((d) => d.question_id === qA);
  const dB = sub.details.find((d) => d.question_id === qB);
  const dC = sub.details.find((d) => d.question_id === qC);
  check('qA 正确 得40', dA.is_correct === true && dA.earned === 40, { ic: dA.is_correct, e: dA.earned });
  check('qB 正确 得40', dB.is_correct === true && dB.earned === 40, { ic: dB.is_correct, e: dB.earned });
  check('qC 编程题待定(null/0/needs_manual)', dC.is_correct === null && dC.earned === 0 && dC.needs_manual === true, { ic: dC.is_correct, e: dC.earned, nm: dC.needs_manual });
  check('details 透出 correct_answer+explanation', dA.correct_answer != null && dA.explanation != null, { ca: dA.correct_answer, ex: dA.explanation });

  // 8) 历史（最高分标记）
  r = await api('GET', '/exams/my-history', sToken);
  const hist = r.data.history.find((h) => h.exam_id === examId);
  check('历史 is_best=true 且 bestScores=80', hist && hist.is_best === true && r.data.bestScores[examId] === 80, { isBest: hist && hist.is_best, best: r.data.bestScores[examId] });

  // 9) teacher 分析
  r = await api('GET', `/exams/${examId}/analysis`, tToken);
  const an = r.data.analysis;
  check('分析 referenceCount=1', an.referenceCount === 1, an.referenceCount);
  check('分析 averageScore=80', an.averageScore === 80, an.averageScore);
  check('分析 passRate=1', an.passRate === 1, an.passRate);
  check('分析错误率排除编程题(null不计)', !an.questionErrorRates.find((x) => x.question_id === qC), an.questionErrorRates.map((x) => x.question_id));

  // 10) teacher 答卷列表
  r = await api('GET', `/exams/${examId}/attempts`, tToken);
  check('答卷列表含该学生', r.data.attempts.some((a) => a.user_id === sId && a.username === 'it_student'), r.data.attempts.length);

  // 11) teacher 我的试卷
  r = await api('GET', '/exams', tToken);
  const mine = r.data.exams.find((e) => e.id === examId);
  check('我的试卷 attempt_count=1 avg_score=80', mine && mine.attempt_count === 1 && mine.avg_score === 80, { ac: mine && mine.attempt_count, avg: mine && mine.avg_score });

  // 12) 第二次作答（全错，score=0）-> 最高分仍为 80
  r = await api('POST', `/exams/${examId}/start`, sToken);
  const attemptId2 = r.data.attemptId;
  r = await api('POST', `/exams/${examId}/submit`, sToken, { attemptId: attemptId2, answers: { [qA]: '香蕉', [qB]: ['广州'], [qC]: 'x' } });
  check('第二次提交 score=0', r.status === 200 && r.data.score === 0, r.data.score);
  r = await api('GET', '/exams/my-history', sToken);
  check('多次参考 bestScores 仍为 80', r.data.bestScores[examId] === 80, r.data.bestScores[examId]);
  r = await api('GET', `/exams/${examId}/analysis`, tToken);
  check('分析 avg 仍为 80(每学生最高分口径)', r.data.analysis.averageScore === 80, r.data.analysis.averageScore);

  // 13) 超时强制自动交卷（sweep）
  r = await api('POST', `/exams/${examId}/start`, sToken);
  const attemptId3 = r.data.attemptId;
  await db.execute('UPDATE exam_attempts SET deadline=DATE_SUB(NOW(), INTERVAL 1 MINUTE) WHERE id=?', [attemptId3]);
  r = await api('POST', `/exams/${examId}/sweep`, tToken);
  check('sweep 自动交卷 >=1', r.status === 200 && r.data.autoSubmitted >= 1, r.data);
  r = await api('GET', `/exams/attempts/${attemptId3}`, sToken);
  check('被 sweep 的答卷 status=auto_submitted', r.data.attempt.status === 'auto_submitted', r.data.attempt.status);

  // 14) FR-204：owner 读分析页不再触发全场同步收卷
  r = await registerWithCode(db, { username: 'it_student2', password: 'it123456', email: 'it_student2@test.com', role: 'student' });
  const s2Token = r.data.token, s2Id = r.data.user.id;
  await db.execute('UPDATE users SET teacher_id=? WHERE id=?', [tId, s2Id]);
  r = await api('POST', `/exams/${examId}/start`, s2Token);
  const attemptA = r.data.attemptId; // 将被定向收卷
  r = await api('POST', `/exams/${examId}/start`, sToken);
  const attemptB = r.data.attemptId; // 留给 sweep 端点收卷
  await db.execute('UPDATE exam_attempts SET deadline=DATE_SUB(NOW(), INTERVAL 1 MINUTE) WHERE id IN (?,?)', [attemptA, attemptB]);
  r = await api('GET', `/exams/${examId}/analysis`, tToken);
  check('analysis 调用成功', r.status === 200, r.status);
  let [stRows] = await db.execute('SELECT status FROM exam_attempts WHERE id IN (?,?)', [attemptA, attemptB]);
  check('FR-204: GET /analysis 不再同步全场收卷（过期 attempt 仍 in_progress）',
    stRows.length === 2 && stRows.every((x) => x.status === 'in_progress'), stRows.map((x) => x.status));

  // 15) FR-204：GET /attempts/:attemptId 仅定向收当前这份，不扫全场
  r = await api('GET', `/exams/attempts/${attemptA}`, tToken);
  check('定向收卷：被查看的 attempt status=auto_submitted', r.data.attempt.status === 'auto_submitted', r.data.attempt.status);
  const [stB] = await db.execute('SELECT status FROM exam_attempts WHERE id=?', [attemptB]);
  check('定向收卷：其他过期 attempt 不受影响（仍 in_progress，留给调度器/sweep）', stB[0].status === 'in_progress', stB[0].status);
  r = await api('POST', `/exams/${examId}/sweep`, tToken);
  check('sweep 端点可即时排空剩余积压', r.status === 200 && r.data.autoSubmitted >= 1, r.data);

  await cleanup(db); // 收尾清理，保持库整洁
  await db.end();
  const failed = results.filter((x) => !x.ok);
  console.log(`\n==== 集成联调结论：${results.length - failed.length}/${results.length} 通过 ====`);
  process.exit(failed.length ? 1 : 0);
};

main().catch((e) => { console.error('FATAL', e); process.exit(2); });
