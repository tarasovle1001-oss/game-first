# night 22.11 05:15: see hisclose-split.mjs. Waits for the femdom redo, moves the old scene frames out of the review, draws the scenes without the LoRA.
Set-Location C:\Users\stk01\Documents\game-first
$dir = 'tools\prompt-lab\data\pack'
$log = "$dir\hisclose-redo.log"
$BASE = 'sdxl_lightning_8step_lora.safetensors:1,sora_v2-000010.safetensors:0.7'
while (-not (Select-String -Path "$dir\femdom-redo.log" -Pattern '^== DONE' -Quiet)) { Start-Sleep 30 }
New-Item -ItemType Directory -Force "$dir\old\hisclose_scenes_lora04" | Out-Null
Get-ChildItem "$dir\out\hisclose" -Filter *.png | Where-Object { $_.Name -notlike 'detail_*' } | Move-Item -Destination "$dir\old\hisclose_scenes_lora04"
if (Test-Path "$dir\out\_femdom_final04") { Move-Item "$dir\out\_femdom_final04" "$dir\old\femdom_final04" }
"== scenes start $(Get-Date -Format HH:mm:ss)" | Add-Content $log
cmd.exe /c "node node_modules\tsx\dist\cli.mjs tools\comfy-run.ts --plan $dir\passes\hisclose_scenes.json --out $dir\out\none --comfy http://127.0.0.1:18188 --all --per 2 --seed 1000 --loras $BASE --inflight 2 >> $log 2>&1"
"== DONE exit $LASTEXITCODE $(Get-Date -Format HH:mm:ss)" | Add-Content $log
