@echo off
rem Night run on a rented RTX 5090 (see tools\night-run.mjs): rent, draw tools\prompt-lab\night-plan.json, destroy the box.
rem Ceiling $5 (change with --budget). Progress: this window, tools\prompt-lab\night\status.json, http://127.0.0.1:8196
rem Keep this window open; the PC must not sleep (the script keeps it awake, a closed laptop lid may still put it to sleep).
cd /d "%~dp0"
node tools\night-run.mjs --budget 5 %*
pause
