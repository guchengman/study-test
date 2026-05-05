#!/bin/bash
# Study-Test 一键安装脚本 (Linux)
# 运行方式: sudo bash install.sh

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Banner
echo -e "${BLUE}"
cat << "EOF"
██████╗ ███████╗██╗   ██╗     █████╗ ██████╗  ██████╗██╗  ██╗██╗   ██╗██████╗ 
██╔══██╗██╔════╝██║   ██║    ██╔══██╗██╔══██╗██╔════╝██║  ██║██║   ██║██╔══██╗
██████╔╝█████╗  ██║   ██║    ███████║██████╔╝██║     ███████║██║   ██║██████╔╝
██╔══██╗██╔══╝  ╚██╗ ██╔╝    ██╔══██║██╔══██╗██║     ██╔══██║██║   ██║██╔═══╝ 
██████╔╝███████╗ ╚████╔╝     ██║  ██║██████╔╝╚██████╗██║  ██║╚██████╔╝██║     
╚═════╝ ╚══════╝  ╚═══╝      ╚═╝  ╚═╝╚═════╝  ╚═════╝╚═╝  ╚═╝ ╚═════╝ ╚═╝     
EOF
echo -e "${NC}"
echo -e "学习题库系统 - Linux 一键安装脚本"
echo "=========================================="
echo ""

# 参数解析
SKIP_NODE_CHECK=false
SKIP_MYSQL_CHECK=false
DB_HOST="localhost"
DB_PORT="3306"
DB_USER="root"
DB_PASSWORD=""
DB_NAME="study_test"
AUTO_DB_PASSWORD=false

while [[ $# -gt 0 ]]; do
    case "$1" in
        --skip-node-check) SKIP_NODE_CHECK=true ;;
        --skip-mysql-check) SKIP_MYSQL_CHECK=true ;;
        --db-host=*) DB_HOST="${1#*=}" ;;
        --db-port=*) DB_PORT="${1#*=}" ;;
        --db-user=*) DB_USER="${1#*=}" ;;
        --db-password=*) DB_PASSWORD="${1#*=}" ;;
        --db-name=*) DB_NAME="${1#*=}" ;;
        --auto-db-password) AUTO_DB_PASSWORD=true ;;
    esac
    shift
done

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
APP_NAME="study-test"
APP_DIR="$SCRIPT_DIR/$APP_NAME"

# 工具函数
info() { echo -e "    ${BLUE}$1${NC}"; }
success() { echo -e "[${GREEN}OK${NC}] $1"; }
warn() { echo -e "[${YELLOW}WARN${NC}] $1"; }
error() { echo -e "[${RED}ERR${NC}] $1"; }
step() { echo -e "\n>>> ${BLUE}$1${NC}"; }

# ============================================
# 1. 环境检查
# ============================================
step "第1步：环境检查"

# 检查是否以 root 运行
if [[ $EUID -ne 0 ]]; then
    error "请以 root 用户运行此脚本 (sudo bash install.sh)"
    exit 1
fi

# 1.1 检查 Node.js
if [[ $SKIP_NODE_CHECK != true ]]; then
    info "检查 Node.js..."
    if command -v node &> /dev/null; then
        NODE_VERSION=$(node --version)
        NODE_MAJOR=$(echo "$NODE_VERSION" | cut -d'v' -f2 | cut -d'.' -f1)
        if [[ $NODE_MAJOR -ge 18 ]]; then
            success "Node.js 已安装: $NODE_VERSION"
        else
            error "Node.js 版本过低，需要 18+，当前: $NODE_VERSION"
            info "请从 https://nodejs.org 下载安装 Node.js 18+"
            exit 1
        fi
    else
        error "Node.js 未安装"
        info "安装 Node.js..."
        curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
        apt-get install -y nodejs
        success "Node.js 安装完成"
    fi
fi

# 1.2 检查 MySQL
if [[ $SKIP_MYSQL_CHECK != true ]]; then
    info "检查 MySQL..."
    if command -v mysql &> /dev/null; then
        success "MySQL 已安装"
    else
        warn "MySQL 未检测到，尝试安装..."
        DEBIAN_FRONTEND=noninteractive apt-get install -y mysql-server
        if [[ $? -eq 0 ]]; then
            success "MySQL 安装完成"
            # 启动 MySQL 服务
            systemctl start mysql
            systemctl enable mysql
        else
            error "MySQL 安装失败"
            info "请手动安装 MySQL: apt-get install mysql-server"
            exit 1
        fi
    fi
fi

# 1.3 检查 git
info "检查 Git..."
if command -v git &> /dev/null; then
    success "Git 已安装"
else
    info "安装 Git..."
    apt-get install -y git
    success "Git 安装完成"
fi

# ============================================
# 2. 下载程序
# ============================================
step "第2步：下载程序"

if [[ -d "$APP_DIR" ]]; then
    warn "检测到已有安装目录"
    read -p "是否更新现有安装? (Y/N) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        info "正在更新代码..."
        cd "$APP_DIR"
        git pull || warn "Git 更新失败，保留现有代码"
        cd "$SCRIPT_DIR"
    fi
else
    info "从 GitHub 克隆项目..."
    git clone https://github.com/guchengman/study-test.git "$APP_DIR"
    if [[ $? -eq 0 ]]; then
        success "代码下载完成"
    else
        error "克隆失败，请检查网络连接"
        exit 1
    fi
fi

# ============================================
# 3. 安装依赖
# ============================================
step "第3步：安装依赖"

cd "$APP_DIR"
info "安装前端 npm 依赖..."
npm install
if [[ $? -eq 0 ]]; then
    success "前端依赖安装完成"
else
    error "前端 npm 安装失败"
    exit 1
fi

info "安装后端 npm 依赖..."
cd server
npm install
if [[ $? -eq 0 ]]; then
    success "后端依赖安装完成"
else
    error "后端 npm 安装失败"
    exit 1
fi

# ============================================
# 4. 配置环境变量
# ============================================
step "第4步：配置环境变量"

cd "$APP_DIR"
ENV_FILE="$APP_DIR/.env"

if [[ $AUTO_DB_PASSWORD == true ]]; then
    DB_PASSWORD=$(openssl rand -base64 16)
fi

info "创建 .env 文件..."
cat > "$ENV_FILE" << EOF
# 数据库配置
DB_HOST=$DB_HOST
DB_PORT=$DB_PORT
DB_USER=$DB_USER
DB_PASSWORD=$DB_PASSWORD
DB_NAME=$DB_NAME

# JWT 密钥 (自动生成)
JWT_SECRET=$(openssl rand -hex 32)

# 百度 OCR 配置 (可选)
BAIDU_API_KEY=
BAIDU_SECRET_KEY=
EOF

success "环境变量配置完成"

if [[ $AUTO_DB_PASSWORD == true || -z "$DB_PASSWORD" ]]; then
    warn "数据库密码为空或自动生成"
    info "已生成的密码保存在 .env 文件中"
fi

# ============================================
# 5. 创建数据库
# ============================================
step "第5步：创建数据库"

info "尝试连接 MySQL..."
MYSQL_TEST=$(mysql -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" ${DB_PASSWORD:+-p"$DB_PASSWORD"} -e "SELECT 1" 2>/dev/null)
if [[ $? -ne 0 ]]; then
    warn "MySQL 连接测试失败，尝试无密码连接..."
    MYSQL_TEST=$(mysql -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" -e "SELECT 1" 2>/dev/null)
    if [[ $? -ne 0 ]]; then
        warn "MySQL 连接失败，跳过数据库创建"
        info "请手动执行以下命令创建数据库:"
        echo -e "${YELLOW}    CREATE DATABASE $DB_NAME CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;${NC}"
    else
        DB_PASSWORD=""
        success "MySQL 连接成功 (无密码)"
    fi
else
    success "MySQL 连接成功"
fi

# 创建数据库
info "创建数据库 $DB_NAME..."
mysql -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" ${DB_PASSWORD:+-p"$DB_PASSWORD"} -e "CREATE DATABASE IF NOT EXISTS \`$DB_NAME\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;" 2>/dev/null
if [[ $? -eq 0 ]]; then
    success "数据库创建成功"
else
    warn "数据库可能已存在或创建失败，继续下一步..."
fi

# ============================================
# 6. 初始化数据库表结构
# ============================================
step "第6步：初始化数据库表结构"

MIGRATIONS_DIR="$APP_DIR/server/migrations"
if [[ -d "$MIGRATIONS_DIR" ]]; then
    info "执行数据库迁移脚本..."
    SQL_FILES=$(ls "$MIGRATIONS_DIR"/*.sql 2>/dev/null | sort)
    if [[ -n "$SQL_FILES" ]]; then
        for SQL_FILE in $SQL_FILES; do
            info "执行: $(basename "$SQL_FILE")"
            mysql -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" ${DB_PASSWORD:+-p"$DB_PASSWORD"} "$DB_NAME" < "$SQL_FILE" 2>&1
            if [[ $? -eq 0 ]]; then
                success "  完成: $(basename "$SQL_FILE")"
            else
                warn "  跳过: $(basename "$SQL_FILE") (可能已存在)"
            fi
        done
        success "数据库表结构初始化完成"
    else
        warn "未找到 SQL 迁移文件，查找 JS 迁移文件..."
        JS_FILES=$(ls "$MIGRATIONS_DIR"/*.js 2>/dev/null | sort)
        if [[ -n "$JS_FILES" ]]; then
            for JS_FILE in $JS_FILES; do
                info "执行: $(basename "$JS_FILE")"
                node "$JS_FILE" "$DB_HOST" "$DB_PORT" "$DB_USER" "$DB_PASSWORD" "$DB_NAME" 2>&1 || warn "  跳过: $(basename "$JS_FILE")"
            done
            success "数据库表结构初始化完成"
        else
            warn "未找到迁移脚本"
        fi
    fi
else
    warn "未找到迁移脚本目录"
fi

# ============================================
# 7. 启动服务
# ============================================
step "第7步：启动服务"

cd "$APP_DIR"

echo ""
echo -e "${BLUE}请选择启动方式:${NC}"
echo "  1. 开发模式 (npm run dev)"
echo "  2. 生产模式 (构建后运行)"
echo "  3. 仅构建 (npm run build)"
echo "  Q. 退出，稍后手动启动"
read -p "请输入选项 [1]: " -n 1 -r
echo

case "$REPLY" in
    "1")
        echo -e "\n${YELLOW}按 Ctrl+C 停止服务${NC}\n"
        sleep 2
        npm run dev
        ;;
    "2")
        info "构建项目..."
        npm run build
        if [[ $? -eq 0 ]]; then
            success "构建完成"
            echo -e "\n${BLUE}生产模式需要配置 nginx，请参考项目文档${NC}"
        fi
        ;;
    "3")
        info "构建项目..."
        npm run build
        if [[ $? -eq 0 ]]; then
            success "构建完成，输出在 dist/ 目录"
        fi
        ;;
    *)
        info "已退出，请手动运行以下命令启动:"
        echo -e "${YELLOW}    cd $APP_DIR${NC}"
        echo -e "${YELLOW}    npm run dev${NC}"
        ;;
esac

echo ""
echo "========================================"
echo -e "  ${GREEN}安装完成！${NC}"
echo "  项目目录: $APP_DIR"
echo "  环境配置: $ENV_FILE"
echo "========================================"