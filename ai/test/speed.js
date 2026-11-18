// 隨機對局速度：node ai/test/speed.js <id> [秒數=3]（每手 legal＋play＋terminal）
const G = require('../games/' + process.argv[2] + '.js'), sec = +process.argv[3] || 3;
let x = 1; const rng = () => ((x = (x * 1103515245 + 12345) >>> 0) / 4294967296);
const t0 = Date.now(); let plies = 0, games = 0;
while (Date.now() - t0 < sec * 1000) {
  let s = G.fromReq(G.starts()[0]);
  while (!G.terminal(s)) { const L = G.legal(s); s = G.play(s, L[(rng() * L.length) | 0], rng).s; plies++; }
  games++;
}
const ms = Date.now() - t0;
console.log(`[${G.id}] ${games} 局 ${plies} 手，${(plies / ms * 1000) | 0} 手/秒，${(games / ms * 1000).toFixed(1)} 局/秒`);
