#!/bin/bash
# Concept LoRA for one scene family of the game, SDXL (WAI Illustrious v17), on the rented box (RTX 5090, 32 GB).
# Usage on the box:  bash lora-train.sh <name> [extra sd-scripts args]
#   dataset:  /workspace/tr/data/<name>/*.png + *.txt   (captions from tools/prompt-lab/wd-tag.py: trigger first, then tags)
#   result:   /workspace/tr/out/<name>/<name>-step00000500.safetensors ... and <name>.safetensors (last)
# Recipe (first pilot, not tuned yet): rank 16 / alpha 8, U-Net only, lr 1e-4 cosine, AdamW8bit, batch 4 at 1024 with buckets,
# 1500 steps, a file every 500 steps. The Sora style LoRA is merged into the base at 0.7 for the training run (--base_weights),
# because the game always draws with it: the concept LoRA then learns only what Sora + WAI cannot do, not the style.
# The Lightning LoRA is NOT merged: it only changes the sampling, the training runs on ordinary noise prediction.
# Do not start without Alexey's "да": it occupies the box for about an hour (estimate, never measured).
set -eo pipefail
R=${1:?name of the run = folder in /workspace/tr/data}; shift
T=/workspace/tr
WAI=/workspace/ComfyUI/models/checkpoints/waiIllustriousSDXL_v170.safetensors
SORA=/workspace/ComfyUI/models/loras/sora_v2-000010.safetensors
STEPS=${STEPS:-1500}; EVERY=${EVERY:-500}; DIM=${DIM:-16}; ALPHA=${ALPHA:-8}; LR=${LR:-1e-4}; BATCH=${BATCH:-2}
[ -f "$WAI" ] || { echo "no checkpoint $WAI"; exit 1; }
[ -f "$SORA" ] || { echo "no Sora LoRA $SORA"; exit 1; }
N=$(ls $T/data/$R/*.png 2>/dev/null | wc -l); [ "$N" -gt 0 ] || { echo "no pictures in $T/data/$R"; exit 1; }
M=$(ls $T/data/$R/*.txt 2>/dev/null | grep -v '\.prompt\.txt$' | wc -l)
[ "$M" -ge "$N" ] || { echo "captions: $M for $N pictures"; exit 1; }

# sd-scripts once, in its own venv (ComfyUI's environment is not touched)
if [ ! -d $T/sd-scripts ]; then
  mkdir -p $T && cd $T
  git clone --depth 1 https://github.com/kohya-ss/sd-scripts.git
  python3 -m venv $T/sdenv
  $T/sdenv/bin/pip install -q --upgrade pip
  $T/sdenv/bin/pip install -q torch torchvision --index-url https://download.pytorch.org/whl/cu128
  cd sd-scripts && $T/sdenv/bin/pip install -q -r requirements.txt && $T/sdenv/bin/pip install -q bitsandbytes
fi

mkdir -p $T/out/$R $T/logs
cat > $T/$R.toml <<EOF
[general]
shuffle_caption = true
keep_tokens = 1
caption_extension = ".txt"
enable_bucket = true
bucket_no_upscale = true
bucket_reso_steps = 64
min_bucket_reso = 512
max_bucket_reso = 1536

[[datasets]]
resolution = 1024
batch_size = $BATCH

  [[datasets.subsets]]
  image_dir = "$T/data/$R"
  num_repeats = 1
EOF

cd $T/sd-scripts
echo "== $(date) start $R: $N pictures, $STEPS steps, batch $BATCH, rank $DIM/$ALPHA, lr $LR"
$T/sdenv/bin/accelerate launch --num_cpu_threads_per_process 8 --mixed_precision bf16 sdxl_train_network.py \
  --pretrained_model_name_or_path "$WAI" \
  --base_weights "$SORA" --base_weights_multiplier 0.7 \
  --dataset_config $T/$R.toml --output_dir $T/out/$R --output_name $R --save_model_as safetensors \
  --network_module networks.lora --network_dim $DIM --network_alpha $ALPHA --network_train_unet_only \
  --optimizer_type AdamW8bit --learning_rate $LR --lr_scheduler cosine --lr_warmup_steps 100 \
  --max_train_steps $STEPS --save_every_n_steps $EVERY \
  --mixed_precision bf16 --save_precision fp16 --no_half_vae \
  --cache_latents --cache_latents_to_disk --gradient_checkpointing \
  --seed 42 --max_data_loader_n_workers 4 --persistent_data_loader_workers \
  --logging_dir $T/logs/tb_$R "$@" 2>&1 | tee $T/logs/$R.log
