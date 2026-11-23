# 狼人殺迷你發言模型：不做傳統訓練（沒有反向傳播、沒有 optimizer），直接改權重，用測試決定留不留。
# python train/ww/mini/edit.py <ckpt.pt> <資料夾（prep.js 的輸出 train.u16／train.idx）> <輸出資料夾> [分鐘=120]
#
# 改的是「倍率」：每一個 RMSNorm 增益、每一個矩陣的每一列，各有一個倍率（一開始都是 1，共約 3.5 萬個）。
# 每一步：
#   1. 隨機挑一個方向，把倍率往正、反兩邊各推一點（一次試 POP 組方向），直接改好權重；
#   2. 測試：拿一批「好的發言」（大模型老師寫的＋自我對弈裡又通順又有幫助的），看改完的模型有多容易講出這些話（回答部分的平均 loss，越低越好）；
#   3. 把「讓測試變好」的方向合起來當成這一步要改的方向，試幾種步長，在另一批資料上真的變好才留，不然丟掉。
# 另外留一份完全不拿來挑方向的驗證資料：每 EVAL 步看一次，驗證變差就退回上一次最好的權重。
# 輸出：<輸出資料夾>/ckpt.pt（倍率已經乘進權重，格式和 train.py 的一樣，可以直接給 export.py）、edit.log。
import sys, os, json, math, time, hashlib, numpy as np, torch, torch.nn.functional as F
from torch.func import functional_call
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from model import Mini
ckp, src, out = sys.argv[1:4]; MIN = float(sys.argv[4]) if len(sys.argv) > 4 else 120
dev = os.environ.get('WW_DEV', 'cuda' if torch.cuda.is_available() else 'cpu'); SEP = 2
POP = int(os.environ.get('WW_POP', 24)); SIG = float(os.environ.get('WW_SIG', 0.01)); BS = int(os.environ.get('WW_BS', 96)); EVAL = int(os.environ.get('WW_EVAL', 25))
os.makedirs(out, exist_ok=True); torch.manual_seed(0); np.random.seed(0)
logf = open(f'{out}/edit.log', 'a', encoding='utf8')
def log(*a):
    s = ' '.join(str(x) for x in a); print(s, flush=True); logf.write(s + '\n'); logf.flush()
ck = torch.load(ckp, map_location=dev); cfg = ck['cfg']; base = {k: v.float().to(dev) for k, v in ck['sd'].items()}
model = Mini(cfg['V'], cfg['d'], cfg['L'], cfg['ctx'], 0.0).to(dev).eval(); V = cfg['V']
# ---- 資料：去掉一模一樣的，依內容雜湊切 85% 挑方向用／15% 驗證用 ----
ids = np.fromfile(f'{src}/train.u16', dtype=np.uint16); idx = np.fromfile(f'{src}/train.idx', dtype=np.uint32).astype(np.int64)
seen = set(); fit = []; val = []
for i in range(len(idx) - 1):
    b = ids[idx[i]:idx[i + 1]]; a = b.tolist(); k = a.index(SEP) if SEP in a else 0
    h = hashlib.md5(b.tobytes()).digest()
    if h in seen: continue
    seen.add(h)
    (val if hashlib.md5(np.asarray(a[k:], dtype=np.uint16).tobytes()).digest()[0] < 38 else fit).append(i)   # 依「回答」切：同一段回答不會兩邊都有
T_ids = torch.from_numpy(ids.astype(np.int64))
def make(b):
    Lm = max(int(idx[i + 1] - idx[i]) for i in b); x = torch.zeros((len(b), Lm), dtype=torch.long)
    for j, i in enumerate(b): x[j, :idx[i + 1] - idx[i]] = T_ids[idx[i]:idx[i + 1]]
    return x.to(dev)
def batches(lst, bs):   # 長度相近的放一批（少補白）
    lst = sorted(lst, key=lambda i: idx[i + 1] - idx[i]); return [make(lst[j:j + bs]) for j in range(0, len(lst), bs)]
rng = np.random.default_rng(0)
VAL = batches(val[:3000], 128); FITB = batches(fit, BS); order = rng.permutation(len(FITB))
log(f'資料：挑方向用 {len(fit)} 筆（{len(FITB)} 批）、驗證用 {len(val)} 筆；裝置 {dev}；POP {POP} SIG {SIG} BS {BS}')
# ---- 倍率參數：增益逐元素、矩陣逐列 ----
keys = [k for k in base]; sizes = [base[k].shape[0] for k in keys]; offs = np.cumsum([0] + sizes); DIM = int(offs[-1])
def apply(theta):
    sd = {}
    for j, k in enumerate(keys):
        m = torch.exp(theta[offs[j]:offs[j + 1]]); sd[k] = base[k] * (m[:, None] if base[k].dim() == 2 else m)
    return sd
@torch.no_grad()
def loss_of(theta, xs):
    sd = apply(theta); tot = 0.0; cnt = 0
    for x in xs:
        with torch.autocast('cuda', dtype=torch.bfloat16, enabled=dev.startswith('cuda')):
            lg = functional_call(model, sd, (x[:, :-1],))
        tg = x[:, 1:]; af = ((x[:, :-1] == SEP).cumsum(1) > 0) & (tg != 0)
        l = F.cross_entropy(lg.float().reshape(-1, V), tg.reshape(-1), reduction='none').view(tg.shape)
        tot += (l * af).sum().item(); cnt += af.sum().item()
    return tot / cnt
theta = torch.zeros(DIM, device=dev)
if os.path.exists(f'{out}/theta.pt'): theta = torch.load(f'{out}/theta.pt', map_location=dev); log('接著上次的倍率做')
v0 = loss_of(torch.zeros(DIM, device=dev), VAL); best_v = loss_of(theta, VAL); best = theta.clone()
log(f'原本的模型：驗證 loss {v0:.4f}；目前 {best_v:.4f}（共 {DIM} 個倍率）')
def save(th):
    sd = {k: v.cpu() for k, v in apply(th).items()}; torch.save({'cfg': cfg, 'sd': sd}, f'{out}/ckpt.pt'); torch.save(th, f'{out}/theta.pt')
t0 = time.time(); step = 0; kept = 0; mom = torch.zeros(DIM, device=dev); bi = 0; NB = int(os.environ.get('WW_NB', 5))
# 三個階段（各佔 1/3 時間）：1. 每個張量一個總倍率（51 個，最容易找到方向） 2. 增益逐元素（5 千多個） 3. 全部（3.5 萬個）
gmask = torch.zeros(DIM, device=dev); tid = torch.zeros(DIM, dtype=torch.long, device=dev)
for j, k in enumerate(keys):
    tid[offs[j]:offs[j + 1]] = j
    if base[k].dim() == 1: gmask[offs[j]:offs[j + 1]] = 1
def direction(stage):
    if stage == 0: return torch.randn(len(keys), device=dev)[tid]
    e = torch.randn(DIM, device=dev); return e * gmask if stage == 1 else e
def take(n):
    global bi
    xs = [FITB[order[(bi + j) % len(FITB)]] for j in range(n)]; bi += n; return xs
last = -1
while time.time() - t0 < MIN * 60:
    step += 1; stage = min(2, int((time.time() - t0) / (MIN * 20)))
    if stage != last: mom.zero_(); last = stage; log(f'階段 {stage + 1}：' + ['每個張量一個總倍率', '增益逐元素', '全部倍率'][stage])
    xa = take(NB); xb = take(NB); sig = SIG * (3 if stage == 0 else 1)
    g = torch.zeros(DIM, device=dev)
    for _ in range(POP):   # 正反兩邊各試一次（同一批資料），差多少就代表這個方向有沒有用
        e = direction(stage); d = loss_of(theta + sig * e, xa) - loss_of(theta - sig * e, xa); g += d * e
    g = g / (2 * sig * POP); mom = 0.7 * mom + g; u = mom / (mom.norm() + 1e-12) * math.sqrt(DIM)   # 每個倍率平均動 lr 這麼多
    # 步長：在另一批資料上試幾種，真的變好才留
    l0 = loss_of(theta, xb); cand = None
    for lr in (0.01, 0.005, 0.002):
        l1 = loss_of(theta - lr * u, xb)
        if l1 < l0 - 2e-4: cand = (lr, l1); break
    if cand: theta = theta - cand[0] * u; kept += 1
    else: mom = mom * 0.3
    if step % EVAL == 0:
        v = loss_of(theta, VAL)
        if v < best_v: best_v = v; best = theta.clone(); save(best); tag = '（留下）'
        else: theta = best.clone(); mom.zero_(); tag = '（驗證沒有變好，退回）'
        log(f'第 {step} 步，{(time.time() - t0) / 60:.0f} 分：驗證 loss {v:.4f}{tag}，最好 {best_v:.4f}（原本 {v0:.4f}），這段留下 {kept}/{EVAL} 步，倍率平均偏離 {best.abs().mean().item():.4f}')
        kept = 0
save(best); log(f'完成：驗證 loss {v0:.4f} → {best_v:.4f}，共 {step} 步，{(time.time() - t0) / 60:.0f} 分')
