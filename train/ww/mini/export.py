# 狼人殺迷你發言模型：把訓練好的權重轉成網頁用的檔案（model.json＋model.bin）
# python train/ww/mini/export.py <訓練輸出資料夾（有 ckpt.pt）> <vocab.json> <輸出資料夾（例如 ai/ww/tiny）> [測試用的 token 檔 held.u16 所在資料夾]
# 矩陣用 int8 存，每一列一個縮放值（float32）；RMSNorm 的增益用 float32。檔案前段全是 float32、後段全是 int8（ai/ww/mini.js 的 Net 照這個順序讀）。
# model.json 另外附一筆測試：一串 token 和 PyTorch（用量化後的權重）算出的最後一個位置的 logits，給 ai/test/ww_mini_check.js 比對 JS 推論。
import sys, os, json, numpy as np, torch
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from model import Mini
run, vocab, out = sys.argv[1:4]; src = sys.argv[4] if len(sys.argv) > 4 else None
ck = torch.load(f'{run}/ckpt.pt', map_location='cpu'); cfg = ck['cfg']; sd = {k: v.float() for k, v in ck['sd'].items()}
tokens = json.load(open(vocab, encoding='utf8')); assert len(tokens) == cfg['V'], (len(tokens), cfg['V'])
names = [('emb', 'emb.weight', 1), ('pos', 'pos.weight', 1)]
for l in range(cfg['L']):
    names += [(f'b{l}.n1', f'blocks.{l}.n1.g', 0), (f'b{l}.qkv', f'blocks.{l}.qkv.weight', 1), (f'b{l}.proj', f'blocks.{l}.proj.weight', 1),
              (f'b{l}.n2', f'blocks.{l}.n2.g', 0), (f'b{l}.fc1', f'blocks.{l}.fc1.weight', 1), (f'b{l}.fc2', f'blocks.{l}.fc2.weight', 1)]
names.append(('nf', 'nf.g', 0))
fl = []; q8 = []; tens = []; sdq = dict(sd)
for n, key, q in names:
    w = sd[key]
    if q:
        s = (w.abs().amax(1) / 127).clamp_min(1e-12); qi = torch.round(w / s[:, None]).clamp(-127, 127)
        fl.append(s.numpy().astype('<f4')); q8.append(qi.numpy().astype(np.int8)); sdq[key] = qi * s[:, None]
        tens.append({'n': n, 'r': w.shape[0], 'c': w.shape[1], 'q': 1})
    else:
        fl.append(w.numpy().astype('<f4')); tens.append({'n': n, 'r': 1, 'c': w.shape[0], 'q': 0})
os.makedirs(out, exist_ok=True)
with open(f'{out}/model.bin', 'wb') as f:
    for a in fl: f.write(a.tobytes())
    for a in q8: f.write(a.tobytes())
# 測試向量（量化後的權重）
m = Mini(cfg['V'], cfg['d'], cfg['L'], cfg['ctx'], 0.0); m.load_state_dict(sdq); m.eval()
if src and os.path.exists(f'{src}/held.u16'):
    hi = np.fromfile(f'{src}/held.u16', dtype=np.uint16); hx = np.fromfile(f'{src}/held.idx', dtype=np.uint32)
    ids = hi[hx[0]:hx[1]].astype(np.int64).tolist()[:-1]
else:
    g = torch.Generator().manual_seed(0); ids = [1] + torch.randint(5, cfg['V'], (60,), generator=g).tolist() + [2]
with torch.no_grad(): lg = m(torch.tensor([ids]))[0, -1]
top = lg.topk(8)
meta = {'v': 1, 'cfg': cfg, 'bytes': os.path.getsize(f'{out}/model.bin'), 'tensors': tens, 'tokens': tokens,
        'test': {'ids': ids, 'top': top.indices.tolist(), 'topv': [round(float(x), 5) for x in top.values], 'head': [round(float(x), 5) for x in lg[:64]]}}
json.dump(meta, open(f'{out}/model.json', 'w', encoding='utf8'), ensure_ascii=False, separators=(',', ':'))
torch.save({'cfg': cfg, 'sd': sdq}, f'{run}/ckpt_q8.pt')
err = max(float((sdq[k] - sd[k]).abs().max()) for _, k, q in names if q)
print(f'參數量 {sum(v.numel() for v in sd.values())}，model.bin {os.path.getsize(out + "/model.bin") / 1e6:.2f} MB，model.json {os.path.getsize(out + "/model.json") / 1e3:.0f} KB，量化最大誤差 {err:.4f}')
