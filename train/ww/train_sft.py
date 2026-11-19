# 狼人殺 AI 發言：微調學生模型（Qwen3.5-0.8B，LoRA 後合併成完整權重）
# 在 DGX 的 ww-train 容器裡跑：python train/ww/train_sft.py <train.jsonl> <輸出資料夾> [epochs=2]
# 資料每行 {"prompt":..., "out":...}；只對回答部分算 loss。提示格式（遊戲裡也用同一個）：
#   <|im_start|>user\n{prompt}<|im_end|>\n<|im_start|>assistant\n{out}<|im_end|>
import json, sys, math, random, time, torch
from transformers import AutoTokenizer, AutoModelForCausalLM
from peft import LoraConfig, get_peft_model

BASE = 'hf/Qwen3.5-0.8B'
src, outdir = sys.argv[1], sys.argv[2]
EPOCHS = float(sys.argv[3]) if len(sys.argv) > 3 else 2
import os
# 每步 16 筆；顯示卡記憶體小時用 WW_MICRO 拆成小批累積梯度（例如筆電 8GB 用 4）
LR, BS, MAXLEN = 2e-4, 16, 1280
MICRO = int(os.environ.get('WW_MICRO', BS))
torch.manual_seed(0); random.seed(0)
tok = AutoTokenizer.from_pretrained(BASE)
rows = [json.loads(l) for l in open(src, encoding='utf8')]
def enc(r):
    a = tok('<|im_start|>user\n' + r['prompt'] + '<|im_end|>\n<|im_start|>assistant\n', add_special_tokens=False)['input_ids']
    b = tok(r['out'] + '<|im_end|>', add_special_tokens=False)['input_ids']
    ids = (a + b)[-MAXLEN:]; lab = ([-100] * len(a) + b)[-MAXLEN:]
    return ids, lab
data = [enc(r) for r in rows]
print('樣本', len(data), '平均長度', sum(len(d[0]) for d in data) / len(data), flush=True)
model = AutoModelForCausalLM.from_pretrained(BASE, dtype=torch.bfloat16).cuda()
model.gradient_checkpointing_enable(); model.enable_input_require_grads()
cfg = LoraConfig(r=64, lora_alpha=128, lora_dropout=0.05, target_modules='all-linear', task_type='CAUSAL_LM')
model = get_peft_model(model, cfg); model.print_trainable_parameters(); base = model.get_base_model()
opt = torch.optim.AdamW([p for p in model.parameters() if p.requires_grad], lr=LR, weight_decay=0.0)
steps = math.ceil(len(data) / BS * EPOCHS); warm = max(10, steps // 30)
sched = torch.optim.lr_scheduler.LambdaLR(opt, lambda s: min(1, (s + 1) / warm) * 0.5 * (1 + math.cos(math.pi * min(1, s / steps))))
model.train(); step = 0; t0 = time.time()
while step < steps:
    order = list(range(len(data))); random.shuffle(order)
    # 長度相近的放一起，少一點 padding
    chunks = [order[i:i + BS * 50] for i in range(0, len(order), BS * 50)]
    batches = []
    for c in chunks:
        c.sort(key=lambda i: len(data[i][0])); batches += [c[i:i + BS] for i in range(0, len(c), BS)]
    random.shuffle(batches)
    for bt in batches:
        if step >= steps: break
        ntok = sum(sum(1 for t in data[i][1] if t != -100) for i in bt); tot = 0.0
        for k in range(0, len(bt), MICRO):
            mb = bt[k:k + MICRO]; L = max(len(data[i][0]) for i in mb)
            ids = torch.full((len(mb), L), tok.pad_token_id or 0); lab = torch.full((len(mb), L), -100); att = torch.zeros((len(mb), L), dtype=torch.long)
            for j, i in enumerate(mb):
                x, y = data[i]; ids[j, :len(x)] = torch.tensor(x); lab[j, :len(y)] = torch.tensor(y); att[j, :len(x)] = 1
            # 只在回答的位置算 lm_head（詞表 24 萬，全部位置都算會很慢又很吃記憶體）
            ids, att, lab = ids.cuda(), att.cuda(), lab.cuda()
            h = base.model(input_ids=ids, attention_mask=att).last_hidden_state
            m = lab[:, 1:] != -100
            logits = base.lm_head(h[:, :-1][m]).float()
            l = torch.nn.functional.cross_entropy(logits, lab[:, 1:][m], reduction='sum') / ntok
            l.backward(); tot += l.item()
        loss = torch.tensor(tot); torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0); opt.step(); sched.step(); opt.zero_grad(); step += 1
        if step % 10 == 0 or step <= 3:
            print(f'step {step}/{steps} loss {loss.item():.3f} lr {sched.get_last_lr()[0]:.2e} {time.time() - t0:.0f}s', flush=True)
model = model.merge_and_unload()
model.save_pretrained(outdir, safe_serialization=True); tok.save_pretrained(outdir)
print('完成', outdir, flush=True)
