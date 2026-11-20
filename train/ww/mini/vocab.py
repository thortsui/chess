# 狼人殺迷你發言模型：從資料學詞表（字＋常見片語，BPE 合併），輸出 vocab.json（字串陣列，前 5 個是特殊符號）
# python train/ww/mini/vocab.py <輸出 vocab.json> <詞表大小> <資料.jsonl> [更多.jsonl ...]
# 編碼時不照 BPE 的合併順序，而是「從左到右每次取詞表裡最長的片語」（ai/ww/mini.js 的 Tok.encode），JS 只有這一份實作。
import json, sys, random
from tokenizers import Tokenizer, models, trainers, pre_tokenizers
out, V, srcs = sys.argv[1], int(sys.argv[2]), sys.argv[3:]
SPEC = ['<pad>', '<bos>', '<sep>', '<eos>', '<unk>']
random.seed(0); texts = []
for f in srcs:
    for l in open(f, encoding='utf8'):
        try: d = json.loads(l)
        except Exception: continue
        if d.get('err') is not None: continue
        # 提示最後會多一行「我N號，可投：…」（ai/ww/mini.js 的 Tok.prompt 加的），詞表也要看過這種句型
        me = d.get('seat', 0) + 1; can = [str(i + 1) for i, a in enumerate(d['st']['alive']) if a and i + 1 != me] if 'st' in d else []
        ex = ''.join('，' + l for l in d['prompt'].split('\n') if l.startswith(('我的查驗：', '狼隊友：')))   # 0.27.0 起這兩行在紀錄後面
        texts.append(d['prompt'] + '\n我%d號%s，可投：%s\n' % (me, ex, '、'.join(can)) + d['out'])
random.shuffle(texts); texts = texts[:60000]            # 幾萬筆就夠學詞表
print('樣本', len(texts), flush=True)
tok = Tokenizer(models.BPE()); tok.pre_tokenizer = pre_tokenizers.Split('\n', 'isolated')
tr = trainers.BpeTrainer(vocab_size=V - len(SPEC), min_frequency=8, limit_alphabet=2800, max_token_length=10, show_progress=False, special_tokens=[])
tok.train_from_iterator(texts, tr)
vs = [t for t, _ in sorted(tok.get_vocab().items(), key=lambda kv: kv[1])]
vs = [t for t in vs if all(ord(c) < 0x10000 for c in t)]   # JS 用 UTF-16，不收超出基本平面的字
if '\n' not in vs: vs.append('\n')
json.dump(SPEC + vs, open(out, 'w', encoding='utf8'), ensure_ascii=False)
print('詞表', len(SPEC) + len(vs), '單字', sum(1 for t in vs if len(t) == 1), '最長', max(len(t) for t in vs))
