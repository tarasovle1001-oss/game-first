@echo off
cd /d "%~dp0"
start http://127.0.0.1:8196/report
node node_modules\tsx\dist\cli.mjs tools\prompt-lab\server.ts --port 8196 --data tools\prompt-lab\night --comfy http://127.0.0.1:18188 --nosave
pause

