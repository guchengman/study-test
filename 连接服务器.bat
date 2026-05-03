@echo off
chcp 65001 >nul
echo ========================================
echo    连接到阿里云服务器
echo ========================================
echo.

set KEY_FILE=C:\Users\zengxiao\.ssh\deploy_key.pem
set SERVER_HOST=47.88.52.213
set SERVER_USER=root
set SERVER_PATH=/home/zengxiao/study-test

echo 连接服务器: %SERVER_USER%@%SERVER_HOST%
echo.

:: 测试连接
echo [测试连接...]
echo.

:: 首先检查密钥权限
echo [检查SSH密钥...]
icacls "%KEY_FILE%" | findstr /i "Read"

echo.
echo [可用命令]：
echo 1. 查看服务器上的 handleImport 函数
echo 2. 下载服务器文件到本地
echo 3. 上传本地文件到服务器
echo 4. 直接SSH连接（手动操作）
echo.

set /p choice=请输入选项 (1/2/3/4):

if "%choice%"=="1" goto view
if "%choice%"=="2" goto download
if "%choice%"=="3" goto upload
if "%choice%"=="4" goto ssh_connect
goto end

:view
echo.
echo ===== 服务器上的 handleImport 函数 (App.tsx) =====
ssh -i "%KEY_FILE%" -o StrictHostKeyChecking=no -o ConnectTimeout=30 %SERVER_USER%@%SERVER_HOST% "sed -n '/handleImport/,/^  };/p' %SERVER_PATH%/src/App.tsx" 2>&1
echo.
echo ===== 服务器上的 handleSubjectSelectionConfirm 函数 (ImportModal.tsx) =====
ssh -i "%KEY_FILE%" -o StrictHostKeyChecking=no -o ConnectTimeout=30 %SERVER_USER%@%SERVER_HOST% "sed -n '/handleSubjectSelectionConfirm/,/^  };/p' %SERVER_PATH%/src/components/ImportModal.tsx" 2>&1
goto end

:download
echo.
echo 下载服务器文件到本地对比...
ssh -i "%KEY_FILE%" -o StrictHostKeyChecking=no %SERVER_USER%@%SERVER_HOST% "cat %SERVER_PATH%/src/App.tsx" > "%~dp0server_App.tsx"
ssh -i "%KEY_FILE%" -o StrictHostKeyChecking=no %SERVER_USER%@%SERVER_HOST% "cat %SERVER_PATH%/src/components/ImportModal.tsx" > "%~dp0server_ImportModal.tsx"
echo.
echo 文件已下载到当前目录
echo.
echo 使用以下命令对比：
echo fc "%~dp0src\App.tsx" "%~dp0server_App.tsx"
echo fc "%~dp0src\components\ImportModal.tsx" "%~dp0server_ImportModal.tsx"
goto end

:upload
echo.
echo 上传题库导入相关文件到服务器...
scp -i "%KEY_FILE%" -o StrictHostKeyChecking=no "%~dp0src\App.tsx" %SERVER_USER%@%SERVER_HOST%:%SERVER_PATH%/src/
scp -i "%KEY_FILE%" -o StrictHostKeyChecking=no "%~dp0src\components\ImportModal.tsx" %SERVER_USER%@%SERVER_HOST%:%SERVER_PATH%/src/components/
echo.
echo 重新构建前端...
ssh -i "%KEY_FILE%" -o StrictHostKeyChecking=no %SERVER_USER%@%SERVER_HOST% "cd %SERVER_PATH% && npm run build && pm2 restart study-server"
echo.
echo ✅ 上传完成！
goto end

:ssh_connect
echo.
echo 正在打开SSH连接...
start "" ssh -i "%KEY_FILE%" %SERVER_USER%@%SERVER_HOST%
goto end

:end
echo.
pause
