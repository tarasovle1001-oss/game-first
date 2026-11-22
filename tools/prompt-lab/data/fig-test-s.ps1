# variant S: body string without the frontal tags (thigh gap, ass visible through thighs, wide hips) - do two-person scenes stop turning into a frontal standing portrait?
Set-Location C:\Users\stk01\Documents\game-first
$dir = 'tools\prompt-lab\data\pack\figtest'
$BASE = 'sdxl_lightning_8step_lora.safetensors:1,sora_v2-000010.safetensors:0.7'
while (-not (Select-String -Path "$dir\figtest.log" -Pattern '^== DONE' -Quiet)) { Start-Sleep 20 }
cmd.exe /c "node node_modules\tsx\dist\cli.mjs tools\comfy-run.ts --plan $dir\figS.json --out $dir\S --comfy http://127.0.0.1:18188 --all --per 2 --seed 1000 --loras $BASE --inflight 2 >> $dir\figtest.log 2>&1"
"== DONE-S $(Get-Date -Format HH:mm:ss)" | Add-Content "$dir\figtest.log"
