@echo off
chcp 65001 >nul
setlocal
title CB Community - Stop
cd /d "%~dp0"

powershell.exe -NoProfile -ExecutionPolicy Bypass -Command ^
  "$pidFile = Join-Path (Get-Location) 'bot.pid';" ^
  "if (-not (Test-Path -LiteralPath $pidFile)) { Write-Host '[INFO] El bot no esta activo.'; exit 0 };" ^
  "$savedPid = [int](Get-Content -LiteralPath $pidFile -ErrorAction SilentlyContinue);" ^
  "$entry = [IO.Path]::GetFullPath((Join-Path (Get-Location) 'dist\src\index.js'));" ^
  "$process = Get-CimInstance Win32_Process -Filter ('ProcessId=' + $savedPid) -ErrorAction SilentlyContinue;" ^
  "if (-not $process) { Remove-Item -LiteralPath $pidFile -Force; Write-Host '[INFO] El bot ya estaba detenido; se elimino el PID obsoleto.'; exit 0 };" ^
  "if ($process.CommandLine -notlike ('*' + $entry + '*')) { Remove-Item -LiteralPath $pidFile -Force; Write-Host '[AVISO] El PID pertenece a otro proceso y no se detuvo.'; exit 1 };" ^
  "Stop-Process -Id $savedPid -Force -ErrorAction Stop;" ^
  "Remove-Item -LiteralPath $pidFile -Force;" ^
  "Write-Host ('[OK] CB Studios Bot detenido (PID ' + $savedPid + ').')"

exit /b %errorlevel%
