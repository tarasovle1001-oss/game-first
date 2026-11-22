# night 22.11: draws the pack pass after pass, group after group (one LoRA switch per group). Resumable: comfy-run skips files that exist.
# A group whose LoRA is not trained yet is put off and retried before every later group. Log: data\pack\pack-run.log; stop: create data\pack\STOP
Set-Location C:\Users\stk01\Documents\game-first
$dir = 'tools\prompt-lab\data\pack'
$log = "$dir\pack-run.log"
$BASE = 'sdxl_lightning_8step_lora.safetensors:1,sora_v2-000010.safetensors:0.7'
$pushed = @{}
function Draw($it) {
  $loras = $BASE
  if ($it.lora) {
    $f = "tools\prompt-lab\data\loras\$($it.lora).safetensors"
    if (-not (Test-Path $f)) { return $false }
    if (-not $pushed[$it.lora]) { cmd.exe /c "node tools\vast-box.mjs push $f >> $log 2>&1"; $pushed[$it.lora] = $true }
    $loras = "$BASE,$($it.lora).safetensors:$($it.weight)"
  }
  $out = "$dir\out\$($it.group)"
  "== pass $($it.pass) $($it.group) $($it.rows) keys start $(Get-Date -Format HH:mm:ss)" | Add-Content $log
  for ($try = 1; $try -le 4; $try++) {
    cmd.exe /c "node node_modules\tsx\dist\cli.mjs tools\comfy-run.ts --plan $($it.file) --out $out --comfy http://127.0.0.1:18188 --all --per 2 --seed 1000 --loras $loras --inflight 3 >> $log 2>&1"
    if ($LASTEXITCODE -eq 0) { break }
    "   try $try failed ($LASTEXITCODE), waiting 2 min $(Get-Date -Format HH:mm:ss)" | Add-Content $log
    $pushed = @{}; Start-Sleep 120
  }
  "== pass $($it.pass) $($it.group) end $(Get-Date -Format HH:mm:ss) files: $((Get-ChildItem $out -Filter *.png -ErrorAction SilentlyContinue).Count)" | Add-Content $log
  return $true
}
$index = Get-Content "$dir\passes\index.json" -Raw | ConvertFrom-Json
$later = New-Object System.Collections.ArrayList
foreach ($it in $index) {
  if (Test-Path "$dir\STOP") { "== STOP file $(Get-Date -Format HH:mm:ss)" | Add-Content $log; break }
  foreach ($old in @($later)) { if (Draw $old) { $later.Remove($old) } }
  if (-not (Draw $it)) { [void]$later.Add($it); "   put off: pass $($it.pass) $($it.group) (no LoRA yet)" | Add-Content $log }
}
while ($later.Count -and -not (Test-Path "$dir\STOP")) { foreach ($old in @($later)) { if (Draw $old) { $later.Remove($old) } }; if ($later.Count) { Start-Sleep 300 } }
"== DONE $(Get-Date -Format HH:mm:ss)" | Add-Content $log
