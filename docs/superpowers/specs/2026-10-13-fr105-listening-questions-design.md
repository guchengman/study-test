# FR-105 听力题（音频挂载）核心纵切 · 设计

**日期**：2026-10-13　**优先级**：M　**阶段**：Phase 2　**范围**：核心纵切（音频挂载 + 鉴权播放，主链闭环）

## 1. 背景与目标

FR-105 听力题：题目挂一段音频，学生在练习/正式考试中播放后作答。本增量交付**核心纵切**——「上传音频 → 挂到题目 → 练习/考试页可播放作答 → 判分不变」主链 + 四重门禁。

沿用 FR-104 的「最稳妥 / 最小改动 / 最贴近生产」原则：判分主流程（SSOT）零改动，题型枚举零改动。

**明确不在本增量**（见 §8 延后）：OSS 签名 URL / 防盗链、服务端强制播放次数限制、Chrome 扩展端音频（PRD 已定不做）。

## 2. 关键决策

- **D1｜听力不是新题型，而是「给普通题挂一段音频」**：一道听力题仍是 `single/multiple/judge/fill_in/short_answer` 正常题，只是额外携带可空 `audio_url`。音频仅是题干刺激物，作答与判分逻辑完全复用现有普通题。→ **SSOT 零改动、题型枚举零改动**（最低风险）。
- **D2｜媒体鉴权用 blob 方案，不放松静态路由**：`authMiddleware` 仅认 `Authorization: Bearer` 头，浏览器发起的 `<audio src>`/`<img src>` GET 拿不到头会 401。复用仓库既有 `exportApi.downloadBlob` 先例（带 `Authorization` 的 `fetch` → `res.blob()` → `URL.createObjectURL`）渲染 `<audio controls>`。不新增 query-token、不改 `/api/uploads` 的鉴权，规避 token 落 URL/日志/Referer。
- **D3｜上传管线复用**：新增 `POST /api/upload/audio`，复用现有 multer 磁盘落盘、FR-606 字节配额 + 95% 存储熔断记账、`/api/uploads/user_<id>/<uuid>` 静态直读；仅把 fileFilter 从图片扩到音频。
- **D4｜录入入口两处并存**：新建独立「新建题目」模态（含音频上传，接 `questionApi.create`）；ImportModal 预览/确认步骤逐题「上传音频」，经 `handleImport` 映射 `audioUrl → audio_url` 进 `/questions/batch`。
- **D5｜`audio_url` 可空软引用，不设外键**：存的是上传返回的相对路径字符串（`/api/uploads/...`），非表引用；无需 FK/CASCADE。
- **D6｜隔离沿用属主模型**：`audio_url` 依附 `questions`，读路径沿用既有 `created_by` 隔离；上传静态路径含不可猜 uuid，登录即可取（不新增可枚举列表端点，规避 FR-104 那类列表越权）。

## 3. 数据模型

迁移 `026_question_audio.sql`（仅追加，零数据风险；utf8mb4_unicode_ci）：

```sql
ALTER TABLE questions ADD COLUMN audio_url VARCHAR(300) DEFAULT NULL COMMENT 'FR-105 听力题音频相对路径(/api/uploads/...)，NULL=非音频题；软引用上传文件，无 FK';
```

`questions` 现有列（001）：`id/subject_id/type/title/code/options/answer/explanation/points/share_code/created_by/org_id/group_id(025)/created_at/updated_at/deleted_at(017)`。本增量只加 `audio_url`。

## 4. 后端

### 4.1 上传音频 `POST /api/upload/audio`（routes/upload.js）
- 抽出音频 multer 实例：`fileFilter` 允许 `\.(mp3|m4a|wav)$/i` 且 `mimetype` 匹配 `^audio/(mpeg|m4a|x-m4a|wav|wave|mp3)$/i`（扩展名 + MIME 双校验，与图片同标准）；`limits.fileSize = 15MB`。
- 复用图片端点同款：`destination=user_<id>` 目录、`filename=uuid+ext`、配额 `checkQuota('upload_bytes')` + 超限删除落盘文件并 429、`recordUsage(upload_bytes/file_count)`、返回 `{ url: '/api/uploads/user_<id>/<uuid>.<ext>', filename }`。
- 沿用 `router.use(apiLimiter)`（upload 路由本就挂限流）。

### 4.2 建题写 `audio_url`（routes/questions.js）
- create（L157 INSERT）：列与占位符加 `audio_url`，取 `req.body.audio_url || null`。
- batch（L226 INSERT）：加 `q.audio_url || null`。
- update（L249）：解构加 `audio_url`，SET 子句包含 `audio_url=?`。
- 不校验音频路径存在性（软引用；YAGNI）。

### 4.3 考试/练习下发 `audio_url`
- exams.js 两处 SELECT（GET /:id 详情、start）加 `q.audio_url`，返回对象加 `audio_url: q.audio_url ?? null`（与 FR-104 `group_material` 同处同构）。
- 练习侧走 `questionApi.list/listAll` 返回的原始行已含 `audio_url`（`SELECT q.*`），无需改。

## 5. 前端

### 5.1 类型
- `src/types.ts`：`Question` 加 `audioUrl?: string | null`；`ExamQuestionDetail`、`ExamQuestionFull` 各加 `audio_url?: string | null`。
- `src/services/api.ts`：`QuestionItem` 加 `audio_url?: string | null`；`uploadApi` 加 `audio(file)`（`POST /upload/audio`）；新增 `mediaApi.fetchBlob(urlPath)`（带 `Authorization` 的 fetch → blob，参考 `exportApi.downloadBlob`）；`questionApi.create` 入参沿用 `Partial<QuestionItem>`（含 audio_url）。
- `useQuestionBank.handleImport`：apiQuestions 映射加 `audio_url: (q as any).audioUrl ?? null`。

### 5.2 `AudioPlayer` 组件（新 `src/components/AudioPlayer.tsx`）
- props：`{ src: string }`（相对 `/api/uploads/...` 路径）。
- 挂载时 `mediaApi.fetchBlob(src)` → `URL.createObjectURL` → `<audio controls src={objectURL}>`；卸载 `revokeObjectURL`；加载中/失败态兜底。

### 5.3 新建题目模态（新 `src/components/exam/QuestionForm.tsx`）
- props：`{ open, subjects, onClose, onCreated }`；字段：科目、题型、题干、选项（single/multiple 逐行）、答案、解析、分值、**音频上传**（`uploadApi.audio` 得 url 存 `audioUrl`，可预览 `AudioPlayer`）。
- 提交 `questionApi.create({ subject_id, type, title, code, options, answer, explanation, points, audio_url })`；成功 `onCreated()` 刷新。
- 入口：`QuestionManagePage` 顶部「新建题目」按钮（与 FR-104「新建材料组」并列），渲染该模态。

### 5.4 ImportModal 逐题挂音频
- 在题目预览/确认列表每项加「上传音频」控件，选文件 → `uploadApi.audio` → 写入该 `Question.audioUrl`；随后 batchImport 落库。

### 5.5 播放渲染（练习 + 正式考试）
- `ExamScreen`（练习）与 `FormalExamScreen`（考试）：当题目 `audioUrl/audio_url` 存在，在题干上方渲染 `<AudioPlayer src=.../>`（样式对齐 FR-104「阅读材料」卡片，用蓝紫色调区分）。

## 6. 判分（SSOT 零改动）

听力题是普通题 + `audio_url`，`gradeQuestion`/`isAnswerCorrect` 完全不变。`src/shared/scoring/index.ts` 与 `server/src/utils/examScoring.generated.js` 本增量不触碰（DoD 用 `git diff main..HEAD` 验证为空）。

## 7. 安全与边界

- 音频上传：扩展名 + MIME 双校验；15MB 上限；复用配额/熔断。`/api/uploads` 维持 `authMiddleware` + `nosniff`；音频经 blob 带鉴权取用，URL 不含 token。
- 静态路径不可枚举（uuid 文件名）；跨租户：`audio_url` 随题隔离（created_by），无新增可越权的列表端点。
- 播放次数：本增量不限制（学生可反复听）。

## 8. 延后（增量 2）

- OSS 对象存储 + 签名 URL（时效/防盗链，依赖 FR-109）。
- 服务端强制播放次数上限（`max_plays` + attempt 播放计数回写 + 交卷校验）。
- 音频时长元数据、波形/倍速等增强播放。
- Chrome 扩展端音频播放（PRD 明确不做）。

## 9. 完成定义（DoD）

1. 迁移 026 仅追加 `audio_url`，可整体 revert，入库（`git add -f`）。
2. 上传音频端到端：`/api/upload/audio` 落盘 + 配额 + 返回 url；非法格式/超限被拒。
3. 建题（新建题目模态 + ImportModal）均可挂 `audio_url`；create/batch/update 落库回读一致。
4. 练习页与正式考试页：音频题可播放（blob 鉴权），非音频题无回归。
5. 判分：听力题（普通题）按原口径计分；SSOT 零改动（diff 空）。
6. 跨租户隔离：B 取不到 A 的音频题（沿用 questions 隔离），进门禁断言。
7. 四重门禁全绿：integration_exam / isolation（各 fresh server）/ server vitest / root vitest；`tsc --noEmit` 0。
8. 文档同步：开发文档端点清单（`/api/upload/audio` + questions `audio_url`）+ PRD FR-105 交付状态。
