# day 22.11: WD tagger over the five concept datasets, one after another; progress in data\tag-all.log
Set-Location C:\Users\stk01\Documents\game-first
$py = 'C:\ComfyUI\.venv\Scripts\python.exe'
$tr = @{ his_close = 'tc_hisclose'; fd_behind = 'tc_femdom'; xray = 'tc_xray'; groups = 'tc_groups'; sixty_nine = 'tc_sixtynine' }
foreach ($c in 'his_close', 'fd_behind', 'xray', 'groups', 'sixty_nine') {
  "== $c $(Get-Date -Format HH:mm:ss)" | Add-Content tools\prompt-lab\data\tag-all.log
  & $py tools\prompt-lab\wd-tag.py "tools\prompt-lab\data\synth\_dataset\$c" $tr[$c] 2>&1 | Add-Content tools\prompt-lab\data\tag-all.log
}
"== DONE $(Get-Date -Format HH:mm:ss)" | Add-Content tools\prompt-lab\data\tag-all.log
