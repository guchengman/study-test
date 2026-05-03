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

:MENU
cls
echo ========================================
echo      Study Quiz App 启动菜单
echo ========================================
echo.
echo 1. 开发模式 (Web 浏览器)
echo 2. Electron 桌面应用 (开发模式)
echo 3. 构建 Electron 应用
echo 4. 退出
echo.
choice /c 1234 /m "请选择启动方式"

if errorlevel 4 goto EXIT
if errorlevel 3 goto BUILD_ELECTRON
if errorlevel 2 goto ELECTRON_DEV
if errorlevel 1 goto WEB_DEV

:WEB_DEV
echo.
echo 启动 Web 开发服务器...
echo 访问地址: http://localhost:3000
npm run dev
goto END

:ELECTRON_DEV
echo.
echo 启动 Electron 桌面应用 (开发模式)...
npm run electron:dev
goto END

:BUILD_ELECTRON
echo.
echo 构建 Electron 应用...
echo 构建完成后，可执行文件将位于 dist-electron 目录
npm run electron:build
pause
goto MENU

:EXIT
exit /b 0

:END
if %errorlevel% neq 0 (
    echo.
    echo 错误: 应用启动失败。
    pause
)