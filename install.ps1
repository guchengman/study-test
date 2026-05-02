# Study-Test 一键安装脚本 (Windows PowerShell)
# 运行方式：以管理员身份运行 PowerShell，然后执行 .\install.ps1

param(
    [switch]$SkipNodeCheck,      # 跳过 Node.js 检查
    [switch]$SkipMySQLCheck,    # 跳过 MySQL 检查
    [string]$DBHost = "localhost",
    [string]$DBPort = "3306",
    [string]$DBUser = "root",
    [string]$DBPassword = "",
    [string]$DBName = "study_test",
    [switch]$AutoDBPassword      # 自动生成随机数据库密码
)

$ErrorActionPreference = "Continue"
$ScriptDir = $PSScriptRoot
$AppName = "study-test"
$AppDir = Join-Path $ScriptDir $AppName

# 颜色定义
function Write-Step { param($msg) Write-Host "`n>>> $msg" -ForegroundColor Cyan }
function Write-Success { param($msg) Write-Host "[OK] $msg" -ForegroundColor Green }
function Write-Warn { param($msg) Write-Host "[WARN] $msg" -ForegroundColor Yellow }
function Write-Err { param($msg) Write-Host "[ERR] $msg" -ForegroundColor Red }
function Write-Info { param($msg) Write-Host "    $msg" }

#  Banner
Write-Host @"

██████╗ ███████╗██╗   ██╗     █████╗ ██████╗  ██████╗██╗  ██╗██╗   ██╗██████╗ 
██╔══██╗██╔════╝██║   ██║    ██╔══██╗██╔══██╗██╔════╝██║  ██║██║   ██║██╔══██╗
██████╔╝█████╗  ██║   ██║    ███████║██████╔╝██║     ███████║██║   ██║██████╔╝
██╔══██╗██╔══╝  ╚██╗ ██╔╝    ██╔══██║██╔══██╗██║     ██╔══██║██║   ██║██╔═══╝ 
██████╔╝███████╗ ╚████╔╝     ██║  ██║██████╔╝╚██████╗██║  ██║╚██████╔╝██║     
╚═════╝ ╚══════╝  ╚═══╝      ╚═╝  ╚═╝╚═════╝  ╚═════╝╚═╝  ╚═╝ ╚═════╝ ╚═╝     

"@ -ForegroundColor Magenta

Write-Host "学习题库系统 - 一键安装脚本" -ForegroundColor White
Write-Host "==========================================`n" -ForegroundColor White

# ============================================
# 1. 环境检查
# ============================================
Write-Step "第1步：环境检查"

# 1.1 检查 Node.js
if (-not $SkipNodeCheck) {
    Write-Info "检查 Node.js..."
    $nodeVersion = node --version 2>$null
    if ($nodeVersion) {
        $nodeMajor = [int]($nodeVersion -replace 'v', '' -split '\.')[0]
        if ($nodeMajor -ge 18) {
            Write-Success "Node.js 已安装: $nodeVersion"
        } else {
            Write-Err "Node.js 版本过低，需要 18+，当前: $nodeVersion"
            Write-Info "请从 https://nodejs.org 下载安装 Node.js 18+"
            exit 1
        }
    } else {
        Write-Err "Node.js 未安装"
        Write-Info "请从 https://nodejs.org 下载安装 Node.js 18+"
        exit 1
    }
}

# 1.2 检查 MySQL
if (-not $SkipMySQLCheck) {
    Write-Info "检查 MySQL..."
    $mysqlCmd = Get-Command mysql -ErrorAction SilentlyContinue
    if ($mysqlCmd) {
        Write-Success "MySQL 已安装"
    } else {
        Write-Warn "MySQL 未检测到，尝试检查服务..."
        $mysqlService = Get-Service -Name "MySQL*" -ErrorAction SilentlyContinue
        if ($mysqlService) {
            Write-Success "MySQL 服务已安装: $($mysqlService.Name)"
        } else {
            Write-Err "MySQL 未安装"
            Write-Info "请选择以下任一方式安装 MySQL:"
            Write-Info "  1. 下载 https://dev.mysql.com/downloads/mysql/"
            Write-Info "  2. 使用 Chocolatey: choco install mysql"
            Write-Info "  3. 使用 Docker: docker run -d -p 3306:3306 -e MYSQL_ROOT_PASSWORD=123456 mysql"
            exit 1
        }
    }
}

# ============================================
# 2. 下载程序
# ============================================
Write-Step "第2步：下载程序"

if (Test-Path $AppDir) {
    Write-Warn "检测到已有安装目录，询问是否更新..."
    $update = Read-Host "是否更新现有安装? (Y/N)"
    if ($update -eq 'Y' -or $update -eq 'y') {
        Write-Info "正在更新代码..."
        Set-Location $AppDir
        git pull 2>$null
        if ($LASTEXITCODE -ne 0) {
            Write-Warn "Git 更新失败，保留现有代码"
        }
        Set-Location $ScriptDir
    }
} else {
    Write-Info "从 GitHub 克隆项目..."
    git clone https://github.com/guchengman/study-test.git $AppDir
    if ($LASTEXITCODE -ne 0) {
        Write-Err "克隆失败，请检查网络连接"
        exit 1
    }
    Write-Success "代码下载完成"
}

# ============================================
# 3. 安装依赖
# ============================================
Write-Step "第3步：安装依赖"

Set-Location $AppDir
Write-Info "安装 npm 依赖..."
npm install
if ($LASTEXITCODE -ne 0) {
    Write-Err "npm 安装失败"
    exit 1
}
Write-Success "依赖安装完成"

# ============================================
# 4. 配置环境变量
# ============================================
Write-Step "第4步：配置环境变量"

$envFile = Join-Path $AppDir ".env"
if ($AutoDBPassword) {
    $DBPassword = -join ((48..57) + (65..90) + (97..122) | Get-Random -Count 16 | ForEach-Object {[char]$_})
}

Write-Info "创建 .env 文件..."
$envContent = @"
# 数据库配置
DB_HOST=$DBHost
DB_PORT=$DBPort
DB_USER=$DBUser
DB_PASSWORD=$DBPassword
DB_NAME=$DBName

# JWT 密钥 (自动生成)
JWT_SECRET=$(-join ((65..90) + (97..122) + (48..57) | Get-Random -Count 64 | ForEach-Object {[char]$_}))
"@

Set-Content -Path $envFile -Value $envContent -Encoding UTF8
Write-Success "环境变量配置完成"

if ($AutoDBPassword -or [string]::IsNullOrEmpty($DBPassword)) {
    Write-Warn "数据库密码为空，建议设置密码"
    Write-Info "已生成的随机密码保存在 .env 文件中"
}

# ============================================
# 5. 创建数据库
# ============================================
Write-Step "第5步：创建数据库"

Write-Info "尝试连接 MySQL..."
$mysqlTest = mysql -h $DBHost -P $DBPort -u $DBUser $(if ($DBPassword) { "-p$DBPassword" }) -e "SELECT 1" 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Warn "MySQL 连接测试失败，尝试无密码连接..."
    $mysqlTest = mysql -h $DBHost -P $DBPort -u $DBUser -e "SELECT 1" 2>$null
    if ($LASTEXITCODE -ne 0) {
        Write-Warn "MySQL 连接失败，跳过数据库创建"
        Write-Info "请手动执行以下命令创建数据库:"
        Write-Host "    CREATE DATABASE $DBName CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;" -ForegroundColor Yellow
    } else {
        $DBPassword = ""
    }
} else {
    Write-Success "MySQL 连接成功"
}

# 创建数据库
Write-Info "创建数据库 $DBName..."
$createDB = mysql -h $DBHost -P $DBPort -u $DBUser $(if ($DBPassword) { "-p$DBPassword" }) -e "CREATE DATABASE IF NOT EXISTS `$DBName` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;" 2>$null
if ($LASTEXITCODE -eq 0) {
    Write-Success "数据库创建成功"
} else {
    Write-Warn "数据库可能已存在或创建失败，继续下一步..."
}

# ============================================
# 6. 初始化数据库表结构
# ============================================
Write-Step "第6步：初始化数据库表结构"

$migrationsDir = Join-Path $AppDir "server\migrations"
if (Test-Path $migrationsDir) {
    Write-Info "执行数据库迁移脚本..."
    $sqlFiles = Get-ChildItem -Path $migrationsDir -Filter "*.sql" | Sort-Object Name
    foreach ($sqlFile in $sqlFiles) {
        Write-Info "执行: $($sqlFile.Name)"
        $result = mysql -h $DBHost -P $DBPort -u $DBUser $(if ($DBPassword) { "-p$DBPassword" }) $DBName < $sqlFile.FullName 2>&1
        if ($LASTEXITCODE -eq 0) {
            Write-Success "  完成: $($sqlFile.Name)"
        } else {
            Write-Warn "  跳过: $($sqlFile.Name) (可能已存在)"
        }
    }
    Write-Success "数据库表结构初始化完成"
} else {
    Write-Warn "未找到迁移脚本目录"
}

# ============================================
# 7. 启动服务
# ============================================
Write-Step "第7步：启动服务"

Write-Host "`n请选择启动方式:" -ForegroundColor Cyan
Write-Host "  1. 开发模式 (npm run dev)"
Write-Host "  2. 生产模式 (构建后运行)"
Write-Host "  3. 仅构建 (npm run build)"
Write-Host "  Q. 退出，稍后手动启动"
$choice = Read-Host "`n请输入选项 [1]"

# 返回项目目录
Set-Location $AppDir

switch ($choice) {
    "1" {
        Write-Host "`n按 Ctrl+C 停止服务`n" -ForegroundColor Yellow
        Start-Sleep -Seconds 2
        npm run dev
    }
    "2" {
        Write-Info "构建项目..."
        npm run build
        if ($LASTEXITCODE -eq 0) {
            Write-Success "构建完成"
            Write-Host "`n生产模式需要配置 nginx，请参考项目文档" -ForegroundColor Cyan
        }
    }
    "3" {
        Write-Info "构建项目..."
        npm run build
        if ($LASTEXITCODE -eq 0) {
            Write-Success "构建完成，输出在 dist/ 目录"
        }
    }
    default {
        Write-Info "已退出，请手动运行以下命令启动:"
        Write-Host "    cd $AppDir" -ForegroundColor Yellow
        Write-Host "    npm run dev" -ForegroundColor Yellow
    }
}

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "  安装完成！" -ForegroundColor Green
Write-Host "  项目目录: $AppDir" -ForegroundColor White
Write-Host "  环境配置: $envFile" -ForegroundColor White
Write-Host "========================================`n" -ForegroundColor Cyan