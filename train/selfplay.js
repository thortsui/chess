// 自我對弈工作行程（由 train/selfplay.py 啟動，不要直接跑）
// node train/selfplay.js <game> <同時幾局> <每步模擬次數> <種子>
// 和 Python 用 stdin/stdout 的二進位框架溝通：
//   送出 [u32 長度][u8 類型][內容]：類型 1 = 估值請求，2 = 下完的棋局資料（v2 格式），3 = 文字紀錄
//   收到 [u32 長度][內容]：對應估值請求，每個局面 [f32 value][f32×走法數 先驗機率]
const path = require('path');
const [id, CONC = 64, SIMS = 128, SEED = 1] = process.argv.slice(2);
const AI = require(path.join(__dirname, '..', 'ai', 'brain.js'));
const G = require(path.join(__dirname, '..', 'ai', 'games', id + '.js'));
const NC = AI.NC, HW = G.H * G.W, NB = 36, BITB = Math.ceil(NB * HW / 8), AUXB = 4 * HW;
const rng = AI.makeRng(+SEED * 2654435761 + 7);
const SIM = +SIMS, MAXPLY = id === 'bg' ? 240 : 500;   // 八國聯軍一局太長：下到 240 手算和局，棋局才會快點變成訓練資料
// 溫度：開局 30 手 1.0（多變化），之後 0.7；根節點 Dirichlet 雜訊
const TAU0 = 1.0, TAU1 = 0.7, OPEN = 30, DIR_A = 0.3, DIR_E = 0.25;
const planes = new Float32Array(NC * HW);
const starts = G.starts();

function send(type, buf) { const h = Buffer.alloc(5); h.writeUInt32LE(buf.length + 1, 0); h.writeUInt8(type, 4); process.stdout.write(h); process.stdout.write(buf); }
const log = t => send(3, Buffer.from(String(t)));
function keyArr(k) { return k.pass ? [2, 0, 0, -1] : k.p !== undefined ? [1, k.p, 0, k.k ?? -1] : [0, k.f, k.t, k.k ?? -1]; }

function newGame() {
  const s = G.fromReq(JSON.parse(JSON.stringify(starts[(rng() * starts.length) | 0])));
  return { tree: new AI.Tree(G, s, 1e9, rng), sims: 0, ply: 0, recs: [], noised: false };
}
const games = Array.from({ length: +CONC }, newGame);
let finished = 0, positions = 0;

function record(g) {
  const root = g.tree.root, s = root.s, n = root.moves.length;
  planes.fill(0); G.encode(s, planes);
  const bits = Buffer.alloc(BITB), aux = Buffer.alloc(AUXB);
  for (let i = 0; i < NB * HW; i++) if (planes[i] > 0.5) bits[i >> 3] |= 1 << (i & 7);
  for (let i = 0; i < AUXB; i++) aux[i] = Math.round(Math.max(0, Math.min(1, planes[NB * HW + i])) * 255);
  const ks = new Int16Array(n * 4); root.moves.forEach((m, j) => ks.set(keyArr(G.keys(s, m)), j * 4));
  let tot = 0; for (let i = 0; i < n; i++) tot += root.N[i];
  const pi = new Uint16Array(n); for (let i = 0; i < n; i++) pi[i] = Math.round(root.N[i] / Math.max(1, tot) * 65535);
  let best = 0; for (let i = 1; i < n; i++) if (root.N[i] > root.N[best]) best = i;
  g.recs.push({ team: root.team, n, best, bits, aux, ks, pi });
}
function finishGame(g, win) {
  const parts = [];
  for (const r of g.recs) {
    const z = win === -1 ? 0 : win === r.team ? 1 : -1, head = Buffer.alloc(16);
    head.writeUInt32LE(16 + BITB + AUXB + r.ks.byteLength + r.pi.byteLength, 0); head.writeUInt16LE(r.n, 4); head.writeUInt16LE(r.best, 6);
    head.writeFloatLE(z, 8); head.writeFloatLE(-9, 12);
    parts.push(head, r.bits, r.aux, Buffer.from(r.ks.buffer), Buffer.from(r.pi.buffer));
  }
  positions += g.recs.length; finished++;
  const hdr = Buffer.alloc(8); hdr.writeUInt16LE(AI.GAMES.indexOf(G.id), 0); hdr.writeUInt16LE(G.H, 2); hdr.writeUInt16LE(G.W, 4); hdr.writeUInt16LE(win + 1, 6);
  send(2, Buffer.concat([hdr, ...parts]));
  if (finished % 20 === 0) log(`[${id}] 已下完 ${finished} 局、${positions} 個局面`);
}
// 這一步模擬夠了：記錄、依溫度抽一步走下去
function move(g) {
  const root = g.tree.root;
  if (root.moves.length > 1) record(g);
  const tau = g.ply < OPEN ? TAU0 : TAU1, n = root.moves.length, w = new Float64Array(n);
  let z = 0; for (let i = 0; i < n; i++) { w[i] = Math.pow(root.N[i], 1 / tau); z += w[i]; }
  let r = rng() * z, pick = n - 1; for (let i = 0; i < n; i++) { r -= w[i]; if (r <= 0) { pick = i; break; } }
  g.tree.advance(pick, true); g.ply++; g.sims = 0; g.noised = false;
  const term = G.terminal(g.tree.root.s);
  if (term || g.ply >= MAXPLY) { finishGame(g, term ? term.win : -1); Object.assign(g, newGame()); }
}

// 一輪：每局往下選到需要估值的葉節點，整批送出
// 兩組輪流：一組在等 GPU 回覆時，另一組先往下選（CPU 不空等）
const GROUPS = [games.filter((_, i) => i % 2 === 0), games.filter((_, i) => i % 2 === 1)].filter(x => x.length);
const inflight = [];
function round(gi) {
  const pend = [];
  for (const g of GROUPS[gi]) {
    for (let guard = 0; guard < 4 * SIM; guard++) {
      const root = g.tree.root;
      if (root.pri && !g.noised) { g.tree.noise(DIR_A, DIR_E); g.noised = true; }
      if (root.pri && (g.sims >= SIM || root.moves.length === 1)) { move(g); continue; }
      const leaf = g.tree.select();
      if (leaf) { pend.push({ g, leaf }); break; }
      g.sims++;
      if (root.term) { finishGame(g, root.term.win); Object.assign(g, newGame()); }
    }
  }
  // 整齊排好：[n,H,W,M] + 局面 n×NC×HW (uint8) + 走法 n×M×4 (int16，補 -1) + 走法數 n (uint16)
  const n = pend.length; let M = 1; for (const { leaf } of pend) if (leaf.moves.length > M) M = leaf.moves.length;
  const pb = new Uint8Array(n * NC * HW), ks = new Int16Array(n * M * 4).fill(-1), ms = new Uint16Array(n);
  pend.forEach(({ leaf }, j) => {
    planes.fill(0); G.encode(leaf.s, planes);
    const o = j * NC * HW; for (let i = 0; i < NC * HW; i++) { const v = planes[i]; if (v) pb[o + i] = v >= 1 ? 255 : v <= 0 ? 0 : Math.round(v * 255); }
    const m = leaf.moves.length; ms[j] = m;
    for (let i = 0; i < m; i++) ks.set(keyArr(G.keys(leaf.s, leaf.moves[i])), (j * M + i) * 4);
  });
  const hdr = Buffer.alloc(8); hdr.writeUInt16LE(n, 0); hdr.writeUInt16LE(G.H, 2); hdr.writeUInt16LE(G.W, 4); hdr.writeUInt16LE(M, 6);
  inflight.push({ gi, pend, M });
  send(1, Buffer.concat([hdr, Buffer.from(pb.buffer), Buffer.from(ks.buffer), Buffer.from(ms.buffer)]));
}
// 讀 Python 回傳的估值
let inbuf = Buffer.alloc(0);
process.stdin.on('data', d => {
  inbuf = Buffer.concat([inbuf, d]);
  while (inbuf.length >= 4) {
    const len = inbuf.readUInt32LE(0); if (inbuf.length < 4 + len) break;
    const body = inbuf.subarray(4, 4 + len); inbuf = inbuf.subarray(4 + len);
    // 回覆：value n×f32 + 先驗 n×M×f32
    const { gi, pend, M } = inflight.shift();
    const n = pend.length, f = new Float32Array(body.buffer.slice(body.byteOffset, body.byteOffset + body.length));
    pend.forEach(({ g, leaf }, j) => {
      const m = leaf.moves.length, pri = f.slice(n + j * M, n + j * M + m);
      g.tree.feed(pri, f[j]); g.sims++;
    });
    setImmediate(() => round(gi));
  }
});
process.stdin.on('end', () => process.exit(0));
log(`[${id}] 自我對弈開始：同時 ${CONC} 局、每步 ${SIM} 次模擬`);
GROUPS.forEach((_, gi) => round(gi));
