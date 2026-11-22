# Control sheet of a synth round: rows of consecutive frames. python ctl-sheet.py <round dir> <first index> <rows> <cols> <out.jpg> [h] [row labels...]
import os, sys
from PIL import Image, ImageDraw
d, first, rows, cols, out = sys.argv[1], int(sys.argv[2]), int(sys.argv[3]), int(sys.argv[4]), sys.argv[5]
h = int(sys.argv[6]) if len(sys.argv) > 6 else 230
labels = sys.argv[7:]
cells = []
for i in range(first, first + rows * cols):
    f = os.path.join(d, f'{i}.png')
    cells.append(Image.open(f).convert('RGB') if os.path.exists(f) else None)
w = max((int(c.width * h / c.height) for c in cells if c), default=h)
sheet = Image.new('RGB', (cols * (w + 3) + 70, rows * (h + 3)), (20, 20, 20))
dr = ImageDraw.Draw(sheet)
for n, c in enumerate(cells):
    r, k = divmod(n, cols)
    if k == 0: dr.text((4, r * (h + 3) + h // 2), labels[r] if r < len(labels) else str(r), fill=(255, 230, 0))
    if c: sheet.paste(c.resize((int(c.width * h / c.height), h)), (70 + k * (w + 3), r * (h + 3)))
sheet.save(out, quality=85)
print(out)
