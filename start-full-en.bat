@echo off
cd /d "%~dp0"

:: Check if Node.js is installed
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo Error: Node.js not found. Please install Node.js 18 or higher.
    echo Download: https://nodejs.org/
    pause
    exit /b 1
)

:: Check if frontend dependencies are installed
if not exist "node_modules" (
    echo Installing frontend dependencies...
    npm install
    if %errorlevel% neq 0 (
        echo Error: Frontend dependencies installation failed.
        pause
        exit /b 1
    )
)

:: Check if backend dependencies are installed
if not exist "server\node_modules" (
    echo Installing backend dependencies...
    cd server
    npm install
    if %errorlevel% neq 0 (
        echo Error: Backend dependencies installation failed.
        cd ..
        pause
        exit /b 1
    )
    cd ..
)

:: Start backend server (new window)
start "Study API Server" cmd /c "cd /d D:\github\Study-test\server && npm run dev"

:: Wait a few seconds for backend to start
timeout /t 3 /nobreak >nul

:: Start frontend development server
echo.
echo Starting Study Quiz App frontend...
echo Access URL: http://localhost:3000
npm run dev

:: If frontend fails to start, show error
if %errorlevel% neq 0 (
    echo.
    echo Error: Frontend failed to start.
    pause
)