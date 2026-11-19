@echo off
rem Prompt lab for the scenes: http://127.0.0.1:8195
rem If ComfyUI is not running on 8188, starts it from C:\ComfyUI the way Wayward does (fp8 UNet + --fast: ~10 s a frame on a 6 GB card instead of ~45 s)
cd /d "%~dp0"
powershell -NoProfile -Command "try { Invoke-WebRequest -UseBasicParsing http://127.0.0.1:8188/system_stats -TimeoutSec 2 | Out-Null; Write-Host ComfyUI already running } catch { if (Test-Path C:\ComfyUI\.venv\Scripts\python.exe) { Write-Host Starting ComfyUI...; Start-Process -WindowStyle Minimized -WorkingDirectory C:\ComfyUI -FilePath C:\ComfyUI\.venv\Scripts\python.exe -ArgumentList main.py,--listen,127.0.0.1,--port,8188,--fp8_e4m3fn-unet,--fast } else { Write-Host No ComfyUI in C:\ComfyUI - start yours on 8188 } }"
start "" http://127.0.0.1:8195
node node_modules\tsx\dist\cli.mjs tools\prompt-lab\server.ts %*
pause
