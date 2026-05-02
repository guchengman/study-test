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

在线访问：**[www.xiaoyue.shop](https://www.xiaoyue.shop)** 🧪

---

## 功能特点

| 功能 | 说明 |
|------|------|
| 📚 题库管理 | 创建、编辑、删除科目和题目 |
| 🤖 AI 生成 | 智能生成各类考试题目 |
| 📝 在线答题 | 支持多种题型：单选、多选、判断、简答 |
| 📤 文件导入 | 支持上传 Word/Excel 文档导入题目 |
| 👥 学员管理 | 邀请码注册、成绩统计、错题本 |
| 📱 Chrome 扩展 | 随时随地练习题库 |

---

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | React + TypeScript + Vite |
| 后端 | Node.js + Express + MySQL |
| 认证 | JWT + bcrypt |
| 部署 | 阿里云服务器 |

---

## 一键安装

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

## Chrome 扩展

支持随时随地练习题库，详见 [chrome-extension/README.md](chrome-extension/README.md)

### 安装扩展
1. 打开 `chrome://extensions/`
2. 开启「开发者模式」
3. 点击「加载已解压的扩展程序」
4. 选择 `chrome-extension/` 文件夹

---

## 目录结构

```
study-test/
├── src/                    # React 前端源码
│   ├── components/         # 组件
│   ├── pages/              # 页面
│   ├── services/            # API 服务
│   └── ...
├── server/                  # Express 后端源码
│   ├── src/routes/          # API 路由
│   ├── src/db.js            # 数据库连接
│   └── migrations/          # 数据库迁移
├── chrome-extension/         # Chrome 扩展
├── public/                  # 静态资源
└── package.json
```

---

## 在线体验

🌐 **测试地址**: [https://www.xiaoyue.shop](https://www.xiaoyue.shop)

👉 系统支持自主注册，点击右上角「注册」即可创建账号

---

## License

MIT
