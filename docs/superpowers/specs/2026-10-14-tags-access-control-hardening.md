# Tags 访问控制加固（读侧 IDOR KNOWN-GAP + 写侧跨租户）设计文档

**Goal:** 关闭 `GET /api/tags/question/:qid` 的读侧越权（KNOWN-GAP），并顺带补上同文件 `PUT /:id` / `DELETE /:id` 的跨租户写越权；纯授权加固，零迁移、零行为回归。

**Architecture:** 授权判定放**路由层**（沿用 `bindTags`/`unbindTag` 既有范式：先做属主/可见性校验再调用 service），service 签名不动；两个可测谓词（题可见性、标签归属租户）作为纯函数落 `server/src/utils/`，用假 db 单测。读侧可见规则**与 `GET /questions/:id` 完全一致**（属主 / 已订阅 approved / `share_scope=all|students` + 师生可达）。写侧把标签操作限定到调用者的 PERSONAL 租户。

**Tech Stack:** Node/Express + mysql2（server），vitest（后端单测，沿用 tagService.test 的 SQL 子串路由假 pool 范式）。

---

## 1. 现状与缺口（实测事实）

- `GET /tags/question/:qid`（tags.js:140）：对任意登录用户返回任意 `qid` 的标签，**无任何属主/可见性校验** → 读侧 IDOR（可按题号枚举窥探他租户题目的知识点标签）。
- `PUT /tags/:id`（rename）、`DELETE /:id`（delete）：`UPDATE/DELETE question_tags WHERE id=?`，**无 org 作用域** → 任意用户可跨租户改名/删除他人标签。
- 对照：`bindTags`/`unbindTag` 已在路由内校验 `questions.id=? AND created_by=? AND deleted_at IS NULL`（严格属主）→ 写侧对"题目"有守卫，但对"标签实体"没有。
- `listTags` 按 `org_id` 过滤（读侧已按租户隔离）；`createTag` 写入即赋 `org_id`（S0）。
- 前端调用现状：`TagManagePage` 只用 `list/create/rename/remove`；`bindTags/unbindTag/getForQuestion` **当前无任何前端调用** → 收紧授权不破坏现有 UI。

## 2. 目标与非目标

**做**：给三个"裸"端点补授权；新增可测谓词；补单测；行为对合法主体不变。
**不做**：不动判分/迁移/org enforce；不改 service 既有函数签名；不引入 admin 旁路（`questions/:id` 读可见本身无 admin 旁路，保持一致）；前端零改动。

## 3. 详细设计

### 3.1 谓词（新纯函数，DI db，便于单测）

`server/src/utils/questionAccess.js`
```js
export async function canViewQuestion(db, questionId, userId) {
  // 镜像 GET /questions/:id 的可见性谓词
  const [rows] = await db.execute(
    `SELECT 1 AS ok FROM questions q
     WHERE q.id = ? AND q.deleted_at IS NULL AND (
       q.created_by = ?
       OR q.subject_id IN (SELECT ss.subject_id FROM subject_subscriptions ss WHERE ss.user_id = ? AND ss.status = 'approved')
       OR q.subject_id IN (SELECT s.id FROM subjects s WHERE s.share_scope = 'all' AND s.created_by IN (SELECT teacher_id FROM users WHERE id = ?))
       OR q.subject_id IN (SELECT s.id FROM subjects s WHERE s.share_scope = 'students' AND s.created_by IN (SELECT teacher_id FROM users WHERE id = ?)
         AND (NOT EXISTS (SELECT 1 FROM subject_student_access sa WHERE sa.subject_id = s.id) OR EXISTS (SELECT 1 FROM subject_student_access sa WHERE sa.subject_id = s.id AND sa.student_user_id = ?)))
     ) LIMIT 1`,
    [questionId, userId, userId, userId, userId, userId]
  );
  return rows.length > 0;
}
```
> 参数序：`id` + 5×`userId`，与 `questions/:id` 一致。

`server/src/utils/tagService.js` 追加
```js
// 标签是否属于指定 PERSONAL 租户（org 作用域守卫用）
export async function tagBelongsToOrg(db = pool, tagId, orgId) {
  const [rows] = await db.execute(
    'SELECT 1 AS ok FROM question_tags WHERE id = ? AND org_id = ? LIMIT 1',
    [tagId, orgId]
  );
  return rows.length > 0;
}
```

### 3.2 路由改造（`server/src/routes/tags.js`）

- `GET /question/:qid`：先 `await canViewQuestion(pool, qid, req.user.id)`；false → `404 {error:'题目不存在或无权限'}`；true → 原 `getTagsForQuestion`。
- `PUT /:id`：解析 `const orgId = await resolvePersonalOrgId(pool, req.user.id)`；`tagBelongsToOrg(pool, id, orgId)` 为 false → `404 {error:'标签不存在'}`（跨租户与不存在同话术，不泄漏）；true → 原 `renameTag`。
- `DELETE /:id`：同 `PUT` 的 org 守卫后再 `deleteTag`。

### 3.3 语义说明（防枚举 / 容错）

- 跨租户 tag id 与不存在 id → 统一 `404 '标签不存在'`（不区分，防枚举）。
- 无权限的题目 id 与不存在/软删题目 → 统一 `404 '题目不存在或无权限'`（与 `questions/:id` 同话术）。
- `resolvePersonalOrgId` 返回 `null`（历史无租户用户）：`tagBelongsToOrg(_, _, null)` 的 `org_id = NULL` 不匹配任何行 → 该用户不能改名/删除任何标签（安全默认）；线上个人租户由注册 `ensurePersonalOrg` + 迁移 013 回填保障，属可接受容错。

## 4. 安全边界（验收红线）

1. 非可见主体读任意题目标签 → 404，且响应体不含任何标签数据。
2. 跨租户改名/删除 → 404，目标 tag 不被改动。
3. 合法主体（属主 / approved 订阅 / share 命中）读题目标签 → 200，结果与改造前一致（**行为零回归**）。
4. 不改 `bindTags/unbindTag`（已有严格属主守卫，维持）。

## 5. 测试策略（vitest，假 db 按 SQL 子串路由）

- `questionAccess.test.js`：属主命中→true；订阅 approved 命中→true；share=all 且题主为可见 teacher→true；share=students 受 student_access 白名单约束→命中/不命中；非属主非共享陌生用户→false；软删题→false。
- `tagService.test.js` 追加 `tagBelongsToOrg`：org 匹配→true；不匹配→false；不存在→false。
- 回归：现有 tagService 其余用例保持通过。

## 6. 回滚 / 部署
- 纯授权增量，无迁移、无新表、无 .env 新依赖；revert 相关提交即恢复原状。
- 前端零改动（端点契约仅新增 404 分支）。

## 7. 假设
- `authMiddleware` 注入 `req.user.id`（tags 现网已依赖，bindTags 校验即证）。
- `subject_subscriptions / subject_student_access / organizations / org_members` 均存在（现网在用）。
