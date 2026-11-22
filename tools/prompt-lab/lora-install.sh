#!/bin/bash
# Copies the trained concept LoRAs of a run into ComfyUI on the box: bash lora-install.sh <name>
R=${1:?run name}
ls -la /workspace/tr/out/$R/ 2>/dev/null
cp /workspace/tr/out/$R/*.safetensors /workspace/ComfyUI/models/loras/ && echo INSTALLED
nvidia-smi --query-gpu=memory.used,memory.total --format=csv,noheader
curl -s -m 5 http://127.0.0.1:18999/system_stats | head -c 200; echo
