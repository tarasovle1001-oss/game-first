# night 22.11 05:00: tc_groups, tc_xray, tc_sixtynine failed at 04:22 with CUDA out of memory (two ComfyUI copies were drawing the pack).
# Again with batch 2 (lora-train.sh default), retried up to 3 times each. After each: into ComfyUI (final + 500 / 1000 checkpoints) and pulled to this PC.
Set-Location C:\Users\stk01\Documents\game-first
$log = 'tools\prompt-lab\data\train-all.log'
foreach ($r in @(@('tc_groups', '1500'), @('tc_xray', '1500'), @('tc_sixtynine', '1000'))) {
  $n = $r[0]
  for ($try = 1; $try -le 3; $try++) {
    "== $n start (batch 2, try $try) $(Get-Date -Format HH:mm:ss)" | Add-Content $log
    cmd.exe /c "node tools\vast-box.mjs sh tools\prompt-lab\lora-train.sh $n --max_train_steps $($r[1]) --timeout 7200 > tools\prompt-lab\data\lora-train-$n.log 2>&1"
    "== $n exit $LASTEXITCODE $(Get-Date -Format HH:mm:ss)" | Add-Content $log
    if ($LASTEXITCODE -eq 0) { break }
    Start-Sleep 60
  }
  cmd.exe /c "node tools\vast-box.mjs sh tools\prompt-lab\lora-install.sh $n >> $log 2>&1"
  cmd.exe /c "node tools\vast-box.mjs sh tools\prompt-lab\lora-steps.sh $n >> $log 2>&1"
  cmd.exe /c "node tools\vast-box.mjs pull /workspace/tr/out/$n/$n.safetensors tools\prompt-lab\data\loras\$n.safetensors >> $log 2>&1"
  "== $n pulled: $(Test-Path tools\prompt-lab\data\loras\$n.safetensors) $(Get-Date -Format HH:mm:ss)" | Add-Content $log
}
"== DONE2 $(Get-Date -Format HH:mm:ss)" | Add-Content $log
