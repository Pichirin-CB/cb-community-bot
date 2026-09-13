@echo off
chcp 65001 >nul
setlocal
title CB Studios Bot - Status
cd /d "%~dp0"

powershell.exe -NoProfile -ExecutionPolicy Bypass -Command ^
  "$pidFile = Join-Path (Get-Location) 'bot.pid';" ^
  "if (-not (Test-Path -LiteralPath $pidFile)) { Write-Host '[DETENIDO] CB Studios Bot no esta activo.'; exit 1 };" ^
  "$savedPid = [int](Get-Content -LiteralPath $pidFile -ErrorAction SilentlyContinue);" ^
  "$entry = [IO.Path]::GetFullPath((Join-Path (Get-Location) 'dist\src\index.js'));" ^
  "$process = Get-CimInstance Win32_Process -Filter ('ProcessId=' + $savedPid) -ErrorAction SilentlyContinue;" ^
  "if ($process -and $process.CommandLine -like ('*' + $entry + '*')) {" ^
  "  $started = [datetime]$process.CreationDate;" ^
  "  $uptime = (Get-Date) - $started;" ^
  "  Write-Host ('[ACTIVO] CB Studios Bot - PID ' + $savedPid + ' - Tiempo activo: ' + $uptime.ToString('dd\.hh\:mm\:ss')); exit 0" ^
  "};" ^
  "Remove-Item -LiteralPath $pidFile -Force -ErrorAction SilentlyContinue;" ^
  "Write-Host '[DETENIDO] CB Studios Bot no esta activo. Se elimino un PID obsoleto.'; exit 1"

exit /b %errorlevel%
