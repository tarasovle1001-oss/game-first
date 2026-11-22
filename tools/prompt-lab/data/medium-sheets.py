# contact sheets of the last labelled takes of given keys: one row per take (label on the left), 4 pictures
#   python tools/prompt-lab/data/medium-sheets.py <prefix> [--takes 2] [--h 300] [--per 5] key1 key2 ...  -> data/_msheets/<prefix>_NN.jpg
import json, os, sys
from PIL import Image, ImageDraw
a = sys.argv[1:]
prefix = a.pop(0)
def opt(n, d):
    if n in a:
        i = a.index(n); v = a[i + 1]; del a[i:i + 2]; return int(v)
    return d
T, H, PER = opt('--takes', 2), opt('--h', 300), opt('--per', 5)
data = os.path.join('tools', 'prompt-lab', 'data')
out = os.path.join(data, '_msheets'); os.makedirs(out, exist_ok=True)
rows = []
for key in a:
    s = json.load(open(os.path.join(data, key, 'state.json'), encoding='utf-8'))
    for t in s['takes'][-T:]:
        files = [os.path.join(data, key, f) if f and not os.path.isabs(f) else f for f in t.get('files', [])]
        rows.append((key, t.get('label') or '', t.get('id', ''), files))
W = H
for n in range(0, len(rows), PER * T):
    part = rows[n:n + PER * T]
    sheet = Image.new('RGB', (4 * W, len(part) * H), (20, 20, 20))
    d = ImageDraw.Draw(sheet)
    for r, (key, label, tid, files) in enumerate(part):
        for c, f in enumerate(files[:4]):
            if f and os.path.exists(f):
                im = Image.open(f).convert('RGB'); im.thumbnail((W, H)); sheet.paste(im, (c * W, r * H))
        d.rectangle([0, r * H, 250, r * H + 20], fill=(0, 0, 0))
        d.text((4, r * H + 4), f'{key} {label[:2]} [{r}]', fill=(255, 255, 0))
    p = os.path.join(out, f'{prefix}_{n // (PER * T):02d}.jpg'); sheet.save(p, quality=80); print(p)
    print(' | '.join(f'[{r}] {k} {l}' for r, (k, l, _, _) in enumerate(part)))
