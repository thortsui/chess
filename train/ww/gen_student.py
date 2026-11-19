# 狼人殺 AI 發言：用微調好的學生模型替保留集寫發言（評估用），順便量 DGX 上的生成速度
# python train/ww/gen_student.py <模型資料夾> <heldout.jsonl> <輸出.jsonl> [最多幾筆=600]
import json, sys, time, torch
from transformers import AutoTokenizer, AutoModelForCausalLM
mdir, src, dst = sys.argv[1:4]; N = int(sys.argv[4]) if len(sys.argv) > 4 else 600
tok = AutoTokenizer.from_pretrained(mdir); tok.padding_side = 'left'
model = AutoModelForCausalLM.from_pretrained(mdir, dtype=torch.bfloat16).cuda().eval()
rows = [json.loads(l) for l in open(src, encoding='utf8')][:N]
eos = [tok.convert_tokens_to_ids('<|im_end|>')]
torch.manual_seed(0)
# 單筆速度（像手機一次只生一段）
p = '<|im_start|>user\n' + rows[0]['prompt'] + '<|im_end|>\n<|im_start|>assistant\n'
x = tok(p, return_tensors='pt', add_special_tokens=False).to('cuda')
for k in range(2):
    t0 = time.time(); o = model.generate(**x, max_new_tokens=110, do_sample=True, temperature=0.8, top_p=0.9, eos_token_id=eos)
    torch.cuda.synchronize(); n = o.shape[1] - x['input_ids'].shape[1]
print(f'DGX 單筆：提示 {x["input_ids"].shape[1]} token，生成 {n} token，{time.time() - t0:.2f} 秒（{n / (time.time() - t0):.1f} token/秒）', flush=True)
with open(dst, 'w', encoding='utf8') as w:
    B = 32
    for i in range(0, len(rows), B):
        ps = ['<|im_start|>user\n' + r['prompt'] + '<|im_end|>\n<|im_start|>assistant\n' for r in rows[i:i + B]]
        x = tok(ps, return_tensors='pt', padding=True, add_special_tokens=False).to('cuda')
        with torch.no_grad():
            o = model.generate(**x, max_new_tokens=110, do_sample=True, temperature=0.8, top_p=0.9, repetition_penalty=1.05, eos_token_id=eos, pad_token_id=tok.pad_token_id)
        for j, seq in enumerate(o[:, x['input_ids'].shape[1]:]):
            w.write(json.dumps({'i': i + j, 'text': tok.decode(seq, skip_special_tokens=True)}, ensure_ascii=False) + '\n')
        print(i + B, flush=True)
print('完成')
