/**
 * 正式考试模块 - 端到端集成联调脚本
 * 覆盖：注册 teacher/student -> 组卷发布 -> 学员参试(试卷脱敏) -> 提交(服务端判分/编程题待定/透出答案解析)
 *       -> 历史最高分 -> 分析聚合 -> 多作答取最高分 -> 超时 sweep 自动交卷
 *       -> FR-204：owner 读路径(analysis)不再同步全场收卷；getAttempt 仅定向收单份
 *       -> FR-101/102/103：判断/填空(逐空部分得分+同义项)/简答(待定) 新题型端到端判分
 *       -> FR-107：编辑生成版本快照 / 版本列表 / 回退 / 软删进回收站 / 恢复 / 彻底删(考试引用 409) / 版本 FK 级联
 *       -> FR-206：创建导出任务 / 轮询状态 / 下载 CSV 含 BOM+表头 / 权限校验 / 学生自助导出
 *       -> FR-202：题目/选项乱序确定性 + 复用 attempt 不复洗 + shuffle_seed/option_order 持久化
 *       -> FR-108：知识点标签 CRUD + 题目绑定/解绑 + 树查询
 *       -> FR-701：通知列表/未读数/单条已读/全部已读/越权拦截
 *       -> storage_usage：管理员手动扫描 → storage_usage 行写入 + 非管理员 403
 *       -> FR-606：配额快照/exam_count 受限 429/上传熔断 429/放行记账/平台概览/BYO 登记
 *       -> FR-301/302：日聚合/趋势/标签掌握度/深度考情(样本不足护栏)/班级横向/越权拦截
 *
 * 运行：node server/tests/integration_exam.mjs  （需先启动后端，默认 http://localhost:3100/api；可用 EXAM_IT_BASE 覆盖）
 * 说明：使用 studyapp 直连库做种子与清理（可用 EXAM_IT_DB_HOST/PORT 覆盖）；通过真实 HTTP 调用 /api/exams 全链路。
 */
import mysql from 'mysql2/promise';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOADS_ROOT = path.resolve(__dirname, '../uploads');

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
  await db.execute("DELETE FROM stats_daily WHERE user_id IN (SELECT id FROM users WHERE username IN ('it_teacher','it_student'))");
  await db.execute("DELETE FROM question_tag_map WHERE tag_id IN (SELECT id FROM question_tags WHERE name='IT_统计标签')");
  await db.execute("DELETE FROM question_tags WHERE name='IT_统计标签'");
  await db.execute("DELETE FROM quota_usage WHERE org_id IN (SELECT o.id FROM organizations o JOIN org_members m ON m.org_id=o.id JOIN users u ON u.id=m.user_id WHERE u.username IN ('it_teacher','it_student'))");
  await db.execute("DELETE FROM storage_usage WHERE org_id IN (SELECT o.id FROM organizations o JOIN org_members m ON m.org_id=o.id JOIN users u ON u.id=m.user_id WHERE u.username IN ('it_teacher','it_student'))");
  await db.execute("DELETE FROM question_tag_map WHERE question_id IN (SELECT id FROM questions WHERE subject_id='it_subj_01')");
  await db.execute("DELETE FROM question_tags WHERE org_id IN (SELECT o.id FROM organizations o JOIN org_members m ON m.org_id=o.id JOIN users u ON u.id=m.user_id WHERE u.username IN ('it_teacher','it_student'))");
  await db.execute("DELETE FROM exam_attempts WHERE exam_id IN (SELECT id FROM exams WHERE title LIKE 'IT_%')");
  await db.execute("DELETE FROM exams WHERE title LIKE 'IT_%'");
  await db.execute("DELETE FROM questions WHERE subject_id='it_subj_01'");
  await db.execute("DELETE FROM subjects WHERE id='it_subj_01'");
  await db.execute("DELETE FROM users WHERE username IN ('it_teacher','it_teacher2','it_student','it_student2')");
  await db.execute("DELETE FROM email_verifications WHERE email IN ('it_teacher@test.com','it_teacher2@test.com','it_student@test.com','it_student2@test.com')");
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

  // 16) FR-101/102/103 新题型端到端判分（判断/填空/简答）——独立试卷，不影响上面 100 分制断言
  const [qJudge] = await db.execute(
    "INSERT INTO questions (subject_id,type,title,options,answer,explanation,created_by) VALUES ('it_subj_01','judge','判断题',?,'\"正确\"','1+1=2 为真',?)",
    [JSON.stringify(['正确', '错误']), tId]
  );
  const qJudgeId = qJudge.insertId;
  const [qFill] = await db.execute(
    "INSERT INTO questions (subject_id,type,title,options,answer,explanation,created_by) VALUES ('it_subj_01','fill_in','填空两空(含同义项)',NULL,'[\"2,二\",\"4,四\"]','逐空部分得分',?)",
    [tId]
  );
  const qFillId = qFill.insertId;
  const [qShort] = await db.execute(
    "INSERT INTO questions (subject_id,type,title,options,answer,explanation,created_by) VALUES ('it_subj_01','short_answer','简答题',NULL,'\"参考答案\"','需人工判分',?)",
    [tId]
  );
  const qShortId = qShort.insertId;

  r = await api('POST', '/exams', tToken, {
    subject_id: 'it_subj_01', title: 'IT_新题型考',
    question_set: [{ question_id: qJudgeId, points: 10 }, { question_id: qFillId, points: 10 }, { question_id: qShortId, points: 10 }],
    duration_minutes: 30, pass_score: 60,
  });
  check('新题型试卷创建', r.status === 200 && r.data.id, r.status);
  const exam2Id = r.data.id;
  r = await api('PUT', `/exams/${exam2Id}`, tToken, { status: 'published', start_time: fmt(new Date(now.getTime() - 60000)), end_time: fmt(new Date(now.getTime() + 86400000)) });
  check('新题型试卷发布', r.status === 200, r.status);

  r = await api('POST', `/exams/${exam2Id}/start`, sToken);
  check('新题型 start total_points=30', r.status === 200 && r.data.total_points === 30, r.data && r.data.total_points);
  const attemptN = r.data.attemptId;
  // 判断答“对”(真)、填空答“2/9”(一对一错→部分得分)、简答任意(待定)
  r = await api('POST', `/exams/${exam2Id}/submit`, sToken, {
    attemptId: attemptN,
    answers: { [qJudgeId]: '对', [qFillId]: ['2', '9'], [qShortId]: '学生的简答内容' },
  });
  check('新题型提交成功', r.status === 200, r.status);
  const subN = r.data;
  check('新题型 score=15(判断10+填空部分5+简答0)', subN.score === 15, subN.score);
  check('新题型 total_points=30', subN.total_points === 30, subN.total_points);
  check('新题型 correct_count=1(仅判断全对)', subN.correct_count === 1, subN.correct_count);
  const dJudge = subN.details.find((d) => d.question_id === qJudgeId);
  const dFill = subN.details.find((d) => d.question_id === qFillId);
  const dShort = subN.details.find((d) => d.question_id === qShortId);
  check('judge 真值归一命中(对↔正确) 得10', dJudge.is_correct === true && dJudge.earned === 10, { ic: dJudge.is_correct, e: dJudge.earned });
  check('fill_in 多空部分得分(5)且 is_correct=false', dFill.is_correct === false && dFill.earned === 5, { ic: dFill.is_correct, e: dFill.earned });
  check('short_answer 待定(null/0/needs_manual)', dShort.is_correct === null && dShort.earned === 0 && dShort.needs_manual === true, { ic: dShort.is_correct, e: dShort.earned, nm: dShort.needs_manual });

  // 17) 判断题答错分支 + 填空同义项(二/四)全对满分（二次作答）
  r = await api('POST', `/exams/${exam2Id}/start`, sToken);
  const attemptN2 = r.data.attemptId;
  r = await api('POST', `/exams/${exam2Id}/submit`, sToken, {
    attemptId: attemptN2,
    answers: { [qJudgeId]: '错', [qFillId]: ['二', '四'], [qShortId]: 'x' },
  });
  const subN2 = r.data;
  const dJudge2 = subN2.details.find((d) => d.question_id === qJudgeId);
  const dFill2 = subN2.details.find((d) => d.question_id === qFillId);
  check('judge 答错(错↔正确) → is_correct=false 得0', dJudge2.is_correct === false && dJudge2.earned === 0, { ic: dJudge2.is_correct, e: dJudge2.earned });
  check('fill_in 同义项(二/四)全对 → is_correct=true 满分10', dFill2.is_correct === true && dFill2.earned === 10, { ic: dFill2.is_correct, e: dFill2.earned });

  // 18) FR-107 回收站与版本历史端到端（独立题目，不影响上述判分断言）
  r = await api('POST', '/questions', tToken, { subject_id: 'it_subj_01', type: 'single', title: 'IT_生命周期题', options: ['A', 'B'], answer: 'A', points: 5 });
  check('FR-107 建题', r.status === 200 && r.data.id, r.status);
  const qLife = r.data.id;

  // 18a 编辑一次 -> 生成「编辑前」快照 seq1（原始标题/5 分）
  r = await api('PUT', `/questions/${qLife}`, tToken, { subject_id: 'it_subj_01', type: 'single', title: 'IT_生命周期题-v2', options: ['A', 'B'], answer: 'B', points: 5 });
  check('FR-107 编辑题目', r.status === 200, r.status);
  r = await api('GET', `/questions/${qLife}/versions`, tToken);
  check('FR-107 版本历史>=1且首版为编辑前快照', r.status === 200 && r.data.versions.length >= 1 && r.data.versions[0].payload.title === 'IT_生命周期题', { len: r.data.versions && r.data.versions.length });

  // 18b 再编辑一次（v3/6分）-> 回退到 seq1，标题与分值应恢复原始
  await api('PUT', `/questions/${qLife}`, tToken, { subject_id: 'it_subj_01', type: 'single', title: 'IT_生命周期题-v3', options: ['A', 'B'], answer: 'A', points: 6 });
  r = await api('POST', `/questions/${qLife}/versions/1/revert`, tToken);
  check('FR-107 回退到版本1', r.status === 200, r.status);
  r = await api('GET', `/questions/${qLife}`, tToken);
  check('FR-107 回退后标题/分值恢复原始', r.status === 200 && r.data.question.title === 'IT_生命周期题' && r.data.question.points === 5, { title: r.data && r.data.question && r.data.question.title });

  // 18c 软删 -> 回收站可见 & 单题不可见 -> 恢复 -> 重新可见
  r = await api('DELETE', `/questions/${qLife}`, tToken);
  check('FR-107 软删移入回收站', r.status === 200 && /回收站/.test((r.data && r.data.message) || ''), r.status);
  r = await api('GET', `/questions/recycle`, tToken);
  check('FR-107 回收站列表含该题', r.status === 200 && r.data.questions.some((q) => q.id === qLife), r.status);
  r = await api('GET', `/questions/${qLife}`, tToken);
  check('FR-107 软删后单题不可见(404)', r.status === 404, r.status);
  r = await api('POST', `/questions/${qLife}/restore`, tToken);
  check('FR-107 恢复成功', r.status === 200, r.status);
  r = await api('GET', `/questions/${qLife}`, tToken);
  check('FR-107 恢复后重新可见', r.status === 200, r.status);

  // 18d 被考试引用的题禁止物理删（qA 属于 IT_模拟考）
  r = await api('DELETE', `/questions/${qA}/permanent`, tToken);
  check('FR-107 考试引用禁止物理删(409)', r.status === 409, r.status);

  // 18e 未被引用的题可彻底删除，且版本随 FK 级联清空
  r = await api('DELETE', `/questions/${qLife}/permanent`, tToken);
  check('FR-107 未被引用可彻底删除', r.status === 200, r.status);
  r = await api('GET', `/questions/${qLife}`, tToken);
  check('FR-107 彻底删后不存在(404)', r.status === 404, r.status);
  const [vc] = await db.execute('SELECT COUNT(*) AS c FROM question_versions WHERE question_id = ?', [qLife]);
  check('FR-107 版本随 FK ON DELETE CASCADE 清空', vc[0].c === 0, vc[0].c);

  // ── 19. FR-206 成绩导出（异步任务 + CSV 下载） ──
  // 19a owner 创建导出任务 scope=exam
  {
    const r = await api('POST', '/exports', tToken, { scope: 'exam', exam_id: examId });
    check('FR-206 创建导出任务(201)', r.status === 201, r.status);
    const jobId = r.data?.job_id;
    check('FR-206 返回 job_id', typeof jobId === 'number' && jobId > 0, jobId);

    // 19b 轮询状态至 done/failed（最多等 10s）
    let job = null;
    for (let i = 0; i < 20; i++) {
      const pr = await api('GET', `/exports/jobs/${jobId}`, tToken);
      job = pr.data;
      if (job?.status === 'done' || job?.status === 'failed') break;
      await new Promise((r2) => setTimeout(r2, 500));
    }
    check('FR-206 job 状态=done', job?.status === 'done', job?.status);
    check('FR-206 row_count>0', (job?.row_count ?? 0) > 0, job?.row_count);

    // 19c 下载 CSV
    const dlRes = await fetch(`${BASE}/exports/jobs/${jobId}/download`, {
      headers: { Authorization: 'Bearer ' + tToken },
    });
    check('FR-206 下载返回 200', dlRes.status === 200, dlRes.status);
    const buf = await dlRes.arrayBuffer();
    const bytes = new Uint8Array(buf);
    check('FR-206 CSV 含 UTF-8 BOM (EF BB BF)', bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF);
    const csvText = new TextDecoder('utf-8').decode(buf);
    check('FR-206 CSV 含表头「用户名」', csvText.includes('用户名'));
    check('FR-206 CSV 含逐题列', csvText.includes('第1题'));

    // 19d 未登录不能下载
    const noAuth = await fetch(`${BASE}/exports/jobs/${jobId}/download`);
    check('FR-206 未登录禁止下载(401)', noAuth.status === 401, noAuth.status);

    // 19e 学生自助导出 scope=self
    const r2 = await api('POST', '/exports', sToken, { scope: 'self' });
    check('FR-206 学生自助导出(201)', r2.status === 201, r2.status);
    const selfJobId = r2.data?.job_id;
    let selfJob = null;
    for (let i = 0; i < 20; i++) {
      const pr = await api('GET', `/exports/jobs/${selfJobId}`, sToken);
      selfJob = pr.data;
      if (selfJob?.status === 'done' || selfJob?.status === 'failed') break;
      await new Promise((r3) => setTimeout(r3, 500));
    }
    check('FR-206 self job done', selfJob?.status === 'done', selfJob?.status);

    // 19f 学生不能导出他人考试
    const r3 = await api('POST', '/exports', sToken, { scope: 'exam', exam_id: examId });
    check('FR-206 非owner禁止导出exam(403)', r3.status === 403, r3.status);
  }

  // ── 20. FR-202 试题/选项乱序（确定性 + 复用不复洗） ──
  {
    // 20a 新建 attempt：返回含题序且 DB 持久化 shuffle_seed
    const r = await api('POST', `/exams/${examId}/start`, sToken);
    check('FR-202 start(200)', r.status === 200, r.status);
    const { attemptId: newAid, questions: qs1, reused: re1 } = r.data;
    check('FR-202 新建 attempt (reused=false)', re1 === false, re1);
    check('FR-202 返回题目数量>0', Array.isArray(qs1) && qs1.length > 0, qs1?.length);

    // 查询 DB 确认 shuffle_seed 非空
    const [seedRows] = await db.execute('SELECT shuffle_seed, option_order FROM exam_attempts WHERE id = ?', [newAid]);
    check('FR-202 shuffle_seed 已持久化', seedRows[0]?.shuffle_seed != null && seedRows[0].shuffle_seed > 0, seedRows[0]?.shuffle_seed);
    check('FR-202 option_order 已持久化', seedRows[0]?.option_order != null, typeof seedRows[0]?.option_order);

    // 20b 再次 start（复用）：应返回同题序、同选项序
    const r2 = await api('POST', `/exams/${examId}/start`, sToken);
    const { questions: qs2, reused: re2 } = r2.data;
    check('FR-202 复用 attempt (reused=true)', re2 === true, re2);
    const ids1 = qs1.map((q) => q.id);
    const ids2 = qs2.map((q) => q.id);
    check('FR-202 复用后题序一致', JSON.stringify(ids1) === JSON.stringify(ids2), { ids1, ids2 });

    // 20c 选项一致性：同题的 options 顺序相同
    if (qs1.length > 0 && qs1[0].options && qs1[0].options.length > 1) {
      const opt1 = JSON.stringify(qs1[0].options);
      const matching = qs2.find((q) => q.id === qs1[0].id);
      const opt2 = JSON.stringify(matching?.options);
      check('FR-202 复用后选项序一致', opt1 === opt2);
    } else {
      check('FR-202 题目无多选选项，跳过选项序比对', true);
    }

    // 20d 乱序效果：题序与原 question_set 可能不同（非强断言，因小概率能原序）
    const [examRow] = await db.execute('SELECT question_set FROM exams WHERE id = ?', [examId]);
    const qset = typeof examRow[0].question_set === 'string' ? JSON.parse(examRow[0].question_set) : examRow[0].question_set;
    const origIds = qset.map((x) => x.question_id).filter((id) => ids1.includes(id));
    // 不要求必须不同（概率性）；仅确认返回的题 ID 集合与原集合相同
    check('FR-202 乱序后题ID集合不变', JSON.stringify(ids1.slice().sort()) === JSON.stringify(origIds.slice().sort()));
  }

  // ── 21. FR-108 知识点标签体系 ──
  {
    // 21a 创建标签
    const r1 = await api('POST', '/tags', tToken, { name: '数学', level: 1 });
    check('FR-108 创建L1标签(201)', r1.status === 201 && r1.data.id, r1.status);
    const tagL1 = r1.data.id;

    const r2 = await api('POST', '/tags', tToken, { name: '代数', level: 2, parent_id: tagL1 });
    check('FR-108 创建L2标签(201)', r2.status === 201 && r2.data.id, r2.status);
    const tagL2 = r2.data.id;

    const r3 = await api('POST', '/tags', tToken, { name: '一元二次方程', level: 3, parent_id: tagL2 });
    check('FR-108 创建L3标签(201)', r3.status === 201 && r3.data.id, r3.status);
    const tagL3 = r3.data.id;

    // 21b 重复创建应 409
    const rDup = await api('POST', '/tags', tToken, { name: '数学', level: 1 });
    check('FR-108 重复标签(409)', rDup.status === 409, rDup.status);

    // 21c 查询标签树
    const rTree = await api('GET', '/tags/tree', tToken);
    check('FR-108 树查询含标签(200)', rTree.status === 200 && rTree.data.tags.length >= 3, rTree.data?.tags?.length);

    // 21d 题目绑定标签
    const rBind = await api('POST', `/tags/question/${qA}/bindTags`, tToken, { tag_ids: [tagL1, tagL3] });
    check('FR-108 绑定标签(200)', rBind.status === 200 && rBind.data.added === 2, rBind.data);

    // 21e 获取题目标签
    const rGet = await api('GET', `/tags/question/${qA}`, tToken);
    check('FR-108 题目有2个标签', rGet.status === 200 && rGet.data.tags.length === 2, rGet.data?.tags?.length);

    // 21f 解绑
    const rUnbind = await api('DELETE', `/tags/question/${qA}/unbindTag/${tagL3}`, tToken);
    check('FR-108 解绑成功(200)', rUnbind.status === 200 && rUnbind.data.ok, rUnbind.data);
    const rGet2 = await api('GET', `/tags/question/${qA}`, tToken);
    check('FR-108 解绑后剩1个标签', rGet2.data.tags.length === 1, rGet2.data?.tags?.length);

    // 21g 重命名
    const rRen = await api('PUT', `/tags/${tagL1}`, tToken, { name: '高等数学' });
    check('FR-108 重命名(200)', rRen.status === 200 && rRen.data.ok, rRen.status);

    // 21h 删除标签
    const rDel = await api('DELETE', `/tags/${tagL3}`, tToken);
    check('FR-108 删除标签(200)', rDel.status === 200 && rDel.data.ok, rDel.status);

    // 21i 未登录禁止
    const rNoAuth = await api('GET', '/tags/tree', null);
    check('FR-108 未登录(401)', rNoAuth.status === 401, rNoAuth.status);
  }

  // ── 22. FR-701/702 通知中心 ──
  {
    // 直接种入两条通知（服务端由 notificationService 内部创建，此处模拟数据面读/标记接口）
    const [n1] = await db.execute(
      "INSERT INTO notifications (user_id, type, title, payload) VALUES (?, 'exam_published', '新考试已发布', ?)",
      [tId, JSON.stringify({ exam_id: 1 })]
    );
    const notifId = n1.insertId;
    await db.execute(
      "INSERT INTO notification_deliveries (notification_id, channel, status, sent_at) VALUES (?, 'site', 'sent', NOW())",
      [notifId]
    );
    await db.execute("INSERT INTO notifications (user_id, type, title) VALUES (?, 'system', '系统维护公告')", [tId]);

    // 22a 通知列表
    const rl = await api('GET', '/notifications', tToken);
    check('FR-701 通知列表(200)', rl.status === 200 && rl.data.notifications.length >= 2, rl.data?.notifications?.length);

    // 22b 未读数
    const ru0 = await api('GET', '/notifications/unread-count', tToken);
    check('FR-701 未读数>=2', ru0.status === 200 && ru0.data.count >= 2, ru0.data?.count);

    // 22c 单条标记已读
    const rm = await api('PUT', `/notifications/${notifId}/read`, tToken);
    check('FR-701 标记已读(200)', rm.status === 200 && rm.data.ok, rm.status);

    // 22d 未读数下降
    const ru1 = await api('GET', '/notifications/unread-count', tToken);
    check('FR-701 标已读后未读下降', ru1.data.count === ru0.data.count - 1, { before: ru0.data.count, after: ru1.data.count });

    // 22e 越权：学员标记他人通知 → 404（仅本人可读）
    const rr = await api('PUT', `/notifications/${notifId}/read`, sToken);
    check('FR-701 越权标记(404)', rr.status === 404, rr.status);

    // 22f 全部标记已读
    const rall = await api('PUT', '/notifications/read-all', tToken);
    check('FR-701 全部已读(200)', rall.status === 200 && rall.data.ok, rall.status);
    const ru2 = await api('GET', '/notifications/unread-count', tToken);
    check('FR-701 全部已读后未读=0', ru2.data.count === 0, ru2.data?.count);

    // 22g 未登录禁止
    const rNoAuth2 = await api('GET', '/notifications', null);
    check('FR-701 未登录(401)', rNoAuth2.status === 401, rNoAuth2.status);
  }

  // ── 23. storage_usage 存储用量统计与告警 ──
  {
    // 提升 teacher 为平台管理员，重新登录取 token（role 来自 JWT）
    await db.execute("UPDATE users SET role='admin' WHERE id=?", [tId]);
    const rl = await api('POST', '/auth/login', null, { username: 'it_teacher', password: 'it123456' });
    const aToken = rl.data?.token;
    check('storage 管理员登录(200)', rl.status === 200 && !!aToken, rl.status);

    // 种一个真实上传文件到 uploads/user_<tId>
    const userDir = path.join(UPLOADS_ROOT, `user_${tId}`);
    fs.mkdirSync(userDir, { recursive: true });
    const testFile = path.join(userDir, 'it_storage_probe.bin');
    fs.writeFileSync(testFile, Buffer.alloc(2048));

    // 23a 手动触发扫描
    const rScan = await api('POST', '/admin/storage-usage/scan', aToken);
    check('storage 扫描触发(200)', rScan.status === 200 && typeof rScan.data.users === 'number', rScan.data);

    // 23b DB 校验 storage_usage 行
    const [orgRows] = await db.execute("SELECT m.org_id FROM org_members m JOIN organizations o ON o.id=m.org_id AND o.type='PERSONAL' WHERE m.user_id=? LIMIT 1", [tId]);
    const orgId = orgRows[0]?.org_id;
    check('storage 个人租户存在', orgId != null, orgId);
    const [su] = await db.execute('SELECT bytes_used, file_count, circuit_broken FROM storage_usage WHERE org_id=?', [orgId]);
    check('storage_usage 行已写入', su.length === 1 && Number(su[0]?.bytes_used) >= 2048 && Number(su[0]?.file_count) >= 1, su[0]);
    check('storage_usage 小用量未熔断', Number(su[0]?.circuit_broken) === 0);

    // 23c 非管理员(student)禁止 → 403
    const rDeny = await api('GET', '/admin/storage-usage', sToken);
    check('storage 非管理员禁止(403)', rDeny.status === 403, rDeny.status);

    // 23d 管理员查看全部用量 → 200 数组
    const rAll = await api('GET', '/admin/storage-usage', aToken);
    check('storage 管理员列表(200)', rAll.status === 200 && Array.isArray(rAll.data.usage), rAll.status);

    // 23e 未登录 → 401
    const rNoAuth3 = await api('GET', '/admin/storage-usage', null);
    check('storage 未登录(401)', rNoAuth3.status === 401, rNoAuth3.status);

    try { fs.unlinkSync(testFile); } catch { /* ignore */ }
  }

  // ── 24. FR-606 配额框架 ──
  {
    // teacher 于 step23 已提升为 admin；aToken 块作作用域已销毁，此处重新登录获取
    const [orgRows] = await db.execute("SELECT m.org_id FROM org_members m JOIN organizations o ON o.id=m.org_id AND o.type='PERSONAL' WHERE m.user_id=? LIMIT 1", [tId]);
    const qOrgId = orgRows[0]?.org_id;
    const yearKey = String(new Date(Date.now() + 8 * 3600 * 1000).getUTCFullYear());
    const rlA = await api('POST', '/auth/login', null, { username: 'it_teacher', password: 'it123456' });
    const aToken = rlA.data?.token;
    check('FR-606 管理员登录(200)', rlA.status === 200 && !!aToken, rlA.status);

    // 24a 本人配额快照
    const rUsage = await api('GET', '/quota/usage', aToken);
    const hasExam = Array.isArray(rUsage.data?.usage) && rUsage.data.usage.some((u) => u.resource_type === 'exam_count' && Number(u.limit) === 200);
    check('FR-606 配额快照(200, FREE, exam_count=200)', rUsage.status === 200 && rUsage.data.plan === 'FREE' && hasExam, rUsage.data?.plan);

    // 24b exam_count 受限：预置本年度已用量达上限 → 创建考试 429
    await db.execute(
      "INSERT INTO quota_usage (org_id, resource_type, period_key, used) VALUES (?, 'exam_count', ?, 200) ON DUPLICATE KEY UPDATE used=200",
      [qOrgId, yearKey]
    );
    const rExam = await api('POST', '/exams', aToken, {
      subject_id: 'it_subj_01', title: 'IT_QUOTA_EXAM', question_set: [{ question_id: 1, points: 10 }],
    });
    check('FR-606 考试创建受限(429)', rExam.status === 429 && rExam.data?.reason === 'quota_exceeded', rExam.status);
    await db.execute("DELETE FROM quota_usage WHERE org_id=? AND resource_type='exam_count'", [qOrgId]);

    // 24c 上传熔断：置 circuit_broken=1 → 上传图片 429 circuit_broken
    await db.execute('UPDATE storage_usage SET circuit_broken=1 WHERE org_id=?', [qOrgId]);
    const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
    const form1 = new FormData();
    form1.append('file', new Blob([PNG], { type: 'image/png' }), 'it_quota.png');
    const up1 = await fetch(BASE + '/upload/image', { method: 'POST', headers: { Authorization: 'Bearer ' + aToken }, body: form1 });
    const up1Data = await up1.json().catch(() => null);
    check('FR-606 上传熔断(429 circuit_broken)', up1.status === 429 && up1Data?.reason === 'circuit_broken', up1.status);

    // 24d 解除熔断 → 正常上传 200 且 upload_bytes 记账
    await db.execute('UPDATE storage_usage SET circuit_broken=0 WHERE org_id=?', [qOrgId]);
    const form2 = new FormData();
    form2.append('file', new Blob([PNG], { type: 'image/png' }), 'it_quota.png');
    const up2 = await fetch(BASE + '/upload/image', { method: 'POST', headers: { Authorization: 'Bearer ' + aToken }, body: form2 });
    const up2Data = await up2.json().catch(() => null);
    check('FR-606 上传放行(200)', up2.status === 200 && !!up2Data?.url, up2.status);
    const [ub] = await db.execute("SELECT used FROM quota_usage WHERE org_id=? AND resource_type='upload_bytes'", [qOrgId]);
    check('FR-606 upload_bytes 记账', ub.length === 1 && Number(ub[0].used) >= PNG.length, ub[0]);
    // 清理上传产物
    if (up2Data?.filename) { try { fs.unlinkSync(path.join(UPLOADS_ROOT, `user_${tId}`, up2Data.filename)); } catch { /* ignore */ } }

    // 24e 平台概览：admin 200 / student 403
    const rOv = await api('GET', '/quota/admin/overview', aToken);
    check('FR-606 平台概览(admin 200)', rOv.status === 200 && Array.isArray(rOv.data?.overview), rOv.status);
    const rOvDeny = await api('GET', '/quota/admin/overview', sToken);
    check('FR-606 平台概览(student 403)', rOvDeny.status === 403, rOvDeny.status);

    // 24f BYO Key 登记：返回 sha256 指纹
    const rByo = await api('POST', '/quota/byo-register', aToken, { provider: 'gemini', key_preview: 'sk-test-abcdef' });
    check('FR-606 BYO 登记(200, 64hex)', rByo.status === 200 && /^[0-9a-f]{64}$/.test(rByo.data?.key_hash || ''), rByo.data);
    const rByoBad = await api('POST', '/quota/byo-register', aToken, { provider: 'unknown', key_preview: 'x' });
    check('FR-606 BYO 非法provider(400)', rByoBad.status === 400, rByoBad.status);

    // 24g 未登录 → 401
    const rNoAuth4 = await api('GET', '/quota/usage', null);
    check('FR-606 未登录(401)', rNoAuth4.status === 401, rNoAuth4.status);
  }

  // ── 25. FR-301/302 学情/考情看板 ──
  {
    // teacher 于 step23 已提升为 admin；学员/管理员分别重新登录取 token
    const rlS = await api('POST', '/auth/login', null, { username: 'it_student', password: 'it123456' });
    const stuToken = rlS.data?.token;
    const rlT = await api('POST', '/auth/login', null, { username: 'it_teacher', password: 'it123456' });
    const admToken = rlT.data?.token;

    // 25a 绑定标签到 qA（FR-108 维度），供掌握度统计（须在聚合前完成）
    const [tagIns] = await db.execute("INSERT INTO question_tags (org_id, name, parent_id, level) VALUES (NULL, 'IT_统计标签', NULL, 1)");
    const statTagId = tagIns.insertId;
    await db.execute('INSERT INTO question_tag_map (question_id, tag_id) VALUES (?, ?)', [qA, statTagId]);

    // 25b 取已提交答卷的业务日（与 aggregate 的 DATE(submitted_at) 同源，避免时区错配）
    const [adRow] = await db.execute(
      "SELECT DATE_FORMAT(submitted_at,'%Y-%m-%d') AS d FROM exam_attempts WHERE user_id=? AND exam_id=? AND status IN ('submitted','auto_submitted') ORDER BY id DESC LIMIT 1",
      [sId, examId]
    );
    const aggDate = adRow[0]?.d;
    check('FR-301 存在已交卷业务日', !!aggDate, aggDate);

    // 25c 手动聚合：越权(student 403) / 管理员(200, rows>0)
    const rAggDeny = await api('POST', `/stats/admin/aggregate?date=${aggDate}`, stuToken);
    check('FR-301 聚合越权(student 403)', rAggDeny.status === 403, rAggDeny.status);
    const rAgg = await api('POST', `/stats/admin/aggregate?date=${aggDate}`, admToken);
    check('FR-301 手动聚合(200 rows>0)', rAgg.status === 200 && rAgg.data.ok && Number(rAgg.data.rows) > 0, rAgg.data);

    // 25d stats_daily 落库（practiced/correct 总量口径 dim_key IS NULL）
    const [sd] = await db.execute(
      "SELECT metric, dim_key, value FROM stats_daily WHERE user_id=? AND date=? AND metric IN ('practiced','correct') AND dim_key IS NULL",
      [sId, aggDate]
    );
    const pracRow = sd.find((x) => x.metric === 'practiced');
    check('FR-301 stats_daily practiced 落库(>=2)', !!pracRow && Number(pracRow.value) >= 2, sd);

    // 25e 本人指标趋势
    const rTrend = await api('GET', '/stats/me/trend?metric=practiced&days=30', stuToken);
    check('FR-301 趋势含聚合日', rTrend.status === 200 && rTrend.data.trend.some((p) => p.date === aggDate && Number(p.value) >= 2), rTrend.data);

    // 25f 标签掌握度雷达（依赖 tag 维度）
    const rMast = await api('GET', '/stats/me/mastery', stuToken);
    const mi = rMast.data?.mastery?.find((m) => m.tag_id === statTagId);
    check('FR-301 掌握度含标签且100%', !!mi && mi.practiced >= 1 && mi.mastery === 100, rMast.data?.mastery);

    // 25g 深度考情：owner(admin) 200；n<50 样本不足不产出区分度
    const rAn = await api('GET', `/stats/exam/${examId}/analysis`, admToken);
    check('FR-302 考情owner(200)', rAn.status === 200 && rAn.data.analysis.referenceCount >= 1, rAn.status);
    check('FR-302 样本不足(n<50 不显示区分度)', rAn.data.analysis.sample_insufficient === true && rAn.data.analysis.discrimination === null, { n: rAn.data.analysis?.sampleSize });

    // 25h 越权：非 owner 学员查看他人试卷分析 → 403
    const rAnDeny = await api('GET', `/stats/exam/${examId}/analysis`, stuToken);
    check('FR-302 非owner学员(403)', rAnDeny.status === 403, rAnDeny.status);

    // 25h2 越权收紧（L3 回归）：非创建者的 teacher 也不能访问他人试卷→ 403（stats + exams 同时生效）
    const rT2 = await registerWithCode(db, { username: 'it_teacher2', password: 'it123456', email: 'it_teacher2@test.com', role: 'teacher', phone: '13800000002' });
    const t2Token = rT2.data?.token;
    const rAnT2 = await api('GET', `/stats/exam/${examId}/analysis`, t2Token);
    check('L3回归 非owner教师 stats(403)', rAnT2.status === 403, rAnT2.status);
    const rExamT2 = await api('GET', `/exams/${examId}`, t2Token);
    check('L3回归 非owner教师 exams(403)', rExamT2.status === 403, rExamT2.status);

    // 25i 班级横向：admin 200 含 it_student；student 403
    const rCls = await api('GET', '/stats/class/compare', admToken);
    check('FR-302 班级对比(admin 200)', rCls.status === 200 && Array.isArray(rCls.data.students), rCls.status);
    const rClsDeny = await api('GET', '/stats/class/compare', stuToken);
    check('FR-302 班级对比(student 403)', rClsDeny.status === 403, rClsDeny.status);

    // 25j 未登录 → 401
    const rNoAuth5 = await api('GET', '/stats/me/trend', null);
    check('FR-301 未登录(401)', rNoAuth5.status === 401, rNoAuth5.status);
  }

  await cleanup(db); // 收尾清理，保持库整洁
  await db.end();
  const failed = results.filter((x) => !x.ok);
  console.log(`\n==== 集成联调结论：${results.length - failed.length}/${results.length} 通过 ====`);
  process.exit(failed.length ? 1 : 0);
};

main().catch((e) => { console.error('FATAL', e); process.exit(2); });
