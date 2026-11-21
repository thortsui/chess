# 狼人殺迷你發言模型：訓練
# python train/ww/mini/train.py <資料夾（prep.js 的輸出：train.u16、train.idx、meta.json）> <輸出資料夾> [d=384] [L=8] [epochs=8] [每批最多幾筆=128] [lr=1e-3]
# 每筆是 <bos> 提示 <sep> 發言＋投票 <eos>。提示部分也算 loss（權重 0.3）——提示裡有別人的發言，等於多了幾倍的文字可以學語言；
# 回答部分權重 1。長度相近的放同一批。
import sys, os, json, math, random, time, numpy as np, torch, torch.nn.functional as F
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from model import Mini
src, outdir = sys.argv[1], sys.argv[2]
a = sys.argv[3:]; D = int(a[0]) if len(a) > 0 else 384; L = int(a[1]) if len(a) > 1 else 8
EPOCHS = float(a[2]) if len(a) > 2 else 8; BS = int(a[3]) if len(a) > 3 else 128; LR = float(a[4]) if len(a) > 4 else 1e-3
DROP = float(os.environ.get('WW_DROP', 0.05)); PW = 0.3; CTX = 512; SEP = 2
os.makedirs(outdir, exist_ok=True); torch.manual_seed(0); random.seed(0); np.random.seed(0)
meta = json.load(open(f'{src}/meta.json', encoding='utf8')); V = meta['V']
ids = np.fromfile(f'{src}/train.u16', dtype=np.uint16); idx = np.fromfile(f'{src}/train.idx', dtype=np.uint32).astype(np.int64)
N = len(idx) - 1; lens = np.diff(idx)
print(f'樣本 {N}，token {len(ids)}，平均長度 {lens.mean():.0f}，最長 {lens.max()}，詞表 {V}', flush=True)
T_ids = torch.from_numpy(ids.astype(np.int64))
dev = os.environ.get('WW_DEV', 'cuda'); model = Mini(V, D, L, CTX, DROP).to(dev)
if os.environ.get('WW_THREADS'): torch.set_num_threads(int(os.environ['WW_THREADS']))
# WW_INIT=<ckpt.pt>：從現有模型接著訓練（自我對弈微調用，train/ww/mini/selfplay.js）；寬、層數要和原模型一樣
if os.environ.get('WW_INIT'): model.load_state_dict(torch.load(os.environ['WW_INIT'], map_location=dev)['sd']); print('從', os.environ['WW_INIT'], '接著訓練', flush=True)
print('參數量', sum(p.numel() for p in model.parameters()), flush=True)
isdec = lambda n, p: p.dim() == 2 and 'emb' not in n and 'pos' not in n
dec = [p for n, p in model.named_parameters() if isdec(n, p)]; nod = [p for n, p in model.named_parameters() if not isdec(n, p)]
opt = torch.optim.AdamW([{'params': dec, 'weight_decay': 0.05}, {'params': nod, 'weight_decay': 0.0}], lr=LR, betas=(0.9, 0.98))
TOKB = int(os.environ.get('WW_TOKB', 16000))   # 每批最多幾個 token（含補白）：顯示卡記憶體一爆就會慢 10 倍以上，8GB 用 16000 很安全
def batches():
    order = np.random.permutation(N); bs = []
    for i in range(0, N, BS * 100):
        c = order[i:i + BS * 100]; c = c[np.argsort(lens[c], kind='stable')]; j = 0
        while j < len(c):       # 長度相近的放一批；一批最多 BS 筆，而且 筆數×最長長度 不超過 TOKB
            k = j + 1
            while k < len(c) and k - j < BS and (k - j + 1) * lens[c[k]] <= TOKB: k += 1
            bs.append(c[j:k]); j = k
    random.shuffle(bs); return bs
per = len(batches()); steps = math.ceil(per * EPOCHS); warm = max(1, min(2000, steps // 20)) if not os.environ.get('WW_INIT') else max(1, steps // 50)
print(f'每輪約 {per} 步，共 {steps} 步', flush=True)
sched = torch.optim.lr_scheduler.LambdaLR(opt, lambda s: min(1, (s + 1) / warm) * (0.02 + 0.98 * 0.5 * (1 + math.cos(math.pi * min(1, s / steps)))))
def make(b):
    Lm = int(lens[b].max()); x = torch.zeros((len(b), Lm), dtype=torch.long)
    for j, i in enumerate(b): x[j, :lens[i]] = T_ids[idx[i]:idx[i + 1]]
    return x.to(dev, non_blocking=True)
step = 0; t0 = time.time(); model.train(); ema = None; ema_o = None
while step < steps:
    for b in batches():
        if step >= steps: break
        x = make(b)
        with torch.autocast('cuda' if dev.startswith('cuda') else 'cpu', dtype=torch.bfloat16, enabled=dev.startswith('cuda')):   # CPU 上 bf16 慢 60 倍，用 fp32
            logits = model(x[:, :-1])
        tgt = x[:, 1:]; l = F.cross_entropy(logits.float().reshape(-1, V), tgt.reshape(-1), reduction='none', ignore_index=0).view(tgt.shape)
        after = (x[:, :-1] == SEP).cumsum(1) > 0            # <sep> 之後（回答）的位置
        w = torch.where(after, 1.0, PW) * (tgt != 0)
        loss = (l * w).sum() / w.sum()
        lo = (l * after).sum() / (after & (tgt != 0)).sum()
        opt.zero_grad(set_to_none=True); loss.backward(); torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0); opt.step(); sched.step(); step += 1
        ema = loss.item() if ema is None else 0.98 * ema + 0.02 * loss.item(); ema_o = lo.item() if ema_o is None else 0.98 * ema_o + 0.02 * lo.item()
        if step % 200 == 0 or step == 1:
            print(f'step {step}/{steps} loss {ema:.3f} 回答 {ema_o:.3f} lr {sched.get_last_lr()[0]:.2e} {time.time() - t0:.0f}s', flush=True)
        if step % 5000 == 0: torch.save({'cfg': model.cfg, 'sd': model.state_dict()}, f'{outdir}/ckpt.pt')
torch.save({'cfg': model.cfg, 'sd': model.state_dict()}, f'{outdir}/ckpt.pt')
# 保留集的回答 loss
if os.path.exists(f'{src}/held.u16'):
    hi = np.fromfile(f'{src}/held.u16', dtype=np.uint16); hx = np.fromfile(f'{src}/held.idx', dtype=np.uint32).astype(np.int64); model.eval(); tot = 0.0; cnt = 0
    with torch.no_grad():
        for i in range(min(len(hx) - 1, 3000)):
            x = torch.from_numpy(hi[hx[i]:hx[i + 1]].astype(np.int64))[None].to(dev)
            lg = model(x[:, :-1]).float(); tg = x[:, 1:]; af = (x[:, :-1] == SEP).cumsum(1) > 0
            l = F.cross_entropy(lg.reshape(-1, V), tg.reshape(-1), reduction='none').view(tg.shape); tot += (l * af).sum().item(); cnt += af.sum().item()
    print(f'保留集回答 loss {tot / cnt:.3f}（每 token）', flush=True)
print('完成', outdir, f'{time.time() - t0:.0f}s', flush=True)
