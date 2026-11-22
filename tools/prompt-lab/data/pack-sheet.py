# Contact sheet of pack frames: python pack-sheet.py <folder> <out.jpg> [--match text] [--cols 8] [--rows 5] [--h 260] [--skip 0] [--step 1]
import glob, os, sys
from PIL import Image, ImageDraw
a = sys.argv[1:]
folder, out = a[0], a[1]
opt = lambda n, d: (a[a.index('--' + n) + 1] if '--' + n in a else d)
cols, rows, h, skip, step = int(opt('cols', 8)), int(opt('rows', 5)), int(opt('h', 260)), int(opt('skip', 0)), int(opt('step', 1))
match = opt('match', '')
files = sorted(f for f in glob.glob(os.path.join(folder, '*.png')) if match in os.path.basename(f))[skip::step][:cols * rows]
if not files: sys.exit('no files')
ims = []
for f in files:
    im = Image.open(f).convert('RGB')
    ims.append((im.resize((int(im.width * h / im.height), h)), os.path.basename(f)))
w = max(i.width for i, _ in ims)
sheet = Image.new('RGB', (cols * (w + 4), rows * (h + 20)), (20, 20, 20))
d = ImageDraw.Draw(sheet)
for n, (im, name) in enumerate(ims):
    x, y = (n % cols) * (w + 4), (n // cols) * (h + 20)
    sheet.paste(im, (x, y + 16))
    d.text((x + 2, y + 2), name.replace('__', ' ')[:int(w / 6.2)], fill=(255, 230, 0))
sheet.save(out, quality=85)
print(out, len(ims))
