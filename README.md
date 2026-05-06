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

### 🌐 在线安装（最快方式）

**Linux / macOS / WSL2：**
```bash
curl -fsSL https://raw.githubusercontent.com/guchengman/study-test/main/install.sh | bash
```

**Windows (PowerShell)：**
```powershell
iwr -useb https://raw.githubusercontent.com/guchengman/study-test/main/install.sh | bash
```

### 📁 本地安装

**Linux/macOS：**
```bash
# 克隆项目
git clone https://github.com/guchengman/study-test.git
cd study-test

# 运行一键安装脚本
sudo bash install.sh
```

**Windows：**
```bash
# 克隆项目
git clone https://github.com/guchengman/study-test.git
cd study-test

# 运行安装脚本
install.bat
```

### 🎯 可选参数

```bash
# 非交互模式（适合自动化部署）
curl -fsSL https://raw.githubusercontent.com/guchengman/study-test/main/install.sh | bash -s -- --no-prompt

# 跳过检查
--skip-node-check       # 跳过 Node.js 检查
--skip-mysql-check      # 跳过 MySQL 检查

# 数据库配置
--auto-db-password      # 自动生成随机密码
--db-host=localhost     # 指定数据库地址
--db-user=root          # 指定数据库用户名
--db-password=xxx       # 指定数据库密码

# 输出模式
--verbose               # 详细输出模式
```

### 一键安装脚本功能

| 功能 | 说明 |
|------|------|
| 🌐 **在线安装** | 支持 `curl | bash` 一键在线安装，无需手动克隆 |
| 🌍 **网络检测** | 自动检测网络连接，智能切换国内镜像源 |
| 📦 **环境检查** | 自动检测并安装 Node.js、MySQL、npm、Git、curl、OpenSSL |
| 🔄 **服务检测** | 自动检测并停止运行中的旧服务（PM2、端口占用） |
| 🔁 **覆盖安装** | 支持删除旧安装重新克隆，或保留现有安装仅更新代码 |
| ⬇️ **下载代码** | 从 GitHub/Gitee 克隆最新代码（自动切换镜像） |
| 📊 **实时进度** | npm 安装过程实时显示日志，不再黑屏等待 |
| ⚡ **进度条** | 实时显示安装进度百分比 |
| ✅ **配置环境** | 自动生成 .env 文件 |
| 🗄️ **数据库检测** | 智能检测已有数据库，提供删除重建/保留更新/跳过等选项 |
| 📋 **初始化表** | 自动执行 SQL 迁移脚本 |
| 🚀 **启动服务** | 可选开发/生产模式启动 |

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
