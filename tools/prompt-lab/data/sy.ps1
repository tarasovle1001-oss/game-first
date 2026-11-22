# helpers for the night iteration (dot-source: . tools\prompt-lab\data\sy.ps1)
$L = 'http://127.0.0.1:8195'
$H = @{ 'content-type' = 'application/json' }
function Post($u, $o) { (Invoke-WebRequest -UseBasicParsing "$L$u" -Method Post -Headers $H -Body ($o | ConvertTo-Json -Compress -Depth 6) -TimeoutSec 60).Content }
function Round($c, $mode, $targets, $scale = 1, $soft = $false, $redraw = $null) { $o = @{ concept = $c; mode = $mode; targets = $targets; scale = $scale; soft = $soft }; if ($redraw) { $o.redraw = $redraw }; "$c $mode [$($targets -join ',')] -> " + (Post '/api/synth/round' $o) }
function Screen($c, $k, $from, $to, $keep) { "$c k$k [$from..$to] -> " + (Post '/api/synth/mark' @{ concept = $c; round = $k; survivors = @($keep); range = @($from, $to) }) }
function Beat { Set-Content C:\Users\stk01\Documents\game-first\tools\prompt-lab\data\heartbeat (Get-Date); Get-Content C:\Users\stk01\Documents\game-first\tools\prompt-lab\data\night-run.log -Tail 1 }
function Sheets($c, $k, $t) { $a = @('tools\prompt-lab\synth-sheets.py', $c, $k, '--h', '220', '--cols', '8', '--rows', '6'); if ($t) { $a += @('--targets', $t) }; & C:\ComfyUI\.venv\Scripts\python.exe @a }
function Stats($c, $t) { $a = @('tools\prompt-lab\synth-stats.mjs', $c, '--soft'); if ($t) { $a += @('--targets', $t) }; node @a }
