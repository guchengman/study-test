# 学习题库系统

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
- **在线考试** — 模拟考试环境，自动计时、随机出题、即时评分
- **AI 出题** — 支持 Gemini、DeepSeek、通义千问、智谱、Moonshot、百川、混元、文心等多家 AI 自动生成题目
- **Markdown 编辑** — 内置 Markdown 编辑器和渲染器，支持富文本题目
- **文档导入** — Word / PDF 文件一键导入，批量解析题目
- **错题本** — 自动记录错题，智能追踪薄弱知识点
- **学员管理** — 邀请码机制，查看学习进度和成绩统计
- **多平台** — Web + Electron 桌面版 + Chrome 扩展 + Android 应用

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | React 19 + TypeScript + Vite + Tailwind CSS v4 |
| 后端 | Node.js + Express + MySQL (mysql2) |
| 认证 | JWT + bcrypt |
| AI | Gemini / DeepSeek / Qwen / Zhipu / Moonshot / Baichuan / Hunyuan / ERNIE / OpenRouter |
| 桌面端 | Electron |
| 移动端 | Capacitor (Android) |

## 本地开发

**环境要求**: Node.js 18+ / MySQL 5.7+

```bash
# 1. 安装依赖
npm install

# 2. 配置环境变量
cp .env.example server/.env
# 编辑 server/.env 填入数据库信息和 JWT_SECRET

# 3. 初始化数据库
# 导入 server/migrations/ 下的 SQL 迁移文件

# 4. 启动开发服务器（前端 :3000，后端 :3100）
npm run dev

# 5. 另开终端启动后端
node server/src/index.js
```

**其他命令：**

```bash
npm run build            # 生产构建到 dist/
npm run lint             # TypeScript 类型检查 (tsc --noEmit)
npm run electron:dev     # Electron 桌面应用（开发模式）
npm run electron:build   # 打包 Windows 便携版 .exe
```

**环境变量：**

```env
DB_HOST=localhost
DB_USER=your_user
DB_PASSWORD=your_password
DB_NAME=study_test
JWT_SECRET=your_jwt_secret_32_chars_min
```

## 部署

支持一键安装脚本：

**在线安装：**
```bash
curl -fsSL https://raw.githubusercontent.com/guchengman/study-test/main/install.sh | bash
```

**本地安装：**
```bash
git clone https://github.com/guchengman/study-test.git
cd study-test
bash install.sh
```

可选参数：`--no-prompt`（自动化部署）、`--db-host`、`--db-user`、`--db-password`、`--verbose`

## 目录结构

```
study-test/
├── src/                      # React 前端
│   ├── components/           # 组件 (app/, Markdown编辑器等)
│   ├── pages/                # 页面 (HomePage, ExamPage, ResultPage)
│   ├── hooks/                # 自定义 Hooks (useAuth, useExam 等)
│   ├── services/             # API 客户端 + AI 服务
│   ├── context/              # React Context (AppContext)
│   ├── config/               # 配置 (API 配置)
│   └── utils/                # 工具函数
├── server/                   # Express 后端
│   ├── src/routes/           # API 路由
│   ├── src/middleware/       # 中间件 (JWT 认证)
│   └── migrations/           # 数据库迁移脚本
├── electron/                 # Electron 桌面应用
│   └── main.cjs
├── chrome-extension/         # Chrome 浏览器扩展
├── android/                  # Capacitor Android 应用
├── scripts/                  # 构建/部署脚本
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
