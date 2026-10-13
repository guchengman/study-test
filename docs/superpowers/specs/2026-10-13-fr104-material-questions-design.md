# FR-104 材料题（一拖 N）核心纵切 设计文档

> 状态：已获批（范围 = 核心纵切，Excel「材料行 + 缩进子题」导入约定延后为增量 2）
> 日期：2026-10-13
> 关联：PRD FR-104（docs/产品需求文档-平台化演进.md §M1 题型与内容基建）、判分 SSOT（src/shared/scoring/index.ts）、FR-204 sweep（server/src/utils/examSweep.js）

## 1. 目标与范围

**目标**：让教师可创建「一段共享材料 + N 道子题」的材料题组，把整组纳入正式考试；学生作答时每题上方显示其所属材料；交卷后各子题按既有单题口径独立判分、总分回写 attempt。

**本增量包含（核心纵切）**：
- 数据模型：新增 `question_groups` 表 + `questions.group_id` 可空列（迁移 025）。
- 出题：材料组的创建 / 读取（含其子题）端点。
- 组卷：ExamForm 支持「按材料组选题」，选中即把该组全部子题批量加入 `question_set`。
- 下发与渲染：考试 start 与 GET 详情带出 `group_id / group_material`；学生作答界面、试卷预览、人工判分页在子题上方渲染共享材料。
- 判分：确认子题天然独立计分（SSOT 零改动），补「子题聚合」测试语料。
- 门禁：集成 + 跨租户隔离 + server vitest + root vitest + tsc 四重门禁全绿。

**本增量明确不包含（延后增量 2）**：
- Excel / CSV「材料行 + 缩进子题」导入约定（xlsxExtract / ImportModal 改造）。

## 2. 关键设计决策（自主定案，原则：最稳妥 / 最小改动 / 最贴近生产）

| # | 决策 | 理由 / 被否方案 |
|---|---|---|
| D1 | 材料本体独立存 `question_groups.material`，子题通过 `questions.group_id` 引用 | 关系干净、可被多题共享；被否：把材料塞进某道子题 title（耦合、无法共享、污染题干） |
| D2 | `question_set` 保持扁平 `{question_id, points}` 不变，「组」只在选组=批量加子题这层表达 | 零改动判分与 attempt 结构；被否：question_set 引入 group 嵌套（波及 gradeAttempt、details、导出、乱序等一大片） |
| D3 | 判分 SSOT 不改，子题就是普通题型 | `gradeAttempt` 已逐题调 `gradeQuestion` 累加，天然满足「逐子题独立给分、总分回写」；PRD「子题聚合用例」以测试语料形式落地 |
| D4 | 材料在每题上方重复渲染，不重构为分节翻页 | 复用现有逐题翻页 UI（FormalExamScreen），改动面最小；被否：把作答界面改为按组分节（波及进度、乱序、导航一大片） |
| D5 | `questions.group_id` 用**可空普通索引列，不设 DB 外键** | 对存量题与所有现有查询零影响；被否：加 FK `ON DELETE CASCADE`——DB 级联会绕过项目既有「被试卷 question_set 引用的题目禁止物理删」护栏（questionLifecycle），造成悬空引用/意外硬删 |

## 3. 数据模型

### 3.1 新增 `question_groups`（迁移 `025_question_groups.sql`）

```sql
CREATE TABLE IF NOT EXISTS question_groups (
  id INT AUTO_INCREMENT PRIMARY KEY,
  subject_id VARCHAR(50) NOT NULL,
  material LONGTEXT NOT NULL COMMENT '共享材料本体（文本/Markdown）',
  created_by INT DEFAULT NULL,
  org_id INT DEFAULT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_subject (subject_id),
  KEY idx_created_by (created_by),
  KEY idx_org (org_id),
  FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

- 迁移范式对齐 013/014：幂等（`IF NOT EXISTS`）、utf8mb4_unicode_ci、`migrate.js` 按「分号+换行」拆句故语句体内不得出现行内分号。
- `org_id` 沿用 S0 影子租户机制（`resolvePersonalOrgId`），与 questions/subjects 一致，供隔离门禁校验。

### 3.2 `questions` 加列（同一迁移文件内）

```sql
ALTER TABLE questions
  ADD COLUMN group_id INT DEFAULT NULL COMMENT '材料题组ID，NULL=非子题',
  ADD KEY idx_group (group_id);
```

- 子题（有 group_id）本身仍是普通题型行：single / multiple / judge / fill_in / short_answer / programming。
- **`group_id` 不建 DB 外键**：组与子题的关联是「软引用」，由应用层维护。原因——questions 现有删除护栏（questionLifecycle：被试卷引用的题禁止物理删）在应用层判定；若在此加 `ON DELETE CASCADE`，删 `question_groups` 行会绕过该护栏直接硬删子题并留下 exam.question_set 悬空引用。故列仅建索引、不建 FK。
- 本增量**不提供删组端点**（YAGNI，见 §7）。

## 4. 后端改动

### 4.1 材料组 CRUD（`server/src/routes/questions.js` 或新增分组路由）

新增端点（均 `authMiddleware`，沿用 `isOwner`/科目归属校验口径）：
- `POST /api/question-groups`：body `{subject_id, material, questions:[{type,title,code,options,answer,explanation,points}]}`。事务内：插入 group → 逐个插入子题并写 `group_id`（复用 VALID_QUESTION_TYPES 校验）。返回 `{group_id, question_ids}`。
- `GET /api/question-groups/:id`：返回 group（material）+ 其全部子题（owner 视角含答案）。
- 隔离：非 owner / 跨租户读该组 → 403/404（与题目隔离同口径）。

> 子题的增删改可复用现有单题端点（带 group_id 归属），本增量不强求组内编辑 UI，API 具备即可。

### 4.2 材料下发（两处查询，join 一次）

- `GET /api/exams/:id`（exams.js L255-289）：`SELECT ... FROM questions` 改为 `LEFT JOIN question_groups qg ON q.group_id = qg.id`，questions 每项附 `group_id`、`group_material`。
- `POST /api/exams/:id/start`（exams.js L437-457）：同上 join，剥离答案的题目对象附 `group_id`、`group_material`（材料本身不含答案，安全下发）。

无 N+1：仍是单条按 id 集合的批量查询，仅多一个 LEFT JOIN。

## 5. 前端改动

### 5.1 类型（`src/types.ts`）
- `ExamQuestionDetail`、`ExamQuestionFull` 各加可选 `group_id?: number | null;` 与 `group_material?: string | null;`。
- 新增 `QuestionGroupInput`（组创建入参）与 `QuestionGroup`（组详情）接口，供 api 层使用。

### 5.2 API 层（`src/services/examApi.ts` 或 `questionApi`）
- `createQuestionGroup(payload)` → `POST /api/question-groups`。
- `getQuestionGroup(id)` → `GET /api/question-groups/:id`。

### 5.3 组卷（`src/components/exam/ExamForm.tsx`）
- 新增「材料组」选题入口：列出当前科目下的材料组，选中一个组 → 将其全部子题（携各自 points）批量 push 进 `question_set`（去重已存在的 question_id）。

### 5.4 作答渲染（`src/components/app/FormalExamScreen.tsx`）
- 当 `currentQuestion.group_material` 非空：在题型徽标行与题干之间渲染一段「材料」卡片（复用 `MarkdownRenderer`），与题干视觉区隔。子题作答交互完全不变。

### 5.5 预览 / 人工判分
- 试卷预览（含答案处）与 `ManualGradingPage` 的题目项同样按 `group_material` 显示材料（若该页拿到的数据含子题）。判分页数据来自 GET 详情/start，字段已带出。

## 6. 判分正确性（SSOT 零改动）

- `gradeAttempt`（examSweep.js L44-108）逐个 `question_set` 项取题、调 SSOT `gradeQuestion({type,answer,options}, userAnswer, points)`，累加 `score`、`correctCount`（`is_correct===true` 计数）、`totalCount`。
- 材料题子题即普通题，进入上述循环天然被独立计分并计入总分——满足 PRD「共享材料下逐子题独立给分、总分回写 attempt」。
- **测试语料（补进 `server/tests/unit/scoringConsistency.test.js` 或新增用例）**：构造一个含 2~3 道不同类型子题（single + fill_in + short_answer）的组，交卷后断言各子题 earned 独立、score = Σ、correct_count 正确。

## 7. 错误处理与边界

- 材料为空：创建组时 `material` 必填非空校验 → 400。
- 组内子题为空：允许（先建组后加题）；但组卷「选组」仅加入已有子题，空组不产生 question_set 变更。
- 删组：**本增量不提供删组端点**（YAGNI）。未来若提供，须走应用层——仅物理删未被任何试卷引用的子题，其余子题置 `group_id = NULL` 脱组（材料不再显示但题与引用不丢）；**绝不依赖 DB 级 CASCADE**。
- 缺材料（join 未命中，group 已删但子题残留引用）：`group_material` 为 null，前端不渲染材料卡片，作答与判分不受影响（降级安全）。
- 乱序：start 已有 shuffleQuestions/option_order 逻辑，子题作为普通题参与乱序，材料随题走（每题带自己的 material），乱序无副作用。

## 8. 验收标准（DoD）

1. 迁移 `025_question_groups.sql` 幂等、utf8mb4、可重复执行；`questions.group_id` 可空且对存量无影响。
2. 可经 API 创建材料组（group + N 子题）并读取。
3. 组卷可把一个材料组的全部子题批量加入试卷。
4. 学生开考/查看详情：子题带 `group_id/group_material`；作答界面在子题上方显示材料；预览显示材料。
5. 交卷后子题独立判分、总分回写正确（集成用例 + 判分语料断言）。
6. 跨租户隔离：B 读/写 A 的材料组及其下发 → 403/404（进隔离门禁）。
7. 四重门禁全绿：integration、isolation、server vitest、root vitest + tsc。
8. SSOT（src/shared/scoring + examScoring.generated.js）零改动；可整体 revert 单 PR；文档（开发文档端点清单 + PRD FR-104 状态）同步。

## 9. 不在本范围（增量 2 预告）

- Excel/CSV「材料行 + 缩进子题」导入解析（`src/services/extract/xlsxExtract.ts`、`ImportModal.tsx`）。
- 组内子题的可视化拖拽编辑界面。
- 材料为音频/图片（属 FR-105 听力 / FR-109 OSS，依赖更高阶段）。
