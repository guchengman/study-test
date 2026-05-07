@echo off
cd /d "%~dp0"

:: ========================================
:: Study Quiz App 启动脚本
:: ========================================

:: 检查 Node.js 是否已安装
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo 错误: 未找到 Node.js。请先安装 Node.js 18 或更高版本。
    echo 下载地址: https://nodejs.org/
    pause
    exit /b 1
)

:: 检查前端依赖是否已安装
if not exist "node_modules" (
    echo 正在安装前端依赖...
    npm install
    if %errorlevel% neq 0 (
        echo 错误: 前端依赖安装失败。
        pause
        exit /b 1
    )
)

:: 检查后端依赖是否已安装
if not exist "server\node_modules" (
    echo 正在安装后端依赖...
    cd server
    npm install
    if %errorlevel% neq 0 (
        echo 错误: 后端依赖安装失败。
        cd ..
        pause
        exit /b 1
    )
    cd ..
)

:MENU
cls
echo ========================================
echo      Study Quiz App 启动菜单
echo ========================================
echo.
echo 1. 开发模式 (前端 + 后端)
echo 2. 仅启动前端
echo 3. 仅启动后端
echo 4. 构建生产版本
echo 5. 退出
echo.
choice /c 12345 /m "请选择启动方式"

if errorlevel 5 goto EXIT
if errorlevel 4 goto BUILD
if errorlevel 3 goto BACKEND_ONLY
if errorlevel 2 goto FRONTEND_ONLY
if errorlevel 1 goto FULL_DEV

:FULL_DEV
echo.
echo 启动后端服务...
start "Study API Server" cmd /c "cd /d %~dp0\server && npm run dev"

echo.
echo 等待后端启动...
timeout /t 3 /nobreak >nul

echo.
echo 启动前端开发服务器...
echo 访问地址: http://localhost:5173
npm run dev
goto END

:FRONTEND_ONLY
echo.
echo 启动前端开发服务器...
echo 访问地址: http://localhost:5173
npm run dev
goto END

:BACKEND_ONLY
echo.
echo 启动后端服务...
echo 访问地址: http://localhost:3100
cd server
npm run dev
cd ..
goto END

:BUILD
echo.
echo 构建生产版本...
npm run build
if %errorlevel% neq 0 (
    echo 错误: 构建失败。
    pause
    goto MENU
)
echo 构建完成！输出目录: dist
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