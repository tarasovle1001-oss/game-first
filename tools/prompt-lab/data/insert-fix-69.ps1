# waits for insert-fix.ps1, then redraws the insert_patron_sixty_nine frames: all old ones moved out (most had a second figure), drawn without the LoRA.
Set-Location C:\Users\stk01\Documents\game-first
$dir = 'tools\prompt-lab\data\pack'
$log = "$dir\insert-fix.log"
while (-not (Select-String -Path $log -Pattern '^== DONE' -Quiet)) { Start-Sleep 30 }
New-Item -ItemType Directory -Force "$dir\old\insert_extra_person" | Out-Null
Get-ChildItem "$dir\out\sixtynine" -Filter insert_patron_*.png | % { Move-Item $_.FullName "$dir\old\insert_extra_person\sixtynine__$($_.Name)" -Force }
cmd.exe /c "node node_modules\tsx\dist\cli.mjs tools\comfy-run.ts --plan $dir\figtest\insert_fix_69.json --out $dir\out\sixtynine --comfy http://127.0.0.1:18188 --all --per 2 --seed 1000 --loras sdxl_lightning_8step_lora.safetensors:1,sora_v2-000010.safetensors:0.7 --inflight 2 >> $log 2>&1"
"== DONE-69 exit $LASTEXITCODE $(Get-Date -Format HH:mm:ss)" | Add-Content $log
