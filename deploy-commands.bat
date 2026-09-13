@echo off
chcp 65001 >nul
setlocal
title CB Studios Bot - Deploy Commands
cd /d "%~dp0"

call npm.cmd run deploy:commands
exit /b %errorlevel%
