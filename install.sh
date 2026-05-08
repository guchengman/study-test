#!/bin/bash
# Study-Test Installation Script
#
# Online install:
#   curl -fsSL https://raw.githubusercontent.com/guchengman/study-test/main/install.sh | bash
# Local install:
#   bash install.sh
#
# Options:
#   --no-prompt           Non-interactive mode
#   --skip-node-check     Skip Node.js version check
#   --skip-mysql-check    Skip MySQL connectivity check
#   --db-host=HOST        Database host (default: localhost)
#   --db-port=PORT        Database port (default: 3306)
#   --db-user=USER        Database user (default: root)
#   --db-password=PASS    Database password
#   --db-name=NAME        Database name (default: study_test)
#   --auto-db-password    Generate random DB password
#   --verbose             Verbose output

# ---- Safety ----
set -uo pipefail

# ---- Portability: timeout command fallback (macOS) ----
if ! command -v timeout &>/dev/null; then
    timeout() {
        local t="$1"; shift
        "$@" &
        local pid=$!
        (
            sleep "$t"
            kill -TERM "$pid" 2>/dev/null
            sleep 2
            kill -KILL "$pid" 2>/dev/null
        ) &
        local killer=$!
        wait "$pid" 2>/dev/null
        local rc=$?
        kill -KILL "$killer" 2>/dev/null
        wait "$killer" 2>/dev/null
        return $rc
    }
fi

# ---- Colors ----
C_BLUE='\033[38;2;59;130;246m'
C_GREEN='\033[38;2;34;197;94m'
C_YELLOW='\033[38;2;251;191;36m'
C_RED='\033[38;2;239;68;68m'
C_GRAY='\033[38;2;107;114;128m'
C_MUTED='\033[38;2;156;163;175m'
C_BOLD='\033[1m'
C_NC='\033[0m'

# ---- Paths ----
APP_NAME="study-test"
if [[ -n "${BASH_SOURCE[0]-}" ]]; then
    SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" &>/dev/null && pwd)
else
    SCRIPT_DIR=""
fi

# curl | bash → install to /opt; otherwise use script directory
if [[ -z "$SCRIPT_DIR" || "$SCRIPT_DIR" == "/" ]]; then
    APP_DIR="/opt/$APP_NAME"
    ONLINE_INSTALL=true
else
    APP_DIR="$SCRIPT_DIR"
    ONLINE_INSTALL=false
fi

# ---- Defaults ----
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

# mirror defaults (auto-detect later)
USE_CN_MIRROR=true
NPM_REGISTRY="https://registry.npmmirror.com"
GIT_REPO_CN="https://gitee.com/guchengman/study-test.git"
GIT_REPO_GITHUB="https://github.com/guchengman/study-test.git"

# ---- Parse args ----
while [[ $# -gt 0 ]]; do
    case "$1" in
        --skip-node-check)   SKIP_NODE_CHECK=true ;;
        --skip-mysql-check)  SKIP_MYSQL_CHECK=true ;;
        --db-host=*)         DB_HOST="${1#*=}" ;;
        --db-port=*)         DB_PORT="${1#*=}" ;;
        --db-user=*)         DB_USER="${1#*=}" ;;
        --db-password=*)     DB_PASSWORD="${1#*=}" ;;
        --db-name=*)         DB_NAME="${1#*=}" ;;
        --auto-db-password)  AUTO_DB_PASSWORD=true ;;
        --no-prompt)         NO_PROMPT=true ;;
        --verbose)           VERBOSE=true ;;
        *) echo -e "${C_RED}Unknown option: $1${C_NC}"; exit 1 ;;
    esac
    shift
done

# ---- Temp file cleanup ----
TMPFILES=()
cleanup() { for f in "${TMPFILES[@]:-}"; do rm -rf "$f" 2>/dev/null || true; done; }
trap cleanup EXIT

tmpfile() { local f; f="$(mktemp)"; TMPFILES+=("$f"); echo "$f"; }

# ---- Helpers ----
is_root() { [[ $EUID -eq 0 ]]; }

GIT_REPO_URL="$GIT_REPO_GITHUB"  # may switch to CN mirror

say()       { echo -e "$*"; }
info()      { echo -e "${C_GRAY}  $*${C_NC}"; }
warn()      { echo -e "${C_YELLOW}  ! $*${C_NC}"; }
ok()        { echo -e "${C_GREEN}  ✓ $*${C_NC}"; }
err()       { echo -e "${C_RED}  ✗ $*${C_NC}"; }
section()   { echo -e "\n${C_BLUE}${C_BOLD}${1}${C_NC}"; }
banner()    {
    echo -e "${C_BLUE}${C_BOLD}"
    cat << "ENDOFBANNER"
██████╗ ███████╗██╗   ██╗     █████╗ ██████╗  ██████╗██╗  ██╗██╗   ██╗██████╗
██╔══██╗██╔════╝██║   ██║    ██╔══██╗██╔══██╗██╔════╝██║  ██║██║   ██║██╔══██╗
██████╔╝█████╗  ██║   ██║    ███████║██████╔╝██║     ███████║██║   ██║██████╔╝
██╔══██╗██╔══╝  ╚██╗ ██╔╝    ██╔══██║██╔══██╗██║     ██╔══██║██║   ██║██╔═══╝
██████╔╝███████╗ ╚████╔╝     ██║  ██║██████╔╝╚██████╗██║  ██║╚██████╔╝██║
╚═════╝ ╚══════╝  ╚═══╝      ╚═╝  ╚═╝╚═════╝  ╚═════╝╚═╝  ╚═╝ ╚═════╝ ╚═╝
ENDOFBANNER
    echo -e "${C_NC}${C_GRAY}  Study-Test 一键安装脚本${C_NC}\n"
}

confirm() {
    [[ "$NO_PROMPT" == "true" ]] && return 0
    local answer
    read -r -p "  ? $1 (y/N) " answer
    [[ "$answer" =~ ^[Yy]$ ]]
}

# ---- Run command with timeout ----
# Usage: run STEP_TITLE TIMEOUT_SECONDS cmd...
# Returns the command's exit code. Logs output to temp file; prints on failure.
run() {
    local title="$1"; shift
    local timeout_sec="$1"; shift

    if [[ "$VERBOSE" == "true" ]]; then
        info "$title ..."
        timeout "$timeout_sec" "$@"
        local rc=$?
    else
        local log; log="$(tmpfile)"
        printf "${C_GRAY}  %-50s${C_NC}" "$title ..."
        if timeout "$timeout_sec" "$@" >"$log" 2>&1; then
            printf "\r${C_GREEN}  ✓ %-50s${C_NC}\n" "$title"
            rc=0
        else
            rc=$?
            printf "\r${C_RED}  ✗ %-50s${C_NC}\n" "$title"
            if [[ -s "$log" ]]; then
                echo -e "${C_RED}  --- 错误详情 ---${C_NC}"
                tail -20 "$log" | while IFS= read -r line; do
                    echo -e "  ${C_MUTED}$line${C_NC}"
                done
                echo -e "${C_RED}  -----------------${C_NC}"
            fi
        fi
    fi
    return $rc
}

# ---- Network check ----
check_network() {
    local t=5
    info "检测网络连接..."
    if curl -s --connect-timeout $t https://github.com >/dev/null 2>&1; then
        ok "网络连接正常 (GitHub 可达)"
        return 0
    fi
    if curl -s --connect-timeout $t https://gitee.com >/dev/null 2>&1; then
        warn "GitHub 不可达，将使用 Gitee 镜像"
        GIT_REPO_URL="$GIT_REPO_CN"
        USE_CN_MIRROR=true
        npm config set registry "$NPM_REGISTRY" 2>/dev/null || true
        return 0
    fi
    err "无法连接网络，请检查网络设置"
    return 1
}

# ---- MySQL connectivity ----
mysql_cmd() {
    local extra_args=("$@")
    local pass_arg=()
    [[ -n "$DB_PASSWORD" ]] && pass_arg=("-p${DB_PASSWORD}")
    timeout 10 mysql -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" "${pass_arg[@]}" --connect-timeout=5 "${extra_args[@]}" 2>&1
}

# ---- npm install with timeout ----
run_npm_install() {
    local cwd="$1"
    local timeout_min="${2:-15}"

    # npm itself can hang on slow networks; use --prefer-offline --no-audit --no-fund
    local npm_args=(install --prefer-offline --no-audit --no-fund --legacy-peer-deps)
    if [[ "$USE_CN_MIRROR" == "true" ]]; then
        npm_args+=(--registry "$NPM_REGISTRY")
    fi

    local dirname; dirname="$(basename "$cwd")"
    local title="npm install ($dirname)"

    if [[ "$VERBOSE" == "true" ]]; then
        info "$title ..."
        (cd "$cwd" && timeout "${timeout_min}m" npm "${npm_args[@]}" 2>&1)
        return $?
    fi

    local log; log="$(tmpfile)"
    printf "${C_GRAY}  %-50s${C_NC}" "$title ..."
    if (cd "$cwd" && timeout "${timeout_min}m" npm "${npm_args[@]}" >"$log" 2>&1); then
        local added; added=$(grep -c "added" "$log" 2>/dev/null || echo "?")
        printf "\r${C_GREEN}  ✓ %-50s${C_NC}\n" "$title ($added packages)"
        return 0
    else
        local rc=$?
        printf "\r${C_RED}  ✗ %-50s${C_NC}\n" "$title"
        warn "npm install 失败，尝试继续..."
        tail -15 "$log" 2>/dev/null | while IFS= read -r line; do
            echo -e "  ${C_MUTED}$line${C_NC}"
        done
        return 0  # non-fatal
    fi
}

# ============================================================
# Main
# ============================================================
main() {
    banner

    # ---- 1. Pre-flight checks ----
    section "[1/6] 环境检查"

    # OS check
    case "$OSTYPE" in
        linux-gnu*) ok "操作系统: Linux" ;;
        darwin*)    ok "操作系统: macOS" ;;
        msys*|cygwin*)
            err "此脚本仅支持 Linux/macOS。Windows 请使用 install.bat"
            exit 1 ;;
        *)
            warn "未知操作系统: $OSTYPE，继续执行..." ;;
    esac

    # Network
    check_network || exit 1

    # Node.js
    if [[ "$SKIP_NODE_CHECK" != "true" ]]; then
        if command -v node &>/dev/null; then
            local node_ver; node_ver=$(node --version | sed 's/v//')
            local node_major; node_major=$(echo "$node_ver" | cut -d. -f1)
            if [[ "$node_major" -ge 18 ]]; then
                ok "Node.js v$node_ver"
            else
                err "Node.js 版本过低 (v$node_ver)，需要 v18+"
                exit 1
            fi
        else
            err "未找到 Node.js，请安装 Node.js 18+ 后重试"
            info "下载: https://nodejs.org/"
            exit 1
        fi
    fi

    # npm
    if command -v npm &>/dev/null; then
        ok "npm v$(npm --version)"
    else
        err "未找到 npm"
        exit 1
    fi

    # MySQL client (only check connectivity, don't install)
    if [[ "$SKIP_MYSQL_CHECK" != "true" ]]; then
        if ! command -v mysql &>/dev/null; then
            warn "未安装 MySQL 客户端，跳过数据库检查"
            SKIP_MYSQL_CHECK=true
        else
            ok "MySQL 客户端已安装"
        fi
    fi

    # ---- 2. Stop existing services ----
    section "[2/6] 检查运行中的服务"

    local has_running=false
    if command -v pm2 &>/dev/null && pm2 list 2>/dev/null | grep -q "study-server"; then
        warn "检测到 PM2 进程 'study-server'"
        has_running=true
    fi

    # Check port occupancy (use ss/netstat, fallback gracefully)
    local port_check=""
    if command -v ss &>/dev/null; then
        port_check=$(ss -tlnp 2>/dev/null | grep -E ':(3000|3100)\s' || true)
    elif command -v netstat &>/dev/null; then
        port_check=$(netstat -tlnp 2>/dev/null | grep -E ':(3000|3100)\s' || true)
    fi
    if [[ -n "$port_check" ]]; then
        warn "端口 3000 或 3100 已被占用"
        has_running=true
    fi

    if [[ "$has_running" == "true" ]]; then
        if [[ "$ONLINE_INSTALL" == "true" || "$NO_PROMPT" == "true" ]]; then
            info "停止旧服务..."
            command -v pm2 &>/dev/null && { pm2 stop study-server 2>/dev/null || true; pm2 delete study-server 2>/dev/null || true; }
            # kill by port (try fuser first, then lsof)
            command -v fuser &>/dev/null && { fuser -k 3000/tcp 2>/dev/null || true; fuser -k 3100/tcp 2>/dev/null || true; }
            command -v lsof &>/dev/null && { lsof -ti:3000 2>/dev/null | xargs -r kill -9 2>/dev/null || true; lsof -ti:3100 2>/dev/null | xargs -r kill -9 2>/dev/null || true; }
            ok "旧服务已停止"
        else
            if confirm "是否停止旧服务?"; then
                command -v pm2 &>/dev/null && { pm2 stop study-server 2>/dev/null || true; pm2 delete study-server 2>/dev/null || true; }
                command -v fuser &>/dev/null && { fuser -k 3000/tcp 2>/dev/null || true; fuser -k 3100/tcp 2>/dev/null || true; }
                command -v lsof &>/dev/null && { lsof -ti:3000 2>/dev/null | xargs -r kill -9 2>/dev/null || true; }
                ok "旧服务已停止"
            else
                err "请先手动停止旧服务"
                exit 1
            fi
        fi
    else
        ok "无运行中的旧服务"
    fi

    # ---- 3. Get/verify code ----
    section "[3/6] 获取代码"

    if [[ "$ONLINE_INSTALL" == "true" ]]; then
        if [[ -d "$APP_DIR" ]]; then
            warn "目录已存在: $APP_DIR"
            if confirm "删除并重新克隆?"; then
                run "删除旧目录" 30 rm -rf "$APP_DIR" || true
            else
                info "保留现有目录，仅更新代码..."
                (cd "$APP_DIR" && timeout 60 git pull 2>/dev/null) || warn "git pull 失败，将使用现有代码"
                # skip clone
            fi
        fi
        if [[ ! -d "$APP_DIR" ]]; then
            run "克隆仓库" 120 git clone --depth=1 "$GIT_REPO_URL" "$APP_DIR" || {
                err "git clone 失败，请检查网络"
                exit 1
            }
        fi
    else
        ok "使用本地代码: $APP_DIR"
    fi

    # ---- 4. Install dependencies ----
    section "[4/6] 安装依赖"

    cd "$APP_DIR"
    run_npm_install "$APP_DIR" 15
    run_npm_install "$APP_DIR/server" 10

    # ---- 5. Configure .env ----
    section "[5/6] 配置环境变量"

    local ENV_FILE="$APP_DIR/server/.env"

    # ensure server directory exists
    mkdir -p "$APP_DIR/server"
    if [[ "$AUTO_DB_PASSWORD" == "true" ]]; then
        DB_PASSWORD=$(openssl rand -base64 16 2>/dev/null || date +%s | sha256sum | head -c 16)
    fi

    local jwt_secret; jwt_secret=$(openssl rand -hex 32 2>/dev/null || date +%s | sha256sum | head -c 64)

    cat > "$ENV_FILE" << EOF
# 数据库配置
DB_HOST=$DB_HOST
DB_PORT=$DB_PORT
DB_USER=$DB_USER
DB_PASSWORD=$DB_PASSWORD
DB_NAME=$DB_NAME

# JWT 密钥（已自动生成随机值）
JWT_SECRET=$jwt_secret
EOF

    ok ".env 已生成"

    # ---- 6. Database setup ----
    section "[6/6] 数据库配置"

    if [[ "$SKIP_MYSQL_CHECK" == "true" ]]; then
        warn "跳过数据库配置（MySQL 客户端不可用）"
        info "请手动创建数据库和执行迁移脚本"
    elif ! command -v mysql &>/dev/null; then
        warn "跳过数据库配置（MySQL 客户端不可用）"
    else
        # Test connection
        info "测试 MySQL 连接..."
        local conn_test; conn_test=$(mysql_cmd -e "SELECT 1" 2>&1)
        if [[ "$conn_test" == *"1"* ]]; then
            ok "MySQL 连接成功"
        else
            warn "MySQL 连接失败: $conn_test"
            info "请检查数据库配置，手动执行以下操作:"
            echo -e "  ${C_YELLOW}mysql -h $DB_HOST -u $DB_USER -p${C_NC}"
            echo -e "  ${C_YELLOW}CREATE DATABASE IF NOT EXISTS $DB_NAME CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;${C_NC}"
        fi

        # Create database
        local create_result; create_result=$(mysql_cmd -e "CREATE DATABASE IF NOT EXISTS \`$DB_NAME\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;" 2>&1)
        if [[ $? -eq 0 ]]; then
            ok "数据库 $DB_NAME 已就绪"
        else
            warn "创建数据库失败: $create_result"
        fi

        # Run migrations
        local MIGRATIONS_DIR="$APP_DIR/server/migrations"
        if [[ -d "$MIGRATIONS_DIR" ]]; then
            info "执行数据库迁移..."
            local migrated=0 failed=0
            for f in $(ls "$MIGRATIONS_DIR"/*.js 2>/dev/null | sort); do
                local fname; fname="$(basename "$f")"
                if timeout 30 node "$f" "$DB_HOST" "$DB_PORT" "$DB_USER" "$DB_PASSWORD" "$DB_NAME" 2>/dev/null; then
                    ((migrated++))
                else
                    warn "跳过: $fname"
                    ((failed++))
                fi
            done
            ok "迁移完成: $migrated 成功, $failed 跳过"
        fi
    fi

    # ---- Done ----
    echo ""
    echo -e "${C_GREEN}${C_BOLD}  安装完成!${C_NC}"
    echo ""
    echo -e "  ${C_GRAY}项目目录:${C_NC} $APP_DIR"
    echo -e "  ${C_GRAY}环境配置:${C_NC} $ENV_FILE"
    echo ""
    echo -e "  ${C_GRAY}启动命令:${C_NC}"
    echo -e "    ${C_YELLOW}cd $APP_DIR && npm run dev${C_NC}"
    echo -e "    ${C_YELLOW}node $APP_DIR/server/src/index.js${C_NC}"
    echo ""

    if [[ "$NO_PROMPT" != "true" ]]; then
        if confirm "是否立即启动开发服务器?"; then
            echo -e "\n${C_YELLOW}按 Ctrl+C 停止服务器${C_NC}\n"
            sleep 1
            cd "$APP_DIR"
            npm run dev
        fi
    fi
}

main "$@"
