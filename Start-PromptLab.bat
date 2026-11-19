@echo off
rem Prompt lab for the scenes: http://127.0.0.1:8195 (needs ComfyUI running, by default on 8188)
cd /d "%~dp0"
start "" http://127.0.0.1:8195
node node_modules\tsx\dist\cli.mjs tools\prompt-lab\server.ts %*
pause
