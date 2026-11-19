# 狼人殺 AI 發言：把老師資料整理成訓練集／保留集
# python train/ww/build_sft.py <輸出資料夾> <老師資料.jsonl> [更多.jsonl ...]
# 只留通過檢查（err 為 null）的發言；用 OpenCC 再轉一次台灣正體；依「對局」切 5% 當保留集（評估用，訓練看不到）
import json, sys, hashlib, os, re
try:
    import opencc
    CONV = opencc.OpenCC('s2twp')
except Exception:
    CONV = None
outdir, srcs = sys.argv[1], sys.argv[2:]
os.makedirs(outdir, exist_ok=True)
seen = set(); tr = []; ho = []
for f in srcs:
    for l in open(f, encoding='utf8'):
        try: d = json.loads(l)
        except Exception: continue
        if d.get('err') is not None or 'st' not in d: continue
        out = d['out']
        if CONV:
            # 只轉發言部分（「投:N」不動）
            sp, v = out.rsplit('\n', 1); out = CONV.convert(sp) + '\n' + v
            d['prompt'] = CONV.convert(d['prompt'])  # 提示裡別人的發言也可能有簡體字
        key = (d['prompt'], out)
        if key in seen: continue
        seen.add(key); d['out'] = out
        h = int(hashlib.md5(str(d.get('gid')).encode()).hexdigest(), 16) % 100
        # 老師很愛講「手上有點資訊先不講」這類句子（早期提示裡有舉例），只留三分之一，免得學生每句都這樣講
        if h >= 5 and re.search(r'手上有點|先不講|先不說太多', out) and int(hashlib.md5(out.encode()).hexdigest(), 16) % 3:
            continue
        (ho if h < 5 else tr).append(d)
with open(f'{outdir}/train.jsonl', 'w', encoding='utf8') as w:
    for d in tr: w.write(json.dumps({'prompt': d['prompt'], 'out': d['out']}, ensure_ascii=False) + '\n')
with open(f'{outdir}/heldout.jsonl', 'w', encoding='utf8') as w:
    for d in ho: w.write(json.dumps(d, ensure_ascii=False) + '\n')
print('訓練', len(tr), '保留', len(ho))
