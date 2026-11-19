// 二次大戰規則測試與平衡測試：node tools/w2test.js [局數=0] [擺法 JSON]
// 直接從 index.html 切出「八國聯軍：規則引擎」（共用的 bgMoves／bgAI）和「二次大戰：規則引擎」兩段來跑，永遠和網頁同一份規則。
// 局數 > 0 時跑電腦自我對局（上限 W2_MAX 步）統計勝負；第二個參數可以給另一種擺法（同 W2_DEF 的格式）做平衡比較；--seed=N 固定亂數。
const fs = require('fs'), vm = require('vm'), path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const cut = (a, b) => { const i = html.indexOf(a), j = html.indexOf(b); if (i < 0 || j < 0 || j < i) throw new Error('找不到段落 ' + a); return html.slice(i, j); };
const src = cut('/* ===== 八國聯軍：規則引擎', '/* ===== 八國聯軍：控制流程') + '\n' + cut('/* ===== 二次大戰：規則引擎＋', '/* ===== 二次大戰：規則引擎（完）');
const args = process.argv.slice(2), seedArg = args.find(a => a.startsWith('--seed=')), pos = args.filter(a => !a.startsWith('--'));
// 有 --seed 時用可重現的亂數（xorshift32），沒有時用內建亂數
let z = seedArg ? (+seedArg.slice(7) | 0) || 1 : 0;
const M = Object.create(Math); if (z) M.random = () => { z ^= z << 13; z ^= z >>> 17; z ^= z << 5; return (z >>> 0) / 4294967296; };
const ctx = vm.createContext({ Math: M, console, Uint8Array, Array, Object, JSON });
vm.runInContext(src, ctx);
const E = k => vm.runInContext(k, ctx), W2S = s => ({ X: '軸心國', L: '同盟國' })[s];
const games = +pos[0] || 0, lay = pos[1] ? JSON.parse(pos[1]) : null;
let fail = 0; const ok = (c, m) => { if (!c) { fail++; console.log('FAIL', m); } };

E('bgUse("w2"' + (lay ? ',' + JSON.stringify(lay) : '') + ')');
const W = E('BG_W'), H = E('BG_H'), NAT = E('BG_NATIONS');
// ---- 地圖與子數 ----
const st0 = E('w2New()');
ok(W >= 30 && H >= 16, '地圖大小 ' + W + 'x' + H);
const cnt = NAT.map(() => 0); st0.b.forEach((p, i) => { if (p) { cnt[p.n]++; ok(p.s === NAT[p.n].s, '陣營不對'); } });
console.log('地圖', W + 'x' + H, '先走', E('W2.first'), '各國子數', NAT.map((N, n) => N.n + cnt[n]).join(' '));
let s = ''; for (let y = 0; y < H; y++) { let r = ''; for (let x = 0; x < W; x++) { const p = st0.b[y * W + x]; r += p ? p.t : '·'; } s += r + '\n'; } console.log(s);
const base = { de: 24, jp: 20, it: 16, uk: 16, us: 16, su: 16, roc: 16 };
if (!lay) NAT.forEach((N, n) => ok(cnt[n] === base[N.key] + N.add.join('').replace(/\./g, '').length, N.n + ' 子數 ' + cnt[n]));
// 每國一個王
NAT.forEach((N, n) => ok(st0.b.filter(p => p && p.n === n && (p.t === 'k' || p.t === 'G')).length === 1, N.n + ' 只有一個王'));
// 每國的棋都在自己陣地裡、各國陣地不重疊
const own = new Map(); NAT.forEach((N, n) => { const h = E('w2Home(' + n + ')'); for (let y = h.y; y < h.y + h.h; y++)for (let x = h.x; x < h.x + h.w; x++) { const k = y * W + x; ok(!own.has(k), '陣地重疊 ' + N.n); own.set(k, n); ok(x >= 0 && x < W && y >= 0 && y < H, '陣地超出地圖'); } });
st0.b.forEach((p, i) => { if (p) ok(own.get(i) === p.n, '棋子不在自己陣地 ' + i); });
// 德國完整 12 路信使棋、日本完整 9 路將棋（兩隻桂）
const types = n => st0.b.filter(p => p && p.n === n).map(p => p.t).join('');
const DE = NAT.findIndex(N => N.key === 'de'), JP = NAT.findIndex(N => N.key === 'jp'), RC = NAT.findIndex(N => N.key === 'roc'), SU = NAT.findIndex(N => N.key === 'su');
const c = (n, t) => types(n).split(t).length - 1;
ok(c(DE, 'c') === 2 && c(DE, 'a') === 2 && c(DE, 'n') >= 2 && c(DE, 'm') === 1 && c(DE, 'f') === 1 && c(DE, 'w') === 1 && c(DE, 'p') >= 12, '德國 12 路信使棋');
ok(c(JP, 'j') === 2 && c(JP, 'u') >= 9 && c(JP, 'l') === 2, '日本 9 路將棋');
ok(c(RC, 'G') === 1 && c(RC, 'A') === 2 && c(RC, 'E') === 2 && c(RC, 'C') === 2 && c(RC, 'P') === 5, '中華民國象棋子');
ok(c(SU, 'o') === 1, '蘇聯有王前兵');
// 各國開局都有合法步
NAT.forEach((N, n) => { const L = E('bgAll')({ ...st0, turn: N.s }, N.s, false).filter(([f]) => st0.b[f].n === n); ok(L.length > 0, N.n + ' 開局沒有棋可以走'); });
console.log('開局可走：', NAT.map((N, n) => N.n + E('bgAll')({ ...st0, turn: N.s }, N.s, false).filter(([f]) => st0.b[f].n === n).length).join(' '));
// 開局雙方都不能一步就吃到對方兵以外的棋（例如中華民國的炮隔著對面的兵打底線；隔著自己的兵吃對面的兵會被吃回，允許）
['X', 'L'].forEach(s => ok(E('bgAll')({ ...st0, turn: s }, s, true).filter(([f, t]) => !'pu'.includes(st0.b[t].t)).length === 0, W2S(s) + ' 開局就能吃到大子'));
// ---- 規則小測試 ----
{ const blank = () => { const st = E('w2New()'); st.b.fill(null); return st; }, at = (x, y) => y * W + x, mv = (st, i) => E('bgMoves')(st, i, false);
  // 帥、仕、相只能在中華民國陣地；兵過河才能橫走
  const R0 = NAT[RC].at; let st = blank(); st.b[at(R0 + 4, H - 5)] = { s: 'L', t: 'G', n: RC }; ok(mv(st, at(R0 + 4, H - 5)).every(t => ((t / W) | 0) >= H - 5), '帥不能出陣地');
  st = blank(); st.b[at(R0 + 4, H - 4)] = { s: 'L', t: 'P', n: RC }; ok(mv(st, at(R0 + 4, H - 4)).length === 1, '兵沒過河只能往前');
  st = blank(); st.b[at(R0 + 4, 3)] = { s: 'L', t: 'P', n: RC }; ok(mv(st, at(R0 + 4, 3)).length === 3, '兵過河可以橫走');
  // 同陣營不能互吃
  st = blank(); st.b[at(5, 10)] = { s: 'L', t: 'r', n: 3 }; st.b[at(5, 8)] = { s: 'L', t: 'r', n: 4 }; st.b[at(5, 5)] = { s: 'X', t: 'r', n: 0 };
  ok(!mv(st, at(5, 10)).includes(at(5, 8)), '同陣營不能互吃'); ok(mv(st, at(5, 8)).includes(at(5, 5)), '可以吃對方');
  // 國王被吃整隊撤退
  st = E('w2New()'); const ki = st.b.findIndex(p => p && p.n === 3 && p.t === 'k'); st.b[ki - W] = { s: 'X', t: 'q', n: 2 }; st.turn = 'X';
  E('w2Apply')(st, ki - W, ki); ok(st.dead[3] && !st.b.some(p => p && p.n === 3), '國王被吃整隊撤退'); ok(!st.over, '只吃一國不結束');
  // 日本走進敵陣升變；兵走到盡頭升變（信使棋變小后）
  st = blank(); st.b[at(3, H - 4)] = { s: 'X', t: 'r', n: JP }; st.turn = 'X'; E('w2Apply')(st, at(3, H - 4), at(3, H - 3)); ok(st.b[at(3, H - 3)].t === 'd', '飛進敵陣變龍');
  st = blank(); st.b[at(3, H - 2)] = { s: 'X', t: 'p', n: DE, m: 1 }; st.turn = 'X'; E('w2Apply')(st, at(3, H - 2), at(3, H - 1)); ok(st.b[at(3, H - 1)].t === 'f', '信使棋的兵變小后');
  st = blank(); st.b[at(3, 1)] = { s: 'L', t: 'o', n: SU, m: 1 }; st.turn = 'L'; E('w2Apply')(st, at(3, 1), at(3, 0)); ok(st.b[at(3, 0)].t === 'e', '王前兵變赫爾吉');
  // 打包解包
  st = E('w2New()'); const u = E('w2Unpack')(JSON.parse(JSON.stringify(E('w2Pack')(st)))); ok(JSON.stringify(u.b.map(p => p && [p.s, p.t, p.n])) === JSON.stringify(st.b.map(p => p && [p.s, p.t, p.n])), '打包解包');
}
console.log(fail ? '規則檢查失敗 ' + fail : '規則檢查通過');
// ---- 自我對局 ----
if (games > 0) {
  const res = { X: 0, L: 0, D: 0 }, t0 = Date.now(); let plies = 0, lens = [];
  for (let g = 0; g < games; g++) {
    const st = E('w2New()'); let k = 0;
    for (; !st.over && k < 2000; k++) { const m = E('bgAI')(st); if (!m) break; const p = st.b[m[0]], q = st.b[m[1]]; if (!p || p.s !== st.turn || (q && q.s === p.s)) { ok(false, '電腦走錯'); break; } E('w2Apply')(st, m[0], m[1]); }
    plies += k; lens.push(k); const w = st.over ? st.over.win : 'D'; res[w]++;
    if (process.env.W2V) console.log('局', g, w, k, '步', st.over && st.over.why, '陣亡', NAT.filter((N, n) => st.dead[n]).map(N => N.n).join(''));
  }
  console.log('RESULT', JSON.stringify(res), '平均步數', (plies / games).toFixed(0), '每步 ms', ((Date.now() - t0) / plies).toFixed(1));
}
console.log(fail ? '失敗 ' + fail : '全部通過');
process.exitCode = fail ? 1 : 0;
