@echo off
chcp 65001 >nul
setlocal
title CB Studios Bot - Test
cd /d "%~dp0"

echo.
echo === Migraciones ===
call npm.cmd run db:migrate || exit /b 1

echo.
echo === Build ===
call npm.cmd run build || exit /b 1

echo.
echo === Lint ===
call npm.cmd run lint || exit /b 1

echo.
echo === Tests ===
call npm.cmd test || exit /b 1

echo.
echo CB Studios Bot: validacion completa OK.
exit /b 0
