# 学习题库系统 (Study-Test)

<div align="center">
  <img width="800" height="300" alt="Banner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

在线访问：**[www.xiaoyue.shop](https://www.xiaoyue.shop)** 🧪

---

## 功能特点

| 功能 | 说明 |
|------|------|
| 📚 题库管理 | 创建、编辑、删除科目和题目 |
| 🤖 AI 生成 | 基于 Gemini AI 智能生成题目 |
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
| AI | Google Gemini API |
| 部署 | 阿里云服务器 |

---

## 本地开发

### 环境要求
- Node.js 18+
- MySQL 5.7+ / MariaDB 10.4+

### 安装步骤

```bash
# 1. 克隆项目
git clone https://github.com/guchengman/study-test.git
cd study-test

# 2. 安装依赖
npm install

# 3. 配置环境变量
cp .env.example .env
# 编辑 .env 填入数据库和 API 密钥

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

# Gemini AI (可选，用于 AI 生成题目)
GEMINI_API_KEY=your_gemini_api_key
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
│   ├── services/           # API 服务
│   └── ...
├── server/                 # Express 后端源码
│   ├── src/routes/         # API 路由
│   ├── src/db.js           # 数据库连接
│   └── migrations/         # 数据库迁移
├── chrome-extension/        # Chrome 扩展
├── public/                 # 静态资源
└── package.json
```

---

## 在线体验

🌐 **测试地址**: [https://www.xiaoyue.shop](https://www.xiaoyue.shop)

### 测试账号

| 角色 | 用户名 | 密码 |
|------|--------|------|
| 管理员 | admin | 请联系管理员获取 |

---

## License

MIT
