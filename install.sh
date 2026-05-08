#!/bin/bash
# -*- coding: utf-8 -*-
# Study-Test Installation Script
# 
# Online installation:
#   curl -fsSL https://raw.githubusercontent.com/guchengman/study-test/main/install.sh | bash
# 
# Local installation:
#   sudo bash install.sh
# 
# Optional parameters:
#   --no-prompt          # Non-interactive mode
#   --verbose            # Verbose output
#   --skip-node-check    # Skip Node.js check
#   --skip-mysql-check   # Skip MySQL check
#   --auto-db-password   # Auto generate database password
#   --db-host=xxx        # Specify database host
#   --db-user=xxx        # Specify database user
#   --db-password=xxx    # Specify database password

set -euo pipefail

export LANG=en_US.UTF-8
export LC_ALL=en_US.UTF-8

# ============================================
# 
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
# 
# ============================================
if [[ -n "${BASH_SOURCE[0]-}" ]]; then
    SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" &>/dev/null && pwd)
else
    SCRIPT_DIR=""
fi
APP_NAME="study-test"

# （ curl | bash ）
if [[ -z "$SCRIPT_DIR" || "$SCRIPT_DIR" == "/" ]]; then
    # ： /opt 
    APP_DIR="/opt/$APP_NAME"
    ONLINE_INSTALL=true
else
    # ：（）
    APP_DIR="$SCRIPT_DIR"
    ONLINE_INSTALL=false
fi
TMPFILES=()
INSTALL_STAGE_TOTAL=8
INSTALL_STAGE_CURRENT=0
TAGLINE="，"

# 
USE_CN_MIRROR=true
NPM_REGISTRY="https://registry.npmmirror.com"
GIT_REPO_CN="https://gitee.com/guchengman/study-test.git"
GIT_REPO_ORIGINAL="https://github.com/guchengman/study-test.git"
NODEJS_SETUP_CN="https://mirrors.tuna.tsinghua.edu.cn/nodejs-release/v20.x/setup_20.x"
NODEJS_SETUP_ORIGINAL="https://deb.nodesource.com/setup_20.x"

# ============================================
# 
# ============================================
SKIP_NODE_CHECK=false
SKIP_MYSQL_CHECK=false
SKIP_MIGRATION=false
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
            echo -e "${ERROR}: $1${NC}"
            exit 1
            ;;
    esac
    shift
done

# ============================================
# 
# ============================================

# 
cleanup_tmpfiles() {
    local f
    for f in "${TMPFILES[@]:-}"; do
        rm -rf "$f" 2>/dev/null || true
    done
}
trap cleanup_tmpfiles EXIT

# 
mktempfile() {
    local f
    f="$(mktemp)"
    TMPFILES+=("$f")
    echo "$f"
}

#  root
is_root() {
    [[ $EUID -eq 0 ]]
}

#  sudo
require_sudo() {
    if ! is_root; then
        if ! command -v sudo &>/dev/null; then
            ui_error " root  sudo "
            exit 1
        fi
    fi
}

# 
detect_downloader() {
    if command -v curl &>/dev/null; then
        DOWNLOADER="curl"
        return 0
    fi
    if command -v wget &>/dev/null; then
        DOWNLOADER="wget"
        return 0
    fi
    ui_error " (curl  wget)"
    exit 1
}

# 
check_network() {
    local timeout=5
    ui_info "..."
    
    #  GitHub
    if curl -s --connect-timeout $timeout https://github.com >/dev/null 2>&1; then
        ui_success ""
        return 0
    fi
    
    # 
    if curl -s --connect-timeout $timeout https://gitee.com >/dev/null 2>&1; then
        ui_warn " GitHub ，"
        if confirm_action "？"; then
            switch_to_cn_mirror
        fi
        return 0
    fi
    
    ui_error "，"
    return 1
}

# 
switch_to_cn_mirror() {
    USE_CN_MIRROR=true
    ui_info "..."
    
    #  npm 
    npm config set registry "$NPM_REGISTRY" 2>/dev/null || true
    
    ui_success ""
    ui_kv "npm " "$NPM_REGISTRY"
    ui_kv "Git " "$GIT_REPO_CN"
    ui_kv "Node.js " "$NODEJS_SETUP_CN"
}

#  Git 
get_git_repo() {
    if [[ "$USE_CN_MIRROR" == "true" ]]; then
        echo "$GIT_REPO_CN"
    else
        echo "$GIT_REPO_ORIGINAL"
    fi
}

#  Node.js 
get_nodejs_setup() {
    if [[ "$USE_CN_MIRROR" == "true" ]]; then
        echo "$NODEJS_SETUP_CN"
    else
        echo "$NODEJS_SETUP_ORIGINAL"
    fi
}

# 
download_with_retry() {
    local title="$1"
    local url="$2"
    local output="$3"
    local max_retries=2
    local retry_count=0
    
    while [[ $retry_count -lt $max_retries ]]; do
        if [[ "$retry_count" -gt 0 ]]; then
            ui_warn " $((retry_count + 1)) ..."
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
            ui_warn "，..."
            USE_CN_MIRROR=true
            npm config set registry "$NPM_REGISTRY" 2>/dev/null || true
            #  URL 
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
    
    ui_error "$title "
    return 1
}

# ============================================
# UI 
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
# （）
# ============================================

run_step() {
    local title="$1"
    shift
    
    if [[ "$VERBOSE" == "true" ]]; then
        ui_info ": $*"
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
            echo -e "${ERROR}---  ---${NC}"
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
        ui_info ": $*"
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
        
        # 
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
            echo -e "${ERROR}---  ---${NC}"
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
    local no_output_timeout=180  # 3
    
    echo -e "${INFO}${title}...${NC}"
    echo -e "${MUTED}----------------------------------------${NC}"
    echo -e "${WARN}⏰ ，...${NC}"
    echo ""
    
    local npm_cmd="npm install --legacy-peer-deps"
    if [[ -n "$registry" ]]; then
        npm_cmd="$npm_cmd --registry $registry"
    fi
    
    # 
    local log_file=$(mktemp)
    local pid_file=$(mktemp)
    
    #  npm install
    $npm_cmd >"$log_file" 2>&1 &
    local pid=$!
    echo "$pid" > "$pid_file"
    
    # 
    local spin='-\|/'
    local i=0
    local elapsed=0
    
    while kill -0 "$pid" 2>/dev/null; do
        # 
        local current_time=$(date +%s)
        elapsed=$((current_time - start_time))
        
        # 
        if [[ -s "$log_file" ]]; then
            local last_modified=$(stat -c %Y "$log_file" 2>/dev/null || stat -f %m "$log_file" 2>/dev/null || echo "$current_time")
            if [[ $((current_time - last_modified)) -gt $no_output_timeout ]]; then
                echo -e "\n${WARN}⚠️ ，${NC}"
                echo -e "${WARN}：${NC}"
                tail -n 5 "$log_file" | while IFS= read -r line; do
                    echo -e "${INFO}  $line${NC}"
                done
                echo -e "${WARN}... ( $((elapsed/60)) )${NC}"
                last_output_time=$current_time
            fi
        fi
        
        # 
        i=$(( (i+1) % 4 ))
        printf "\r${INFO}${title} ${spin:$i:1}  %d  %d ${NC}" $((elapsed/60)) $((elapsed%60))
        
        # 
        if [[ $elapsed -gt $((timeout_minutes * 60)) ]]; then
            echo -e "\n${WARN}⚠️ （ $timeout_minutes ），${NC}"
            kill "$pid" 2>/dev/null || true
            wait "$pid" 2>/dev/null || true
            echo -e "${WARN}---  ---${NC}"
            tail -n 10 "$log_file" >&2
            echo -e "${WARN}---------------${NC}"
            rm -f "$log_file" "$pid_file"
            echo -e "${WARN}⚠️ ${title} ，...${NC}"
            return 0  # ，
        fi
        
        sleep 1
    done
    
    wait "$pid"
    local exit_code=$?
    
    # 
    if [[ -s "$log_file" ]]; then
        local package_count=$(grep -c "added" "$log_file" | head -1 || echo "0")
        
        if [[ $exit_code -eq 0 ]]; then
            printf "\r${SUCCESS}${title} ✓ ( %d  %d )${NC}\n" $((elapsed/60)) $((elapsed%60))
            echo -e "${MUTED}----------------------------------------${NC}"
            if [[ -n "$package_count" && "$package_count" != "0" ]]; then
                echo -e "${INFO}📦  $package_count ${NC}"
            fi
            rm -f "$log_file" "$pid_file"
            return 0
        else
            printf "\r${WARN}⚠️ ${title}  ( %d  %d )${NC}\n" $((elapsed/60)) $((elapsed%60))
            echo -e "${MUTED}----------------------------------------${NC}"
            if [[ -n "$package_count" && "$package_count" != "0" ]]; then
                echo -e "${INFO}📦  $package_count ${NC}"
            fi
            echo -e "${WARN}---  ---${NC}"
            tail -n 10 "$log_file" >&2
            echo -e "${WARN}---------------${NC}"
            rm -f "$log_file" "$pid_file"
            echo -e "${WARN}⚠️ ${title} ，...${NC}"
            return 0  # ，
        fi
    else
        if [[ $exit_code -eq 0 ]]; then
            printf "\r${SUCCESS}${title} ✓ ( %d  %d )${NC}\n" $((elapsed/60)) $((elapsed%60))
        else
            printf "\r${WARN}⚠️ ${title}  ( %d  %d )${NC}\n" $((elapsed/60)) $((elapsed%60))
            echo -e "${WARN}---  ---${NC}"
            tail -n 10 "$log_file" >&2
            echo -e "${WARN}---------------${NC}"
            echo -e "${WARN}⚠️ ${title} ，...${NC}"
        fi
        rm -f "$log_file" "$pid_file"
        return 0  # ，
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
# 
# ============================================

main() {
    #  Banner
    ui_banner

    # ============================================
    # 1. 
    # ============================================
    ui_stage ""

    #  root 
    if ! is_root; then
        ui_warn " root "
        if ! confirm_action "？"; then
            exit 0
        fi
    fi

    # 
    if [[ "$OSTYPE" != "linux-gnu"* ]]; then
        ui_error ""
        echo " Linux "
        exit 1
    fi
    ui_success " Linux "

    # 
    if ! check_network; then
        exit 1
    fi

    # 1.1  Node.js
    if [[ "$SKIP_NODE_CHECK" != "true" ]]; then
        ui_info " Node.js..."
        if command -v node &>/dev/null; then
            NODE_VERSION=$(node --version)
            NODE_MAJOR=$(echo "$NODE_VERSION" | cut -d'v' -f2 | cut -d'.' -f1)
            if [[ "$NODE_MAJOR" -ge 18 ]]; then
                ui_success "Node.js : $NODE_VERSION"
            else
                ui_error "Node.js ， 18+，: $NODE_VERSION"
                if confirm_action " Node.js 20.x？"; then
                    require_sudo
                    if is_root; then
                        run_step_with_spinner " Node.js" bash -c "curl -fsSL $(get_nodejs_setup) | bash - && apt-get install -y nodejs"
                    else
                        run_step_with_spinner " Node.js" bash -c "curl -fsSL $(get_nodejs_setup) | sudo bash - && sudo apt-get install -y nodejs"
                    fi
                    ui_success "Node.js "
                else
                    ui_error " Node.js 18+"
                    exit 1
                fi
            fi
        else
            ui_warn "Node.js "
            if confirm_action " Node.js 20.x？"; then
                require_sudo
                if is_root; then
                    run_step_with_spinner " Node.js" bash -c "curl -fsSL $(get_nodejs_setup) | bash - && apt-get install -y nodejs"
                else
                    run_step_with_spinner " Node.js" bash -c "curl -fsSL $(get_nodejs_setup) | sudo bash - && sudo apt-get install -y nodejs"
                fi
                ui_success "Node.js "
            else
                ui_error " Node.js 18+"
                exit 1
            fi
        fi
    fi

    # 1.2  MySQL
    if [[ "$SKIP_MYSQL_CHECK" != "true" ]]; then
        ui_info " MySQL..."
        if command -v mysql &>/dev/null; then
            ui_success "MySQL "
        else
            ui_warn "MySQL "
            if confirm_action " MySQL？"; then
                require_sudo
                if is_root; then
                    run_step_with_spinner " MySQL" bash -c "DEBIAN_FRONTEND=noninteractive apt-get install -y mysql-server && systemctl start mysql && systemctl enable mysql"
                else
                    run_step_with_spinner " MySQL" bash -c "DEBIAN_FRONTEND=noninteractive sudo apt-get install -y mysql-server && sudo systemctl start mysql && sudo systemctl enable mysql"
                fi
                ui_success "MySQL "
                ui_info " MySQL root ..."
                if is_root; then
                    run_step " MySQL " mysql -u root -e "ALTER USER 'root'@'localhost' IDENTIFIED WITH mysql_native_password BY ''; FLUSH PRIVILEGES;" || ui_warn "MySQL "
                else
                    run_step " MySQL " sudo mysql -u root -e "ALTER USER 'root'@'localhost' IDENTIFIED WITH mysql_native_password BY ''; FLUSH PRIVILEGES;" || ui_warn "MySQL "
                fi
                ui_success "MySQL "
            else
                ui_warn " MySQL ，"
            fi
        fi
    fi

    # 1.3  curl（ Node.js ）
    ui_info " curl..."
    if command -v curl &>/dev/null; then
        ui_success "curl "
    else
        ui_warn "curl "
        require_sudo
        if is_root; then
            run_step " curl" apt-get install -y curl
        else
            run_step " curl" sudo apt-get install -y curl
        fi
        ui_success "curl "
    fi
    # 1.4  npm（Node.js ）
    ui_info " npm..."
    if command -v npm &>/dev/null; then
        NPM_VERSION=$(npm --version)
        ui_success "npm : v$NPM_VERSION"
    else
        ui_warn "npm ， Node.js "
    fi

    # 1.5  Git
    ui_info " Git..."
    if command -v git &>/dev/null; then
        GIT_VERSION=$(git --version | cut -d' ' -f3)
        ui_success "Git : v$GIT_VERSION"
    else
        ui_warn "Git "
        require_sudo
        if is_root; then
            run_step " Git" apt-get install -y git
        else
            run_step " Git" sudo apt-get install -y git
        fi
        ui_success "Git "
    fi

    # 1.6  OpenSSL
    ui_info " OpenSSL..."
    if command -v openssl &>/dev/null; then
        OPENSSL_VERSION=$(openssl version | cut -d' ' -f2)
        ui_success "OpenSSL : v$OPENSSL_VERSION"
    else
        ui_warn "OpenSSL "
        require_sudo
        if is_root; then
            run_step " OpenSSL" apt-get install -y openssl
        else
            run_step " OpenSSL" sudo apt-get install -y openssl
        fi
        ui_success "OpenSSL "
    fi

    # ============================================
    # 2. 
    # ============================================
    ui_stage ""

    local SERVICE_RUNNING=false

    #  PM2 
    if command -v pm2 &>/dev/null; then
        if pm2 list 2>/dev/null | grep -q "study-server"; then
            ui_warn " PM2  'study-server' "
            SERVICE_RUNNING=true
        fi
    fi

    # 
    if lsof -i :3000 -i :3100 2>/dev/null | grep -q LISTEN; then
        ui_warn " 3000  3100 "
        SERVICE_RUNNING=true
    fi

    if [[ "$SERVICE_RUNNING" == "true" ]]; then
        if [[ "$ONLINE_INSTALL" == "true" ]]; then
            # ：
            ui_info "，..."
            
            #  PM2 
            if command -v pm2 &>/dev/null; then
                run_step " PM2 " pm2 stop study-server 2>/dev/null || true
                run_step " PM2 " pm2 delete study-server 2>/dev/null || true
            fi

            # 
            ui_info "..."
            lsof -ti:3000 | xargs -r kill -9 2>/dev/null || true
            lsof -ti:3100 | xargs -r kill -9 2>/dev/null || true

            ui_success ""
        else
            # ：
            if confirm_action "？"; then
                ui_info "..."
                
                #  PM2 
                if command -v pm2 &>/dev/null; then
                    run_step " PM2 " pm2 stop study-server 2>/dev/null || true
                    run_step " PM2 " pm2 delete study-server 2>/dev/null || true
                fi

                # 
                ui_info "..."
                lsof -ti:3000 | xargs -r kill -9 2>/dev/null || true
                lsof -ti:3100 | xargs -r kill -9 2>/dev/null || true

                ui_success ""
            else
                ui_error ""
                exit 1
            fi
        fi
    else
        ui_success ""
    fi

    # ============================================
    # 3. 
    # ============================================
    ui_stage ""

    if [[ "$ONLINE_INSTALL" == "true" ]]; then
        # ： GitHub 
        if [[ -d "$APP_DIR" ]]; then
            ui_warn ": $APP_DIR"
            ui_info "，..."
            run_step "" rm -rf "$APP_DIR"
        fi
        ui_info "..."
        run_step_with_spinner "" git clone "$(get_git_repo)" "$APP_DIR"
        ui_success ""
    else
        # ：，
        ui_info "，"
        ui_success ""
    fi

    # ============================================
    # 4. 
    # ============================================
    ui_stage ""

    cd "$APP_DIR"

    if [[ "$USE_CN_MIRROR" == "true" ]]; then
        run_npm_install " npm " "$NPM_REGISTRY"
    else
        run_npm_install " npm "
    fi

    cd server
    if [[ "$USE_CN_MIRROR" == "true" ]]; then
        run_npm_install " npm " "$NPM_REGISTRY"
    else
        run_npm_install " npm "
    fi

    # ============================================
    # 5. 
    # ============================================
    ui_stage ""

    cd "$APP_DIR"
    ENV_FILE="$APP_DIR/.env"

    # 
    if [[ "$AUTO_DB_PASSWORD" == "true" ]]; then
        DB_PASSWORD=$(openssl rand -base64 16)
    fi

    ui_info " .env ..."
    cat > "$ENV_FILE" << EOF
# 
DB_HOST=$DB_HOST
DB_PORT=$DB_PORT
DB_USER=$DB_USER
DB_PASSWORD=$DB_PASSWORD
DB_NAME=$DB_NAME

# JWT  ()
JWT_SECRET=$(openssl rand -hex 32)

#  OCR  ()
BAIDU_API_KEY=
BAIDU_SECRET_KEY=
EOF

    ui_success ""

    if [[ "$AUTO_DB_PASSWORD" == "true" || -z "$DB_PASSWORD" ]]; then
        ui_warn ""
        ui_info " .env "
    fi

    # ============================================
    # 6. 
    # ============================================
    ui_stage ""

    local DB_EXISTS=false
    local TABLE_COUNT=0

    ui_info " MySQL..."
    if mysql -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" ${DB_PASSWORD:+-p"$DB_PASSWORD"} -e "SELECT 1" 2>/dev/null; then
        ui_success "MySQL "
    elif mysql -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" -e "SELECT 1" 2>/dev/null; then
        DB_PASSWORD=""
        ui_success "MySQL  ()"
    else
        ui_warn "MySQL ，"
        ui_info ":"
        echo -e "${WARN}    CREATE DATABASE $DB_NAME CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;${NC}"
    fi

    # 
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
        ui_warn "Database '$DB_NAME' already exists with $TABLE_COUNT tables"
        
        if [[ "$TABLE_COUNT" -gt 0 ]]; then
            echo ""
            echo -e "${ACCENT}Database exists!${NC}"
            echo "  1. Drop and recreate database (WARNING: all data will be lost)"
            echo "  2. Continue with existing database"
            echo "  3. Continue but skip database migration"
            read -p "Select option [2]: " -n 1 -r
            echo

            case "$REPLY" in
                "1")
                    ui_info "Dropping and recreating database..."
                    if [[ -z "$DB_PASSWORD" ]]; then
                        run_step "" mysql -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" -e "DROP DATABASE IF EXISTS \`$DB_NAME\`; CREATE DATABASE \`$DB_NAME\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
                    else
                        run_step "" mysql -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" -p"$DB_PASSWORD" -e "DROP DATABASE IF EXISTS \`$DB_NAME\`; CREATE DATABASE \`$DB_NAME\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
                    fi
                    ui_success "Database recreated"
                    ;;
                "3")
                    ui_info "Skipping database migration"
                    SKIP_MIGRATION=true
                    ;;
                *)
                    ui_info "Continuing with existing database..."
                    ;;
            esac
        else
            ui_info "Database exists but is empty, continuing..."
        fi
    else
        ui_info "Creating database..."
        if [[ -z "$DB_PASSWORD" ]]; then
            run_step "" mysql -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" -e "CREATE DATABASE IF NOT EXISTS \`$DB_NAME\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
        else
            run_step "" mysql -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" -p"$DB_PASSWORD" -e "CREATE DATABASE IF NOT EXISTS \`$DB_NAME\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
        fi
        ui_success "Database created"
    fi

    # ============================================
    # 7. Database Migration
    # ============================================
    ui_stage "Database Migration"

    if [[ "$SKIP_MIGRATION" == "true" ]]; then
        ui_info "Skipping database migration"
    else
        MIGRATIONS_DIR="$APP_DIR/server/migrations"
        if [[ -d "$MIGRATIONS_DIR" ]]; then
            ui_info "Running database migrations..."
            JS_FILES=$(ls "$MIGRATIONS_DIR"/*.js 2>/dev/null | sort)
            if [[ -n "$JS_FILES" ]]; then
                for JS_FILE in $JS_FILES; do
                    ui_info "Running: $(basename "$JS_FILE")"
                    if node "$JS_FILE" "$DB_HOST" "$DB_PORT" "$DB_USER" "$DB_PASSWORD" "$DB_NAME" 2>&1; then
                        ui_success "  Done"
                    else
                        ui_warn "  Failed"
                    fi
                done
                ui_success "Migrations completed"
            else
                ui_warn "No migration files found"
            fi
        else
            ui_warn "Migrations directory not found"
        fi
    fi

    # ============================================
    # 8. 
    # ============================================
    ui_stage ""

    cd "$APP_DIR"

    if [[ "$NO_PROMPT" == "true" ]]; then
        ui_info "Installation complete."
        ui_info "To start: cd $APP_DIR && npm run dev"
    else
        echo ""
        echo -e "${ACCENT}Installation Complete!${NC}"
        echo "  1. Start Development Server (npm run dev)"
        echo "  2. Start Production Server"
        echo "  3. Build Only (npm run build)"
        echo "  Q. Quit"
        read -p "Select option [1]: " -n 1 -r
        echo

        case "$REPLY" in
            "1")
                echo -e "\n${WARN}Press Ctrl+C to stop${NC}\n"
                sleep 2
                npm run dev
                ;;
            "2")
                ui_info "Building production version..."
                run_step_with_spinner "" npm run build
                ui_success "Build complete"
                echo -e "\n${INFO}Configure nginx to serve dist/ folder${NC}"
                ;;
            "3")
                ui_info "Building..."
                run_step_with_spinner "" npm run build
                ui_success "Build complete, output in dist/"
                ;;
            *)
                ui_info "Exiting. To start later:"
                echo -e "${WARN}    cd $APP_DIR${NC}"
                echo -e "${WARN}    npm run dev${NC}"
                ;;
        esac
    fi

    # ============================================
    # Finish
    # ============================================
    ui_celebrate "Installation finished!"
    echo ""
    echo -e "${INFO}App directory:${NC} $APP_DIR"
    echo -e "${INFO}Env file:${NC} $ENV_FILE"
    echo -e "${INFO}To start:${NC} cd $APP_DIR && npm run dev"
    echo ""
}

# 
main "$@"