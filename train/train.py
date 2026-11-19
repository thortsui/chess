"""訓練共用下棋網路（8 種棋一份權重）。結構必須和 ai/brain.js 的推論一模一樣。

用法（DGX 的 PyTorch 容器裡）：
  python train/train.py --data data --out ai --steps 60000 [--C 32 --B 6]
  python train/train.py --export-only ckpt.pt --out ai      # 只把 checkpoint 匯出成 model.bin/json
"""
import argparse, glob, json, math, os, struct, time
import numpy as np
import torch, torch.nn as nn, torch.nn.functional as F

NC, QD, NK, NG, NB = 40, 16, 8, 10, 36
ORDER = ['xq', 'qf', 'jw', 'dk', 'ch', 'gm', 'go', 'bg']


class Block(nn.Module):
    def __init__(s, C):
        super().__init__()
        s.c1 = nn.Conv2d(C, C, 3, padding=1, bias=False); s.n1 = nn.BatchNorm2d(C)
        s.c2 = nn.Conv2d(C, C, 3, padding=1, bias=False); s.n2 = nn.BatchNorm2d(C)

    def forward(s, x):
        y = F.relu(s.n1(s.c1(x)))
        return F.relu(s.n2(s.c2(y)) + x)


class Net(nn.Module):
    def __init__(s, C=32, B=6, FC=32):
        super().__init__()
        s.C, s.B, s.FC = C, B, FC
        s.stem = nn.Conv2d(NC, C, 3, padding=1, bias=False); s.sn = nn.BatchNorm2d(C)
        s.blocks = nn.ModuleList([Block(C) for _ in range(B)])
        s.hq = nn.Conv2d(C, QD, 1); s.hk = nn.Conv2d(C, QD, 1); s.hp = nn.Conv2d(C, 1, 1)
        s.fc1 = nn.Linear(C, FC); s.fc2 = nn.Linear(FC, NG)

    def forward(s, x):
        a = F.relu(s.sn(s.stem(x)))
        for b in s.blocks:
            a = b(a)
        Bt = x.shape[0]
        Q = s.hq(a).flatten(2); K = s.hk(a).flatten(2); P = s.hp(a).flatten(1)
        m = x[:, 24:25]
        g = (a * m).sum((2, 3)) / m.sum((2, 3)).clamp(min=1)
        o = s.fc2(F.relu(s.fc1(g)))
        return Q, K, P, o


def move_logits(Q, K, P, o, keys):
    """keys: (B,M,4) int64 [type,a,b,k]，type -1 = 補位。回傳 (B,M) 分數（補位為 -1e4）。和 brain.js 的 moveLogit 一樣。"""
    typ, a, b, k = keys.unbind(-1)
    ac, bc, kc = a.clamp(min=0), b.clamp(min=0), k.clamp(min=0)
    Qf = torch.gather(Q, 2, ac.unsqueeze(1).expand(-1, QD, -1))
    Kt = torch.gather(K, 2, bc.unsqueeze(1).expand(-1, QD, -1))
    mv = (Qf * Kt).sum(1) * 0.25
    pl = torch.gather(P, 1, ac)
    kind = o[:, 2:]
    kb = torch.where(k >= 0, torch.gather(kind, 1, kc), torch.zeros_like(mv))
    s = torch.where(typ == 0, mv + kb, torch.where(typ == 1, pl + kb, o[:, 1:2].expand_as(mv)))
    return s.masked_fill(typ < 0, -1e4)


# ---------- 資料 ----------
MMAX = {'xq': 128, 'qf': 160, 'jw': 256, 'dk': 64, 'ch': 256, 'gm': 225, 'go': 82, 'bg': 1100}
CAP = {'bg': 60000}


def parse_records(buf, p, H, W, ver):
    """從 bytes 讀出一筆筆紀錄：(bits, aux, keys, best, z, tv, pi 或 None)"""
    HW = H * W; bitb = (NB * HW + 7) // 8; auxb = 4 * HW
    while p + 16 <= len(buf):
        tot, n, lab = struct.unpack_from('<IHH', buf, p); z, tv = struct.unpack_from('<ff', buf, p + 8)
        if tot < 16 or p + tot > len(buf):
            break
        q = p + 16
        bits = np.frombuffer(buf, np.uint8, bitb, q); q += bitb
        aux = np.frombuffer(buf, np.uint8, auxb, q); q += auxb
        ks = np.frombuffer(buf, np.int16, n * 4, q).reshape(n, 4); q += n * 8
        pi = np.frombuffer(buf, np.uint16, n, q).astype(np.float32) / 65535.0 if ver >= 2 else None
        yield bits, aux, ks, lab, z, tv, pi
        p += tot


def read_file(fn):
    buf = open(fn, 'rb').read()
    if len(buf) < 16 or buf[:4] != b'CHAI':
        return None, []
    ver, gi, H, W = struct.unpack_from('<HHHH', buf, 4)
    return ORDER[gi], list(parse_records(buf, 16, H, W, ver))


class Replay:
    """一種棋的環形資料緩衝區（新資料蓋掉最舊的）"""
    def __init__(s, g, H, W, cap=None):
        s.g, s.H, s.W = g, H, W; HW = H * W
        s.cap = cap or CAP.get(g, 400000); s.M = MMAX[g]
        s.bits = np.zeros((s.cap, (NB * HW + 7) // 8), np.uint8); s.aux = np.zeros((s.cap, 4 * HW), np.uint8)
        s.keys = np.full((s.cap, s.M, 4), -1, np.int16); s.pi = np.zeros((s.cap, s.M), np.float16)
        s.best = np.zeros(s.cap, np.int64); s.val = np.zeros(s.cap, np.float32)
        s.n = 0; s.pos = 0; s.added = 0

    def add(s, recs):
        for bits, aux, ks, lab, z, tv, pi in recs:
            m = ks.shape[0]
            # 壞資料（索引超出棋盤、種類格超出 8 格、標籤超出走法數）會讓 GPU 的 gather 直接當掉整個訓練，這裡先擋掉並計數
            if m > s.M or m == 0 or lab >= m or ks[:, 0].min() < 0 or ks[:, 0].max() > 2 or ks[:, 1:3].max() >= s.H * s.W or ks[:, 3].max() >= 8 or ks[:, 1:].min() < -1:
                s.bad = getattr(s, 'bad', 0) + (m <= s.M); continue
            i = s.pos
            s.bits[i] = bits; s.aux[i] = aux; s.keys[i] = -1; s.keys[i, :m] = ks
            s.pi[i] = 0
            if pi is None:
                s.pi[i, lab] = 1
            else:
                t = pi.sum(); s.pi[i, :m] = pi / t if t > 0 else 1.0 / m
            s.best[i] = lab
            s.val[i] = 0.7 * z + 0.3 * tv if tv > -2 else z
            s.pos = (i + 1) % s.cap; s.n = min(s.n + 1, s.cap); s.added += 1

    def batch(s, idx, dev):
        HW = s.H * s.W
        bits = np.unpackbits(s.bits[idx], axis=1, bitorder='little')[:, :NB * HW].astype(np.float32)
        aux = s.aux[idx].astype(np.float32) / 255.0
        x = np.concatenate([bits, aux], 1).reshape(len(idx), NC, s.H, s.W)
        ks = s.keys[idx]; m = max(1, int((ks[:, :, 0] >= 0).sum(1).max()))
        t = lambda a: torch.from_numpy(a).to(dev)
        return t(x), t(ks[:, :m].astype(np.int64)), t(s.pi[idx, :m].astype(np.float32)), t(s.best[idx]), t(s.val[idx])


def train_step(net, opt, rb, bs, dev, sched=None):
    """一步訓練：走法用搜尋機率（或老師走法）當目標的交叉熵，價值用勝負的均方差"""
    bs = bs if rb.H * rb.W <= 400 else max(16, bs * 400 // (rb.H * rb.W))
    idx = np.random.randint(0, rb.n, bs)
    x, ks, pi, best, val = rb.batch(idx, dev)
    net.train(); Q, K, P, o = net(x)
    lg = move_logits(Q, K, P, o, ks)
    lp = -(pi * F.log_softmax(lg, 1)).sum(1).mean(); lv = F.mse_loss(torch.tanh(o[:, 0]), val)
    loss = lp + lv
    opt.zero_grad(); loss.backward(); nn.utils.clip_grad_norm_(net.parameters(), 2.0); opt.step()
    if sched:
        sched.step()
    return lp.item(), lv.item(), (lg.argmax(1) == best).float().mean().item()


def export(net, out):
    """BN 併進卷積，寫成 brain.js 讀的 model.bin / model.json。"""
    net = net.eval().cpu()
    parts, tens, off = [], {}, 0

    def put(name, t):
        nonlocal off
        a = t.detach().float().contiguous().numpy().ravel()
        tens[name] = [off, int(a.size)]; parts.append(a); off += a.size

    def fuse(conv, bn):
        sc = bn.weight / torch.sqrt(bn.running_var + bn.eps)
        return conv.weight * sc[:, None, None, None], bn.bias - bn.running_mean * sc
    w, b = fuse(net.stem, net.sn); put('stem.w', w); put('stem.b', b)
    for i, blk in enumerate(net.blocks):
        w, b = fuse(blk.c1, blk.n1); put(f'b{i}.w1', w); put(f'b{i}.b1', b)
        w, b = fuse(blk.c2, blk.n2); put(f'b{i}.w2', w); put(f'b{i}.b2', b)
    for n in ['hq', 'hk', 'hp']:
        m = getattr(net, n); put(n + '.w', m.weight); put(n + '.b', m.bias)
    put('fc1.w', net.fc1.weight); put('fc1.b', net.fc1.bias); put('fc2.w', net.fc2.weight); put('fc2.b', net.fc2.bias)
    os.makedirs(out, exist_ok=True)
    np.concatenate(parts).astype('<f4').tofile(os.path.join(out, 'model.bin'))
    # 對照用測試向量：brain.js 讀同一個輸入要算出一樣的值（ai/test/net_check.js）
    g = torch.Generator().manual_seed(1); H, W = 10, 9
    x = (torch.rand(1, NC, H, W, generator=g) > 0.8).float(); x[:, 24] = 1
    with torch.no_grad():
        Q, K, P, o = net(x)
    meta = {'C': net.C, 'B': net.B, 'NC': NC, 'QD': QD, 'FC': net.FC, 'tensors': tens, 'version': int(time.time()),
            'test': {'H': H, 'W': W, 'x': x.flatten().tolist(), 'value': math.tanh(float(o[0, 0])), 'pass': float(o[0, 1]),
                     'P': P[0, :8].tolist(), 'Q0': Q[0, 0, :8].tolist()}}
    json.dump(meta, open(os.path.join(out, 'model.json'), 'w'))
    print('匯出', out, f'{off} 個參數 ({off * 4 / 1e6:.2f} MB)')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--data', default='data'); ap.add_argument('--out', default='ai')
    ap.add_argument('--steps', type=int, default=60000); ap.add_argument('--bs', type=int, default=256)
    ap.add_argument('--C', type=int, default=32); ap.add_argument('--B', type=int, default=6); ap.add_argument('--FC', type=int, default=32)
    ap.add_argument('--lr', type=float, default=2e-3); ap.add_argument('--resume', default=None); ap.add_argument('--export-only', default=None)
    a = ap.parse_args()
    dev = 'cuda' if torch.cuda.is_available() else 'cpu'
    if a.export_only:
        ck = torch.load(a.export_only, map_location='cpu'); net = Net(ck['C'], ck['B'], ck['FC']); net.load_state_dict(ck['sd']); export(net, a.out); return
    data = {}
    for g in ORDER:
        for fn in sorted(glob.glob(os.path.join(a.data, g, '*.bin'))):
            gg, recs = read_file(fn)
            if not recs:
                continue
            if gg not in data:
                bits = recs[0][0].size; HW = None
                H, W = struct.unpack_from('<HH', open(fn, 'rb').read(12), 8)
                data[gg] = Replay(gg, H, W, cap=max(CAP.get(gg, 400000), 1))
            data[gg].add(recs)
    for g, d in data.items():
        print(f'{g}: {d.n} 筆, 棋盤 {d.H}x{d.W}', flush=True)
    names = list(data)
    wts = np.array([math.sqrt(data[g].n) for g in names]); wts /= wts.sum()
    net = Net(a.C, a.B, a.FC).to(dev)
    if a.resume:
        net.load_state_dict(torch.load(a.resume, map_location=dev)['sd'])
    opt = torch.optim.AdamW(net.parameters(), lr=a.lr, weight_decay=1e-4)
    sched = torch.optim.lr_scheduler.OneCycleLR(opt, max_lr=a.lr, total_steps=a.steps, pct_start=0.05)
    rng = np.random.default_rng(1); t0 = time.time(); run = {}
    os.makedirs(a.out, exist_ok=True)
    for step in range(1, a.steps + 1):
        g = names[rng.choice(len(names), p=wts)]
        lp, lv, acc = train_step(net, opt, data[g], a.bs, dev, sched)
        r = run.setdefault(g, [0, 0, 0, 0]); r[0] += lp; r[1] += lv; r[2] += acc; r[3] += 1
        if step % 1000 == 0 or step == a.steps:
            print(f'[{step}/{a.steps}] {time.time() - t0:.0f}s ' + ' | '.join(f'{g} p{r[0]/r[3]:.2f} v{r[1]/r[3]:.3f} 準{r[2]/r[3]:.0%}' for g, r in run.items()), flush=True)
            run = {}
            torch.save({'sd': net.state_dict(), 'C': a.C, 'B': a.B, 'FC': a.FC}, os.path.join(a.out, 'ckpt.pt'))
    export(net, a.out)


if __name__ == '__main__':
    main()
