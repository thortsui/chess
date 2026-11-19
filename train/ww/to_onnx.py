# 把微調後（LoRA 已合併）的 Qwen3.5-0.8B 權重換進 onnx-community/Qwen3.5-0.8B-Text-ONNX 的 4-bit 圖
# 在 ww-train 容器裡跑：python train/ww/to_onnx.py <合併後的模型資料夾> <輸出資料夾> [--check]
# 做法：圖的結構不變（MatMulNBits，4 bits、每 32 個一組、有零點），只把每個 MatMul 的權重用 onnxruntime 同一套量化函式重新量化後換掉。
# LoRA 只動到線性層，embedding／lm_head（共用）、norm、conv 都沒變，所以直接沿用。
# --check：先拿原版權重量化一次，確認和 onnx-community 的檔案位元完全相同（證明量化方式一致）。
import sys, os, shutil, json, re, numpy as np, onnx
from onnx import numpy_helper as nh
from safetensors.torch import load_file
from onnxruntime.capi._pybind_state import quantize_matmul_4bits

SRC = 'hf/Qwen3.5-0.8B-Text-ONNX'
mdir, out = sys.argv[1], sys.argv[2]
check = '--check' in sys.argv

def load_hf(d):
    W = {}
    for f in sorted(os.listdir(d)):
        if f.endswith('.safetensors'):
            for k, v in load_file(os.path.join(d, f)).items():
                W[k] = v.float().numpy()
    return W

def hf_key(node_name, W):
    m = re.match(r'/model/layers\.(\d+)/(gdn|attn|mlp)/(\w+)/MatMul_Quant', node_name)
    if not m: return None
    l, blk, p = m.groups()
    blk = {'gdn': 'linear_attn', 'attn': 'self_attn', 'mlp': 'mlp'}[blk]
    suf = f'layers.{l}.{blk}.{p}.weight'
    ks = [k for k in W if k.endswith(suf) and 'visual' not in k and 'mtp' not in k]
    assert len(ks) == 1, (suf, ks)
    return ks[0]

def quant(w, bs=32):  # w: [N, K] float32 → (packed [N, nb, bs/2] uint8, scales [N, nb] float32, zp [N, ceil(nb/2)] uint8)
    N, K = w.shape; nb = (K + bs - 1) // bs
    packed = np.zeros((N, nb, bs // 2), dtype=np.uint8); scales = np.zeros((N * nb,), dtype=np.float32); zp = np.zeros((N * ((nb + 1) // 2),), dtype=np.uint8)
    # onnxruntime 要的是 [K, N] 的權重
    quantize_matmul_4bits(packed, np.ascontiguousarray(w.T.astype(np.float32)), scales, zp, bs, N, K, False)
    return packed, scales.reshape(N, nb), zp.reshape(N, (nb + 1) // 2)

def build(variant, W):
    m = onnx.load(f'{SRC}/onnx/{variant}.onnx', load_external_data=True)
    I = {i.name: i for i in m.graph.initializer}
    n_rep = 0; n_same = 0
    for node in m.graph.node:
        if node.op_type != 'MatMulNBits' or 'lm_head' in node.name: continue
        k = hf_key(node.name, W)
        w = W[k].astype(np.float32)
        qn, sn, zn = node.input[1], node.input[2], node.input[3]
        p, s, z = quant(w)
        sdt = I[sn].data_type
        s = s.astype(np.float16 if sdt == onnx.TensorProto.FLOAT16 else np.float32)
        if check:
            old = nh.to_array(I[qn])
            n_same += int(np.array_equal(old, p) and np.array_equal(nh.to_array(I[zn]), z))
        for name, arr in ((qn, p), (sn, s), (zn, z)):
            I[name].CopyFrom(nh.from_array(arr.reshape([d for d in I[name].dims]), name))
        n_rep += 1
    print(variant, '換掉', n_rep, '個 MatMul', ('，和原檔位元相同：%d' % n_same) if check else '', flush=True)
    os.makedirs(f'{out}/onnx', exist_ok=True)
    for f in os.listdir(f'{out}/onnx'):
        if f.startswith(variant + '.onnx'): os.remove(f'{out}/onnx/{f}')
    onnx.save(m, f'{out}/onnx/{variant}.onnx', save_as_external_data=True, all_tensors_to_one_file=True, location=f'{variant}.onnx_data', size_threshold=1024)

W = load_hf(mdir)
os.makedirs(out, exist_ok=True)
for f in ('config.json', 'generation_config.json', 'tokenizer.json', 'tokenizer_config.json'):
    shutil.copy(f'{SRC}/{f}', f'{out}/{f}')
for v in ('model_q4f16', 'model_q4'):
    build(v, W)
print('完成', out)
