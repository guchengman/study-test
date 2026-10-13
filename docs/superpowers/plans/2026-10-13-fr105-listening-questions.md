# FR-105 听力题（音频挂载）核心纵切 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 给普通题挂一段音频（可空 `audio_url`），交付「上传音频 → 挂到题目 → 练习/正式考试页 blob 鉴权播放 → 判分不变」核心主链 + 四重门禁。

**Architecture:** 听力不是新题型，只是 `questions` 多一个可空软引用列 `audio_url`（迁移 026，无 FK）。后端上传复用现有 multer 磁盘管线扩到音频；考试/练习下发在既有 SELECT 追加 `q.audio_url`。前端用带 `Authorization` 的 `fetch → blob → createObjectURL` 渲染 `<audio controls>`（复用 `exportApi.downloadBlob` 先例），不放松 `/api/uploads` 鉴权。SSOT 判分零改动。

**Tech Stack:** Node/Express + mysql2 + multer（后端）；React + TypeScript + Tailwind + motion + lucide-react（前端）；vitest（server & root）；`.mjs` HTTP 集成/隔离门禁。

**设计事实来源：** [specs/2026-10-13-fr105-listening-questions-design.md](../specs/2026-10-13-fr105-listening-questions-design.md)

---

## 环境约定（每个 HTTP 门任务都适用）

- 分支：`feature/fr105-listening-questions`（T1 起建；base=main，当前 HEAD `04dd6c8`）。
- 后端：`cd server; node src/index.js`（默认 3100）。**每次改后端代码或连跑 HTTP 门前，先 kill 旧 node 再起 fresh server**（`apiLimiter` 内存 store 重启清零，避免累计触发 429）。
- HTTP 门基址：`$env:EXAM_IT_BASE='http://127.0.0.1:3100/api'`（规避 Windows localhost→::1）。
- 迁移：`.gitignore` 忽略 `*.sql`，历史迁移均 `git add -f`；`node src/migrate.js` 按文件名在 `schema_migrations` 记录、每文件仅应用一次。
- PowerShell 无 `sed`，用 Read/Grep 定位；LF→CRLF 警告无害。
- 门禁清单（T10 全跑）：`node server/tests/integration_exam.mjs`、`node server/tests/isolation.integration.mjs`（各 fresh server）、`cd server && npx vitest run`、根 `npx vitest run`、`npx tsc --noEmit`。

## File Structure（本增量涉及）

- Create `server/migrations/026_question_audio.sql` — 追加 `questions.audio_url`（仅此一句 ALTER）。
- Modify `server/src/routes/upload.js` — 抽音频 multer 实例 + `POST /audio`。
- Modify `server/src/routes/questions.js` — create(L157)/batch(L226)/update(L249) 三处写 `audio_url`。
- Modify `server/src/routes/exams.js` — 详情 SELECT(L256/L282)、start SELECT(L442/L456) 带出 `audio_url`。
- Modify `server/tests/integration_exam.mjs` — 追加 FR-105 音频端到端段。
- Modify `server/tests/isolation.integration.mjs` — 追加 FR-105 音频题跨租户断言段。
- Modify `src/types.ts` — `Question.audioUrl`、`ExamQuestionDetail/ExamQuestionFull.audio_url`。
- Modify `src/services/api.ts` — `QuestionItem.audio_url`、`uploadApi.audio`、`mediaApi.fetchBlob`。
- Modify `src/services/api.mappers.ts` — `questionItemToQuestion` 带出 `audioUrl`。
- Modify `src/hooks/useQuestionBank.ts` — `handleImport` 映射 `audio_url`。
- Create `src/components/AudioPlayer.tsx` — blob 鉴权播放组件。
- Create `src/components/exam/QuestionForm.tsx` — 「新建题目」模态（含音频上传）。
- Modify `src/components/import/PreviewList.tsx` — 逐题「上传音频」控件。
- Modify `src/components/ImportModal.tsx` — 传入 `onAudioUpload`，写回 `preview[idx].audioUrl`。
- Modify `src/pages/QuestionManagePage.tsx` — 「新建题目」按钮 + 模态。
- Modify `src/components/app/ExamScreen.tsx` — 练习页渲染 `AudioPlayer`。
- Modify `src/components/app/FormalExamScreen.tsx` — 考试页渲染 `AudioPlayer`。
- Modify `docs/开发文档.md`、`docs/产品需求文档-平台化演进.md`。

---

## Task 1: 分支 + 数据迁移 026

**Files:**
- Create: `server/migrations/026_question_audio.sql`

- [ ] **Step 1: 建功能分支**

```bash
git checkout -b feature/fr105-listening-questions
```

- [ ] **Step 2: 写迁移（对齐 025 风格，幂等由 migrate.js 记录保证，仅一句 ALTER）**

`server/migrations/026_question_audio.sql`：

```sql
-- 026：FR-105 听力题（音频挂载）
--   questions 加可空软引用列 audio_url，存上传返回的相对路径（/api/uploads/...）。
--   非新题型：听力题仍是普通题（single/fill_in/…），音频仅题干刺激物，判分复用既有 gradeAttempt，SSOT 零改动。
--   audio_url 是「软引用」上传文件而非表引用，不设 FK/CASCADE；删除文件不影响题目行（YAGNI，本增量不做级联清理）。
--   范式对齐 013/014/025：utf8mb4_unicode_ci；migrate.js 按「分号+换行」拆句，语句体内不得出现行内分号；每文件仅应用一次。

ALTER TABLE questions
  ADD COLUMN audio_url VARCHAR(300) DEFAULT NULL COMMENT 'FR-105 听力题音频相对路径(/api/uploads/...)，NULL=非音频题；软引用上传文件，无 FK';
```

- [ ] **Step 3: 应用迁移并校验列存在**

Run: `cd server; node src/migrate.js`
Expected: 输出含 `026_question_audio.sql` 应用成功；无报错。

Run（校验）: `cd server; node -e "import('./src/db.js').then(async m=>{const [r]=await m.default.execute('SHOW COLUMNS FROM questions LIKE \'audio_url\'');console.log(JSON.stringify(r));process.exit(r.length?0:1)})"`
Expected: 打印一行 `audio_url` 列定义（`Type` 含 `varchar(300)`、`Null: YES`），退出码 0。

- [ ] **Step 4: 提交（迁移需 -f 强制入库）**

```bash
git add -f server/migrations/026_question_audio.sql
git commit -m "feat(fr105): 迁移026 questions.audio_url（可空软引用，无FK，SSOT零改动前提）"
```

---

## Task 2: 后端下发 `audio_url`（建题/批量/更新 + 考试读路径）

先写失败测试（integration_exam FR-105 段），跑红，再实现，跑绿。

**Files:**
- Modify: `server/tests/integration_exam.mjs`（在 19b FR-104 段之后插入）
- Modify: `server/src/routes/questions.js`（L157 create、L226 batch、L249/267 update）
- Modify: `server/src/routes/exams.js`（L256+L282 详情、L442+L456 start）

- [ ] **Step 1: 写失败测试——在 integration_exam.mjs 插入 FR-105 段**

在 `19b) FR-104` 段的收尾之后、`// 18) FR-107` 之前，插入下面这段（复用已在作用域内的 `tToken`、`sToken`、`now`、`fmt`、`BASE`、`api`、`check`、`db`、`fs`、`path`、`UPLOADS_ROOT`、`tId`）：

```js
  // 19c) FR-105 听力题（音频挂载）端到端：上传音频→建题挂 audio_url→列/详情/开考下发→判分不变
  {
    // 用合法音频 MIME（fileFilter 校验扩展名 + mimetype，无需真实解码）
    const MP3 = Buffer.from('SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4Ljc2LjEwMAAAAAAAAAAAAAAA', 'base64');
    const aForm = new FormData();
    aForm.append('file', new Blob([MP3], { type: 'audio/mpeg' }), 'it_audio.mp3');
    const aUp = await fetch(BASE + '/upload/audio', { method: 'POST', headers: { Authorization: 'Bearer ' + tToken }, body: aForm });
    const aUpData = await aUp.json().catch(() => null);
    check('FR105 上传音频(200,含url)', aUp.status === 200 && typeof aUpData?.url === 'string' && /\/api\/uploads\/user_\d+\//.test(aUpData.url), { status: aUp.status, body: aUpData });
    const audioUrl = aUpData?.url;

    // 非法格式（伪装 .exe + 非 audio MIME）应 400
    const badForm = new FormData();
    badForm.append('file', new Blob([Buffer.from('notaudio')], { type: 'application/octet-stream' }), 'it_bad.exe');
    const badUp = await fetch(BASE + '/upload/audio', { method: 'POST', headers: { Authorization: 'Bearer ' + tToken }, body: badForm });
    check('FR105 非法音频格式被拒(400)', badUp.status === 400, badUp.status);

    // 建题挂 audio_url（走 create 端点）
    const rc = await api('POST', '/questions', tToken, {
      subject_id: 'it_subj_01', type: 'single', title: 'IT_FR105音频题',
      options: ['甲', '乙'], answer: '甲', audio_url: audioUrl,
    });
    check('FR105 建题(200,id)', rc.status === 200 && rc.data?.id, rc.status);
    const qAudio = rc.data?.id;

    // 列表原样回读 audio_url（SELECT q.* 自动带出）
    const rl = await api('GET', '/questions?subject_id=it_subj_01', tToken);
    const rowAudio = (rl.data?.questions || []).find((x) => x.id === qAudio);
    check('FR105 列表回读audio_url一致', rl.status === 200 && rowAudio?.audio_url === audioUrl, { got: rowAudio?.audio_url });

    // 详情回读
    const rd = await api('GET', `/questions/${qAudio}`, tToken);
    check('FR105 详情回读audio_url', rd.status === 200 && rd.data?.question?.audio_url === audioUrl, rd.status);

    // 组卷 → 发布 → 开考：start 下发的题携 audio_url（脱敏仍成立，不含 answer/explanation）
    const rex = await api('POST', '/exams', tToken, {
      subject_id: 'it_subj_01', title: 'IT_FR105听考',
      question_set: [{ question_id: qAudio, points: 100 }], duration_minutes: 30, pass_score: 60,
    });
    const exAudio = rex.data?.id;
    await api('PUT', `/exams/${exAudio}`, tToken, { status: 'published', start_time: fmt(new Date(now.getTime() - 60000)), end_time: fmt(new Date(now.getTime() + 86400000)) });
    const rst = await api('POST', `/exams/${exAudio}/start`, sToken);
    const startQ = (rst.data?.questions || []).find((x) => x.id === qAudio);
    check('FR105 开考下发audio_url且脱敏', rst.status === 200 && startQ?.audio_url === audioUrl && !('answer' in (startQ || {})), { status: rst.status });

    // 详情(组卷预览)也带出 audio_url
    const redx = await api('GET', `/exams/${exAudio}`, tToken);
    const detailQ = (redx.data?.exam?.questions || []).find((x) => x.id === qAudio);
    check('FR105 试卷详情携audio_url', redx.status === 200 && detailQ?.audio_url === audioUrl, redx.status);

    // 交卷判分不变：答对满分（证明音频列不影响 SSOT）
    const rsub = await api('POST', `/exams/${exAudio}/submit`, sToken, { attemptId: rst.data.attemptId, answers: { [qAudio]: '甲' } });
    check('FR105 判分不受影响 score=100', rsub.status === 200 && rsub.data.score === 100 && rsub.data.correct_count === 1, { status: rsub.status, score: rsub.data?.score });

    // 更新可清空 audio_url（去掉音频回归普通题）
    await api('PUT', `/questions/${qAudio}`, tToken, { subject_id: 'it_subj_01', type: 'single', title: 'IT_FR105音频题', options: ['甲', '乙'], answer: '甲', audio_url: null });
    const rnull = await api('GET', `/questions/${qAudio}`, tToken);
    check('FR105 更新可清空audio_url', rnull.status === 200 && (rnull.data?.question?.audio_url == null), rnull.data?.question?.audio_url);

    // 清理落盘音频文件（题/科目由既有 cleanup 覆盖）
    if (aUpData?.filename) { try { fs.unlinkSync(path.join(UPLOADS_ROOT, `user_${tId}`, aUpData.filename)); } catch { /* ignore */ } }
  }
```

- [ ] **Step 2: 起 fresh server，跑测试确认失败**

```bash
# 先 kill 任何占用 3100 的旧 node（Get-NetTCPConnection -LocalPort 3100 → Stop-Process），再起新
cd server; $env:EXAM_IT_BASE='http://127.0.0.1:3100/api'; node src/index.js *> server-out.log   # 后台/独立终端
# 待 health 就绪：curl http://127.0.0.1:3100/api/health
node tests/integration_exam.mjs
```
Expected: `FR105 上传音频` 等断言 FAIL（`/upload/audio` 404、`audio_url` 未落库/未下发），exit 1。

- [ ] **Step 3: 实现 questions.js create 写 audio_url（L117/L157-162）**

`server/src/routes/questions.js` 创建题目路由，解构行改为：

```js
    const { subject_id, type, title, code, options, answer, explanation, points = 1, audio_url } = req.body;
```

INSERT 改为（列与占位符各加一个 `audio_url` / `?`，参数数组在 `req.user.id` 前插入 `audio_url || null`）：

```js
    const [result] = await pool.execute(
      `INSERT INTO questions (subject_id, type, title, code, options, answer, explanation, points, audio_url, created_by, org_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [subject_id, type, title, code || null, options ? JSON.stringify(options) : null,
       JSON.stringify(answer), explanation || null, points, audio_url || null, req.user.id, await resolvePersonalOrgId(pool, req.user.id)]
    );
```

- [ ] **Step 4: 实现 batch 写 audio_url（L226-232）**

```js
      const [result] = await conn.execute(
        `INSERT INTO questions (subject_id, type, title, code, options, answer, explanation, points, audio_url, created_by, org_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [q.subject_id || subject_id, q.type || 'single', q.title,
         q.code || null, q.options ? JSON.stringify(q.options) : null,
         JSON.stringify(q.answer), q.explanation || null, q.points || 1, q.audio_url || null, req.user.id, batchOrgId]
      );
```

- [ ] **Step 5: 实现 update 写/清空 audio_url（L249 解构 + L267 SET）**

解构行改为：

```js
    const { subject_id, type, title, code, options, answer, explanation, points, audio_url } = req.body;
```

UPDATE 语句加 `audio_url=?`（用 `?? null` 支持显式清空；未传字段沿用 `undefined→null` 与既有风格一致，但 audio 需允许清空，故：传了用值、未传保留原值）：

```js
    await pool.execute(
      `UPDATE questions SET subject_id=?, type=?, title=?, code=?, options=?, answer=?, explanation=?, points=?, audio_url=?, updated_at=NOW()
       WHERE id = ? AND created_by = ?`,
      [subject_id, type, title, code || null, options ? JSON.stringify(options) : null,
       JSON.stringify(answer), explanation || null, points || 1,
       audio_url === undefined ? null : (audio_url || null), req.params.id, req.user.id]
    );
```

> 注：FR-107 `snapshotCurrentVersion` 在 UPDATE 前已把「当前内容」存版，本列是否入快照不影响判分；不改动该辅助函数。

- [ ] **Step 6: 实现 exams.js 详情下发（L256 SELECT + L282 返回对象）**

SELECT 列加 `q.audio_url`：

```js
      const [qRows] = await pool.execute(
        `SELECT q.id, q.type, q.title, q.code, q.options, q.answer, q.explanation, q.points,
                q.group_id, qg.material AS group_material, q.audio_url
         FROM questions q LEFT JOIN question_groups qg ON q.group_id = qg.id
         WHERE q.id IN (${placeholders})`,
        questionIds
      );
```

返回对象（`questionMap` 映射处）加 `audio_url`：

```js
      return {
        id: q.id,
        type: q.type,
        title: q.title,
        code: q.code,
        options: parseJsonSafe(q.options, []),
        answer: parseJsonSafe(q.answer, q.answer),
        explanation: q.explanation || '',
        points: item.points,
        group_id: q.group_id ?? null,
        group_material: q.group_material ?? null,
        audio_url: q.audio_url ?? null,
      };
```

- [ ] **Step 7: 实现 exams.js start 下发（L442 SELECT + L456 返回对象）**

SELECT 加 `q.audio_url`：

```js
      const [qRows] = await pool.execute(
        `SELECT q.id, q.type, q.title, q.code, q.options, q.points,
                q.group_id, qg.material AS group_material, q.audio_url
         FROM questions q LEFT JOIN question_groups qg ON q.group_id = qg.id
         WHERE q.deleted_at IS NULL AND q.id IN (${placeholders})`,
        questionIds
      );
```

返回对象加 `audio_url`：

```js
          return {
            id: q.id,
            type: q.type,
            title: q.title,
            code: q.code,
            options: parseJsonSafe(q.options, []),
            points: item.points,
            group_id: q.group_id ?? null,
            group_material: q.group_material ?? null,
            audio_url: q.audio_url ?? null,
          };
```

- [ ] **Step 8: 实现 upload.js 音频端点（在图片 router 之后、`export` 之前追加）**

复用同文件顶部的 `uploadsRoot`、`resolvePersonalOrgId`、`checkQuota`、`recordUsage`、`log`、`authMiddleware`、`unlinkSync/existsSync/mkdirSync`、`uuidv4`。新增独立 multer 实例 + `/audio`：

```js
// FR-105：音频上传——独立 multer 实例（扩展名/MIME 双校验 + 15MB），复用同一磁盘落盘与 FR-606 配额/熔断记账
const audioStorage = multer.diskStorage({
  destination: (req, _file, cb) => {
    const userDir = path.join(uploadsRoot, `user_${req.user.id}`);
    if (!existsSync(userDir)) mkdirSync(userDir, { recursive: true });
    cb(null, userDir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${uuidv4()}${ext}`);
  },
});

const uploadAudio = multer({
  storage: audioStorage,
  limits: { fileSize: 15 * 1024 * 1024 }, // 15MB
  fileFilter: (_req, file, cb) => {
    const allowed = /\.(mp3|m4a|wav)$/i;
    const mimeOk = /^audio\/(mpegmp3|mpeg|x-m4a|mp3|wav|wave|m4a)$/i.test(file.mimetype);
    if (allowed.test(path.extname(file.originalname)) && mimeOk) {
      cb(null, true);
    } else {
      cb(new Error('仅支持音频格式: mp3, m4a, wav'));
    }
  },
});

router.post('/audio', authMiddleware, (req, res) => {
  uploadAudio.single('file')(req, res, async (err) => {
    if (err) {
      if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ error: '音频文件大小不能超过 15MB' });
      }
      return res.status(400).json({ error: err.message });
    }
    if (!req.file) {
      return res.status(400).json({ error: '请选择音频文件' });
    }

    const userId = req.user.id;
    const savedPath = req.file.path;

    // FR-606：上传字节配额 + 存储熔断（95%）校验。multer 已落盘，超限则删除并 429。
    try {
      const orgId = await resolvePersonalOrgId(pool, userId);
      const quota = await checkQuota(pool, orgId, 'upload_bytes', req.file.size);
      if (!quota.allowed) {
        try { unlinkSync(savedPath); } catch { /* 删除失败不阻断响应 */ }
        return res.status(quota.status || 429).json({ error: '存储配额已用完或已熔断', reason: quota.reason });
      }
      await recordUsage(pool, orgId, 'upload_bytes', req.file.size);
      await recordUsage(pool, orgId, 'file_count', 1);
    } catch (qerr) {
      log.error('upload/audio quota error:', qerr);
    }

    const url = `/api/uploads/user_${userId}/${req.file.filename}`;
    res.json({ url, filename: req.file.filename });
  });
});
```

> `router.use(apiLimiter)` 在文件顶部已对整条 upload 路由生效，`/audio` 自动受限，无需重复。

- [ ] **Step 9: 起 fresh server，跑测试确认通过**

```bash
# kill 旧 3100 node → 起新（含改后的 src）；health 就绪后
node tests/integration_exam.mjs
```
Expected: 全部 `FR105 …` 断言 PASS，末尾 `==== 集成联调结论：N/N 通过 ====`，exit 0。

- [ ] **Step 10: 提交**

```bash
git add server/src/routes/questions.js server/src/routes/exams.js server/src/routes/upload.js server/tests/integration_exam.mjs
git commit -m "feat(fr105): 后端上传音频端点+建题/批量/更新写audio_url+考试详情/开考下发(判分不变)"
```

---

## Task 3: 跨租户隔离门禁（FR-105 音频题随题隔离）

**Files:**
- Modify: `server/tests/isolation.integration.mjs`

- [ ] **Step 1: 写失败断言——在 FR-104 `question_groups` 段之后插入 FR-105 段**

在 isolation.integration.mjs `// ===== FR-104 question_groups 材料组跨租户 =====` 段（`grpA`/`grpAId` 块）结束、`// ===== exams / exam_attempts 跨租户 =====` 之前插入。复用作用域内 `tA`、`tB`、`api`、`check`、`checkBlocked`、`asArray`、`iso_subj_A`：

```js
    // ===== FR-105 音频题跨租户（audio_url 依附 questions，读路径沿用 created_by 隔离）=====
    const audioUrlFake = '/api/uploads/user_0/iso-audio-fake.mp3'; // 软引用字符串，不实际落盘，仅验证列随题隔离
    const qAudio = await api('POST', '/questions', tA.token, {
      subject_id: 'iso_subj_A', type: 'single', title: 'ISO_音频题A',
      options: ['甲', '乙'], answer: '甲', audio_url: audioUrlFake,
    });
    check('ISO FR105 A建音频题', qAudio.status === 200 && qAudio.data?.id, qAudio.status);
    const qAudioId = qAudio.data?.id;
    if (qAudioId) {
      // 属主正向对照：A 读回自己的音频题详情，audio_url 落库一致
      const ownAudio = await api('GET', `/questions/${qAudioId}`, tA.token);
      check('ISO FR105 A读回A音频题audio_url一致(200)', ownAudio.status === 200 && ownAudio.data?.question?.audio_url === audioUrlFake, ownAudio.status);
      // 越权探测：B 读 A 的音频题详情应 403/404（音频路径不跨租户泄漏）
      checkBlocked('ISO FR105 B读A音频题详情(403/404)', await api('GET', `/questions/${qAudioId}`, tB.token));
      // 列表越权：B 按 A 的 subject_id 列题不含 A 音频题
      const listAudioB = await api('GET', '/questions?subject_id=iso_subj_A', tB.token);
      check('ISO FR105 B列表不含A音频题', listAudioB.status === 200 && !asArray(listAudioB.data?.questions).some((q) => q.id === qAudioId), { status: listAudioB.status });
    } else {
      check('ISO FR105 A读回A音频题audio_url一致(200)', false, 'qAudioId 缺失');
      check('ISO FR105 B读A音频题详情(403/404)', false, 'qAudioId 缺失');
      check('ISO FR105 B列表不含A音频题', false, 'qAudioId 缺失');
    }
```

> cleanup 无需改动：该题标题以 `ISO_` 开头，被既有 `DELETE FROM questions WHERE title LIKE 'ISO\\_%'` 覆盖。

- [ ] **Step 2: 起 fresh server，跑隔离门确认通过**

```bash
# 确保 3100 server 为含 T2 后端改动的 fresh 实例（questions 列表/详情 SELECT q.* 已带 audio_url）
cd server; $env:EXAM_IT_BASE='http://127.0.0.1:3100/api'; node tests/isolation.integration.mjs
```
Expected: 全部 `ISO FR105 …` PASS；`==== 集成联调结论：N/N 通过 ====`（原 42 基线 + 本段新增数），exit 0，无 429。

- [ ] **Step 3: 提交**

```bash
git add server/tests/isolation.integration.mjs
git commit -m "test(fr105): 跨租户隔离门禁——音频题随questions按created_by隔离，B读/列均不可见A的audio_url题"
```

---

## Task 4: 前端 types + api + mappers（数据契约打通）

**Files:**
- Modify: `src/types.ts`、`src/services/api.ts`、`src/services/api.mappers.ts`、`src/hooks/useQuestionBank.ts`

- [ ] **Step 1: types.ts 加字段**

`Question`（L141-152）加一行：

```ts
  input?: string; // For questions that mention specific input
  audioUrl?: string | null; // FR-105 听力题音频相对路径(/api/uploads/...)，NULL/缺省=非音频题
}
```

`ExamQuestionDetail`（L211-220）与 `ExamQuestionFull`（L223-235）各在 `group_material` 行后加：

```ts
  audio_url?: string | null;   // FR-105 音频软引用（后端原样下发相对路径）
```

- [ ] **Step 2: api.ts 加 `QuestionItem.audio_url` + `uploadApi.audio` + `mediaApi.fetchBlob`**

`QuestionItem`（L173-190）在 `group_id` 行后加：

```ts
  group_id?: number | null;  // FR-104
  audio_url?: string | null; // FR-105 音频相对路径，NULL/缺省=非音频题
```

`uploadApi` 对象内、`image` 之后追加 `audio`（与 `image` 同款 raw fetch）：

```ts
  audio: async (file: File): Promise<{ url: string; filename: string }> => {
    const form = new FormData();
    form.append('file', file);
    const token = getToken();
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch(`${API_BASE}/upload/audio`, { method: 'POST', headers, body: form });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw { message: data.error || `上传失败 (${res.status})`, status: res.status } as { message: string; status: number };
    }
    return res.json();
  },
```

文件末尾（`uploadApi` 之后、`export default client` 之前）新增 `mediaApi`：

```ts
/** FR-105：带鉴权取媒体（浏览器 <audio src> 带不上 Authorization 头，改 fetch→blob→objectURL；参考 exportApi.downloadBlob） */
export const mediaApi = {
  fetchBlob: async (urlPath: string): Promise<Blob> => {
    const token = getToken();
    const res = await fetch(`${API_BASE}${urlPath}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) throw new Error(`媒体加载失败 (${res.status})`);
    return res.blob();
  },
};
```

- [ ] **Step 3: api.mappers.ts 带出 audioUrl**

`questionItemToQuestion` 返回对象（L35-46）加：

```ts
    input: item.input,
    audioUrl: item.audio_url ?? null,
  };
```

- [ ] **Step 4: useQuestionBank.ts handleImport 映射 audio_url**

`apiQuestions` 映射（L247-251）加 `audio_url`：

```ts
      const apiQuestions = enriched.map(q => ({
        subject_id: q.subject, type: q.type, title: q.title,
        code: q.code, options: q.options, answer: q.answer,
        explanation: q.explanation, points: q.points, input: q.input,
        audio_url: q.audioUrl ?? null,
      }));
```

- [ ] **Step 5: 类型检查 + 根单测（mapper 断言）**

在 `src/services/__tests__/mappers.test.ts` 的 `questionItemToQuestion` 用例里补一条（若已有构造 item，则加 `audio_url` 到 item 并断言；否则新增独立用例）：

```ts
  it('questionItemToQuestion: audio_url -> audioUrl（FR-105 软引用透传）', () => {
    const q = questionItemToQuestion({
      id: 2, subject_id: 'english', type: 'single', title: '听力',
      options: ['A', 'B'], answer: 'A', points: 1,
      userId: 1, createdAt: '', updatedAt: '',
      audio_url: '/api/uploads/user_1/x.mp3',
    } as never);
    expect(q.audioUrl).toBe('/api/uploads/user_1/x.mp3');
  });
```

Run: `npx tsc --noEmit` → Expected: 0 error。
Run: `npx vitest run src/services/__tests__/mappers.test.ts` → Expected: 新用例 PASS，其余不回归。

- [ ] **Step 6: 提交**

```bash
git add src/types.ts src/services/api.ts src/services/api.mappers.ts src/hooks/useQuestionBank.ts src/services/__tests__/mappers.test.ts
git commit -m "feat(fr105): 前端types(audioUrl/audio_url)+uploadApi.audio+mediaApi.fetchBlob+mapper透传"
```

---

## Task 5: AudioPlayer 组件（blob 鉴权播放）

**Files:**
- Create: `src/components/AudioPlayer.tsx`
- Test: `src/components/__tests__/AudioPlayer.test.tsx`（若无 jsdom 组件测试惯例，则降级为纯逻辑单测放 `src/services` 层；本仓库 root vitest 有组件相关测试，按现有 setup）

- [ ] **Step 1: 写失败测试**

`src/components/__tests__/AudioPlayer.test.tsx`：

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { AudioPlayer } from '../AudioPlayer';
import { mediaApi } from '../../services/api';

vi.mock('../../services/api', () => ({
  mediaApi: { fetchBlob: vi.fn() },
}));

describe('AudioPlayer (FR-105)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (URL.createObjectURL as any) = vi.fn(() => 'blob:mock');
    (URL.revokeObjectURL as any) = vi.fn();
    (mediaApi.fetchBlob as any).mockResolvedValue(new Blob(['x'], { type: 'audio/mpeg' }));
  });

  it('加载后渲染 <audio controls> 且 src 为 objectURL', async () => {
    render(<AudioPlayer src="/api/uploads/user_1/a.mp3" />);
    await waitFor(() => expect(mediaApi.fetchBlob).toHaveBeenCalledWith('/api/uploads/user_1/a.mp3'));
    const el = await screen.findByRole('audio');
    expect(el.getAttribute('src')).toBe('blob:mock');
  });

  it('拉取失败展示错误态', async () => {
    (mediaApi.fetchBlob as any).mockRejectedValue(new Error('403'));
    render(<AudioPlayer src="/api/uploads/user_1/a.mp3" />);
    await waitFor(() => expect(screen.getByText(/加载失败/)).toBeInTheDocument());
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run src/components/__tests__/AudioPlayer.test.tsx`
Expected: FAIL（模块不存在）。

> 若本仓库无 `@testing-library/react` 依赖，改用最小断言：直接 import 组件并测试其导出的辅助 `resolveAudioSource`（把 blob→objectURL 逻辑抽成可单测的纯函数），或添加 `@testing-library/react` 到 devDependencies 后 `npm install`。实施时先 `Get-Content package.json` 核对，缺失则在本步安装并纳入提交。

- [ ] **Step 3: 写组件**

`src/components/AudioPlayer.tsx`：

```tsx
/**
 * FR-105 听力题音频播放器：
 * 浏览器发起的 <audio src> GET 带不上 Authorization 头会 401，故用带鉴权的 fetch→blob→objectURL 渲染。
 * 不放松 /api/uploads 静态鉴权；URL 不含 token。卸载时 revokeObjectURL。
 */
import { useEffect, useRef, useState } from 'react';
import { mediaApi } from '../services/api';

export interface AudioPlayerProps {
  src: string; // 相对路径 /api/uploads/...
}

type Status = 'loading' | 'ready' | 'error';

export function AudioPlayer({ src }: AudioPlayerProps) {
  const [status, setStatus] = useState<Status>('loading');
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const urlRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setStatus('loading');
    setObjectUrl(null);
    mediaApi
      .fetchBlob(src)
      .then((blob) => {
        if (cancelled) return;
        const url = URL.createObjectURL(blob);
        urlRef.current = url;
        setObjectUrl(url);
        setStatus('ready');
      })
      .catch(() => {
        if (!cancelled) setStatus('error');
      });
    return () => {
      cancelled = true;
      if (urlRef.current) {
        URL.revokeObjectURL(urlRef.current);
        urlRef.current = null;
      }
    };
  }, [src]);

  if (status === 'loading') {
    return <div className="text-xs text-slate-400 py-2">音频加载中…</div>;
  }
  if (status === 'error' || !objectUrl) {
    return <div className="text-xs text-rose-500 py-2">音频加载失败，请刷新重试</div>;
  }
  return (
    <audio controls preload="metadata" src={objectUrl} className="w-full h-10" aria-label="听力音频" />
  );
}
```

- [ ] **Step 4: 跑测试确认通过 + 类型检查**

Run: `npx vitest run src/components/__tests__/AudioPlayer.test.tsx` → Expected: PASS。
Run: `npx tsc --noEmit` → Expected: 0 error。

- [ ] **Step 5: 提交**

```bash
git add src/components/AudioPlayer.tsx src/components/__tests__/AudioPlayer.test.tsx package.json package-lock.json
git commit -m "feat(fr105): AudioPlayer组件（带鉴权fetch→blob→objectURL播放，卸载revoke）"
```

---

## Task 6: 「新建题目」模态 + QuestionManagePage 入口

**Files:**
- Create: `src/components/exam/QuestionForm.tsx`
- Modify: `src/pages/QuestionManagePage.tsx`

- [ ] **Step 1: 写 QuestionForm 模态（受控，含音频上传 + 预览；结构对齐 QuestionGroupForm）**

`src/components/exam/QuestionForm.tsx`：

```tsx
/**
 * FR-105：新建单题模态（含听力音频上传）。提交走 questionApi.create。
 * 与 ImportModal 并存的第二个建题入口；科目由模态内下拉选择（题目管理页无外部选中科目上下文）。
 */
import { useState } from 'react';
import { motion } from 'motion/react';
import { X, Plus, Upload, AlertTriangle, BookPlus } from 'lucide-react';
import { questionApi, uploadApi } from '../../services/api';
import { AudioPlayer } from '../AudioPlayer';

const TYPES = [
  { value: 'single', label: '单选题' },
  { value: 'multiple', label: '多选题' },
  { value: 'judge', label: '判断题' },
  { value: 'fill_in', label: '填空题' },
  { value: 'short_answer', label: '简答题' },
  { value: 'programming', label: '编程题' },
];

export interface QuestionFormProps {
  open: boolean;
  subjects: { id: string; name: string }[];
  onClose: () => void;
  onCreated: () => void;
}

export function QuestionForm({ open, subjects, onClose, onCreated }: QuestionFormProps) {
  const [subjectId, setSubjectId] = useState<string>(subjects[0]?.id || '');
  const [type, setType] = useState<string>('single');
  const [title, setTitle] = useState<string>('');
  const [optionsText, setOptionsText] = useState<string>('');
  const [answer, setAnswer] = useState<string>('');
  const [explanation, setExplanation] = useState<string>('');
  const [points, setPoints] = useState<number>(1);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<boolean>(false);

  if (!open) return null;
  const needsOptions = type === 'single' || type === 'multiple';

  const reset = () => {
    setType('single'); setTitle(''); setOptionsText(''); setAnswer('');
    setExplanation(''); setPoints(1); setAudioUrl(null); setError(null);
  };
  const handleClose = () => { reset(); onClose(); };

  const onPickAudio = async (file: File | undefined) => {
    if (!file) return;
    setError(null); setUploading(true);
    try {
      const { url } = await uploadApi.audio(file);
      setAudioUrl(url);
    } catch (e: any) {
      setError(e?.message || '音频上传失败');
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async () => {
    setError(null);
    if (!subjectId) return setError('请选择所属科目');
    if (!title.trim()) return setError('题干不能为空');
    if (!answer.trim()) return setError('答案不能为空');
    const opts = needsOptions ? optionsText.split('\n').map((s) => s.trim()).filter(Boolean) : undefined;
    if (needsOptions && (!opts || opts.length < 2)) return setError('单选/多选题选项至少 2 项（每行一个）');

    setSubmitting(true);
    try {
      await questionApi.create({
        subject_id: subjectId, type, title: title.trim(),
        options: opts, answer: type === 'multiple' ? answer.split(/[,，]/).map((s) => s.trim()).filter(Boolean) : answer.trim(),
        explanation: explanation.trim() || undefined, points: Number(points) > 0 ? Number(points) : 1,
        audio_url: audioUrl,
      });
      reset();
      onCreated();
    } catch (e: any) {
      setError(e?.message || '创建题目失败');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[1001] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
      onClick={handleClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 16 }} animate={{ opacity: 1, scale: 1, y: 0 }}
        className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[88vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <BookPlus size={20} className="text-indigo-600" />
            <h3 className="text-lg font-bold text-slate-800">新建题目</h3>
          </div>
          <button onClick={handleClose} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {error && (
            <div className="flex items-start gap-2 p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-600 text-sm">
              <AlertTriangle size={16} className="flex-shrink-0 mt-0.5" /> <span>{error}</span>
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <label className="block text-sm">
              <span className="font-bold text-slate-600">科目</span>
              <select value={subjectId} onChange={(e) => setSubjectId(e.target.value)}
                className="mt-1 w-full px-3 py-2.5 rounded-xl border-2 border-slate-100 focus:border-indigo-600 outline-none">
                {subjects.length === 0 && <option value="">（无可管理科目）</option>}
                {subjects.map((s) => (<option key={s.id} value={s.id}>{s.name}</option>))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="font-bold text-slate-600">题型</span>
              <select value={type} onChange={(e) => setType(e.target.value)}
                className="mt-1 w-full px-3 py-2.5 rounded-xl border-2 border-slate-100 focus:border-indigo-600 outline-none">
                {TYPES.map((t) => (<option key={t.value} value={t.value}>{t.label}</option>))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="font-bold text-slate-600">分值</span>
              <input type="number" min={1} value={points}
                onChange={(e) => setPoints(parseInt(e.target.value, 10) || 1)}
                className="mt-1 w-full px-3 py-2.5 rounded-xl border-2 border-slate-100 focus:border-indigo-600 outline-none" />
            </label>
          </div>

          <label className="block text-sm">
            <span className="font-bold text-slate-600">题干</span>
            <textarea value={title} onChange={(e) => setTitle(e.target.value)} placeholder="题目内容…"
              className="mt-1 w-full px-3 py-2.5 rounded-xl border-2 border-slate-100 focus:border-indigo-600 outline-none h-20 resize-none" />
          </label>

          {needsOptions && (
            <label className="block text-sm">
              <span className="font-bold text-slate-600">选项（每行一个）</span>
              <textarea value={optionsText} onChange={(e) => setOptionsText(e.target.value)} placeholder={'甲\n乙'}
                className="mt-1 w-full px-3 py-2.5 rounded-xl border-2 border-slate-100 focus:border-indigo-600 outline-none h-20 resize-none" />
            </label>
          )}

          <label className="block text-sm">
            <span className="font-bold text-slate-600">{needsOptions ? '正确答案（须与某选项一致；多选用逗号分隔）' : '参考答案'}</span>
            <input value={answer} onChange={(e) => setAnswer(e.target.value)}
              className="mt-1 w-full px-3 py-2.5 rounded-xl border-2 border-slate-100 focus:border-indigo-600 outline-none" />
          </label>

          <label className="block text-sm">
            <span className="font-bold text-slate-600">解析（可选）</span>
            <textarea value={explanation} onChange={(e) => setExplanation(e.target.value)}
              className="mt-1 w-full px-3 py-2.5 rounded-xl border-2 border-slate-100 focus:border-indigo-600 outline-none h-16 resize-none" />
          </label>

          {/* FR-105 听力音频（可空；上传后可预览播放） */}
          <div className="p-3 rounded-2xl border border-indigo-100 bg-indigo-50/50">
            <div className="flex items-center gap-2 mb-2">
              <Upload size={16} className="text-indigo-600" />
              <span className="text-sm font-bold text-slate-600">听力音频（可选）</span>
              <span className="text-xs text-slate-400">支持 mp3 / m4a / wav，≤15MB</span>
            </div>
            <input type="file" accept="audio/mpeg,audio/mp3,audio/x-m4a,audio/wav,.mp3,.m4a,.wav"
              onChange={(e) => void onPickAudio(e.target.files?.[0])} />
            {uploading && <span className="ml-2 text-xs text-indigo-500">上传中…</span>}
            {audioUrl && (
              <div className="mt-2 space-y-1">
                <AudioPlayer src={audioUrl} />
                <button type="button" onClick={() => setAudioUrl(null)} className="text-xs text-rose-500 hover:underline">移除音频</button>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-slate-100">
          <button type="button" onClick={handleClose} className="px-5 py-2.5 bg-slate-100 text-slate-600 rounded-xl font-bold hover:bg-slate-200">取消</button>
          <button type="button" onClick={handleSubmit} disabled={submitting || subjects.length === 0}
            className="px-6 py-2.5 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 disabled:opacity-60">
            {submitting ? '创建中...' : '创建题目'}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
```

- [ ] **Step 2: QuestionManagePage 接入入口与模态**

`src/pages/QuestionManagePage.tsx`：

1. lucide 导入行追加 `BookPlus`；新增 `import { QuestionForm } from '../components/exam/QuestionForm';`。
2. state：在 `const [showGroupForm, setShowGroupForm] = useState<boolean>(false);` 后加 `const [showQuestionForm, setShowQuestionForm] = useState<boolean>(false);`。
3. 头部按钮：把现有「新建材料组」按钮所在 `<div className="flex items-center gap-2">` 内、`新建材料组` 按钮之前加一个「新建题目」按钮：

```tsx
        <button
          onClick={() => setShowQuestionForm(true)}
          className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 text-white rounded-xl font-bold text-sm hover:bg-indigo-700 transition-colors"
        >
          <BookPlus size={16} /> 新建题目
        </button>
```

4. 在 FR-104 材料组模态 `<AnimatePresence>…</AnimatePresence>` 之后追加：

```tsx
      {/* FR-105 新建题目模态 */}
      <AnimatePresence>
        {showQuestionForm && (
          <QuestionForm
            open={showQuestionForm}
            subjects={ctx.allSubjects.map((s) => ({ id: s.id, name: s.name }))}
            onClose={() => setShowQuestionForm(false)}
            onCreated={() => { setShowQuestionForm(false); void loadQuestions(); }}
          />
        )}
      </AnimatePresence>
```

- [ ] **Step 3: 类型检查 + 构建冒烟**

Run: `npx tsc --noEmit` → Expected: 0 error（`BookPlus`/`Plus` 若未使用会因 noUnusedLocals 报错——本步不导入未用图标；QuestionForm 顶部只保留用到的图标）。
Run: `npm run build` → Expected: 构建通过。

- [ ] **Step 4: 提交**

```bash
git add src/components/exam/QuestionForm.tsx src/pages/QuestionManagePage.tsx
git commit -m "feat(fr105): 新建题目模态(含音频上传+预览)+题目管理页入口"
```

---

## Task 7: ImportModal 逐题挂音频

**Files:**
- Modify: `src/components/import/PreviewList.tsx`
- Modify: `src/components/ImportModal.tsx`

- [ ] **Step 1: PreviewList 加逐题音频控件（新增可选 prop `onAudioUpload` + 每项展示）**

`src/components/import/PreviewList.tsx`：

props 接口加：

```ts
interface PreviewListProps {
  preview: Question[];
  onReparse: () => void;
  onConfirm: () => void;
  onAudioUpload?: (index: number, file: File) => Promise<void>;
}
```

组件签名解构加 `onAudioUpload`；导入 `import { Upload } from 'lucide-react';` 与 `import { AudioPlayer } from '../AudioPlayer';`。在每题 `q.points` 徽标行之后、`MarkdownRenderer content={q.title}` 之前，插入音频区：

```tsx
            {onAudioUpload && (
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <label className="inline-flex items-center gap-1 text-[11px] font-bold text-indigo-600 cursor-pointer">
                  <Upload size={12} />
                  {q.audioUrl ? '重传音频' : '上传音频'}
                  <input
                    type="file"
                    accept="audio/mpeg,audio/mp3,audio/x-m4a,audio/wav,.mp3,.m4a,.wav"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void onAudioUpload(idx, f);
                      e.target.value = '';
                    }}
                  />
                </label>
                {q.audioUrl ? (
                  <span className="inline-flex items-center gap-2 min-w-[160px]">
                    <AudioPlayer src={q.audioUrl} />
                    <span className="text-[10px] text-emerald-600">已挂载</span>
                  </span>
                ) : null}
              </div>
            )}
```

- [ ] **Step 2: ImportModal 传入 onAudioUpload（上传→写回 preview[idx].audioUrl）**

`src/components/ImportModal.tsx`：导入 `uploadApi`（来自 `../services/api`，若未导入则补）。在渲染 `<PreviewList …/>`（L741-745）处加 prop：

```tsx
              <PreviewList
                preview={preview}
                onReparse={() => setPreview([])}
                onConfirm={handleConfirmImportClick}
                onAudioUpload={async (index, file) => {
                  try {
                    const { url } = await uploadApi.audio(file);
                    setPreview((prev) => prev.map((q, i) => (i === index ? { ...q, audioUrl: url } : q)));
                  } catch (e: any) {
                    setError(e?.message || '音频上传失败');
                  }
                }}
              />
```

> `handleSubjectSelectionConfirm`（L584）用 `preview.map((q) => ({ ...q, subject }))` 保留 `audioUrl`；`onImport(valid, …)` → `handleImport` 映射 `audio_url`（T4 Step4 已做）。链路自洽。

- [ ] **Step 3: 类型检查 + 构建**

Run: `npx tsc --noEmit` → Expected: 0 error。
Run: `npm run build` → Expected: 通过。

- [ ] **Step 4: 提交**

```bash
git add src/components/import/PreviewList.tsx src/components/ImportModal.tsx
git commit -m "feat(fr105): ImportModal预览逐步题上传音频，写回audioUrl经batch落库"
```

---

## Task 8: 播放渲染（练习页 + 正式考试页）

**Files:**
- Modify: `src/components/app/FormalExamScreen.tsx`
- Modify: `src/components/app/ExamScreen.tsx`

- [ ] **Step 1: FormalExamScreen 渲染音频卡（对齐 FR-104 阅读材料卡，蓝紫色调）**

`src/components/app/FormalExamScreen.tsx`：导入 `import { AudioPlayer } from '../AudioPlayer';`。在 `group_material` 卡（L170-175）之后、题干 `MarkdownRenderer content={currentQuestion.title}`（L177）之前插入：

```tsx
        {currentQuestion.audio_url ? (
          <div className="mb-4 p-4 rounded-2xl bg-indigo-50 border border-indigo-100">
            <div className="text-xs font-bold text-indigo-600 uppercase mb-2">听力音频</div>
            <AudioPlayer src={currentQuestion.audio_url} />
          </div>
        ) : null}
```

- [ ] **Step 2: ExamScreen（练习页）渲染音频**

`src/components/app/ExamScreen.tsx`：导入 `import { AudioPlayer } from '../AudioPlayer';`。在题干 `MarkdownRenderer content={currentQuestion.title}`（L428）之前插入（练习用 `Question.audioUrl`）：

```tsx
        {currentQuestion.audioUrl ? (
          <div className="mb-4 p-4 rounded-2xl bg-indigo-50 border border-indigo-100">
            <div className="text-xs font-bold text-indigo-600 uppercase mb-2">听力音频</div>
            <AudioPlayer src={currentQuestion.audioUrl} />
          </div>
        ) : null}
```

- [ ] **Step 3: 类型检查 + 根测试全量回归**

Run: `npx tsc --noEmit` → Expected: 0 error。
Run: `npx vitest run`（root）→ Expected: 全绿（含新增 AudioPlayer/mapper 用例，既有基线不回归）。

- [ ] **Step 4: 手动冒烟（可选，若环境允许）**

起 fresh server + `npm run dev`，用一个音频题走完「建题挂音频→练习页/考试页播放」，确认 `<audio>` 播放、控制台无 401。（CI 门以 T10 自动化门禁为准。）

- [ ] **Step 5: 提交**

```bash
git add src/components/app/FormalExamScreen.tsx src/components/app/ExamScreen.tsx
git commit -m "feat(fr105): 练习页与正式考试页渲染AudioPlayer(blob鉴权播放)，非音频题无回归"
```

---

## Task 9: 文档同步

**Files:**
- Modify: `docs/开发文档.md`
- Modify: `docs/产品需求文档-平台化演进.md`

- [ ] **Step 1: 开发文档路由表加上传音频端点行**

在 §7 路由表内、图片上传行附近加一行：

```
| /api/upload/audio | routes/upload.js | FR-105 听力题音频上传（multer 磁盘落盘，mp3/m4a/wav，≤15MB，扩展名+MIME双校验，FR-606 配额+熔断，返回 {url,filename}） |
```

- [ ] **Step 2: 开发文档加 §8.3c 音频挂载说明**

在 §8.3b（FR-104）段之后追加：

```markdown
### 8.3c FR-105 听力题（音频挂载）

- 数据：`questions.audio_url`（迁移 026，可空 VARCHAR(300)，存 `/api/uploads/...` 相对路径，软引用上传文件、**无外键**）。听力不是新题型——仍是普通题（single/fill_in/…），判分/题型枚举零改动。
- 建题：`POST /questions`、`POST /questions/batch`、`PUT /questions/:id` 均接受并落 `audio_url`（update 支持显式清空）。
- 下发：`GET /exams/:id`、`POST /exams/:id/start` 的题 SELECT 追加 `q.audio_url`（与 FR-104 `group_material` 同处）；练习侧 `SELECT q.*` 原样带出。
- 播放：前端 `mediaApi.fetchBlob`（带 `Authorization` 的 fetch→blob→`URL.createObjectURL`）喂 `<AudioPlayer>`；**不放松 `/api/uploads` 静态鉴权**，规避 token 落 URL。
- 隔离：`audio_url` 依附 questions，沿用 `created_by` 隔离，无新增可越权列表端点。
```

- [ ] **Step 3: PRD FR-105 行更新交付状态**

`docs/产品需求文档-平台化演进.md` 找到 FR-105 行，追加：

```
核心纵切已交付 v1（2026-10-13）：普通题挂 audio_url + blob 鉴权播放主链 + 四重门禁；OSS 签名 URL/服务端强制播放次数限制延后为增量 2。详见 docs/superpowers/specs/2026-10-13-fr105-listening-questions-design.md。
```

- [ ] **Step 4: 提交**

```bash
git add docs/开发文档.md docs/产品需求文档-平台化演进.md
git commit -m "docs(fr105): 同步/api/upload/audio与§8.3c音频挂载说明+PRD FR-105核心纵切交付状态"
```

---

## Task 10: 四重门禁 + DoD 收尾

- [ ] **Step 1: DoD — SSOT 零改动核验**

Run: `git diff main..HEAD -- src/shared/scoring/index.ts server/src/utils/examScoring.generated.js`
Expected: 空输出（判分主流程与生成物未被触碰）。

- [ ] **Step 2: DoD — 仅新增迁移 026**

Run: `git diff main..HEAD --stat -- server/migrations`
Expected: 仅 `026_question_audio.sql` 新增。

- [ ] **Step 3: server vitest**

Run: `cd server; npx vitest run`
Expected: 全绿（170 基线，不回归）。

- [ ] **Step 4: integration_exam（fresh server）**

```bash
# kill 3100 旧 node → 起含本增量改动的 fresh server；EXAM_IT_BASE=127.0.0.1；health 就绪后
cd server; node tests/integration_exam.mjs
```
Expected: 全绿含 `FR105 …` 段，exit 0。

- [ ] **Step 5: isolation（另起 fresh server，避免累计 429）**

```bash
# kill → 再起 fresh server → 就绪后
cd server; node tests/isolation.integration.mjs
```
Expected: 全绿含 `ISO FR105 …` 段，0×429，exit 0。

- [ ] **Step 6: root vitest + tsc**

Run: `npx vitest run`（根）→ Expected: 全绿（103 基线 + 新增 AudioPlayer/mapper 用例）。
Run: `npx tsc --noEmit` → Expected: 0 error。

- [ ] **Step 7: diffstat 复核无越界改动**

Run: `git diff main..HEAD --stat`
Expected: 仅本计划 File Structure 列出的文件；无对 scoring/workflow 无关改动。

- [ ] **Step 8: 走 finishing-a-development-branch（L3 + 合并）**

全部门绿后：呈现 4 选项；合并/推送前按 security-scan 隐式 L3 handoff 先跑 L3 深度审查（settings 确认 `l3_enabled`），0 findings 再本地 FF 合并回 main；如需上线再推 origin 触发 CI。

---

## Self-Review

**Spec coverage（对 §1–§9）：** 迁移026=T1；`/upload/audio`=T2·Step8；create/batch/update 写=T2·Step3-5；exams 下发=T2·Step6-7；前端 types/api/mapper=T4；AudioPlayer=blob 播放=T5；新建题目模态+入口=T6；ImportModal 逐题挂音频=T7；练习+考试页播放=T8；隔离进门禁=T3；文档=T9；四重门禁+DoD+SSOT 零改动=T10。延后项（OSS/max_plays）未纳入，符合 §8。✅

**Placeholder scan：** 无 TBD/TODO；每个改动步给出可粘贴的完整代码/SQL；命令均带期望输出。✅

**Type consistency：** 后端列名 `audio_url`、下发对象键 `audio_url`；`QuestionItem.audio_url`→`questionItemToQuestion`→`Question.audioUrl`；`handleImport`/`QuestionForm.create` 提交键均 `audio_url`；`mediaApi.fetchBlob`、`uploadApi.audio`、`AudioPlayer(src=…)` 三处命名前后一致；隔离段变量 `qAudioId`/`audioUrlFake` 与断言引用一致。✅
