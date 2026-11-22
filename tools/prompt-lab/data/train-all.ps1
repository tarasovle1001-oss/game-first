# day 22.11: all five concept LoRAs on a fresh box, one after another. After each: copied into ComfyUI on the box AND pulled to this PC
# (tools\prompt-lab\data\loras), so a lost box does not lose a finished LoRA. Logs: data\lora-train-<name>.log, overall data\train-all.log
Set-Location C:\Users\stk01\Documents\game-first
$log = 'tools\prompt-lab\data\train-all.log'
New-Item -ItemType Directory -Force tools\prompt-lab\data\loras | Out-Null
while (-not ((Get-Content .vast-box.json -Raw) -match '"step": "(ready|push)"')) { Start-Sleep 20 }
"== setup $(Get-Date -Format HH:mm:ss)" | Add-Content $log
cmd.exe /c "node tools\vast-box.mjs sh tools\prompt-lab\lora-setup.sh --timeout 3600 > tools\prompt-lab\data\lora-setup.log 2>&1"
"== setup exit $LASTEXITCODE $(Get-Date -Format HH:mm:ss)" | Add-Content $log
$sets = @(@('his_close', 'tc_hisclose', '1500'), @('fd_behind', 'tc_femdom', '1500'), @('groups', 'tc_groups', '1500'), @('xray', 'tc_xray', '1500'), @('sixty_nine', 'tc_sixtynine', '800'))
foreach ($r in $sets) { cmd.exe /c "node tools\vast-box.mjs pushdir tools\prompt-lab\data\synth\_dataset\$($r[0]) $($r[1]) >> $log 2>&1" }
foreach ($r in $sets) {
  $n = $r[1]
  "== $n start $(Get-Date -Format HH:mm:ss)" | Add-Content $log
  cmd.exe /c "node tools\vast-box.mjs sh tools\prompt-lab\lora-train.sh $n --max_train_steps $($r[2]) --timeout 7200 > tools\prompt-lab\data\lora-train-$n.log 2>&1"
  "== $n exit $LASTEXITCODE $(Get-Date -Format HH:mm:ss)" | Add-Content $log
  cmd.exe /c "node tools\vast-box.mjs sh tools\prompt-lab\lora-install.sh $n >> $log 2>&1"
  cmd.exe /c "node tools\vast-box.mjs pull /workspace/tr/out/$n/$n.safetensors tools\prompt-lab\data\loras\$n.safetensors >> $log 2>&1"
  "== $n pulled: $(Test-Path tools\prompt-lab\data\loras\$n.safetensors) $(Get-Date -Format HH:mm:ss)" | Add-Content $log
}
"== DONE $(Get-Date -Format HH:mm:ss)" | Add-Content $log
