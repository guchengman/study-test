@echo off
cd /d "%~dp0"

:: ========================================
:: Study Quiz App Start Script
:: ========================================

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

:MENU
cls
echo ========================================
echo      Study Quiz App Menu
echo ========================================
echo.
echo 1. Development Mode (Frontend + Backend)
echo 2. Frontend Only
echo 3. Backend Only
echo 4. Build Production Version
echo 5. Exit
echo.
choice /c 12345 /m "Please select an option"

if errorlevel 5 goto EXIT
if errorlevel 4 goto BUILD
if errorlevel 3 goto BACKEND_ONLY
if errorlevel 2 goto FRONTEND_ONLY
if errorlevel 1 goto FULL_DEV

:FULL_DEV
echo.
echo Starting backend server...
start "Study API Server" /d "%~dp0server" cmd /c npm run dev

echo.
echo Waiting for backend to start...
timeout /t 3 /nobreak >nul

echo.
echo Starting frontend development server...
echo Access URL: http://localhost:3000
npm run dev
goto END

:FRONTEND_ONLY
echo.
echo Starting frontend development server...
echo Access URL: http://localhost:3000
npm run dev
goto END

:BACKEND_ONLY
echo.
echo Starting backend server...
echo Access URL: http://localhost:3100
cd server
npm run dev
cd ..
goto END

:BUILD
echo.
echo Building production version...
npm run build
if %errorlevel% neq 0 (
    echo Error: Build failed.
    pause
    goto MENU
)
echo Build completed! Output directory: dist
pause
goto MENU

:EXIT
exit /b 0

:END
exit /b 0