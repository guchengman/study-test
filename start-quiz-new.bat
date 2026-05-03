@echo off
cd /d "%~dp0"

:: 检查 Node.js 是否已安装
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo 错误: 未找到 Node.js。请先安装 Node.js 18 或更高版本。
    echo 下载地址: https://nodejs.org/
    pause
    exit /b 1
)

:: 检查依赖是否已安装
if not exist "node_modules" (
    echo 正在安装依赖...
    npm install
    if %errorlevel% neq 0 (
        echo 错误: 依赖安装失败。
        pause
        exit /b 1
    )
)

echo Starting Study Quiz App on http://localhost:3000
npm run dev
if %errorlevel% neq 0 (
    echo 错误: 应用启动失败。
    pause
    exit /b 1
)