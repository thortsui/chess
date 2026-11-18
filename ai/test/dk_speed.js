// 暗棋轉接器隨機對局速度：node ai/test/dk_speed.js [秒數=3]
const G = require('../games/dk.js');
const sec = +process.argv[2] || 3, S = G.starts(64), buf = new Float32Array(40 * 32);
let plies = 0, games = 0, x = 7; const rng = () => ((x = (x * 1103515245 + 12345) >>> 0) / 4294967296);
const t0 = Date.now();
while (Date.now() - t0 < sec * 1000) {
  let s = G.fromReq(S[games % S.length]);
  for (let p = 0; p < 400 && !G.terminal(s); p++) { const L = G.legal(s); s = G.play(s, L[(rng() * L.length) | 0], rng).s; plies++; }
  games++;
}
const ms = Date.now() - t0;
let e0 = Date.now(), ne = 0, s = G.fromReq(S[1]); while (Date.now() - e0 < 500) { buf.fill(0); G.encode(s, buf); ne++; }
console.log(`${games} 局、${plies} 手，${(plies / ms * 1000 | 0)} 手/秒（legal+play+terminal），encode ${(ne * 2)} 次/秒`);
