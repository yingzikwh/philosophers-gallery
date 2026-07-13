@echo off
chcp 65001 >nul 2>&1
title 哲学家画廊 - 本地部署

echo.
echo  ========================================
echo   哲学家画廊 - 本地启动脚本
echo  ========================================
echo.

REM 检查 .env 文件
if not exist ".env" (
    echo  [错误] 未找到 .env 配置文件！
    echo  请先创建 .env 文件并配置 OPENAI_API_KEY
    pause
    exit /b 1
)

REM 检查 API Key 是否已配置
findstr "在此填入" .env >nul 2>&1
if %errorlevel% equ 0 (
    echo  [警告] .env 中的 OPENAI_API_KEY 还是占位符！
    echo  请编辑 .env 文件，填入你的真实 API Key。
    echo.
    echo  前端画廊可以正常浏览，但 AI 对话功能需要配置 API Key 后才能使用。
    echo.
)

echo  正在启动服务...
echo  - 前端: http://localhost:3015
echo  - 后端: http://localhost:3016
echo.
echo  按 Ctrl+C 停止所有服务
echo.

REM 同时启动前端和后端
npx concurrently -n "前端,后端" -c "blue,green" "vite --port 3015 --host 0.0.0.0 --strictPort" "node server/index.js"
