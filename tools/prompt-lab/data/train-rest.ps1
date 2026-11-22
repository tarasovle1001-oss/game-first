# day 22.11: the other four concept LoRAs, one after another, after the pilot. Logs: data\lora-train-<name>.log, overall data\train-rest.log
Set-Location C:\Users\stk01\Documents\game-first
$log = 'tools\prompt-lab\data\train-rest.log'
# wait until the pilot run has left the GPU
while (Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -like '*lora-train.sh tc_hisclose*' }) { Start-Sleep 20 }
foreach ($r in @(@('tc_femdom', '1500'), @('tc_groups', '1500'), @('tc_xray', '1500'), @('tc_sixtynine', '800'))) {
  "== $($r[0]) start $(Get-Date -Format HH:mm:ss)" | Add-Content $log
  cmd.exe /c "node tools\vast-box.mjs sh tools\prompt-lab\lora-train.sh $($r[0]) --max_train_steps $($r[1]) --timeout 7200 > tools\prompt-lab\data\lora-train-$($r[0]).log 2>&1"
  "== $($r[0]) exit $LASTEXITCODE $(Get-Date -Format HH:mm:ss)" | Add-Content $log
}
"== DONE $(Get-Date -Format HH:mm:ss)" | Add-Content $log
