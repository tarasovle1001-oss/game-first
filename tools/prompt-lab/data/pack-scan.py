# night 22.11 06:45: safety and defect sweep of the pack with the WD tagger (CPU). Reads every png under data/pack/out, writes nothing there.
#   python pack-scan.py   -> data/pack/scan.json {"group/file.png": {tag: prob}} for the watched tags (prob >= 0.12). Resumable.
import csv, glob, json, os, sys
import torch  # loads the CUDA / cuDNN DLLs, so onnxruntime can use the local GPU
import numpy as np
import onnxruntime as ort
from PIL import Image

root = os.path.join('tools', 'prompt-lab', 'data', 'pack')
out, dst = os.path.join(root, 'out'), os.path.join(root, 'scan.json')
WATCH = {'loli', 'child', 'shota', 'female child', 'male child', 'petite', 'flat chest', 'aged down', 'oppai loli', 'toddler', 'child on child', 'kindergarten uniform',
         'school uniform', 'serafuku', 'randoseru', 'short stature', '1girl', '2girls', '1boy', '2boys', 'multiple boys', '3boys', 'solo', 'futanari', 'dark-skinned female'}
hits = glob.glob(os.path.join(os.path.expanduser('~'), 'Documents', 'disc', 'dataset_prep', 'models', 'wd', '**', 'model.onnx'), recursive=True)
if not hits: sys.exit('no WD tagger model')
mdir = os.path.dirname(hits[0])
tags = list(csv.DictReader(open(os.path.join(mdir, 'selected_tags.csv'), encoding='utf-8')))
idx = [(i, t['name'].replace('_', ' ')) for i, t in enumerate(tags) if t['name'].replace('_', ' ') in WATCH]
print('watched tags found:', ', '.join(n for _, n in idx), flush=True)
so = ort.SessionOptions(); so.intra_op_num_threads = 12
sess = ort.InferenceSession(os.path.join(mdir, 'model.onnx'), so, providers=['CUDAExecutionProvider', 'CPUExecutionProvider'])
inp = sess.get_inputs()[0]; size = inp.shape[1]
res = json.load(open(dst, encoding='utf-8')) if os.path.exists(dst) else {}
files = sorted(glob.glob(os.path.join(out, '*', '*.png')))
todo = [f for f in files if os.path.relpath(f, out).replace('\\', '/') not in res]
print(len(files), 'files,', len(todo), 'to scan', flush=True)
for n, f in enumerate(todo):
    try:
        im = Image.open(f).convert('RGB')
    except Exception:
        continue
    side = max(im.size)
    sq = Image.new('RGB', (side, side), (255, 255, 255)); sq.paste(im, ((side - im.width) // 2, (side - im.height) // 2))
    x = np.asarray(sq.resize((size, size), Image.BICUBIC), dtype=np.float32)[:, :, ::-1]
    p = sess.run(None, {inp.name: np.ascontiguousarray(x)[None]})[0][0]
    res[os.path.relpath(f, out).replace('\\', '/')] = {name: round(float(p[i]), 3) for i, name in idx if p[i] >= 0.12}
    if n % 100 == 0:
        json.dump(res, open(dst + '.tmp', 'w', encoding='utf-8')); os.replace(dst + '.tmp', dst); print(n, len(todo), flush=True)
json.dump(res, open(dst + '.tmp', 'w', encoding='utf-8')); os.replace(dst + '.tmp', dst)
print('done', len(res), flush=True)


