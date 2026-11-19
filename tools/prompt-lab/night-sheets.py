# Contact sheets of a night run, so the pictures can be looked at a key at a time (one JPEG per key: a row per variant).
#   C:\ComfyUI\.venv\Scripts\python.exe tools\prompt-lab\night-sheets.py [tools\prompt-lab\night]
# Writes <data>/_sheets/<key>.jpg and, for the many small keys (portraits, close-ups of an act), packs of 6 keys.
import json, os, sys
from PIL import Image, ImageDraw, ImageFont
DATA = sys.argv[1] if len(sys.argv) > 1 else os.path.join("tools", "prompt-lab", "night")
OUT = os.path.join(DATA, "_sheets"); os.makedirs(OUT, exist_ok=True)
H = 300; LAB = 230
try: font = ImageFont.truetype("arial.ttf", 18)
except Exception: font = ImageFont.load_default()
def thumb(k, f):
    p = os.path.join(DATA, k, f) if f else None
    if not p or not os.path.exists(p): return Image.new("RGB", (int(H * 0.7), H), (60, 20, 20))
    im = Image.open(p).convert("RGB"); return im.resize((int(im.width * H / im.height), H))
def rows_of(k):
    st = json.load(open(os.path.join(DATA, k, "state.json"), encoding="utf-8"))
    return [(f"{k}\n{t.get('label','')}", [thumb(k, f) for f in t["files"]]) for t in st["takes"]]
def sheet(name, rows):
    w = LAB + max(sum(i.width + 4 for i in imgs) for _, imgs in rows)
    s = Image.new("RGB", (w, len(rows) * (H + 6)), (24, 24, 26)); d = ImageDraw.Draw(s)
    for r, (label, imgs) in enumerate(rows):
        y = r * (H + 6); d.multiline_text((6, y + 6), label.replace(" ", "\n", 2), fill=(230, 230, 230), font=font)
        x = LAB
        for i in imgs: s.paste(i, (x, y)); x += i.width + 4
    s.save(os.path.join(OUT, name), quality=80); return name
keys = sorted(k for k in os.listdir(DATA) if os.path.exists(os.path.join(DATA, k, "state.json")))
small = [k for k in keys if k.startswith(("portrait_", "insert_"))]
made = [sheet(f"{k}.jpg", rows_of(k)) for k in keys if k not in small]
for i in range(0, len(small), 6): made.append(sheet(f"pack_{i // 6:02d}.jpg", [r for k in small[i:i + 6] for r in rows_of(k)]))
print(len(made), "sheets in", OUT)
