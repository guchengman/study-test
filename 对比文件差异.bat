@echo off
chcp 65001 >nul
echo ========================================
echo    对比本地与服务器文件差异
echo ========================================
echo.

set SERVER_HOST=47.88.52.213
set SERVER_USER=zengxiao
set SERVER_PATH=/home/zengxiao/study-test
set LOCAL_PATH=D:\github\Study-test

echo 请选择操作：
echo [1] 查看服务器上的文件内容
echo [2] 下载服务器文件到本地对比
echo [3] 上传本地文件到服务器
echo.

set /p choice=请输入选项 (1/2/3):

if "%choice%"=="1" goto view
if "%choice%"=="2" goto download
if "%choice%"=="3" goto upload

:view
echo.
echo ===== 服务器上的 handleImport 函数 (App.tsx) =====
ssh %SERVER_USER%@%SERVER_HOST% "sed -n '/handleImport/,/^  };/p' %SERVER_PATH%/src/App.tsx 2>/dev/null | head -50"
echo.
echo ===== 服务器上的 handleSubjectSelectionConfirm 函数 (ImportModal.tsx) =====
ssh %SERVER_USER%@%SERVER_HOST% "sed -n '/handleSubjectSelectionConfirm/,/^  };/p' %SERVER_PATH%/src/components/ImportModal.tsx 2>/dev/null | head -50"
goto end

:download
echo.
echo 下载服务器文件到本地...
ssh %SERVER_USER%@%SERVER_HOST% "cat %SERVER_PATH%/src/App.tsx" > "%LOCAL_PATH%\server_App.tsx"
ssh %SERVER_USER%@%SERVER_HOST% "cat %SERVER_PATH%/src/components/ImportModal.tsx" > "%LOCAL_PATH%\server_ImportModal.tsx"
echo 已下载到 %LOCAL_PATH%\server_App.tsx 和 server_ImportModal.tsx
echo.
echo 使用 fc 命令对比：
echo fc "%LOCAL_PATH%\src\App.tsx" "%LOCAL_PATH%\server_App.tsx"
echo fc "%LOCAL_PATH%\src\components\ImportModal.tsx" "%LOCAL_PATH%\server_ImportModal.tsx"
goto end

:upload
echo.
echo 上传题库导入相关文件到服务器...
scp "%LOCAL_PATH%\src\App.tsx" %SERVER_USER%@%SERVER_HOST%:%SERVER_PATH%/src/
scp "%LOCAL_PATH%\src\components\ImportModal.tsx" %SERVER_USER%@%SERVER_HOST%:%SERVER_PATH%/src/components/
echo.
echo 文件已上传！现在重新构建前端...
ssh %SERVER_USER%@%SERVER_HOST% "cd %SERVER_PATH% && npm run build"
echo.
echo ✅ 上传完成！
goto end

:end
echo.
pause
