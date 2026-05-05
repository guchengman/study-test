#!/bin/bash
# -*- coding: utf-8 -*-
# Study-Test 一键安装脚本 (Linux)
# Usage: curl -fsSL https://example.com/install.sh | bash
# or: sudo bash install.sh

set -euo pipefail

export LANG=en_US.UTF-8
export LC_ALL=en_US.UTF-8

# ============================================
# 颜色定义
# ============================================
BOLD='\033[1m'
ACCENT='\033[38;2;59;130;246m'      # blue-500
ACCENT_BRIGHT='\033[38;2;37;99;235m' # blue-600
SUCCESS='\033[38;2;34;197;94m'      # green-500
WARN='\033[38;2;251;191;36m'        # yellow-400
ERROR='\033[38;2;239;68;68m'        # red-500
INFO='\033[38;2;107;114;128m'       # gray-500
MUTED='\033[38;2;156;163;175m'      # gray-400
NC='\033[0m' # No Color

# ============================================
# 全局变量
# ============================================
SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" &>/dev/null && pwd)
APP_NAME="study-test"
APP_DIR="$SCRIPT_DIR/$APP_NAME"
TMPFILES=()
INSTALL_STAGE_TOTAL=8
INSTALL_STAGE_CURRENT=0
TAGLINE="智能题库系统，轻松学习每一天"

# ============================================
# 参数解析
# ============================================
SKIP_NODE_CHECK=false
SKIP_MYSQL_CHECK=false
DB_HOST="localhost"
DB_PORT="3306"
DB_USER="root"
DB_PASSWORD=""
DB_NAME="study_test"
AUTO_DB_PASSWORD=false
NO_PROMPT=false
VERBOSE=false

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
        --no-prompt) NO_PROMPT=true ;;
        --verbose) VERBOSE=true ;;
        *)
            echo -e "${ERROR}未知参数: $1${NC}"
            exit 1
            ;;
    esac
    shift
done

# ============================================
# 工具函数
# ============================================

# 清理临时文件
cleanup_tmpfiles() {
    local f
    for f in "${TMPFILES[@]:-}"; do
        rm -rf "$f" 2>/dev/null || true
    done
}
trap cleanup_tmpfiles EXIT

# 创建临时文件
mktempfile() {
    local f
    f="$(mktemp)"
    TMPFILES+=("$f")
    echo "$f"
}

# 检查是否为 root
is_root() {
    [[ $EUID -eq 0 ]]
}

# 检查是否需要 sudo
require_sudo() {
    if ! is_root; then
        if ! command -v sudo &>/dev/null; then
            ui_error "需要 root 权限或 sudo 命令"
            exit 1
        fi
    fi
}

# 检测下载器
detect_downloader() {
    if command -v curl &>/dev/null; then
        DOWNLOADER="curl"
        return 0
    fi
    if command -v wget &>/dev/null; then
        DOWNLOADER="wget"
        return 0
    fi
    ui_error "缺少下载工具 (curl 或 wget)"
    exit 1
}

# ============================================
# UI 函数
# ============================================

ui_info() {
    local msg="$*"
    echo -e "${MUTED}·${NC} ${msg}"
}

ui_warn() {
    local msg="$*"
    echo -e "${WARN}!${NC} ${msg}"
}

ui_success() {
    local msg="$*"
    echo -e "${SUCCESS}✓${NC} ${msg}"
}

ui_error() {
    local msg="$*"
    echo -e "${ERROR}✗${NC} ${msg}"
}

ui_section() {
    local title="$1"
    echo ""
    echo -e "${ACCENT}${BOLD}${title}${NC}"
}

ui_stage() {
    local title="$1"
    INSTALL_STAGE_CURRENT=$((INSTALL_STAGE_CURRENT + 1))
    ui_section "[${INSTALL_STAGE_CURRENT}/${INSTALL_STAGE_TOTAL}] ${title}"
}

ui_kv() {
    local key="$1"
    local value="$2"
    echo -e "${INFO}${key}:${NC} ${value}"
}

ui_banner() {
    echo -e "${ACCENT}${BOLD}"
    cat << "EOF"
██████╗ ███████╗██╗   ██╗     █████╗ ██████╗  ██████╗██╗  ██╗██╗   ██╗██████╗ 
██╔══██╗██╔════╝██║   ██║    ██╔══██╗██╔══██╗██╔════╝██║  ██║██║   ██║██╔══██╗
██████╔╝█████╗  ██║   ██║    ███████║██████╔╝██║     ███████║██║   ██║██████╔╝
██╔══██╗██╔══╝  ╚██╗ ██╔╝    ██╔══██║██╔══██╗██║     ██╔══██║██║   ██║██╔═══╝ 
██████╔╝███████╗ ╚████╔╝     ██║  ██║██████╔╝╚██████╗██║  ██║╚██████╔╝██║     
╚═════╝ ╚══════╝  ╚═══╝      ╚═╝  ╚═╝╚═════╝  ╚═════╝╚═╝  ╚═╝ ╚═════╝ ╚═╝     
EOF
    echo -e "${NC}${INFO}  ${TAGLINE}${NC}"
    echo ""
}

ui_celebrate() {
    local msg="$1"
    echo -e "\n${SUCCESS}${BOLD}🎉 ${msg} 🎉${NC}"
}

# ============================================
# 运行命令（带日志）
# ============================================

run_quiet_step() {
    local title="$1"
    shift
    if [[ "$VERBOSE" == "true" ]]; then
        ui_info "执行: $*"
        "$@"
        return $?
    fi
    local log
    log="$(mktempfile)"
    if "$@" >"$log" 2>&1; then
        return 0
    fi
    ui_error "${title} 失败"
    if [[ -s "$log" ]]; then
        echo "--- 错误日志 ---"
        tail -n 20 "$log" >&2
        echo "---------------"
    fi
    return 1
}

confirm_action() {
    if [[ "$NO_PROMPT" == "true" ]]; then
        return 0
    fi
    read -p "$1 (Y/N) " -n 1 -r
    echo
    [[ $REPLY =~ ^[Yy]$ ]]
}

# ============================================
# 主安装流程
# ============================================

main() {
    # 显示 Banner
    ui_banner

    # ============================================
    # 1. 环境检查
    # ============================================
    ui_stage "环境检查"

    # 检查 root 权限
    if ! is_root; then
        ui_warn "建议以 root 用户运行以获得完整权限"
        if ! confirm_action "是否继续以当前用户安装？"; then
            exit 0
        fi
    fi

    # 检测操作系统
    if [[ "$OSTYPE" != "linux-gnu"* ]]; then
        ui_error "不支持的操作系统"
        echo "此安装脚本仅支持 Linux 系统"
        exit 1
    fi
    ui_success "检测到 Linux 系统"

    # 1.1 检查 Node.js
    if [[ "$SKIP_NODE_CHECK" != "true" ]]; then
        ui_info "检查 Node.js..."
        if command -v node &>/dev/null; then
            NODE_VERSION=$(node --version)
            NODE_MAJOR=$(echo "$NODE_VERSION" | cut -d'v' -f2 | cut -d'.' -f1)
            if [[ "$NODE_MAJOR" -ge 18 ]]; then
                ui_success "Node.js 已安装: $NODE_VERSION"
            else
                ui_error "Node.js 版本过低，需要 18+，当前: $NODE_VERSION"
                if confirm_action "是否自动安装 Node.js 20.x？"; then
                    require_sudo
                    if is_root; then
                        run_quiet_step "安装 Node.js" bash -c "curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && apt-get install -y nodejs"
                    else
                        run_quiet_step "安装 Node.js" bash -c "curl -fsSL https://deb.nodesource.com/setup_20.x | sudo bash - && sudo apt-get install -y nodejs"
                    fi
                    ui_success "Node.js 安装完成"
                else
                    ui_error "请手动安装 Node.js 18+"
                    exit 1
                fi
            fi
        else
            ui_warn "Node.js 未安装"
            if confirm_action "是否自动安装 Node.js 20.x？"; then
                require_sudo
                if is_root; then
                    run_quiet_step "安装 Node.js" bash -c "curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && apt-get install -y nodejs"
                else
                    run_quiet_step "安装 Node.js" bash -c "curl -fsSL https://deb.nodesource.com/setup_20.x | sudo bash - && sudo apt-get install -y nodejs"
                fi
                ui_success "Node.js 安装完成"
            else
                ui_error "请手动安装 Node.js 18+"
                exit 1
            fi
        fi
    fi

    # 1.2 检查 MySQL
    if [[ "$SKIP_MYSQL_CHECK" != "true" ]]; then
        ui_info "检查 MySQL..."
        if command -v mysql &>/dev/null; then
            ui_success "MySQL 已安装"
        else
            ui_warn "MySQL 未安装"
            if confirm_action "是否自动安装 MySQL？"; then
                require_sudo
                if is_root; then
                    run_quiet_step "安装 MySQL" bash -c "DEBIAN_FRONTEND=noninteractive apt-get install -y mysql-server && systemctl start mysql && systemctl enable mysql"
                else
                    run_quiet_step "安装 MySQL" bash -c "DEBIAN_FRONTEND=noninteractive sudo apt-get install -y mysql-server && sudo systemctl start mysql && sudo systemctl enable mysql"
                fi
                ui_success "MySQL 安装完成"
                ui_info "配置 MySQL root 用户认证方式..."
                if is_root; then
                    run_quiet_step "配置 MySQL 认证" mysql -u root -e "ALTER USER 'root'@'localhost' IDENTIFIED WITH mysql_native_password BY ''; FLUSH PRIVILEGES;" || ui_warn "MySQL 认证配置可能已完成"
                else
                    run_quiet_step "配置 MySQL 认证" sudo mysql -u root -e "ALTER USER 'root'@'localhost' IDENTIFIED WITH mysql_native_password BY ''; FLUSH PRIVILEGES;" || ui_warn "MySQL 认证配置可能已完成"
                fi
                ui_success "MySQL 认证配置完成"
            else
                ui_warn "跳过 MySQL 安装，请手动安装后配置"
            fi
        fi
    fi

    # 1.3 检查 curl（安装 Node.js 需要）
    ui_info "检查 curl..."
    if command -v curl &>/dev/null; then
        ui_success "curl 已安装"
    else
        ui_warn "curl 未安装"
        require_sudo
        if is_root; then
            run_quiet_step "安装 curl" apt-get install -y curl
        else
            run_quiet_step "安装 curl" sudo apt-get install -y curl
        fi
        ui_success "curl 安装完成"
    fi
    # 1.4 检查 npm（Node.js 安装时已包含）
    ui_info "检查 npm..."
    if command -v npm &>/dev/null; then
        NPM_VERSION=$(npm --version)
        ui_success "npm 已安装: v$NPM_VERSION"
    else
        ui_warn "npm 未找到，请确保 Node.js 安装正确"
    fi

    # 1.5 检查 Git
    ui_info "检查 Git..."
    if command -v git &>/dev/null; then
        GIT_VERSION=$(git --version | cut -d' ' -f3)
        ui_success "Git 已安装: v$GIT_VERSION"
    else
        ui_warn "Git 未安装"
        require_sudo
        if is_root; then
            run_quiet_step "安装 Git" apt-get install -y git
        else
            run_quiet_step "安装 Git" sudo apt-get install -y git
        fi
        ui_success "Git 安装完成"
    fi

    # 1.6 检查 OpenSSL
    ui_info "检查 OpenSSL..."
    if command -v openssl &>/dev/null; then
        OPENSSL_VERSION=$(openssl version | cut -d' ' -f2)
        ui_success "OpenSSL 已安装: v$OPENSSL_VERSION"
    else
        ui_warn "OpenSSL 未安装"
        require_sudo
        if is_root; then
            run_quiet_step "安装 OpenSSL" apt-get install -y openssl
        else
            run_quiet_step "安装 OpenSSL" sudo apt-get install -y openssl
        fi
        ui_success "OpenSSL 安装完成"
    fi

    # ============================================
    # 2. 检测并停止旧服务
    # ============================================
    ui_stage "检测并停止旧服务"

    local SERVICE_RUNNING=false

    # 检查 PM2 服务
    if command -v pm2 &>/dev/null; then
        if pm2 list 2>/dev/null | grep -q "study-server"; then
            ui_warn "检测到 PM2 服务 'study-server' 正在运行"
            SERVICE_RUNNING=true
        fi
    fi

    # 检查端口占用
    if lsof -i :3000 -i :3100 2>/dev/null | grep -q LISTEN; then
        ui_warn "检测到端口 3000 或 3100 被占用"
        SERVICE_RUNNING=true
    fi

    if [[ "$SERVICE_RUNNING" == "true" ]]; then
        if confirm_action "是否停止现有服务？"; then
            ui_info "正在停止服务..."
            
            # 停止 PM2 服务
            if command -v pm2 &>/dev/null; then
                run_quiet_step "停止 PM2 服务" pm2 stop study-server 2>/dev/null || true
                run_quiet_step "删除 PM2 服务" pm2 delete study-server 2>/dev/null || true
            fi

            # 强制杀死端口占用进程
            ui_info "释放端口..."
            lsof -ti:3000 | xargs -r kill -9 2>/dev/null || true
            lsof -ti:3100 | xargs -r kill -9 2>/dev/null || true

            ui_success "服务已停止"
        else
            ui_error "请手动停止服务后再安装"
            exit 1
        fi
    else
        ui_success "未检测到运行中的服务"
    fi

    # ============================================
    # 3. 下载程序
    # ============================================
    ui_stage "下载程序"

    if [[ -d "$APP_DIR" ]]; then
        ui_warn "检测到已有安装目录: $APP_DIR"
        if confirm_action "是否覆盖现有安装？"; then
            ui_info "正在删除旧安装..."
            run_quiet_step "删除旧安装" rm -rf "$APP_DIR"
            ui_info "从 GitHub 克隆项目..."
            run_quiet_step "克隆项目" git clone https://github.com/guchengman/study-test.git "$APP_DIR"
            ui_success "代码下载完成"
        else
            ui_info "保留现有安装，仅更新代码..."
            cd "$APP_DIR"
            run_quiet_step "更新代码" git pull || ui_warn "Git 更新失败，保留现有代码"
            cd "$SCRIPT_DIR"
        fi
    else
        ui_info "从 GitHub 克隆项目..."
        run_quiet_step "克隆项目" git clone https://github.com/guchengman/study-test.git "$APP_DIR"
        ui_success "代码下载完成"
    fi

    # ============================================
    # 4. 安装依赖
    # ============================================
    ui_stage "安装依赖"

    cd "$APP_DIR"

    ui_info "安装前端 npm 依赖..."
    run_quiet_step "安装前端依赖" npm install
    ui_success "前端依赖安装完成"

    ui_info "安装后端 npm 依赖..."
    cd server
    run_quiet_step "安装后端依赖" npm install
    ui_success "后端依赖安装完成"

    # ============================================
    # 5. 配置环境变量
    # ============================================
    ui_stage "配置环境变量"

    cd "$APP_DIR"
    ENV_FILE="$APP_DIR/.env"

    # 自动生成密码
    if [[ "$AUTO_DB_PASSWORD" == "true" ]]; then
        DB_PASSWORD=$(openssl rand -base64 16)
    fi

    ui_info "创建 .env 文件..."
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

    ui_success "环境变量配置完成"

    if [[ "$AUTO_DB_PASSWORD" == "true" || -z "$DB_PASSWORD" ]]; then
        ui_warn "数据库密码为空或自动生成"
        ui_info "已生成的密码保存在 .env 文件中"
    fi

    # ============================================
    # 6. 创建数据库
    # ============================================
    ui_stage "创建数据库"

    ui_info "尝试连接 MySQL..."
    if mysql -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" ${DB_PASSWORD:+-p"$DB_PASSWORD"} -e "SELECT 1" 2>/dev/null; then
        ui_success "MySQL 连接成功"
    elif mysql -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" -e "SELECT 1" 2>/dev/null; then
        DB_PASSWORD=""
        ui_success "MySQL 连接成功 (无密码)"
    else
        ui_warn "MySQL 连接失败，跳过数据库创建"
        ui_info "请手动执行以下命令创建数据库:"
        echo -e "${WARN}    CREATE DATABASE $DB_NAME CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;${NC}"
    fi

    # 创建数据库
    if [[ -z "$DB_PASSWORD" ]]; then
        if mysql -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" -e "CREATE DATABASE IF NOT EXISTS \`$DB_NAME\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;" 2>/dev/null; then
            ui_success "数据库创建成功"
        else
            ui_warn "数据库可能已存在或创建失败"
        fi
    else
        if mysql -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" -p"$DB_PASSWORD" -e "CREATE DATABASE IF NOT EXISTS \`$DB_NAME\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;" 2>/dev/null; then
            ui_success "数据库创建成功"
        else
            ui_warn "数据库可能已存在或创建失败"
        fi
    fi

    # ============================================
    # 7. 初始化数据库表结构
    # ============================================
    ui_stage "初始化数据库表结构"

    MIGRATIONS_DIR="$APP_DIR/server/migrations"
    if [[ -d "$MIGRATIONS_DIR" ]]; then
        ui_info "执行数据库迁移脚本..."
        JS_FILES=$(ls "$MIGRATIONS_DIR"/*.js 2>/dev/null | sort)
        if [[ -n "$JS_FILES" ]]; then
            for JS_FILE in $JS_FILES; do
                ui_info "执行: $(basename "$JS_FILE")"
                if node "$JS_FILE" "$DB_HOST" "$DB_PORT" "$DB_USER" "$DB_PASSWORD" "$DB_NAME" 2>&1; then
                    ui_success "  完成"
                else
                    ui_warn "  跳过 (可能已存在)"
                fi
            done
            ui_success "数据库表结构初始化完成"
        else
            ui_warn "未找到迁移脚本"
        fi
    else
        ui_warn "未找到迁移脚本目录"
    fi

    # ============================================
    # 8. 启动服务
    # ============================================
    ui_stage "启动服务"

    cd "$APP_DIR"

    if [[ "$NO_PROMPT" == "true" ]]; then
        ui_info "非交互模式，跳过启动选项"
        ui_info "请手动运行: cd $APP_DIR && npm run dev"
    else
        echo ""
        echo -e "${ACCENT}请选择启动方式:${NC}"
        echo "  1. 开发模式 (npm run dev)"
        echo "  2. 生产模式 (构建后运行)"
        echo "  3. 仅构建 (npm run build)"
        echo "  Q. 退出，稍后手动启动"
        read -p "请输入选项 [1]: " -n 1 -r
        echo

        case "$REPLY" in
            "1")
                echo -e "\n${WARN}按 Ctrl+C 停止服务${NC}\n"
                sleep 2
                npm run dev
                ;;
            "2")
                ui_info "构建项目..."
                run_quiet_step "构建项目" npm run build
                ui_success "构建完成"
                echo -e "\n${INFO}生产模式需要配置 nginx，请参考项目文档${NC}"
                ;;
            "3")
                ui_info "构建项目..."
                run_quiet_step "构建项目" npm run build
                ui_success "构建完成，输出在 dist/ 目录"
                ;;
            *)
                ui_info "已退出，请手动运行以下命令启动:"
                echo -e "${WARN}    cd $APP_DIR${NC}"
                echo -e "${WARN}    npm run dev${NC}"
                ;;
        esac
    fi

    # ============================================
    # 完成
    # ============================================
    ui_celebrate "安装完成！"
    echo ""
    echo -e "${INFO}项目目录:${NC} $APP_DIR"
    echo -e "${INFO}环境配置:${NC} $ENV_FILE"
    echo -e "${INFO}启动命令:${NC} cd $APP_DIR && npm run dev"
    echo ""
}

# 执行主函数
main "$@"