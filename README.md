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

## 🚀 立刻体验

### 🌐 **[www.xiaoyue.shop](https://www.xiaoyue.shop)** — 点击即可使用！

👉 系统支持自主注册，点击右上角「注册」创建专属账号

---

## 💡 这些场景，你中招了吗？

| 😫 困扰 | 😄 用它来解决 |
|--------|-------------|
| 期末考试一堆科目，题库整理到手酸 | 一个平台搞定所有科目题目，随时切换 |
| 对着PDF刷题，错过的题下次还错 | 智能记录错题本，专门攻克薄弱点 |
| 出卷子靠复制粘贴，眼睛都要瞎了 | AI自动生成试卷，一键导出打印 |
| 学员练习情况靠截图反馈，完全失控 | 后台实时统计，每道题的正确率一目了然 |
| 想刷题但电脑不在身边 | Chrome扩展，手机平板随时练 |
| 导入历史题库只能手动一条条录 | Word/Excel一键导入，1000题分分钟搞定 |

---

## 🎯 能做什么？

**📚 题库管理** — 按科目、章节分类管理题目，支持单选/多选/判断/简答多种题型

**🤖 AI 出题** — 输入知识点描述，AI 自动生成高质量题目，再也不用手动编题

**📝 在线答题** — 模拟真实考试环境，自动计时、随机出题、即时评分

**📤 一键导入** — Word/Excel 文档直接导入，支持批量导入历史题库

**👥 学员管理** — 生成邀请码管理学员，查看学习进度、成绩排名、错题统计

**📱 Chrome 扩展** — 安装扩展后，随时随地在浏览器中刷题，充分利用碎片时间

---

## ✨ 为什么选择我们？

| 特性 | 说明 |
|------|------|
| 🎨 界面友好 | 简洁清晰，一看就会用 |
| ⚡ 响应快速 | 前后端分离架构，操作流畅 |
| 🔒 安全可靠 | JWT 认证，密码加密存储 |
| 📦 开箱即用 | Windows 一键安装脚本，无需手动配置 |
| 🔄 持续更新 | 活跃维护，功能不断完善 |

---

## 🛠 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | React + TypeScript + Vite |
| 后端 | Node.js + Express + MySQL |
| 认证 | JWT + bcrypt |
| 部署 | 阿里云服务器 |

---

## 💻 一键安装

### Windows 一键安装（推荐）

1. **下载项目**
   ```bash
   git clone https://github.com/guchengman/study-test.git
   cd study-test
   ```

2. **运行安装脚本**
   ```bash
   # 方式1：双击运行
   install.bat
   
   # 方式2：PowerShell 运行
   .\install.ps1
   
   # 方式3：跳过 MySQL 检查（已有 MySQL）
   .\install.ps1 -SkipMySQLCheck
   
   # 方式4：自动生成随机数据库密码
   .\install.ps1 -AutoDBPassword
   ```

### 一键安装脚本功能

| 功能 | 说明 |
|------|------|
| ✅ 环境检查 | 自动检测 Node.js、MySQL 是否安装 |
| ✅ 下载代码 | 从 GitHub 克隆最新代码 |
| ✅ 安装依赖 | 自动执行 npm install |
| ✅ 配置环境 | 自动生成 .env 文件 |
| ✅ 创建数据库 | 自动创建 MySQL 数据库 |
| ✅ 初始化表 | 自动执行 SQL 迁移脚本 |
| ✅ 启动服务 | 可选开发/生产模式启动 |

### 手动安装

**环境要求**
- Node.js 18+
- MySQL 5.7+ / MariaDB 10.4+

**安装步骤**

```bash
# 1. 克隆项目
git clone https://github.com/guchengman/study-test.git
cd study-test

# 2. 安装依赖
npm install

# 3. 配置环境变量
cp .env.example .env
# 编辑 .env 填入数据库信息

# 4. 初始化数据库
# 导入 server/migrations/ 下的 SQL 文件

# 5. 启动开发服务器
npm run dev
```

### 环境变量 (.env)

```env
# 数据库
DB_HOST=localhost
DB_USER=your_user
DB_PASSWORD=your_password
DB_NAME=study_test

# JWT 密钥
JWT_SECRET=your_jwt_secret
```

---

## 📱 Chrome 扩展

支持随时随地练习题库，详见 [chrome-extension/README.md](chrome-extension/README.md)

### 安装扩展
1. 打开 `chrome://extensions/`
2. 开启「开发者模式」
3. 点击「加载已解压的扩展程序」
4. 选择 `chrome-extension/` 文件夹

---

## 📁 目录结构

```
study-test/
├── src/                    # React 前端源码
│   ├── components/         # 组件
│   ├── pages/              # 页面
│   ├── services/           # API 服务
│   └── ...
├── server/                 # Express 后端源码
│   ├── src/routes/         # API 路由
│   ├── src/db.js           # 数据库连接
│   └── migrations/         # 数据库迁移
├── chrome-extension/       # Chrome 扩展
├── public/                 # 静态资源
└── package.json
```

---

## 🌐 在线体验

🌐 **测试地址**: [https://www.xiaoyue.shop](https://www.xiaoyue.shop)

👉 系统支持自主注册，点击右上角「注册」即可创建账号

---

## License

MIT
