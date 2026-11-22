#!/bin/bash
# Puts the intermediate checkpoints of a run (every 500 steps) into ComfyUI as <name>-500 / <name>-1000: bash lora-steps.sh <name>
R=${1:?run name}
for s in 500 1000; do
  f=/workspace/tr/out/$R/$R-step0000$(printf '%04d' $s).safetensors
  [ -f "$f" ] && cp "$f" /workspace/ComfyUI/models/loras/$R-$s.safetensors && echo "ok $R-$s"
done
ls /workspace/tr/out/$R/
