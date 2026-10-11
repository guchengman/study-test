# 学习题库系统

> 文档基准：2026-10-11（与 main 分支代码全仓核对对齐）· 文档索引见 [docs/README.md](docs/README.md)

<div align="center">

```
██████╗ ███████╗██╗   ██╗     █████╗ ██████╗  ██████╗██╗  ██╗██╗   ██╗██████╗ 
██╔══██╗██╔════╝██║   ██║    ██╔══██╗██╔══██╗██╔════╝██║  ██║██║   ██║██╔══██╗
██████╔╝█████╗  ██║   ██║    ███████║██████╔╝██║     ███████║██║   ██║██████╔╝
██╔══██╗██╔══╝  ╚██╗ ██╔╝    ██╔══██║██╔══██╗██║     ██╔══██║██║   ██║██╔═══╝ 
██████╔╝███████╗ ╚████╔╝     ██║  ██║██████╔╝╚██████╗██║  ██║╚██████╔╝██║     
╚═════╝ ╚══════╝  ╚═══╝      ╚═╝  ╚═╝╚═════╝  ╚═════╝╚═╝  ╚═╝ ╚═════╝ ╚═╝     
```

</div>

## 在线体验

🌐 **[www.xiaoyue.shop](https://www.xiaoyue.shop)** — 即开即用，支持自主注册

## 功能

- **题库管理** — 按科目分类管理，支持单选/多选/编程三种题型
- **在线练习** — 模拟考试环境，自动计时、随机出题、即时评分
- **正式考试** — 教师组卷（题集/分值/限时/及格分）后发布，学员限时作答，服务端评分与成绩分析，支持多次参考取最高分
- **AI 出题** — 支持 Gemini、DeepSeek、通义千问、智谱、Moonshot、百川、OpenRouter 及自定义端点自动生成题目（混元/文心需经 OpenRouter 接入）
- **Markdown + 公式** — 内置 Markdown 编辑器与渲染器，支持 LaTeX 公式（KaTeX）
- **文档导入** — Word / PDF / **Excel** / CSV / Markdown / JSON 一键导入，批量解析题目，扫描件 OCR，公式图片转 LaTeX
- **错题本** — 自动记录错题，智能追踪薄弱知识点
- **学员管理** — 邀请码机制，查看学习进度和成绩统计
- **多平台** — Web + Electron 桌面版 + Chrome 扩展 + Android 应用

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | React 19 + TypeScript + Vite + Tailwind CSS v4 |
| 后端 | Node.js + Express + MySQL (mysql2) |
| 认证 | JWT + bcrypt |
| AI | Gemini / DeepSeek / Qwen / Zhipu / Moonshot / Baichuan / OpenRouter / 自定义（混元、文心待实现，可走 OpenRouter） |
| 桌面端 | Electron |
| 移动端 | Capacitor (Android) |

## 本地开发

**环境要求**: Node.js 18+ / MySQL 5.7+

```bash
# 1. 安装依赖
npm install

# 2. 配置环境变量（后端）
cp server/.env.example server/.env
# 编辑 server/.env 填入数据库信息和 JWT_SECRET（生产必填，≥16 字符）

# 3. 初始化数据库
# 使用自动化迁移运行器（按序应用 server/migrations/*.sql，幂等）：
cd server && npm run migrate

# 4. 启动开发服务器（前端 :3000，后端 :3100）
npm run dev

# 5. 另开终端启动后端
node server/src/index.js
```

**其他命令：**

```bash
npm run build            # 生产构建到 dist/（prebuild 自动同步判分模块）
npm run lint             # TypeScript 类型检查 (tsc --noEmit)
npm test                 # vitest 单元测试（评分/导入解析/映射层等）
npm run sync:scoring     # 从 src/shared/scoring 同步生成后端/扩展判分产物
npm run electron:dev     # Electron 桌面应用（开发模式）
npm run electron:build   # 打包 Windows 便携版 .exe
```

**环境变量：**见 `server/.env.example`（后端）与 `CONFIGURATION.md`（全量说明）。

## 部署

支持一键安装脚本（位于 `scripts/setup/install.sh`）：

**本地安装：**
```bash
git clone https://github.com/guchengman/study-test.git
cd study-test
bash scripts/setup/install.sh
```

可选参数：`--no-prompt`（自动化部署）、`--db-host`、`--db-user`、`--db-password`、`--verbose`

## 目录结构

```
study-test/
├── src/                      # React 前端
│   ├── components/           # 组件（app/ 屏幕、import/ 导入拆分、ui/ 底座、Markdown 编辑器等）
│   ├── pages/                # 页面 (HomePage, ExamPage, ResultPage, FormalExamPage, ExamManagePage)
│   ├── hooks/                # 自定义 Hooks (useAuth, useExam, useFormalExam 等)
│   ├── services/             # API 客户端 + 映射层 + AI 服务 + 导入解析器(extract/)
│   ├── shared/scoring/       # 判分单一事实源（经 prebuild 同步到后端/扩展）
│   ├── context/              # React Context (AppContext)
│   ├── config/               # 配置 (API 配置)
│   └── utils/                # 工具函数
├── server/                   # Express 后端
│   ├── src/routes/           # API 路由（含 exams 正式考试、ai 服务端代理）
│   ├── src/middleware/       # 中间件 (JWT 认证)
│   └── migrations/           # 数据库迁移脚本 001~010
├── docs/                     # 开发文档/使用说明/索引（docs/README.md）/SOP/归档
├── electron/                 # Electron 桌面应用
│   └── main.cjs
├── chrome-extension/         # Chrome 浏览器扩展
├── android/                  # Capacitor Android 应用
├── scripts/                  # 构建/部署脚本（setup/install.sh 等）
└── .github/workflows/        # CI/CD (GitHub Actions)
```

## 平台覆盖

| 平台 | 说明 |
|------|------|
| Web | SPA 部署于阿里云，Nginx + Express |
| Windows 桌面 | Electron 便携版 .exe |
| Chrome 扩展 | `chrome-extension/` 加载即用 |
| Android | Capacitor 封装，`android/` 目录 |

## License

MIT
