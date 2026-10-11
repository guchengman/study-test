# 文档体系对齐代码现状 — 设计文档

> 日期：2026-10-11
> 目标：全套文档与当前代码（main 分支）逐条核对对齐；历史一次性文档归档隔离；建立文档索引页。
> 方式：方案 B —— 全仓库通读核对（不依赖 git diff 圈定范围，逐模块验证文档陈述）。

## 1. 背景与现状

- Study-Test（全科题库）：React 19 + Express + MySQL，四端覆盖（Web / Electron / Chrome 扩展 / Android）。
- 现有主文档基准日期为 2026-07-26，此后代码发生了多项未入档的变化：
  - Excel 题库导入 + react-window 虚拟列表 + 公式渲染兜底（P0）
  - 评分逻辑重构为单一可信源（`src/shared/scoring/`）+ ImportModal 拆分 + API 映射层
  - OCR 本地化资源 + 45s 超时保护、百度 OCR Authorization 修复
  - `ecosystem.config.cjs` 改为可移植双-app 配置
  - 注册 500 / PDF worker MIME / autocomplete 等一系列修复
- docs/ 目录混杂现行文档与一次性审计/计划/SOP 文档，无状态标注。

## 2. 核对范围（代码为唯一事实来源）

| 模块 | 路径 | 对应文档章节 |
|---|---|---|
| 前端状态/路由/UI | `src/`（App.tsx、context、hooks、pages、components、services） | 开发文档 §2~§4、使用说明 |
| 评分引擎 | `src/utils/examScoring.ts`、`src/shared/scoring/` | 开发文档评分章节（重点核实） |
| 后端路由/中间件 | `server/src/`（10+ 路由，含 exams 正式考试） | 开发文档 API 章节 |
| 数据库 | `server/migrations/*.sql`（核实是否已超出 009） | 开发文档数据表章节 |
| 导入链路 | Excel/PDF/Word/OCR/图片 | 开发文档 + 使用说明 |
| 多端封装 | `electron/`、`chrome-extension/`、`android/`、`capacitor.config.json` | 开发文档多端章节 |
| 部署运维 | `scripts/`、`.github/workflows/deploy.yml`、`ecosystem.config.cjs`、`nginx-study-test.conf`、`install.sh` | INSTALL.md、CONFIGURATION.md、开发文档部署章节 |

## 3. 要更新的 6 份主文档

1. `docs/开发文档.md` — 主体修订
2. `docs/用户使用说明.md` — 功能/操作对齐（Excel 导入、新 UI 等）
3. `README.md` — 功能列表、命令、目录结构对齐
4. `CLAUDE.md` — 架构描述对齐（评分单一可信源、API 映射层等）
5. `CONFIGURATION.md` — 环境变量/API Key 现状核对（留根目录）
6. `INSTALL.md` — 部署流程与双-app PM2 配置核对（留根目录）

## 4. 执行流程（四阶段）

### 阶段① 逐模块通读，产出《核对勘误表》
- 按 §2 顺序通读代码，将文档中每条可验证陈述（文件路径、表结构、路由、命令、功能描述）与代码对照。
- 不直接改文档，先记入勘误表（临时工作文件，完工后删除），条目格式：
  **文档位置 | 原文陈述 | 代码事实 | 证据文件路径 | 处理动作（改/删/补）**
- 无法从代码确认的陈述标记「待人工确认」，不猜测修改。

### 阶段② 归档搬迁（git mv 保留历史）
- `docs/archive/`（一次性审计/计划/测试资产）：
  `architecture-audit.md`、`module-consistency-audit.md`、`module-consistency-remediation-risk.md`、`second-batch-plan.md`、`项目分析报告.md`、`CODE_AUDIT_REPORT.md`、`软件Bug测试报告.html`、`bug-feedback-form.html`、`Bug反馈表-实习生版.xlsx`、`PLAN-formula-support.md`（若公式功能已上线则归档，结论并入开发文档）
- `docs/sop/`（持续有效的工作规范）：
  `agent-dispatch-fallback-sop.md`、`git-write-protection-sop.md`、`npm-install-sandbox-sop.md`
- 归档文档头部追加一行归档说明（归档时间 + 指向现行文档），正文不改动。

### 阶段③ 按勘误表修订 6 份主文档
- 每份文档头部「代码基准日期」更新为核对当日；文档间交叉引用路径同步修正。
- 新增/补齐章节：正式考试与组卷管理一致性、Excel 导入、评分单一可信源架构、双-app 部署。

### 阶段④ 索引与终检
- 新建 `docs/README.md` 索引页：现行文档清单（一句话说明 + 基准日期）、SOP、归档说明；
  阅读路径推荐（新人 / 开发者 / 运维 / 用户各读哪几份）。
- 终检：
  - grep 全文确认无残留过时路径、已删表名、废弃脚本名、归档前的相对路径引用；
  - `npm run lint` 与 `npm run build` 通过，保证文档引用命令真实可执行；
  - 不执行安装包打包（遵循用户既有约定）。

## 5. 完工后目录结构

```
仓库根/
├── README.md              # 对齐全景（现行）
├── CLAUDE.md              # 架构指引（现行）
├── CONFIGURATION.md       # 配置说明（现行，留根目录）
├── INSTALL.md             # 部署说明（现行，留根目录）
├── nginx-study-test.conf  # 不动
├── start-app.bat          # 不动
└── docs/
    ├── README.md          # 【新建】文档索引页
    ├── 开发文档.md         # 修订（现行）
    ├── 用户使用说明.md      # 修订（现行）
    ├── exam-module/       # 保留，核对一致性后小修
    ├── sop/               # 【新建】3 份持续有效的 SOP
    └── archive/           # 【新建】一次性历史文档
```

## 6. 验收标准

1. 6 份主文档基准日期统一更新，每处修改在勘误表中有代码证据；
2. `docs/README.md` 完整标注「现行 / SOP / 归档」三类状态;
3. 全文无残留过时引用（grep 检查通过）；
4. `docs/archive/` 内文档正文未被改动，仅头部追加归档说明；
5. 文档中出现的每条命令（npm scripts、migrate、部署命令）与 `package.json` / 脚本实际一致。

## 7. 边界与不做的事

- 不重写文档结构与文风（差异修订，非从头重写）；
- 不修改任何业务代码（纯文档任务）；
- 不删除任何文档（只归档）；
- 线上环境行为（www.xiaoyue.shop 实际状态）无法本地核实的，标注「待人工确认」。
