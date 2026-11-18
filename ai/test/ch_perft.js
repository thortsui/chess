// 西洋棋轉接器額外檢查：node ai/test/ch_perft.js [隨機對局數=200]
// 1) perft（起始局面與幾個經典刁鑽局面）  2) 隨機對局中逐步比對 legal() 與 chEngine.legal(fen)、終局判定與 UI 的 chCheckEnd 邏輯
// 3) 量測隨機對弈速度（legal+play 每秒次數）
const fs = require('fs'), path = require('path');
const G = require(path.join(__dirname, '..', 'games', 'ch.js'));
const html = fs.readFileSync(path.join(__dirname, '..', '..', 'index.html'), 'utf8');
const src = html.match(/<script type="text\/plain" id="chengine">([\s\S]*?)<\/script>/)[1];
const chEngine = new Function(src + ';return chEngine;')();

function perft(s, d) {
  if (d === 0) return 1;
  const L = G.legal(s); if (d === 1) return L.length;
  let n = 0; for (const m of L) n += perft(G.play(s, m).s, d - 1); return n;
}
const CASES = [
  ['起始局面', G.CH_START, [20, 400, 8902, 197281]],
  ['Kiwipete', 'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1', [48, 2039, 97862]],
  ['Position 3（吃過路兵/將軍）', '8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1', [14, 191, 2812, 43238]],
  ['Position 4（升變/入堡）', 'r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1', [6, 264, 9467]],
  ['Position 5', 'rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8', [44, 1486, 62379]],
];
let fail = 0;
for (const [name, fen, want] of CASES) {
  const s = G.fromReq({ fen, rep: [] }), got = [];
  for (let d = 1; d <= want.length; d++) got.push(perft(s, d));
  const eng = chEngine.perft(fen, Math.min(3, want.length));
  const ok = got.every((v, i) => v === want[i]) && eng === want[Math.min(3, want.length) - 1];
  if (!ok) fail++;
  console.log(ok ? '✓' : '✗', name, 'perft', got.join(' / '), '（應為', want.join(' / ') + '；chEngine d' + Math.min(3, want.length), eng + '）');
}

// ---- 隨機對局比對 ----
const games = +process.argv[2] || 200;
let x = 987654321; const rng = () => ((x = (x * 1103515245 + 12345) >>> 0) / 4294967296);
const key = f => f.split(' ').slice(0, 4).join(' ');
let positions = 0, mism = 0, endMism = 0; const ends = {};
for (let g = 0; g < games; g++) {
  let s = G.fromReq({ fen: G.CH_START, rep: [] }), fen = G.CH_START; const keys = [key(fen)], hist = [];
  for (let ply = 0; ply < 600; ply++) {
    positions++;
    if (G.toFen(s) !== fen) { mism++; if (mism < 5) console.log('✗ FEN 不同', G.toFen(s), fen); }
    // UI 的 chCheckEnd
    const st = chEngine.status(fen); let over = null;
    if (!st.moves) over = st.check ? (s.side ? 0 : 1) : -1;
    else if (st.half >= 100) over = -1;
    else if (keys.filter(k => k === key(fen)).length >= 3) over = -1;
    else if (st.insuff) over = -1;
    // 用 UI 的請求格式重建一次狀態，確認 fromReq 與逐步 play 得到同樣的終局判定
    const s2 = G.fromReq({ v: 'ch', fen, rep: hist.slice(-100) });
    const t = G.terminal(s), t2 = G.terminal(s2);
    if ((t ? t.win : null) !== over || (t2 ? t2.win : null) !== over) { endMism++; if (endMism < 5) console.log('✗ 終局判定不同', fen, t, t2, over); }
    if (over !== null) { ends[over] = (ends[over] || 0) + 1; break; }
    const L = G.legal(s), E = chEngine.legal(fen);
    const a = L.map(m => JSON.stringify(G.toRes(s, m))).sort(), b = E.map(m => JSON.stringify({ f: m.f, t: m.t, p: m.p })).sort();
    if (a.join() !== b.join()) { mism++; if (mism < 5) console.log('✗ 合法走法不同', fen, a.filter(v => !b.includes(v)), b.filter(v => !a.includes(v))); }
    const m = L[(rng() * L.length) | 0], r = G.toRes(s, m);
    const pr = chEngine.play(fen, r.f, r.t, r.p);
    hist.push(fen); fen = pr.fen; keys.push(key(fen));
    s = G.play(s, m).s;
  }
}
console.log(`隨機對局 ${games} 局、${positions} 個局面：合法走法/FEN 不一致 ${mism}、終局判定不一致 ${endMism}；結果`, ends);
if (mism || endMism) fail++;

// ---- 速度 ----
{
  let n = 0, plays = 0; const t0 = Date.now();
  while (Date.now() - t0 < 3000) {
    let s = G.fromReq({ fen: G.CH_START, rep: [] });
    for (let ply = 0; ply < 300; ply++) {
      if (G.terminal(s)) break;
      const L = G.legal(s); n++;
      s = G.play(s, L[(rng() * L.length) | 0]).s; plays++;
    }
  }
  const sec = (Date.now() - t0) / 1000;
  console.log(`速度：每秒 legal+play+terminal ${(n / sec | 0)} 次`);
  let c = 0; const s0 = G.fromReq({ fen: CASES[1][1], rep: [] }); const t1 = Date.now();
  while (Date.now() - t1 < 1000) { G.legal(s0); c++; }
  console.log(`Kiwipete 局面 legal() 每秒 ${c} 次`);
}
console.log(fail ? '✗ 有問題' : '✓ 全部通過');
process.exit(fail ? 1 : 0);
