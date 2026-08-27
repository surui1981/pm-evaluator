@echo off
REM PM-Evaluator 独立后端启动脚本（默认 127.0.0.1:8888）
REM 用法: start-server.bat [端口]   例如: start-server.bat 8890
cd /d "%~dp0"
set PORT=8888
if not "%1"=="" set PORT=%1
echo 启动 PM-Evaluator 后端: http://127.0.0.1:%PORT%
node server.js
pause
