@echo off
:: Study-Test 一键安装启动器
:: 双击此文件自动以管理员身份运行安装脚本

echo.
echo  ================================================
echo    学习题库系统 - 一键安装
echo  ================================================
echo.
echo  正在请求管理员权限...
echo.

:: 以管理员身份重新运行此脚本
powershell -Command "Start-Process cmd -ArgumentList '/c cd /d %~dp0 && powershell -NoProfile -ExecutionPolicy Bypass -File \"%~dp0install.ps1\" %*' -Verb RunAs"

pause