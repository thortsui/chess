// 象棋棋盤三種棋的速度與 rep 往返測試：node ai/test/xq_speed.js
const ids = ['xq', 'qf', 'jw'];
let x = 13579; const rng = () => ((x = (x * 1103515245 + 12345) >>> 0) / 4294967296);
for (const id of ids) {
  const G = require('../games/' + id + '.js');
  // rep 往返：teacher() 產生的請求（含 rep）重建 state 後，合法走法要一樣（象棋才有 rep）
  let mism = 0, tests = 0;
  for (let g = 0; g < 50; g++) { let s = G.fromReq(G.starts()[0]);
    for (let p = 0; p < 200 && !G.terminal(s); p++) {
      if (id === 'xq' && p % 7 === 0) { const r = G.fromReq(G.teacher(s).req); tests++; if (G.legal(r).sort().join() !== G.legal(s).sort().join()) mism++; }
      const L = G.legal(s); s = G.play(s, L[(rng() * L.length) | 0]).s; } }
  // 速度：隨機對局，每手 terminal()+legal()+play()
  let plies = 0, games = 0; const t0 = Date.now();
  while (Date.now() - t0 < 4000) { let s = G.fromReq(G.starts()[0]); games++;
    for (let p = 0; p < 400; p++) { if (G.terminal(s)) break; const L = G.legal(s); s = G.play(s, L[(rng() * L.length) | 0]).s; plies++; } }
  const ms = Date.now() - t0;
  console.log(`[${id}] 隨機對局 ${games} 局，${Math.round(plies / ms * 1000)} 手/秒（每手 terminal+legal+play）` + (id === 'xq' ? `；rep 往返 ${tests} 次、不一致 ${mism}` : ''));
}
