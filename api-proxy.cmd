@echo off
rem Локальный прокси к API blockade3d.com (ASCII-текст, чтобы cmd не ломал кодировку).
cd /d "%~dp0"
echo.
echo Starting local API proxy for blockade3d.com ...
echo Keep this window open while the page's "Load from API" button is used.
echo.
node proxy.mjs
echo.
echo Proxy stopped.
pause
