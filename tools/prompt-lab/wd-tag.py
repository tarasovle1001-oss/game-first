# Captions from the pictures themselves (WD tagger), not from the prompt that asked for them: a prompt says "small penis", the picture may not.
#   python tools/prompt-lab/wd-tag.py <dataset folder> <trigger> [--t 0.35] [--model <dir with model.onnx and selected_tags.csv>]
# Writes <name>.txt next to every png (the prompt caption is kept as <name>.prompt.txt) and _tags.tsv with tag frequencies.
import csv, glob, os, sys
from collections import Counter
import numpy as np
import onnxruntime as ort
from PIL import Image

a = sys.argv[1:]
folder, trigger = a[0], a[1]
T = float(a[a.index('--t') + 1]) if '--t' in a else 0.35
root = a[a.index('--model') + 1] if '--model' in a else None
if not root:
    hits = glob.glob(os.path.join(os.path.expanduser('~'), 'Documents', 'disc', 'dataset_prep', 'models', 'wd', '**', 'model.onnx'), recursive=True)
    if not hits: sys.exit('no WD tagger model found: pass --model')
    root = os.path.dirname(hits[0])
tags = list(csv.DictReader(open(os.path.join(root, 'selected_tags.csv'), encoding='utf-8')))
sess = ort.InferenceSession(os.path.join(root, 'model.onnx'), providers=['CPUExecutionProvider'])
inp = sess.get_inputs()[0]
size = inp.shape[1]
# what a concept LoRA must not learn as part of the concept: the drawing style, quality words, the tagger's meta
SKIP = {'realistic', 'uncensored', 'censored', 'simple background', 'grey background', 'white background', 'blurry', 'blurry background', 'indoors', 'no humans'}
freq = Counter()
files = sorted(glob.glob(os.path.join(folder, '*.png')))
for n, f in enumerate(files):
    im = Image.open(f).convert('RGB')
    side = max(im.size)
    sq = Image.new('RGB', (side, side), (255, 255, 255))
    sq.paste(im, ((side - im.width) // 2, (side - im.height) // 2))
    x = np.asarray(sq.resize((size, size), Image.BICUBIC), dtype=np.float32)[:, :, ::-1]
    p = sess.run(None, {inp.name: np.ascontiguousarray(x)[None]})[0][0]
    got = [(tags[i]['name'].replace('_', ' '), float(p[i])) for i in range(len(tags)) if tags[i]['category'] == '0' and p[i] >= T]
    got = [t for t, _ in sorted(got, key=lambda z: -z[1]) if t not in SKIP]
    freq.update(got)
    txt = f[:-4] + '.txt'
    if os.path.exists(txt) and not os.path.exists(f[:-4] + '.prompt.txt'): os.replace(txt, f[:-4] + '.prompt.txt')
    open(txt, 'w', encoding='utf-8').write(', '.join([trigger] + got) + '\n')
    if n % 20 == 0: print(n, len(files), flush=True)
with open(os.path.join(folder, '_tags.tsv'), 'w', encoding='utf-8') as o:
    for t, c in freq.most_common(): o.write(f'{c}\t{t}\n')
print('done', len(files), 'pictures,', len(freq), 'tags')
