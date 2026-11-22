Set-Location C:\Users\stk01\Documents\game-first
$dir = 'tools\prompt-lab\data\pack\figtest'
$BASE = 'sdxl_lightning_8step_lora.safetensors:1,sora_v2-000010.safetensors:0.7'
foreach ($v in 'A', 'B', 'E', 'F') {
  cmd.exe /c "node node_modules\tsx\dist\cli.mjs tools\comfy-run.ts --plan $dir\fig$v.json --out $dir\$v --comfy http://127.0.0.1:18188 --all --per 2 --seed 1000 --loras $BASE --inflight 2 >> $dir\figtest.log 2>&1"
}
"== DONE $(Get-Date -Format HH:mm:ss)" | Add-Content "$dir\figtest.log"
