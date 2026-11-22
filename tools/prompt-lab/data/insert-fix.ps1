# night 22.11: moves the "patron alone" inserts with a second figure out of the pack (by the tagger sweep) and redraws the missing ones with the fixed prompt.
# Safe to run again after the sweep has covered more frames. Also deletes at once every frame with a young-look signal (rule), without looking.
Set-Location C:\Users\stk01\Documents\game-first
$dir = 'tools\prompt-lab\data\pack'
$log = "$dir\insert-fix.log"
"== start $(Get-Date -Format HH:mm:ss)" | Add-Content $log
cmd.exe /c "node tools\prompt-lab\data\pack-scan-act.mjs --young --extra >> $log 2>&1"
if (Test-Path "$dir\old\_young_check") { Remove-Item "$dir\old\_young_check\*.png" -Force }
cmd.exe /c "node node_modules\tsx\dist\cli.mjs tools\comfy-run.ts --plan $dir\figtest\insert_fix.json --out $dir\out\none --comfy http://127.0.0.1:18188 --all --per 2 --seed 1000 --loras sdxl_lightning_8step_lora.safetensors:1,sora_v2-000010.safetensors:0.7 --inflight 2 >> $log 2>&1"
"== DONE exit $LASTEXITCODE $(Get-Date -Format HH:mm:ss)" | Add-Content $log
