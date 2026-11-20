@echo off
rem Picture server for the game: draws missing pictures on your ComfyUI while you play (http://127.0.0.1:8197)
rem Pictures go to pictures\<heroine folder>\ - each folder is a ready picture pack with her card (wife.json).
rem If ComfyUI is not running on 8188, starts it from C:\ComfyUI the same way the prompt lab does.
cd /d "%~dp0"
powershell -NoProfile -Command "try { Invoke-WebRequest -UseBasicParsing http://127.0.0.1:8188/system_stats -TimeoutSec 2 | Out-Null; Write-Host ComfyUI already running } catch { if (Test-Path C:\ComfyUI\.venv\Scripts\python.exe) { Write-Host Starting ComfyUI...; Start-Process -WindowStyle Minimized -WorkingDirectory C:\ComfyUI -FilePath C:\ComfyUI\.venv\Scripts\python.exe -ArgumentList main.py,--listen,127.0.0.1,--port,8188,--fp8_e4m3fn-unet,--fast } else { Write-Host No ComfyUI in C:\ComfyUI - start yours on 8188 } }"
node node_modules\tsx\dist\cli.mjs tools\picture-server.ts %*
pause
