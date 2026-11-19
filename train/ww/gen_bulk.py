# 狼人殺 AI 發言（迷你模型）：用已經訓練好的 0.8B 模型，在全電腦對局裡大量產生訓練資料
# 在 DGX 的 ww-train 容器裡跑（工作目錄 /w）：
#   python train/ww/gen_bulk.py <0.8B 模型資料夾> <輸出.jsonl> <目標合格筆數> [同時幾局=384] [每批最多=256] [node 路徑=bin/node]
# 這支程式管模型（PyTorch 批次生成），對局由 gen_bulk.js 跑；兩邊用標準輸入／輸出傳 JSON。
# 每一批隨機換取樣設定（溫度 0.7～1.1、top-p 0.85～0.97），讓句子多樣。要中途停：touch <輸出.jsonl>.stop
import json, sys, time, random, subprocess, os, torch
from transformers import AutoTokenizer, AutoModelForCausalLM
mdir, out, target = sys.argv[1:4]
con = sys.argv[4] if len(sys.argv) > 4 else '384'; bmax = sys.argv[5] if len(sys.argv) > 5 else '256'
node = sys.argv[6] if len(sys.argv) > 6 else 'bin/node'
tok = AutoTokenizer.from_pretrained(mdir); tok.padding_side = 'left'
model = AutoModelForCausalLM.from_pretrained(mdir, dtype=torch.bfloat16).cuda().eval()
eos = [tok.convert_tokens_to_ids('<|im_end|>')]
here = os.path.dirname(os.path.abspath(__file__))
p = subprocess.Popen([node, os.path.join(here, 'gen_bulk.js'), out, target, con, bmax], stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True, encoding='utf8', bufsize=1)
t0 = time.time(); nb = 0; ns = 0
for line in p.stdout:
    try: d = json.loads(line)
    except Exception: continue
    ps = ['<|im_start|>user\n' + x + '<|im_end|>\n<|im_start|>assistant\n' for x in d['prompts']]
    temp = random.choice([0.7, 0.8, 0.8, 0.9, 0.9, 1.0, 1.0, 1.1]); topp = random.choice([0.85, 0.9, 0.9, 0.95, 0.97])
    x = tok(ps, return_tensors='pt', padding=True, add_special_tokens=False).to('cuda')
    with torch.inference_mode():
        o = model.generate(**x, max_new_tokens=110, do_sample=True, temperature=temp, top_p=topp, repetition_penalty=1.05, eos_token_id=eos, pad_token_id=tok.pad_token_id)
    texts = tok.batch_decode(o[:, x['input_ids'].shape[1]:], skip_special_tokens=True)
    p.stdin.write(json.dumps({'id': d['id'], 'texts': texts, 'temp': temp, 'topp': topp}, ensure_ascii=False) + '\n'); p.stdin.flush()
    nb += 1; ns += len(ps)
    if nb % 20 == 0:
        print(f'批 {nb} 共 {ns} 筆 {ns / (time.time() - t0):.1f} 筆/秒 本批 {len(ps)} 筆 長 {x["input_ids"].shape[1]}', flush=True)
p.wait(); print('結束', ns, f'{time.time() - t0:.0f}s', flush=True)
