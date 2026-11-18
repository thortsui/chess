// 確認 brain.js 的推論和 PyTorch 訓練端算出一樣的值，並量速度：node ai/test/net_check.js [模型資料夾=ai]
const fs = require('fs'), path = require('path');
const AI = require('../brain.js');
const dir = process.argv[2] || path.join(__dirname, '..');
const meta = JSON.parse(fs.readFileSync(path.join(dir, 'model.json'), 'utf8'));
const bin = fs.readFileSync(path.join(dir, 'model.bin'));
const net = new AI.Net(meta, bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength));
const T = meta.test, x = Float32Array.from(T.x), out = net.forward(T.H, T.W, x);
const HW = T.H * T.W;
const diffs = [Math.abs(out.value - T.value), Math.abs(out.pass - T.pass), ...T.P.map((v, i) => Math.abs(out.P[i] - v)), ...T.Q0.map((v, i) => Math.abs(out.Q[i] - v))];
const md = Math.max(...diffs);
console.log(`C=${meta.C} B=${meta.B}，最大誤差 ${md.toExponential(2)}`, md < 1e-3 ? '✓ 一致' : '✗ 不一致');
for (const [H, W, name] of [[10, 9, '象棋類'], [4, 8, '暗棋'], [8, 8, '西洋棋'], [15, 15, '五子棋'], [9, 9, '圍棋'], [34, 40, '八國聯軍']]) {
  const p = new Float32Array(40 * H * W); for (let i = 0; i < p.length; i++) p[i] = Math.random() < 0.1 ? 1 : 0; p.fill(1, 24 * H * W, 25 * H * W);
  const n = H * W > 600 ? 5 : 30, t0 = process.hrtime.bigint();
  for (let i = 0; i < n; i++) net.forward(H, W, p);
  console.log(`${name} ${H}×${W}：每次 ${(Number(process.hrtime.bigint() - t0) / 1e6 / n).toFixed(1)} ms`);
}
process.exit(md < 1e-3 ? 0 : 1);
