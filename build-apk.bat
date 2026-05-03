@echo off
set JAVA_HOME=C:\Program Files\Java\jdk-17
set PATH=%JAVA_HOME%\bin;%PATH%
cd /d D:\github\Study-test\android
gradlew.bat assembleDebug --no-daemon
