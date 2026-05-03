@echo off
chcp 65001 >nul
echo ========================================
echo    部署到阿里云服务器
echo ========================================
echo.

set SERVER_HOST=47.88.52.213
set SERVER_USER=zengxiao
set SERVER_PATH=/home/zengxiao/study-test

echo [1/5] 备份当前文件...
ssh %SERVER_USER%@%SERVER_HOST% "mkdir -p %SERVER_PATH%/backup && cp -r %SERVER_PATH%/dist %SERVER_PATH%/backup/dist_bak_%date:~0,4%%date:~5,2%%date:~8,2%_%time:~0,2%%time:~3,2%%time:~6,2% 2>/dev/null || true"

echo.
echo [2/5] 上传前端文件...
scp -r dist/* %SERVER_USER%@%SERVER_HOST%:%SERVER_PATH%/dist/

echo.
echo [3/5] 上传后端文件...
scp -r server/* %SERVER_USER%@%SERVER_HOST%:%SERVER_PATH%/server/

echo.
echo [4/5] 上传项目配置文件...
scp package.json package-lock.json %SERVER_USER%@%SERVER_HOST%:%SERVER_PATH%/
scp -r src %SERVER_USER%@%SERVER_HOST%:%SERVER_PATH%/
scp vite.config.ts %SERVER_USER%@%SERVER_HOST%:%SERVER_PATH%/
scp index.html %SERVER_USER%@%SERVER_HOST%:%SERVER_PATH%/

echo.
echo [5/5] 重启服务...
ssh %SERVER_USER%@%SERVER_HOST% << EOF
  cd %SERVER_PATH%
  
  echo   - 安装后端依赖...
  cd server
  npm ci --production 2>nul || npm install --production
  
  echo   - 安装前端依赖...
  cd ..
  npm ci --production 2>nul || npm install --production
  
  echo   - 重启 PM2...
  pm2 restart study-server || pm2 start server/src/index.js --name study-server
  
  echo   - 重启 nginx...
  call nginx -t 2>nul
  call nginx -s reload 2>nul
  
  echo.
  echo ✅ 部署完成！
  echo 🌐 网站地址: https://www.xiaoyyue.shop
EOF

echo.
echo ========================================
echo    部署完成！
echo ========================================
pause
