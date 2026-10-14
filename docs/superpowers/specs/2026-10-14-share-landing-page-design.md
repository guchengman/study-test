# 分享落地页（科目/题库公开分享）设计文档

**Goal:** 让未登录访客通过一条公开链接预览某个"全员共享"科目、免费试做几道客观题，并被引导注册加入该科目——纯获客快赢，零新表、零行为回归风险。

**Architecture:** 复用现有科目邀请码（`invite_codes.type='subject'`）作为分享链接标识；新增两个公开（无鉴权）后端端点做"预览 + 无状态服务端判分"；前端在鉴权外壳 `AppLayout` 之外新增一条公开路由渲染落地页。体验会话不落库。

**Tech Stack:** Node/Express + MySQL 5.7（server），React + react-router + Tailwind + motion + lucide（前端），vitest（后端测试）。

---

## 背景与现状（实测事实）

- **前端路由**（`src/App.tsx`）：全部业务页嵌在 `<Route element={<AppLayout/>}>` 下，`AppLayout` 依赖登录上下文并会弹 `LoginModal`。当前**无任何公开路由**。
- **分享现状**：科目靠 `subjects.share_scope`（none/students/all）+ `invite_codes` + `subject_subscriptions`；`questions` 另有 `share_code`。但**全部要求登录**才能用码订阅。
- **既有隐患**：`GET /questions/shared/:code` 需鉴权且用 `SELECT *`（会泄答案），不能直接复用为公开预览。
- **可复用件**：`middleware/rateLimit.js` 已在用（可挂到公开端点）；`authApi.register({inviteCode})` 与 `POST /subjects/join` 均已存在（CTA 引导注册/加入无需新建）；nginx `location / { try_files $uri $uri/ /index.html; }` 已就位（`/s/:code` 无需改 nginx）。
- **`invite_codes` 列**：`code(UNIQUE)`, `type ENUM('registration','subject')`, `subject_id`, `expires_at`, `used_count`, `max_uses`, `creator_id`。

> **实盘校正（2026-10-14 生产冒烟验证补充）** — 与实现计划同口径，写涉及这两张表的 SQL/脚本时以实盘 `SHOW CREATE TABLE` 为准：
> - `invite_codes`：关联创建者列是 **`creator_id`（int NOT NULL）**（本行已正确）；`subject_id` 为 **varchar(50)**（存科目字符串 id，如 `custom_xxx`）；`expires_at` 为 **datetime NOT NULL** —— 插入时不能给 `NULL`。
> - `subjects`：**有** `created_by`（服务用它查 `users.username` 得 `creator.displayName`，冒烟已验证）；**没有** `deleted_at` 列（科目层无软删除，软删过滤只用于 `questions.deleted_at`）。
> - 题面字段实为 **`title`**（下方示例早期写作 `stem`，已改）；结论：**已上线代码与设计文档一致**，`GET /api/public/share/<有效码>` 冒烟返回 200 且响应不含 answer/explanation。

## 已定关键决策（澄清结论）

1. 分享粒度 = **科目/题库**（非试卷、非单题）。
2. 访客可**试做 N 道体验题**（服务端判分，只回对错+分数，绝不下发答案）。
3. 体验成绩**不并入**正式科目，注册后从零开始 → 采用**无状态**设计。
4. 实现走**方案 A**：复用现有邀请码/限流/注册流程，**零新表、零 nginx 改动**。

---

## 详细设计

### 1. 数据契约（零新表）

- **URL**：`/s/:code`，`code` = 现有科目邀请码（`type='subject'`）。落地页只**读**码查科目，不改动 `used_count`（那是注册消费计数）。
- **可见性硬规则**：仅当科目 `share_scope='all'` 且码有效未过期才可访问；否则统一 **404**（"链接不存在或已失效"），不区分"码错/私有/过期/已撤销"——防枚举，与 reset 流程话术一致。
- **体验题**：从该科目未删除题目中抽 N 道**客观题**（`type IN ('single','multiple')`）；编程题/人工题排除（无法即时判分）。N 默认 5，`SHARE_PREVIEW_COUNT` 可配。
- **quizToken**：服务端签名令牌（复用 `JWT_SECRET` + `jsonwebtoken`），载荷含 `{ code, qids: [题目id...], exp: now+30min }`。抽样题目 id 只存在令牌里，不外泄答案。

### 2. 后端接口（`server/src/routes/publicShare.js`，前缀 `/api/public`，无鉴权 + 限流）

**`GET /api/public/share/:code`**
- 查 `invite_codes` WHERE `code=? AND type='subject'` → JOIN `subjects`；校验未过期 + `share_scope='all'`；不满足→ 404 统一话术。
- 抽 N 道客观题，签名 quizToken。
- 响应（**手工白名单构造，绝不 `SELECT *`，绝不含 `answer`/`explanation`**）：
```json
{
  "subject": { "name": "...", "icon": "...", "welcomeTitle": "...", "welcomeDesc": "...",
               "questionCount": 123, "byType": { "single": 80, "multiple": 43 } },
  "creator": { "displayName": "..." },
  "experience": { "quizToken": "<jwt>", "questions": [
      { "id": 101, "type": "single", "title": "...", "options": ["A文本","B文本","C文本","D文本"] }
  ] }
}
```

**`POST /api/public/share/grade`**  body `{ quizToken, answers: { "<qid>": <所选> } }`
- 验签 quizToken（无效/过期 → 400）；**题目集合只取令牌内 `qids`，忽略客户端传入的其它 id**（防探测任意题）。
- 服务端按 DB 答案逐题判分（`single` 比所选、`multiple` 比集合）。
- 响应（**只给对错+分数，不给答案/解析**）：
```json
{ "total": 5, "correct": 3, "scorePercent": 60, "results": [ { "qid": 101, "correct": true } ] }
```
- **完全无状态：不写任何库表。**

挂载顺序：`app.use('/api/public', ...)` 公开端点，接 `rateLimit` 全局中间件之外，`grade` 额外挂更严的 per-IP limiter。

### 3. 前端落地页

- `src/App.tsx` 新增与 `AppLayout` **平级**的公开路由：
  `<Route path="s/:code" element={<Suspense...><PublicSharePage/></Suspense>} />`（不套 AppLayout，绕开登录门）。
- 新页 `src/pages/PublicSharePage.tsx` 状态机：
  `加载中 → 失效(CTA 回首页) → 科目预览(简介+题量+开始体验) → 答题 → 结果(得分+逐题✓✗ + 注册CTA)`。
- **CTA**：按钮携该 `code` 跳回应用并预填邀请码（复用 `authApi.register` 的 `inviteCode` / 登录后 `POST /subjects/join`），注册后才看完整解析。
- 移动端友好；沿用 Tailwind/motion/lucide；所有老师自填文本走 React 默认转义（禁 `dangerouslySetInnerHTML`）。
- "复制分享链接"入口：并入现有 `src/components/SubjectShareCode.tsx`，拼 `${origin}/s/${code}` 复制。

### 4. 安全边界（验收红线）

1. 任何公开响应体**永不**出现 `answer`/`explanation`/正确项标记（白名单构造 + 测试断言全响应无 `answer` 键）。
2. quizToken 服务端签名；`grade` 只信令牌内 `qids`，答案仅在服务端比较，客户端拿不到正确答案。
3. 私有/过期/未知/已撤销码 → 统一 404（防枚举、不泄漏码是否存在）。
4. 两端点挂 `rateLimit.js`；`grade` 再加更严 per-IP 限流（防批量刷判分/探测）。
5. 预览内容 XSS：走 JSX 默认转义，禁 `dangerouslySetInnerHTML`。
6. 不持久化访客任何数据（无状态 = 无滥用数据累积）。
7. 仅 `share_scope='all'` 科目可被公开发现——与老师"全员共享"意愿一致，不越权暴露私有内容。

### 5. 测试策略

**后端（vitest，对齐现有 route 测试风格，可 mock pool）**
- 有效 all 码 → 200，含 subject meta + N 道客观题，**断言全响应序列化后无 `answer`/`explanation` 关键字**。
- 私有（share_scope≠all）/ 过期 / 未知码 / 已撤销 → 统一 404（同一 message）。
- 抽题只返回 `type IN ('single','multiple')`，不含编程/人工题。
- grade：全对→100、部分对→按分；篡改/缺失 quizToken→400；客户端塞入令牌外 qid→被忽略（不进 results）。
- rate limit 中间件挂载点存在（或 limiter 命中返回 429 的用例）。

**前端（vitest + 现有测试栈）**
- 失效码 → 渲染"回首页"CTA。
- 有效码 → 渲染预览，且 DOM 内不含答案文本。

---

## 非目标（本期不做，可后置）
- 试卷 / 单题分享。
- 访问/答题/转化埋点（原方案 B 的 `share_links`/`share_events`）。
- 体验题选项乱序、访客成绩续存、断点续做。

## 回滚 / 部署
- **纯增量**：仅新增公开端点 + 前端公开路由 + 组件里加"复制链接"，**不改动任何既有路由行为**。
- 经现有 CI（`deploy.yml`）自动部署；无迁移、无 `.env` 新增强依赖（`SHARE_PREVIEW_COUNT` 有代码默认 5，缺省即用）。
- 出问题回滚 = revert 该提交即可（无数据变更需回滚）。

## 假设 / 待实现期确认
- `JWT_SECRET` 在 server 环境可用于签名 quizToken（若无则用等价 `process.env` 密钥，禁止硬编码）。
- 注册流程对"科目码 `inviteCode`"的处理：以现有 `POST /subjects/join`（登录后按码加入）为主 CTA 落地，`register(inviteCode)` 为辅；具体预填/跳转参数在实现计划中钉死。
- `multiple` 题的"答案"数据结构（索引数组/字母集合）以其现有存储为准，判分按现有语义比对。
