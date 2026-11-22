# 22.11 12:15: third round - concept scenes only (plain scenes already have 4 frames per key). Waits for pack-run2 to finish.
# Log: data\pack\pack-run3.log; stop: create data\pack\STOP
Set-Location C:\Users\stk01\Documents\game-first
$dir = 'tools\prompt-lab\data\pack'
$log = "$dir\pack-run3.log"
$BASE = 'sdxl_lightning_8step_lora.safetensors:1,sora_v2-000010.safetensors:0.7'
while (-not (Select-String -Path "$dir\pack-run2.log" -Pattern '^== DONE' -Quiet)) { Start-Sleep 30 }
function Draw($plan, $group, $loras, $per) {
  if (Test-Path "$dir\STOP") { return }
  "== $plan -> $group per $per start $(Get-Date -Format HH:mm:ss)" | Add-Content $log
  for ($try = 1; $try -le 3; $try++) {
    cmd.exe /c "node node_modules\tsx\dist\cli.mjs tools\comfy-run.ts --plan $plan --out $dir\out\$group --comfy http://127.0.0.1:18188 --all --per $per --seed 1000 --loras $loras --inflight 3 >> $log 2>&1"
    if ($LASTEXITCODE -eq 0) { break }
    Start-Sleep 120
  }
  "== end $(Get-Date -Format HH:mm:ss) files: $((Get-ChildItem "$dir\out\$group" -Filter *.png).Count)" | Add-Content $log
}
Draw "$dir\figtest\scenes2.json" 'none' $BASE 12
Draw "$dir\passes\femdomA.json" 'femdom' "$BASE,tc_femdom-1000.safetensors:0.6" 24
Draw "$dir\figtest\femdomB2.json" 'femdom' "$BASE,tc_femdom.safetensors:0.4" 24
$index = Get-Content "$dir\passes\index.json" -Raw | ConvertFrom-Json
foreach ($g in 'sixtynine', 'groups', 'xray', 'hisclose') {
  foreach ($it in ($index | Where-Object { $_.group -eq $g })) { Draw $it.file $g "$BASE,$($it.lora).safetensors:0.4" 8 }
}
"== DONE $(Get-Date -Format HH:mm:ss)" | Add-Content $log
