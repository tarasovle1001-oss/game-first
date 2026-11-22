# control run for a concept LoRA: powershell -File grp-ctl.ps1 <group> <trigger>   (see grp-ctl.mjs)
param($g, $t)
Set-Location C:\Users\stk01\Documents\game-first
$dir = 'tools\prompt-lab\data\pack\figtest'
$BASE = 'sdxl_lightning_8step_lora.safetensors:1,sora_v2-000010.safetensors:0.7'
foreach ($j in @(@('no', $BASE), @('1000', "$BASE,$t-1000.safetensors:0.6"))) {
  cmd.exe /c "node node_modules\tsx\dist\cli.mjs tools\comfy-run.ts --plan $dir\ctl_$g.json --out $dir\ctl_${g}_$($j[0]) --comfy http://127.0.0.1:18188 --all --per 2 --seed 1000 --loras $($j[1]) --inflight 2 >> $dir\ctl_$g.log 2>&1"
}
"== DONE $(Get-Date -Format HH:mm:ss)" | Add-Content "$dir\ctl_$g.log"
