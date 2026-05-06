#!/bin/bash
# -*- coding: utf-8 -*-
# Study-Test 一键安装脚本
# 
# 在线安装方式：
#   curl -fsSL https://raw.githubusercontent.com/guchengman/study-test/main/install.sh | bash
# 
# 本地安装方式：
#   sudo bash install.sh
# 
# 可选参数：
#   --no-prompt          # 非交互模式
#   --verbose            # 详细输出模式
#   --skip-node-check    # 跳过 Node.js 检查
#   --skip-mysql-check   # 跳过 MySQL 检查
#   --auto-db-password   # 自动生成数据库密码
#   --db-host=xxx        # 指定数据库地址
#   --db-user=xxx        # 指定数据库用户名
#   --db-password=xxx    # 指定数据库密码

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

# 判断是否为在线安装（通过 curl | bash 方式）
if [[ -z "$SCRIPT_DIR" || "$SCRIPT_DIR" == "/" ]]; then
    # 在线安装模式：使用 /opt 目录
    APP_DIR="/opt/$APP_NAME"
else
    # 本地安装模式：使用脚本所在目录
    APP_DIR="$SCRIPT_DIR/$APP_NAME"
fi
TMPFILES=()
INSTALL_STAGE_TOTAL=8
INSTALL_STAGE_CURRENT=0
TAGLINE="智能题库系统，轻松学习每一天"

# 镜像配置
USE_CN_MIRROR=false
NPM_REGISTRY="https://registry.npmmirror.com"
GIT_REPO_CN="https://gitee.com/guchengman/study-test.git"
GIT_REPO_ORIGINAL="https://github.com/guchengman/study-test.git"
NODEJS_SETUP_CN="https://mirrors.tuna.tsinghua.edu.cn/nodejs-release/v20.x/setup_20.x"
NODEJS_SETUP_ORIGINAL="https://deb.nodesource.com/setup_20.x"

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

# 检测网络连接
check_network() {
    local timeout=5
    ui_info "检测网络连接..."
    
    # 尝试访问 GitHub
    if curl -s --connect-timeout $timeout https://github.com >/dev/null 2>&1; then
        ui_success "网络连接正常"
        return 0
    fi
    
    # 尝试访问国内镜像
    if curl -s --connect-timeout $timeout https://gitee.com >/dev/null 2>&1; then
        ui_warn "检测到网络访问 GitHub 较慢，建议切换到国内镜像"
        if confirm_action "是否自动切换到国内镜像源？"; then
            switch_to_cn_mirror
        fi
        return 0
    fi
    
    ui_error "网络连接失败，请检查网络设置"
    return 1
}

# 切换到国内镜像
switch_to_cn_mirror() {
    USE_CN_MIRROR=true
    ui_info "切换到国内镜像源..."
    
    # 设置 npm 镜像
    npm config set registry "$NPM_REGISTRY" 2>/dev/null || true
    
    ui_success "已切换到国内镜像源"
    ui_kv "npm 镜像" "$NPM_REGISTRY"
    ui_kv "Git 仓库" "$GIT_REPO_CN"
    ui_kv "Node.js 源" "$NODEJS_SETUP_CN"
}

# 获取当前 Git 仓库地址
get_git_repo() {
    if [[ "$USE_CN_MIRROR" == "true" ]]; then
        echo "$GIT_REPO_CN"
    else
        echo "$GIT_REPO_ORIGINAL"
    fi
}

# 获取当前 Node.js 安装脚本地址
get_nodejs_setup() {
    if [[ "$USE_CN_MIRROR" == "true" ]]; then
        echo "$NODEJS_SETUP_CN"
    else
        echo "$NODEJS_SETUP_ORIGINAL"
    fi
}

# 带重试和镜像切换的下载函数
download_with_retry() {
    local title="$1"
    local url="$2"
    local output="$3"
    local max_retries=2
    local retry_count=0
    
    while [[ $retry_count -lt $max_retries ]]; do
        if [[ "$retry_count" -gt 0 ]]; then
            ui_warn "第 $((retry_count + 1)) 次尝试..."
        fi
        
        if [[ "$output" ]]; then
            if curl -fsSL --connect-timeout 30 "$url" -o "$output"; then
                return 0
            fi
        else
            if curl -fsSL --connect-timeout 30 "$url"; then
                return 0
            fi
        fi
        
        retry_count=$((retry_count + 1))
        
        if [[ $retry_count -lt $max_retries ]]; then
            ui_warn "下载失败，尝试切换到国内镜像..."
            USE_CN_MIRROR=true
            npm config set registry "$NPM_REGISTRY" 2>/dev/null || true
            # 更新 URL 使用国内镜像
            case "$url" in
                *github.com*)
                    url=$(echo "$url" | sed 's|github.com|gitee.com|')
                    ;;
                *deb.nodesource.com*)
                    url="$NODEJS_SETUP_CN"
                    ;;
            esac
        fi
    done
    
    ui_error "$title 失败"
    return 1
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
    show_progress_bar $INSTALL_STAGE_CURRENT $INSTALL_STAGE_TOTAL
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

show_progress_bar() {
    local current=$1
    local total=$2
    local width=50
    local percent=$((current * 100 / total))
    local filled=$((current * width / total))
    
    printf "\r${INFO}["
    for ((i=0; i<filled; i++)); do
        printf "${SUCCESS}="
    done
    for ((i=filled; i<width; i++)); do
        printf "${MUTED}-"
    done
    printf "${INFO}] ${percent}%% ${NC}"
    if [[ $current -eq $total ]]; then
        echo ""
    fi
}

show_spinner() {
    local pid=$1
    local msg=$2
    local spin='-\|/'
    local i=0
    
    echo -ne "${INFO}${msg}...${NC}"
    
    while kill -0 $pid 2>/dev/null; do
        i=$(( (i+1) % 4 ))
        printf "\r${INFO}${msg} ${spin:$i:1}${NC}"
        sleep 0.1
    done
    
    wait $pid
    local exit_code=$?
    if [[ $exit_code -eq 0 ]]; then
        printf "\r${SUCCESS}${msg} ✓${NC}\n"
    else
        printf "\r${ERROR}${msg} ✗${NC}\n"
    fi
    
    return $exit_code
}

# ============================================
# 运行命令（带日志）
# ============================================

run_step() {
    local title="$1"
    shift
    
    if [[ "$VERBOSE" == "true" ]]; then
        ui_info "执行: $*"
        "$@"
        return $?
    fi
    
    local log
    log="$(mktempfile)"
    
    echo -ne "${INFO}${title}...${NC}"
    
    if "$@" >"$log" 2>&1; then
        printf "\r${SUCCESS}${title} ✓${NC}\n"
        return 0
    else
        printf "\r${ERROR}${title} ✗${NC}\n"
        if [[ -s "$log" ]]; then
            echo -e "${ERROR}--- 错误日志 ---${NC}"
            tail -n 30 "$log" >&2
            echo -e "${ERROR}---------------${NC}"
        fi
        return 1
    fi
}

run_step_with_spinner() {
    local title="$1"
    shift
    
    if [[ "$VERBOSE" == "true" ]]; then
        ui_info "执行: $*"
        "$@"
        return $?
    fi
    
    local log
    log="$(mktempfile)"
    local spin='-\|/'
    local i=0
    
    echo -ne "${INFO}${title}...${NC}"
    
    "$@" >"$log" 2>&1 &
    local pid=$!
    
    while kill -0 $pid 2>/dev/null; do
        i=$(( (i+1) % 4 ))
        printf "\r${INFO}${title} ${spin:$i:1}${NC}"
        sleep 0.2
        
        # 显示最近的日志行
        if [[ -s "$log" ]]; then
            local last_line=$(tail -n 1 "$log")
            if [[ -n "$last_line" ]]; then
                printf "\r${INFO}${title} ${spin:$i:1} ${last_line:0:40}${NC}"
            fi
        fi
    done
    
    wait $pid
    local exit_code=$?
    
    if [[ $exit_code -eq 0 ]]; then
        printf "\r${SUCCESS}${title} ✓${NC}\n"
        return 0
    else
        printf "\r${ERROR}${title} ✗${NC}\n"
        if [[ -s "$log" ]]; then
            echo -e "${ERROR}--- 错误日志 ---${NC}"
            tail -n 30 "$log" >&2
            echo -e "${ERROR}---------------${NC}"
        fi
        return $exit_code
    fi
}

run_npm_install() {
    local title="$1"
    local registry="${2:-}"
    local timeout_minutes=30
    local start_time=$(date +%s)
    local last_output_time=$start_time
    local no_output_timeout=180  # 3分钟无输出视为卡住
    
    echo -e "${INFO}${title}...${NC}"
    echo -e "${MUTED}----------------------------------------${NC}"
    echo -e "${WARN}⏰ 安装可能需要几分钟时间，请耐心等待...${NC}"
    echo ""
    
    local npm_cmd="npm install --legacy-peer-deps"
    if [[ -n "$registry" ]]; then
        npm_cmd="$npm_cmd --registry $registry"
    fi
    
    # 创建临时日志文件
    local log_file=$(mktemp)
    local pid_file=$(mktemp)
    
    # 后台执行 npm install
    $npm_cmd >"$log_file" 2>&1 &
    local pid=$!
    echo "$pid" > "$pid_file"
    
    # 监控循环
    local spin='-\|/'
    local i=0
    local elapsed=0
    
    while kill -0 "$pid" 2>/dev/null; do
        # 检查是否超时
        local current_time=$(date +%s)
        elapsed=$((current_time - start_time))
        
        # 检查是否长时间无输出
        if [[ -s "$log_file" ]]; then
            local last_modified=$(stat -c %Y "$log_file" 2>/dev/null || stat -f %m "$log_file" 2>/dev/null || echo "$current_time")
            if [[ $((current_time - last_modified)) -gt $no_output_timeout ]]; then
                echo -e "\n${WARN}⚠️ 检测到长时间无输出，可能卡住了${NC}"
                echo -e "${WARN}最近的输出：${NC}"
                tail -n 5 "$log_file" | while IFS= read -r line; do
                    echo -e "${INFO}  $line${NC}"
                done
                echo -e "${WARN}继续等待中... (已等待 $((elapsed/60)) 分钟)${NC}"
                last_output_time=$current_time
            fi
        fi
        
        # 显示进度和时间
        i=$(( (i+1) % 4 ))
        printf "\r${INFO}${title} ${spin:$i:1} 已等待 %d 分 %d 秒${NC}" $((elapsed/60)) $((elapsed%60))
        
        # 检查总超时
        if [[ $elapsed -gt $((timeout_minutes * 60)) ]]; then
            echo -e "\n${ERROR}❌ 安装超时（超过 $timeout_minutes 分钟）${NC}"
            kill "$pid" 2>/dev/null || true
            wait "$pid" 2>/dev/null || true
            echo -e "${ERROR}--- 最后日志 ---${NC}"
            tail -n 20 "$log_file" >&2
            echo -e "${ERROR}---------------${NC}"
            rm -f "$log_file" "$pid_file"
            return 1
        fi
        
        sleep 1
    done
    
    wait "$pid"
    local exit_code=$?
    
    printf "\r${SUCCESS}${title} ✓ (共耗时 %d 分 %d 秒)${NC}\n" $((elapsed/60)) $((elapsed%60))
    echo -e "${MUTED}----------------------------------------${NC}"
    
    # 显示安装统计
    if [[ -s "$log_file" ]]; then
        local package_count=$(grep -c "added" "$log_file" | head -1 || echo "0")
        if [[ -n "$package_count" && "$package_count" != "0" ]]; then
            echo -e "${INFO}📦 安装了 $package_count 个依赖包${NC}"
        fi
    fi
    
    rm -f "$log_file" "$pid_file"
    
    if [[ $exit_code -eq 0 ]]; then
        return 0
    else
        echo -e "${ERROR}${title} ✗${NC}"
        return $exit_code
    fi
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

    # 检测网络连接
    if ! check_network; then
        exit 1
    fi

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
                        run_step_with_spinner "安装 Node.js" bash -c "curl -fsSL $(get_nodejs_setup) | bash - && apt-get install -y nodejs"
                    else
                        run_step_with_spinner "安装 Node.js" bash -c "curl -fsSL $(get_nodejs_setup) | sudo bash - && sudo apt-get install -y nodejs"
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
                    run_step_with_spinner "安装 Node.js" bash -c "curl -fsSL $(get_nodejs_setup) | bash - && apt-get install -y nodejs"
                else
                    run_step_with_spinner "安装 Node.js" bash -c "curl -fsSL $(get_nodejs_setup) | sudo bash - && sudo apt-get install -y nodejs"
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
                    run_step_with_spinner "安装 MySQL" bash -c "DEBIAN_FRONTEND=noninteractive apt-get install -y mysql-server && systemctl start mysql && systemctl enable mysql"
                else
                    run_step_with_spinner "安装 MySQL" bash -c "DEBIAN_FRONTEND=noninteractive sudo apt-get install -y mysql-server && sudo systemctl start mysql && sudo systemctl enable mysql"
                fi
                ui_success "MySQL 安装完成"
                ui_info "配置 MySQL root 用户认证方式..."
                if is_root; then
                    run_step "配置 MySQL 认证" mysql -u root -e "ALTER USER 'root'@'localhost' IDENTIFIED WITH mysql_native_password BY ''; FLUSH PRIVILEGES;" || ui_warn "MySQL 认证配置可能已完成"
                else
                    run_step "配置 MySQL 认证" sudo mysql -u root -e "ALTER USER 'root'@'localhost' IDENTIFIED WITH mysql_native_password BY ''; FLUSH PRIVILEGES;" || ui_warn "MySQL 认证配置可能已完成"
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
            run_step "安装 curl" apt-get install -y curl
        else
            run_step "安装 curl" sudo apt-get install -y curl
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
            run_step "安装 Git" apt-get install -y git
        else
            run_step "安装 Git" sudo apt-get install -y git
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
            run_step "安装 OpenSSL" apt-get install -y openssl
        else
            run_step "安装 OpenSSL" sudo apt-get install -y openssl
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
                run_step "停止 PM2 服务" pm2 stop study-server 2>/dev/null || true
                run_step "删除 PM2 服务" pm2 delete study-server 2>/dev/null || true
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
            run_step "删除旧安装" rm -rf "$APP_DIR"
            ui_info "克隆项目..."
            run_step_with_spinner "克隆项目" git clone "$(get_git_repo)" "$APP_DIR"
            ui_success "代码下载完成"
        else
            ui_info "保留现有安装，仅更新代码..."
            cd "$APP_DIR"
            run_step "更新代码" git pull || ui_warn "Git 更新失败，保留现有代码"
            cd "$SCRIPT_DIR"
        fi
    else
        ui_info "克隆项目..."
        run_step_with_spinner "克隆项目" git clone "$(get_git_repo)" "$APP_DIR"
        ui_success "代码下载完成"
    fi

    # ============================================
    # 4. 安装依赖
    # ============================================
    ui_stage "安装依赖"

    cd "$APP_DIR"

    if [[ "$USE_CN_MIRROR" == "true" ]]; then
        run_npm_install "安装前端 npm 依赖" "$NPM_REGISTRY"
    else
        run_npm_install "安装前端 npm 依赖"
    fi

    cd server
    if [[ "$USE_CN_MIRROR" == "true" ]]; then
        run_npm_install "安装后端 npm 依赖" "$NPM_REGISTRY"
    else
        run_npm_install "安装后端 npm 依赖"
    fi

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

    local DB_EXISTS=false
    local TABLE_COUNT=0

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

    # 检查数据库是否已存在
    if [[ -z "$DB_PASSWORD" ]]; then
        if mysql -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" -e "USE $DB_NAME" 2>/dev/null; then
            DB_EXISTS=true
            TABLE_COUNT=$(mysql -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" -D "$DB_NAME" -e "SHOW TABLES" 2>/dev/null | wc -l)
            ((TABLE_COUNT--))
        fi
    else
        if mysql -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" -p"$DB_PASSWORD" -e "USE $DB_NAME" 2>/dev/null; then
            DB_EXISTS=true
            TABLE_COUNT=$(mysql -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" -p"$DB_PASSWORD" -D "$DB_NAME" -e "SHOW TABLES" 2>/dev/null | wc -l)
            ((TABLE_COUNT--))
        fi
    fi

    if [[ "$DB_EXISTS" == "true" ]]; then
        ui_warn "数据库 '$DB_NAME' 已存在，包含 $TABLE_COUNT 个表"
        
        if [[ "$TABLE_COUNT" -gt 0 ]]; then
            echo ""
            echo -e "${ACCENT}请选择数据库处理方式:${NC}"
            echo "  1. 删除数据库并重建（数据将丢失）"
            echo "  2. 保留数据库，仅更新表结构"
            echo "  3. 保留数据库和表结构，跳过初始化"
            read -p "请输入选项 [2]: " -n 1 -r
            echo

            case "$REPLY" in
                "1")
                    ui_info "删除并重建数据库..."
                    if [[ -z "$DB_PASSWORD" ]]; then
                        run_step "删除数据库" mysql -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" -e "DROP DATABASE IF EXISTS \`$DB_NAME\`; CREATE DATABASE \`$DB_NAME\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
                    else
                        run_step "删除数据库" mysql -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" -p"$DB_PASSWORD" -e "DROP DATABASE IF EXISTS \`$DB_NAME\`; CREATE DATABASE \`$DB_NAME\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
                    fi
                    ui_success "数据库重建成功"
                    ;;
                "3")
                    ui_info "跳过数据库初始化"
                    SKIP_MIGRATION=true
                    ;;
                *)
                    ui_info "保留数据库，准备更新表结构..."
                    ;;
            esac
        else
            ui_info "数据库为空，继续创建表结构..."
        fi
    else
        ui_info "创建数据库..."
        if [[ -z "$DB_PASSWORD" ]]; then
            run_step "创建数据库" mysql -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" -e "CREATE DATABASE IF NOT EXISTS \`$DB_NAME\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
        else
            run_step "创建数据库" mysql -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" -p"$DB_PASSWORD" -e "CREATE DATABASE IF NOT EXISTS \`$DB_NAME\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
        fi
        ui_success "数据库创建成功"
    fi

    # ============================================
    # 7. 初始化数据库表结构
    # ============================================
    ui_stage "初始化数据库表结构"

    if [[ "$SKIP_MIGRATION" == "true" ]]; then
        ui_info "跳过表结构初始化"
    else
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
                        ui_warn "  跳过 (可能已存在或结构不同)"
                    fi
                done
                ui_success "数据库表结构初始化完成"
            else
                ui_warn "未找到迁移脚本"
            fi
        else
            ui_warn "未找到迁移脚本目录"
        fi
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
                run_step_with_spinner "构建项目" npm run build
                ui_success "构建完成"
                echo -e "\n${INFO}生产模式需要配置 nginx，请参考项目文档${NC}"
                ;;
            "3")
                ui_info "构建项目..."
                run_step_with_spinner "构建项目" npm run build
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