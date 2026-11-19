# 狼人殺迷你發言模型：小型 decoder-only Transformer（從頭訓練）。ai/ww/mini.js 是同一個模型的 JS 推論。
# 為了讓 JS 好寫又快：所有線性層沒有 bias；RMSNorm（只有增益）；啟用函數用 Hardswish（不用算 exp／tanh）；
# 位置用學出來的位置表；輸出層和詞向量共用同一張表。
import torch, torch.nn as nn, torch.nn.functional as F

class RMSNorm(nn.Module):
    def __init__(s, d): super().__init__(); s.g = nn.Parameter(torch.ones(d))
    def forward(s, x): return x * torch.rsqrt(x.float().pow(2).mean(-1, keepdim=True) + 1e-6).to(x.dtype) * s.g

class Block(nn.Module):
    def __init__(s, d, nh, drop):
        super().__init__(); s.nh = nh; s.drop = drop
        s.n1 = RMSNorm(d); s.qkv = nn.Linear(d, 3 * d, bias=False); s.proj = nn.Linear(d, d, bias=False)
        s.n2 = RMSNorm(d); s.fc1 = nn.Linear(d, 4 * d, bias=False); s.fc2 = nn.Linear(4 * d, d, bias=False)
    def forward(s, x):
        B, T, D = x.shape
        q, k, v = s.qkv(s.n1(x)).view(B, T, 3, s.nh, D // s.nh).permute(2, 0, 3, 1, 4)
        a = F.scaled_dot_product_attention(q, k, v, is_causal=True, dropout_p=s.drop if s.training else 0.0)
        x = x + F.dropout(s.proj(a.transpose(1, 2).reshape(B, T, D)), s.drop, s.training)
        return x + F.dropout(s.fc2(F.hardswish(s.fc1(s.n2(x)))), s.drop, s.training)

class Mini(nn.Module):
    def __init__(s, V, d=384, L=8, ctx=512, drop=0.0):
        super().__init__(); s.cfg = dict(V=V, d=d, L=L, ctx=ctx, nh=d // 64)
        s.emb = nn.Embedding(V, d); s.pos = nn.Embedding(ctx, d)
        s.blocks = nn.ModuleList([Block(d, d // 64, drop) for _ in range(L)]); s.nf = RMSNorm(d); s.drop = drop
        for n, p in s.named_parameters():
            if p.dim() == 2: nn.init.normal_(p, std=0.02 / (2 * L) ** 0.5 if n.endswith(('proj.weight', 'fc2.weight')) else 0.02)
    def forward(s, ids):
        x = s.emb(ids) + s.pos(torch.arange(ids.shape[1], device=ids.device))
        x = F.dropout(x, s.drop, s.training)
        for b in s.blocks: x = b(x)
        return s.nf(x) @ s.emb.weight.t()
