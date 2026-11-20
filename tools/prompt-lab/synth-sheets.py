# Contact sheets of a synthetic round, for Claude's first pass: every drawn frame of a target, with its number.
#   [--h 300 --cols 8 --rows 4 --targets a,b]
#   C:\ComfyUI\.venv\Scripts\python.exe tools\prompt-lab\synth-sheets.py <concept> <round> [--first N] [--data tools\prompt-lab\data]
# Writes <data>/synth/_sheets/<concept>_k<round>_<target>_<nn>.jpg (40 frames a sheet: 8 x 5, 240 px tall).
import json, os, sys
from PIL import Image, ImageDraw, ImageFont
a = sys.argv[1:]
data = a[a.index("--data") + 1] if "--data" in a else os.path.join("tools", "prompt-lab", "data")
first = int(a[a.index("--first") + 1]) if "--first" in a else 0
concept, rnd = a[0], a[1]
base = os.path.join(data, "synth", concept)
out = os.path.join(data, "synth", "_sheets"); os.makedirs(out, exist_ok=True)
r = json.load(open(os.path.join(base, f"k{rnd}.json"), encoding="utf-8"))
try: font = ImageFont.truetype("arialbd.ttf", 20)
except Exception: font = ImageFont.load_default()
H = int(a[a.index("--h") + 1]) if "--h" in a else 240
COLS = int(a[a.index("--cols") + 1]) if "--cols" in a else 8
ROWS = int(a[a.index("--rows") + 1]) if "--rows" in a else 5
only = a[a.index("--targets") + 1].split(",") if "--targets" in a else None
by = {}
for f in r["frames"]:
    p = os.path.join(base, f"k{rnd}", f"{f['i']}.png")
    if os.path.exists(p): by.setdefault(f["target"], []).append((f["i"], p))
made = []
for t, fr in by.items():
    if only and t not in only: continue
    if first: fr = fr[:first]
    for s in range(0, len(fr), COLS * ROWS):
        part = fr[s:s + COLS * ROWS]
        ims = []
        for i, p in part:
            im = Image.open(p).convert("RGB"); im = im.resize((int(im.width * H / im.height), H))
            d = ImageDraw.Draw(im); d.rectangle((0, 0, 58, 24), fill=(0, 0, 0)); d.text((3, 1), str(i), fill=(255, 255, 0), font=font)
            ims.append(im)
        w = max(i.width for i in ims)
        sheet = Image.new("RGB", (COLS * (w + 3), ((len(ims) + COLS - 1) // COLS) * (H + 3)), (24, 24, 26))
        for n, im in enumerate(ims): sheet.paste(im, ((n % COLS) * (w + 3), (n // COLS) * (H + 3)))
        name = f"{concept}_k{rnd}_{t}_{s // (COLS * ROWS):02d}.jpg"
        sheet.save(os.path.join(out, name), quality=78); made.append(name)
print("\n".join(made))
