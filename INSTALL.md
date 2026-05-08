# 安装部署指南

## 环境要求

| 组件 | 版本 | 说明 |
|------|------|------|
| Node.js | 18+ | 推荐使用 20.x LTS |
| MySQL | 5.7+ | 或 MariaDB 10.4+ |
| npm | 9+ | 随 Node.js 一并安装 |
| Git | 任意 | 用于克隆仓库 |
| OpenSSL | 任意 | 用于生成 JWT 密钥 |

## Ubuntu 安装步骤

### 第一步：安装 Node.js 18+

```bash
# 官方源（推荐）
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo bash -
sudo apt-get install -y nodejs

# 国内清华镜像
curl -fsSL https://mirrors.tuna.tsinghua.edu.cn/nodejs-release/v20.x/setup_20.x | sudo bash -
sudo apt-get install -y nodejs

# 验证
node --version   # 应显示 v18+ 或 v20+
npm --version
```

### 第二步：安装 MySQL

```bash
sudo apt-get update
sudo apt-get install -y mysql-server

# 启动并设置开机自启
sudo systemctl start mysql
sudo systemctl enable mysql

# 安全配置（设置 root 密码）
sudo mysql_secure_installation
```

### 第三步：安装其他工具

```bash
sudo apt-get install -y curl git openssl
```

## 三种安装方式

### 方式一：在线安装（最快捷）

一行命令，代码自动克隆到 `/opt/study-test`：

```bash
curl -fsSL https://raw.githubusercontent.com/guchengman/study-test/main/install.sh | bash
```

带数据库密码参数：

```bash
curl -fsSL https://raw.githubusercontent.com/guchengman/study-test/main/install.sh | bash -s -- \
  --db-host=localhost \
  --db-user=root \
  --db-password=your_mysql_password \
  --db-name=study_test
```

> 国内服务器如果 GitHub 不通，脚本会自动切换到 Gitee 镜像。

### 方式二：本地安装

```bash
git clone https://github.com/guchengman/study-test.git
cd study-test
sudo bash install.sh
```

### 方式三：全手动安装

```bash
# 1. 克隆项目
git clone https://github.com/guchengman/study-test.git
cd study-test

# 2. 安装前端依赖
npm install --legacy-peer-deps

# 3. 安装后端依赖
cd server
npm install --legacy-peer-deps
cd ..

# 4. 配置后端环境变量
cp .env.example server/.env
nano server/.env
```

`server/.env` 内容：

```env
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_mysql_password
DB_NAME=study_test
JWT_SECRET=请用 openssl rand -hex 32 生成
```

```bash
# 5. 创建数据库
sudo mysql -u root -p << SQL
CREATE DATABASE IF NOT EXISTS study_test
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;
SQL

# 6. 执行数据库迁移
for f in server/migrations/run-*.js; do
  echo "Running: $f"
  node "$f"
done

# 7. 启动服务
npm run dev &                  # 前端 :3000
node server/src/index.js &     # 后端 :3100
```

## 可用参数

```bash
--no-prompt            # 非交互模式，全部默认确认
--verbose              # 显示详细输出
--skip-node-check      # 跳过 Node.js 版本检查
--skip-mysql-check     # 跳过 MySQL 检查（纯前端环境）
--db-host=HOST         # 数据库地址（默认 localhost）
--db-port=PORT         # 数据库端口（默认 3306）
--db-user=USER         # 数据库用户（默认 root）
--db-password=PASS     # 数据库密码
--db-name=NAME         # 数据库名（默认 study_test）
--auto-db-password     # 自动生成随机数据库密码
```

## 脚本执行流程

脚本分 6 步执行，每步均有超时保护，不会卡死：

| 步骤 | 操作 | 超时 |
|------|------|------|
| [1/6] 环境检查 | 检查 OS / 网络 / Node.js 18+ / npm / MySQL 客户端 | curl 5s |
| [2/6] 停止旧服务 | 检测 PM2 进程和端口占用，自动停止 | — |
| [3/6] 获取代码 | `git clone --depth=1` 到 `/opt/study-test` | 120s |
| [4/6] 安装依赖 | 前端 + 后端 `npm install` | 15min / 10min |
| [5/6] 配置环境变量 | 生成 `server/.env`（DB 配置 + JWT_SECRET） | — |
| [6/6] 数据库配置 | 测试连接 → 建库 → 执行迁移脚本 | mysql 10s / 迁移 30s |

## 启动服务

安装完成后，打开两个终端：

```bash
# 终端 1：后端（端口 3100）
cd /opt/study-test
node server/src/index.js

# 终端 2：前端开发服务器（端口 3000）
cd /opt/study-test
npm run dev
```

浏览器访问 `http://localhost:3000`，点击右上角「注册」创建账号即可。

## 生产环境部署

### 构建前端

```bash
cd /opt/study-test
npm run build          # 产出到 dist/
```

### 使用 PM2 管理进程

```bash
npm install -g pm2
pm2 start server/src/index.js --name study-server
pm2 save
pm2 startup           # 设置开机自启
```

### 配置 Nginx 反向代理

```bash
sudo apt-get install -y nginx
```

创建 `/etc/nginx/sites-available/study-test`：

```nginx
server {
    listen 80;
    server_name your-domain.com;

    # 前端静态文件
    root /opt/study-test/dist;
    index index.html;

    # API 代理到后端
    location /api/ {
        proxy_pass http://127.0.0.1:3100;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    # SPA 路由回退
    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/study-test /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

## 常见问题

### npm install 很慢

脚本默认使用 npmmirror 国内镜像。如果仍然慢：

```bash
npm config set registry https://registry.npmmirror.com
```

### MySQL 连接被拒绝

```bash
# 检查 MySQL 监听状态
sudo mysql -u root -p -e "SELECT user, host FROM mysql.user;"

# 如需要创建专用用户
sudo mysql -u root -p -e "
  CREATE USER 'studyapp'@'localhost' IDENTIFIED BY 'password';
  GRANT ALL PRIVILEGES ON study_test.* TO 'studyapp'@'localhost';
  FLUSH PRIVILEGES;
"
```

### 端口被占用

脚本会自动检测并停止占用 3000/3100 端口的进程。手动处理：

```bash
sudo fuser -k 3000/tcp
sudo fuser -k 3100/tcp
```

### 数据库迁移失败

确保 `server/.env` 配置正确，手动执行：

```bash
cd /opt/study-test
node server/migrations/run-002.js
node server/migrations/run-003.js
# ... 依次执行所有 run-*.js 文件
```
