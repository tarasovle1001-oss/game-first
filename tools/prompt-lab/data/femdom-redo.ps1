# night 22.11 05:05: redraws the femdom keys of the pack with the LoRA file chosen by the control (see femdom-split.mjs), 6 frames per key.
Set-Location C:\Users\stk01\Documents\game-first
$dir = 'tools\prompt-lab\data\pack'
$log = "$dir\femdom-redo.log"
$BASE = 'sdxl_lightning_8step_lora.safetensors:1,sora_v2-000010.safetensors:0.7'
cmd.exe /c "node tools\vast-box.mjs pull /workspace/tr/out/tc_femdom/tc_femdom-step00001000.safetensors tools\prompt-lab\data\loras\tc_femdom-1000.safetensors >> $log 2>&1"
foreach ($j in @(@('femdomA', 'tc_femdom-1000.safetensors:0.6'), @('femdomB', 'tc_femdom.safetensors:0.4'))) {
  "== $($j[0]) start $(Get-Date -Format HH:mm:ss)" | Add-Content $log
  cmd.exe /c "node node_modules\tsx\dist\cli.mjs tools\comfy-run.ts --plan $dir\passes\$($j[0]).json --out $dir\out\femdom --comfy http://127.0.0.1:18188 --all --per 6 --seed 5000 --loras $BASE,$($j[1]) --inflight 2 >> $log 2>&1"
  "== $($j[0]) exit $LASTEXITCODE $(Get-Date -Format HH:mm:ss)" | Add-Content $log
}
"== DONE $(Get-Date -Format HH:mm:ss)" | Add-Content $log
