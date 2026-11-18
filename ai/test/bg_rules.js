// 八國聯軍轉接器對照測試：node ai/test/bg_rules.js [局數=12]
// 每一手都拿 ai/games/bg.js 的 legal()/play() 和 index.html 的 bgAll()/bgApply() 對照（含 only 限制國家、升變、國王被吃整國撤退、勝負），
// 兩隊都讓舊引擎 bgAI 下一部分棋（check.js 的老師只會在清軍回合出手），最後量 legal()+play() 的速度。
const vm = require('vm'), G = require('../games/bg.js'), E = require('./engines.js');
const ctx = E.bgContext(), N = G.W * G.H, games = +process.argv[2] || 12;
let fail = 0; const bad = (m, x) => { fail++; if (fail <= 20) console.log('✗', m, x !== undefined ? JSON.stringify(x).slice(0, 300) : ''); };
let z = 777; const rng = () => ((z = (z * 1103515245 + 12345) >>> 0) / 4294967296);
const setKinds = k => vm.runInContext('BG_KIND=' + JSON.stringify(k) + ';', ctx);
const boardKey = b => b.map(p => p ? p.s + p.t + p.n + (p.s === 'A' && p.m ? 'm' : '') : '').join(',');
const starts = G.starts();
let plies = 0, aiA = 0, aiAok = 0, onlyTests = 0, ends = {};
for (let g = 0; g < games; g++) {
  const req = JSON.parse(JSON.stringify(starts[g % starts.length])); setKinds(req.kinds);
  let s = G.fromReq(req), u = JSON.parse(JSON.stringify(req.st));
  for (let ply = 0; ply < 500 && !s.over && s.over !== 0 && s.over !== -1; ply++, plies++) {
    if (s.over !== null) break;
    const side = u.turn, L = G.legal(s), want = ctx.bgAll(u, side, false).map(([f, t]) => f * N + t);
    const a = new Set(L), bset = new Set(want);
    if (a.size !== bset.size || [...a].some(m => !bset.has(m))) { bad('合法走法不一致', { g, ply, mine: L.length, ui: want.length }); break; }
    // only：隨機挑幾國，和 bgAI 的 only 篩選比對
    if (side === 'A' && rng() < 0.3) {
      const alive = [0, 1, 2, 3, 4, 5, 6, 7].filter(n => !u.dead[n]), only = alive.filter(() => rng() < 0.4); if (!only.length) only.push(alive[0]);
      const r2 = { st: u, kinds: req.kinds, only }, s2 = G.fromReq(JSON.parse(JSON.stringify(r2))), L2 = G.legal(s2);
      const w2 = want.filter(m => only.includes(u.b[(m / N) | 0].n)); onlyTests++;
      const okSet = w2.length ? (L2.length === w2.length && L2.every(m => w2.includes(m))) : L2.length === want.length;
      if (!okSet) bad('only 篩選不一致', { g, ply, only, mine: L2.length, ui: w2.length });
      const mv = E.call({ v: 'bg', ...r2 }); if (mv) { aiA++; if (L2.includes(mv[0] * N + mv[1])) aiAok++; else bad('bgAI(only) 走法不在 legal()', mv); }
    }
    let m;
    if (rng() < 0.35) { const mv = E.call({ v: 'bg', st: u, kinds: req.kinds, only: null }); m = mv[0] * N + mv[1]; if (!a.has(m)) bad('bgAI 走法不在 legal()', mv); }
    else m = L[(rng() * L.length) | 0];
    s = G.play(s, m).s; const [f, t] = G.toRes(null, m); ctx.bgApply(u, f, t);
    const ui2 = G.toUI(s);
    if (boardKey(ui2.b) !== boardKey(u.b)) { bad('play 後棋盤不一致', { g, ply, f, t }); break; }
    if (JSON.stringify(ui2.dead) !== JSON.stringify(u.dead) || ui2.turn !== u.turn) bad('dead/turn 不一致', { g, ply });
    const uo = u.over ? (u.over.win === 'A' ? 1 : 0) : null;
    if (uo !== (s.over === -1 ? null : s.over)) { bad('勝負不一致', { g, ply, ui: u.over, mine: s.over }); break; }
  }
  const k = s.over === null ? 'none' : s.over; ends[k] = (ends[k] || 0) + 1;
}
console.log(`對照 ${games} 局、${plies} 手；only 測試 ${onlyTests} 次；bgAI(only) 走法 ${aiAok}/${aiA} 合法；結果`, ends);
// 速度：從開局做隨機對局，量 legal()+play()
{
  let t0 = Date.now(), n = 0, sum = 0;
  for (let g = 0; g < 6; g++) {
    let s = G.fromReq(JSON.parse(JSON.stringify(starts[g])));
    for (let k = 0; k < 300 && s.over === null; k++) { const L = G.legal(s); sum += L.length; n++; s = G.play(s, L[(rng() * L.length) | 0]).s; }
  }
  const ms = Date.now() - t0; console.log(`速度：${n} 次 legal()+play() 共 ${ms} ms，平均 ${(ms / n * 1000).toFixed(0)} µs／次；平均合法走法 ${(sum / n).toFixed(1)}`);
  const buf = new Float32Array(40 * N), s = G.fromReq(JSON.parse(JSON.stringify(starts[0]))); t0 = Date.now(); for (let i = 0; i < 500; i++) { buf.fill(0); G.encode(s, buf); }
  console.log(`encode 平均 ${((Date.now() - t0) / 500 * 1000).toFixed(0)} µs`);
}
console.log(fail ? `✗ 共 ${fail} 個問題` : '✓ 全部一致');
process.exit(fail ? 1 : 0);
