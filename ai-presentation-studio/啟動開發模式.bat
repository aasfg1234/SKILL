@echo off
setlocal
chcp 65001 >nul

cd /d "%~dp0"

if not exist "package.json" (
  echo 找不到 package.json。
  echo 請確認批次檔放在專案資料夾內。
  pause
  exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
  echo 找不到 npm。
  echo 請先安裝 Node.js 20 以上版本。
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo 第一次啟動，正在安裝套件。
  call npm install
  if errorlevel 1 (
    echo 套件安裝失敗。
    echo 請把上方紅字整段貼給我。
    pause
    exit /b 1
  )
)

echo 正在啟動 AI 簡報工作室。
echo 瀏覽器會自動開啟。
echo 要停止時，回到這個視窗並按 Ctrl+C。
echo.

call npm run dev -- --host 127.0.0.1 --open

if errorlevel 1 (
  echo.
  echo 啟動失敗。
  echo 請把上方紅字整段貼給我。
  pause
)

endlocal
