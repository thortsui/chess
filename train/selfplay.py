"""自我對弈訓練主控（AlphaZero 式）：Node 行程負責規則與 MCTS，這裡用 GPU 幫它們估值，並且邊下邊訓練。

DGX（訓練＋自我對弈）：
  python train/selfplay.py --mode train --ckpt runs/ckpt.pt --out runs
筆電（只自我對弈，定時從 DGX 抓最新權重、把下完的棋局傳回 DGX）：
  python train/selfplay.py --mode worker --remote dgx:projects/chess-ai/repo/runs --out runs_laptop

棋局存在 <out>/games/<game>/*.bin（v2 格式，走法目標是搜尋後的機率分布）。
DGX 也會讀 <out>/inbox/ 裡筆電傳來的棋局。
"""
import argparse, glob, os, queue, shutil, struct, subprocess, sys, threading, time
import numpy as np
import torch
import torch.nn.functional as F

sys.path.insert(0, os.path.dirname(__file__))
from train import Net, move_logits, Replay, parse_records, train_step, export, ORDER, NC  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def fetch(src, dst):
    """複製檔案：有冒號就用 scp（另一台機器），沒有就是同一台機器直接複製"""
    if ':' in src.split('/')[0] and not os.path.isabs(src):
        return subprocess.run(['scp', '-q', src, dst]).returncode == 0
    try:
        shutil.copyfile(src, dst); return True
    except OSError:
        return False
SIMS = {'bg': 48, 'go': 160, 'gm': 128}        # 每步模擬次數（其餘 128）
CONC = {'bg': 16, 'gm': 48}                    # 每個行程同時下幾局（其餘 64）


def read_exact(f, n):
    buf = bytearray()
    while len(buf) < n:
        c = f.read(n - len(buf))
        if not c:
            return None
        buf += c
    return bytes(buf)


def read_frame(f):
    h = read_exact(f, 4)
    if h is None:
        return None, None
    body = read_exact(f, struct.unpack('<I', h)[0])
    if body is None:
        return None, None
    return body[0], body[1:]


class Worker:
    def __init__(s, game, seed, node, logdir):
        s.game = game
        os.makedirs(logdir, exist_ok=True); s.err = open(os.path.join(logdir, f'{game}_{seed}.err'), 'ab')
        s.p = subprocess.Popen([node, '--max-old-space-size=' + (os.environ.get('NODE_MEM_BG', '1536') if game == 'bg' else os.environ.get('NODE_MEM', '512')), os.path.join(ROOT, 'train', 'selfplay.js'), game, str(int(CONC.get(game, 64) * float(os.environ.get('CONC_MULT', '1')))), str(SIMS.get(game, 128)), str(seed)],
                               stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=s.err, cwd=ROOT, bufsize=0)
        s.q = queue.Queue()
        threading.Thread(target=s._reader, daemon=True).start()

    def _reader(s):
        while True:
            t, b = read_frame(s.p.stdout)
            if t is None:
                s.q.put((None, None)); return
            s.q.put((t, b))

    def reply(s, payload):
        try:
            s.p.stdin.write(struct.pack('<I', len(payload)) + payload); s.p.stdin.flush()
        except OSError:
            pass   # 行程已經結束，讀取執行緒會回報


def parse_req(body):
    n, H, W, M = struct.unpack_from('<HHHH', body, 0); HW = H * W; p = 8
    x = np.frombuffer(body, np.uint8, n * NC * HW, p).reshape(n, NC, H, W); p += n * NC * HW
    k = np.frombuffer(body, np.int16, n * M * 4, p).reshape(n, M, 4)
    return n, H, W, M, x, k


@torch.no_grad()
def evaluate_many(net, dev, reqs):
    """reqs：同一種棋的多個請求 [(worker, body)]，合併成一批送 GPU，再拆開回覆各自的行程"""
    parsed = [parse_req(b) for _, b in reqs]
    tot = sum(p[0] for p in parsed)
    if tot == 0:
        for w, _ in reqs:
            w.reply(b'')
        return 0
    H, W = parsed[0][1], parsed[0][2]; M = max(p[3] for p in parsed)
    x = np.concatenate([p[4] for p in parsed if p[0]]); keys = np.full((tot, M, 4), -1, np.int16); o = 0
    for p in parsed:
        if p[0]:
            keys[o:o + p[0], :p[3]] = p[5]; o += p[0]
    xt = torch.from_numpy(x).to(dev, non_blocking=True).float().div_(255.0)
    net.eval()
    with torch.autocast('cuda', dtype=torch.bfloat16, enabled=dev == 'cuda'):
        Q, K, P, oo = net(xt)
    lg = move_logits(Q.float(), K.float(), P.float(), oo.float(), torch.from_numpy(keys).to(dev).long())
    pri = F.softmax(lg, 1).cpu().numpy().astype('<f4'); val = torch.tanh(oo[:, 0].float()).cpu().numpy().astype('<f4')
    o = 0
    for (w, _), p in zip(reqs, parsed):
        n, m = p[0], p[3]
        w.reply(val[o:o + n].tobytes() + np.ascontiguousarray(pri[o:o + n, :m]).tobytes()); o += n
    return tot


def save_game(out_dir, body, counter):
    gi, H, W, _ = struct.unpack_from('<HHHH', body, 0); g = ORDER[gi]
    d = os.path.join(out_dir, 'games', g); os.makedirs(d, exist_ok=True)
    fn = os.path.join(d, f'{os.getpid()}_{counter // 200:05d}.bin')
    new = not os.path.exists(fn)
    with open(fn, 'ab') as f:
        if new:
            f.write(b'CHAI' + struct.pack('<HHHHHH', 2, gi, H, W, 0, 0))
        f.write(body[8:])
    return g, H, W, list(parse_records(body, 8, H, W, 2))


def load_ckpt(net, path, dev):
    ck = torch.load(path, map_location=dev); net.load_state_dict(ck['sd'])


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--mode', choices=['train', 'worker'], default='train')
    ap.add_argument('--games', default=','.join(ORDER))
    ap.add_argument('--procs', type=int, default=16, help='Node 行程總數（平均分給各種棋）')
    ap.add_argument('--ckpt', default=None, help='起始權重（暖身蒸餾的結果）')
    ap.add_argument('--out', default='runs'); ap.add_argument('--remote', default=None, help='worker 模式：DGX 上 runs 資料夾（scp 路徑）')
    ap.add_argument('--node', default=os.environ.get('NODE', 'node'))
    ap.add_argument('--C', type=int, default=32); ap.add_argument('--B', type=int, default=6); ap.add_argument('--FC', type=int, default=32)
    ap.add_argument('--lr', type=float, default=1e-3); ap.add_argument('--bs', type=int, default=256)
    ap.add_argument('--train-every', type=int, default=512, help='每多幾個新局面就訓練一次')
    ap.add_argument('--steps-per', type=int, default=8)
    ap.add_argument('--export-every', type=int, default=900, help='幾秒匯出一次 model.bin 與 ckpt')
    ap.add_argument('--sync-every', type=int, default=300)
    ap.add_argument('--sps', type=float, default=15, help='專職訓練（--procs 0）時每秒最多練幾步')
    a = ap.parse_args()
    dev = 'cuda' if torch.cuda.is_available() else 'cpu'
    os.makedirs(a.out, exist_ok=True)
    net = Net(a.C, a.B, a.FC).to(dev)
    local_ck = os.path.join(a.out, 'ckpt.pt')
    if a.mode == 'worker' and a.remote:
        fetch(a.remote + '/ckpt.pt', local_ck)
    src = local_ck if os.path.exists(local_ck) else a.ckpt
    if src:
        load_ckpt(net, src, dev); print('載入權重', src, flush=True)
    opt = torch.optim.AdamW(net.parameters(), lr=a.lr, weight_decay=1e-4)
    games = [g for g in a.games.split(',') if g]
    # 行程分配：八國聯軍、圍棋比較慢，多給一點
    weight = {g: (2 if g in ('bg', 'go') else 1) for g in games}
    tot = sum(weight.values()); alloc = {g: (max(1, round(a.procs * weight[g] / tot)) if a.procs > 0 else 0) for g in games}
    workers = []
    for g in games:
        for i in range(alloc[g]):
            workers.append(Worker(g, int(time.time()) % 100000 + len(workers) * 7919, a.node, os.path.join(a.out, 'logs')))
    print('自我對弈行程：', alloc, flush=True)
    rb, new_pos, counter, t_exp, t_sync, steps = {}, 0, 0, time.time(), time.time(), 0
    stats = {g: [0, 0] for g in games}; trainlog = {}; seen = set(); t_data = 0; nevals = 0; t_ev = time.time(); t_start = time.time()
    # DGX：先把舊的自我對弈棋局載入回放區（重開時接續）
    if a.mode == 'train':
        for fn in sorted(glob.glob(os.path.join(a.out, 'games', '*', '*.bin')))[-400:]:
            buf = open(fn, 'rb').read(); ver, gi, H, W = struct.unpack_from('<HHHH', buf, 4); g = ORDER[gi]
            rb.setdefault(g, Replay(g, H, W)).add(parse_records(buf, 16, H, W, ver))
        print('回放區：', {g: r.n for g, r in rb.items()}, flush=True)
    while True:
        busy = False; reqs = {}
        for w in list(workers):
            while True:
                try:
                    t, b = w.q.get_nowait()
                except queue.Empty:
                    break
                busy = True
                if t is None:
                    print('行程結束了：', w.game, flush=True); workers.remove(w); break
                if t == 1:
                    reqs.setdefault(w.game, []).append((w, b))
                elif t == 2:
                    g, H, W, recs = save_game(a.out, b, counter); counter += 1
                    stats[g][0] += 1; stats[g][1] += len(recs)
                    if a.mode == 'train':
                        rb.setdefault(g, Replay(g, H, W)).add(recs); new_pos += len(recs)
                elif t == 3:
                    print(b.decode('utf8', 'replace'), flush=True)
        for g, rs in reqs.items():
            nevals += evaluate_many(net, dev, rs)
        if not workers and a.mode == 'worker':
            break
        if not busy:
            time.sleep(0.0005 if workers else 0.005)
        now = time.time()
        if a.mode == 'train':
            # 筆電傳來的棋局
            for fn in glob.glob(os.path.join(a.out, 'inbox', '*.bin')):
                try:
                    buf = open(fn, 'rb').read(); ver, gi, H, W = struct.unpack_from('<HHHH', buf, 4); g = ORDER[gi]
                    recs = list(parse_records(buf, 16, H, W, ver)); rb.setdefault(g, Replay(g, H, W)).add(recs); new_pos += len(recs)
                    os.makedirs(os.path.join(a.out, 'games', g), exist_ok=True); shutil.move(fn, os.path.join(a.out, 'games', g, 'laptop_' + os.path.basename(fn)))
                    print(f'收到筆電棋局 {g} {len(recs)} 個局面', flush=True)
                except Exception as e:
                    print('讀取 inbox 失敗', fn, e, flush=True)
            # 老師資料（data/<棋>/*.bin，暖身用）：寫完的新檔案也收進回放區
            if now - t_data >= 120:
                t_data = now
                for fn in glob.glob(os.path.join(ROOT, 'data', '*', '*.bin')):
                    if fn in seen or now - os.path.getmtime(fn) < 120:
                        continue
                    seen.add(fn)
                    try:
                        buf = open(fn, 'rb').read(); ver, gi, H, W = struct.unpack_from('<HHHH', buf, 4); g = ORDER[gi]
                        if g in games:
                            rb.setdefault(g, Replay(g, H, W)).add(parse_records(buf, 16, H, W, ver))
                    except Exception as e:
                        print('讀取老師資料失敗', fn, e, flush=True)
            dedicated = a.procs == 0
            if rb and ((dedicated and steps < (now - t_start) * a.sps) or (not dedicated and new_pos >= a.train_every)):
                new_pos = 0; names = [g for g in rb if rb[g].n >= 256]
                for _ in range(4 if dedicated else a.steps_per):
                    if not names:
                        break
                    g = names[np.random.randint(len(names))]
                    lp, lv, acc = train_step(net, opt, rb[g], a.bs, dev); steps += 1
                    r = trainlog.setdefault(g, [0, 0, 0, 0]); r[0] += lp; r[1] += lv; r[2] += acc; r[3] += 1
            if now - t_exp >= a.export_every:
                t_exp = now
                torch.save({'sd': net.state_dict(), 'C': a.C, 'B': a.B, 'FC': a.FC}, local_ck + '.tmp'); os.replace(local_ck + '.tmp', local_ck)
                export(net, os.path.join(a.out, 'model')); net.to(dev)
                print(time.strftime('%H:%M'), f'估值 {nevals / (now - t_ev):.0f}/秒；訓練 {steps} 步；', ' | '.join(f'{g} p{r[0]/r[3]:.2f} v{r[1]/r[3]:.3f} 準{r[2]/r[3]:.0%}' for g, r in trainlog.items()),
                      '；棋局', {g: s for g, s in stats.items() if s[0]}, '；回放區', {g: r.n for g, r in rb.items()}, flush=True)
                trainlog = {}
        elif a.remote and now - t_sync >= a.sync_every:
            t_sync = now
            # 傳回下完的棋局（換新檔案後再傳舊的），再抓最新權重
            for fn in glob.glob(os.path.join(a.out, 'games', '*', '*.bin')):
                if now - os.path.getmtime(fn) < 60:
                    continue
                dst = a.remote + '/inbox/' + os.path.basename(os.path.dirname(fn)) + '_' + os.path.basename(fn)
                if fetch(fn, dst):
                    os.makedirs(os.path.join(a.out, 'sent'), exist_ok=True); shutil.move(fn, os.path.join(a.out, 'sent', os.path.basename(os.path.dirname(fn)) + '_' + os.path.basename(fn)))
            if fetch(a.remote + '/ckpt.pt', local_ck + '.new'):
                try:
                    load_ckpt(net, local_ck + '.new', dev); os.replace(local_ck + '.new', local_ck); print(time.strftime('%H:%M'), f'已更新權重；估值 {nevals / (now - t_ev):.0f}/秒；棋局', stats, flush=True)
                except Exception as e:
                    print('更新權重失敗', e, flush=True)


if __name__ == '__main__':
    main()
