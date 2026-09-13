@echo off
chcp 65001 >nul
setlocal
title CB Community - Start
cd /d "%~dp0"

if not exist "node_modules" (
  echo [ERROR] Faltan las dependencias. Ejecuta: npm install
  exit /b 1
)

if not exist "dist\src\index.js" (
  echo [INFO] Compilando el bot...
  call npm.cmd run build || exit /b 1
)

if not exist "logs" mkdir "logs"

powershell.exe -NoProfile -ExecutionPolicy Bypass -Command ^
  "$pidFile = Join-Path (Get-Location) 'bot.pid';" ^
  "$entry = [IO.Path]::GetFullPath((Join-Path (Get-Location) 'dist\src\index.js'));" ^
  "if (Test-Path -LiteralPath $pidFile) {" ^
  "  $savedPid = [int](Get-Content -LiteralPath $pidFile -ErrorAction SilentlyContinue);" ^
  "  $old = Get-CimInstance Win32_Process -Filter ('ProcessId=' + $savedPid) -ErrorAction SilentlyContinue;" ^
  "  if ($old -and $old.CommandLine -like ('*' + $entry + '*')) { Write-Host ('[INFO] El bot ya esta activo (PID ' + $savedPid + ').'); exit 2 };" ^
  "  Remove-Item -LiteralPath $pidFile -Force -ErrorAction SilentlyContinue" ^
  "};" ^
  "$node = (Get-Command node.exe -ErrorAction Stop).Source;" ^
  "$out = Join-Path (Get-Location) 'logs\bot-output.log';" ^
  "$err = Join-Path (Get-Location) 'logs\bot-error.log';" ^
  "$process = Start-Process -FilePath $node -ArgumentList @($entry) -WorkingDirectory (Get-Location) -WindowStyle Hidden -RedirectStandardOutput $out -RedirectStandardError $err -PassThru;" ^
  "$process.Id | Set-Content -LiteralPath $pidFile -Encoding ascii;" ^
  "Start-Sleep -Milliseconds 1200;" ^
  "if ($process.HasExited) { Remove-Item -LiteralPath $pidFile -Force -ErrorAction SilentlyContinue; Write-Host ('[ERROR] El bot no pudo iniciar. Revisa ' + $err); exit 1 };" ^
  "Write-Host ('[OK] CB Studios Bot iniciado (PID ' + $process.Id + ').')"

set "RESULT=%errorlevel%"
if "%RESULT%"=="2" exit /b 0
exit /b %RESULT%
