#!/bin/bash
# Once per box: kohya sd-scripts in its own venv under /workspace/tr (ComfyUI's environment is not touched). Log: /workspace/tr/setup.log
set -eo pipefail
T=/workspace/tr
mkdir -p $T && cd $T
nvidia-smi --query-gpu=name,memory.used,memory.total --format=csv,noheader
ls -la /workspace/ComfyUI/models/checkpoints/ /workspace/ComfyUI/models/loras/ | grep -i safetensors || true
[ -d sd-scripts ] || git clone --depth 1 https://github.com/kohya-ss/sd-scripts.git
[ -d sdenv ] || python3 -m venv sdenv
sdenv/bin/pip install -q --upgrade pip
sdenv/bin/pip install -q torch torchvision --index-url https://download.pytorch.org/whl/cu128
cd sd-scripts
../sdenv/bin/pip install -q -r requirements.txt
../sdenv/bin/pip install -q bitsandbytes
../sdenv/bin/python -c "import torch,bitsandbytes;print('torch',torch.__version__,'cuda',torch.cuda.is_available(),torch.cuda.get_device_name(0))"
ls sdxl_train_network.py && echo SETUP_OK
