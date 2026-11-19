// 八國聯軍「長條地圖」的規則測試與電腦自我對局：node tools/bgltest.js [局數=0] [--rr] [--seed=N] [--max=步數上限]
// 直接從 index.html 切出「八國聯軍：規則引擎」「二次大戰：規則引擎」「控制流程」與「打包／解包」來跑，永遠和網頁同一份規則。
// 檢查：地圖大小、子數、陣地（清軍整條、各國不重疊、前排有空隙、後排正對空隙）、各國開局都有合法步、
// 後排國家的長程子幾步內能經空隙出擊、清軍每隻馬正前方空且有步、車有直通中央的路、炮有炮架、升變、打包解包、
// 開新局讀 xq-bg-map、長條地圖不呼叫下棋模型、悔棋、切回十字形完全不變。
// 局數 > 0 時跑長條地圖的電腦自我對局（兩方都是 bgAI；--rr 用「八國各一步、清軍連三步」），統計清軍勝／聯軍勝／未分。
const fs = require('fs'), vm = require('vm'), path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const cut = (a, b) => { const i = html.indexOf(a), j = html.indexOf(b, i); if (i < 0 || j < 0) throw new Error('找不到段落 ' + a); return html.slice(i, j); };
const line = a => { const i = html.indexOf(a); if (i < 0) throw new Error('找不到 ' + a); return html.slice(i, html.indexOf('\n', i)); };
const src = cut('/* ===== 八國聯軍：規則引擎', '/* ===== 八國聯軍：控制流程') + '\n'
  + cut('/* ===== 二次大戰：規則引擎＋', '/* ===== 二次大戰：規則引擎（完）') + '\n'
  + cut('/* ===== 八國聯軍：控制流程', '/* ---------- 畫面') + '\n'
  + line('function bgPack(') + '\n' + line('function bgUnpack(') + '\n';
const args = process.argv.slice(2), opt = k => { const a = args.find(x => x.startsWith('--' + k + '=')); return a ? a.slice(k.length + 3) : null; };
const pos = args.filter(a => !a.startsWith('--')), games = +pos[0] || 0, RR = args.includes('--rr'), MAXP = +opt('max') || (RR ? 1100 : 600);
let z = +opt('seed') | 0;
const M = Object.create(Math); if (z) M.random = () => { z ^= z << 13; z ^= z >>> 17; z ^= z << 5; return (z >>> 0) / 4294967296; };
const noop = () => {}, store = {};
const ctx = vm.createContext({ Math: M, console, Uint8Array, Array, Object, JSON, Set, Map, Date, Promise,
  document: { addEventListener: noop, querySelectorAll: () => [] }, localStorage: { getItem: k => store[k] ?? null, setItem: (k, v) => { store[k] = v; } },
  $: () => ({ style: {}, classList: { toggle: noop }, dataset: {}, getBoundingClientRect: () => ({ width: 390, height: 700 }) }),
  setTimeout: f => { ctx.__t = f; return 1; }, clearTimeout: noop, R: null, BR: { ok: false }, aiLevel: 3,
  brainThink: () => { ctx.__brain = (ctx.__brain || 0) + 1; return new Promise(() => {}); } });
vm.runInContext(src + '\nthis.__BG=BG;', ctx);
const E = k => vm.runInContext(k, ctx), BG = ctx.__BG;
E('bgRender=()=>{};bgPush=()=>{};bgShow=()=>{};bgFit=()=>{};');
let fail = 0; const ok = (c, m) => { if (!c) { fail++; console.log('FAIL', m); } };
const OWN = E('BG_OWN');
const play = (st, mv) => ctx.bgApply(st, mv[0], mv[1]);
const key = st => st.b.map(p => p ? p.s + p.t + p.n + (p.m ? 'm' : '') : '').join(',') + '|' + st.turn + st.ql + JSON.stringify(st.mv) + st.seq + JSON.stringify(st.dead);

// ---- 十字形先記下來，換長條再換回來要完全一樣 ----
const crossW = E('BG_W'), crossH = E('BG_H'), crossNat = JSON.stringify(E('BG_NATIONS'));
E('bgSetMap("l")');
const W = E('BG_W'), H = E('BG_H'), QY = E('BGL_QY'), NAT = E('BG_NATIONS'), idx = (x, y) => y * W + x;
ok(E('BG_MAP') === 'l', 'BG_MAP 應是 l');
ok(W >= 38 && W <= 44 && H >= 20 && H <= 28, '地圖大小 ' + W + 'x' + H);
ok(E('BG_VALID').every(v => v === 1), '長條地圖每一格都有效');
ok(NAT.every(N => N.side === 't'), '八國都在上方（前進方向朝下）');
ok(NAT.every((N, n) => JSON.stringify(E('bgDir(' + n + ')')) === '[0,1]'), '八國前進方向都朝下');
ok(H - QY >= 4 && H - QY <= 6, '清軍 4～6 列深（實際 ' + (H - QY) + '）');

// ---- 開局陣形 ----
const draw = st => { let s = ''; for (let y = 0; y < H; y++) { let r = ''; for (let x = 0; x < W; x++) { const p = st.b[idx(x, y)]; r += p ? p.t : '·'; } s += String(y).padStart(2) + ' ' + r + '\n'; } return s; };
for (const rr of [false, true]) {
  const st = ctx.bgNew(OWN, rr), q = st.b.filter(p => p && p.s === 'Q'), byT = {};
  q.forEach(p => byT[p.t] = (byT[p.t] || 0) + 1);
  const nA = NAT.map((N, n) => st.b.filter(p => p && p.s === 'A' && p.n === n).length);
  console.log((rr ? '新輪流方式' : '一步換一步') + '：清軍', q.length, '子', JSON.stringify(byT), '｜各國', NAT.map((N, n) => N.n + nA[n]).join(' '));
  if (!rr) { console.log(draw(st)); ok(q.length >= 96 && q.length <= 104, '清軍子數 ' + q.length); }
  else ok(q.length === ctx.bgNew(OWN, false).b.filter(p => p && p.s === 'Q').length, '新輪流方式清軍陣形不變');
  ok(byT.X === 1 && byT.Y === 1, '慈、禧各一');
  ok(nA.every((c, n) => c === (E('BG_KIND')[n] === 'sh' ? 18 : 16)), '各國子數');
  st.b.forEach((p, i) => { if (!p) return; const x = i % W, y = (i / W) | 0;
    if (p.s === 'Q') ok(E(`bgPalm(${x},${y})`), '清軍棋子不在陣地 ' + x + ',' + y);
    else { const h = E(`bgHome(${p.n})`); ok(x >= h.x && x < h.x + h.w && y >= h.y && y < h.y + h.h, NAT[p.n].n + ' 棋子不在自己陣地'); } });
}
// 慈、禧在最後一列中間附近，士、相在旁邊
{ const st = ctx.bgNew(OWN), at = t => st.b.map((p, i) => p && p.s === 'Q' && p.t === t ? i : -1).filter(i => i >= 0);
  for (const i of [...at('X'), ...at('Y')]) { ok(((i / W) | 0) === H - 1, '慈禧在最後一列'); ok(Math.abs(i % W - (W - 1) / 2) <= 4, '慈禧在中間附近'); }
  for (const i of [...at('A'), ...at('E')]) ok(Math.abs(i % W - (W - 1) / 2) <= 7, '士相在慈禧旁邊');
  ok(at('G').every(i => ((i / W) | 0) === QY), '將在清軍前緣');
  ok(at('G').every(i => !st.b[i - 1] || st.b[i - 1].t !== 'G'), '將隔一格一顆'); }

// ---- 各國陣地：不重疊、前排有空隙、後排正對空隙 ----
{ const homes = NAT.map((N, n) => E(`bgHome(${n})`)), cells = new Map();
  homes.forEach((h, n) => { for (let y = h.y; y < h.y + h.h; y++) for (let x = h.x; x < h.x + h.w; x++) { ok(!cells.has(idx(x, y)), '陣地重疊 ' + NAT[n].n); cells.set(idx(x, y), n); } ok(h.x >= 0 && h.x + h.w <= W && h.y + h.h < QY, '陣地超出範圍'); });
  const front = NAT.map((N, n) => n).filter(n => NAT[n].row === '前排').sort((a, b) => homes[a].x - homes[b].x), back = NAT.map((N, n) => n).filter(n => NAT[n].row === '後排');
  ok(front.length === 4 && back.length === 4, '前排 4 國、後排 4 國');
  for (let k = 1; k < front.length; k++) ok(homes[front[k]].x - (homes[front[k - 1]].x + 8) >= 2, '前排國與國之間至少空 2 路');
  const fy = homes[front[0]].y, open = x => front.every(n => x < homes[n].x || x >= homes[n].x + 8);
  for (const n of back) { const h = homes[n], gaps = []; for (let x = h.x; x < h.x + 8; x++) if (open(x)) gaps.push(x);
    ok(gaps.length >= 2, NAT[n].n + ' 前面要有空隙（實際 ' + gaps.join(',') + '）'); ok(h.y + 2 <= fy, NAT[n].n + ' 在前排後面'); }
  console.log('前排', front.map(n => NAT[n].n + homes[n].x + '～' + (homes[n].x + 7)).join(' '), '｜後排', back.map(n => NAT[n].n + homes[n].x + '～' + (homes[n].x + 7)).join(' '));
}

// ---- 各國開局都有合法步；後排的長程子能在幾步內經空隙出擊 ----
const LONG = new Set(['q', 'r', 'b', 'e', 'c', 'd', 'y']);
function reach(st0, n, depth, goalY) {   // 只動 n 這一國，depth 步內有沒有長程子走到 goalY（含）以下
  const go = (st, d) => { const mv = []; for (let i = 0; i < st.b.length; i++) { const p = st.b[i]; if (p && p.s === 'A' && p.n === n) for (const t of ctx.bgMoves(st, i, false)) if (!st.b[t]) mv.push([i, t]); }
    for (const [f, t] of mv) if (LONG.has(st.b[f].t) && ((t / W) | 0) >= goalY) return d;
    if (d >= depth) return 0;
    for (const [f, t] of mv) { const c = ctx.bgClone(st); c.turn = 'A'; ctx.bgApply(c, f, t); c.turn = 'A'; const r = go(c, d + 1); if (r) return r; }
    return 0; };
  return go(st0, 1); }
for (const kinds of [OWN, Array(8).fill('ch')]) {
  const st = ctx.bgNew(kinds); st.turn = 'A';
  const has = NAT.map((N, n) => ctx.bgAll(st, 'A', false).filter(([f]) => st.b[f].n === n).length);
  ok(has.every(c => c > 0), '各國開局都有合法步 ' + has.join(','));
  const gy = Math.max(...NAT.map((N, n) => { const h = E(`bgHome(${n})`); return h.y + h.h; }));   // 走出前排（前排最下面的下一列）
  const steps = NAT.map((N, n) => N.row === '後排' ? reach(st, n, 4, gy) : -1);
  console.log((kinds === OWN ? '代表棋' : '全西洋棋') + '：開局可走', NAT.map((N, n) => N.n + has[n]).join(' '), '｜後排長程子走出前排（第 ' + gy + ' 列）要幾步', NAT.map((N, n) => N.row === '後排' ? N.n + steps[n] : '').filter(Boolean).join(' '));
  NAT.forEach((N, n) => { if (N.row === '後排') ok(steps[n] > 0 && steps[n] <= 4, N.n + ' 的長程子 4 步內出不去'); });
}

// ---- 清軍：馬、車、炮 ----
{ const st = ctx.bgNew(OWN), Q = (t) => st.b.map((p, i) => p && p.s === 'Q' && p.t === t ? i : -1).filter(i => i >= 0);
  for (const i of Q('H')) { const x = i % W, y = (i / W) | 0; ok(!st.b[idx(x, y - 1)], '馬正前方有棋 ' + x + ',' + y);
    const mv = ctx.bgMoves(st, i, false); ok(mv.length > 0, '馬沒有步 ' + x + ',' + y); ok(mv.some(t => ((t / W) | 0) < y), '馬不能往前跳 ' + x + ',' + y); }
  let open = 0; for (const i of Q('R')) { const x = i % W, y = (i / W) | 0; let k = y - 1; while (k >= QY && !st.b[idx(x, k)]) k--; if (k < QY) open++; }
  ok(open >= 8, '能直接開出去的車只有 ' + open); console.log('清軍：車', Q('R').length, '（開局就能直通中央', open, '）、馬', Q('H').length, '、炮', Q('C').length);
  for (const i of Q('C')) { const x = i % W, y = (i / W) | 0; let k = y - 1, scr = 0; while (k >= QY) { if (st.b[idx(x, k)]) scr++; k--; } ok(scr === 1, '炮前面要剛好一個炮架 ' + x + ',' + y); }
  st.turn = 'Q'; ok(ctx.bgAll(st, 'Q', false).length > 0, '清軍開局有步');
  // 將、士、相、慈、禧不能出陣地
  for (const i of [...Q('G'), ...Q('A'), ...Q('E'), ...Q('X'), ...Q('Y')]) for (const t of ctx.bgMoves(st, i, false)) ok(((t / W) | 0) >= QY, '將士相慈禧走出陣地');
  // 開局第一步清軍不能吃到兵以外的棋
  for (const [f, t] of ctx.bgAll(st, 'Q', true)) ok('pu'.includes(st.b[t].t), '清軍第一步就能吃到 ' + st.b[t].t); }

// ---- 升變、撤退、勝負 ----
{ const st = ctx.bgNew(OWN); st.b.fill(null); st.b[idx(20, H - 1)] = { s: 'Q', t: 'X', n: -1 }; st.b[idx(22, H - 1)] = { s: 'Q', t: 'Y', n: -1 };
  st.b[idx(5, H - 2)] = { s: 'A', t: 'p', n: 2, m: 1 }; st.b[idx(0, 0)] = { s: 'A', t: 'k', n: 2 }; st.turn = 'A';
  play(st, [idx(5, H - 2), idx(5, H - 1)]); ok(st.b[idx(5, H - 1)].t === 'q', '兵走到最下面升變皇后');
  st.b[idx(8, QY - 1)] = { s: 'A', t: 'r', n: 1, m: 1 }; st.b[idx(14, 3)] = { s: 'A', t: 'k', n: 1 }; st.turn = 'A';
  play(st, [idx(8, QY - 1), idx(8, QY)]); ok(st.b[idx(8, QY)].t === 'd', '日本飛車進清軍陣地升變龍');
  st.b[idx(14, 4)] = { s: 'Q', t: 'R', n: -1 }; st.turn = 'Q'; play(st, [idx(14, 4), idx(14, 3)]); ok(st.dead[1] && !st.b.some(p => p && p.s === 'A' && p.n === 1), '日本王被吃整隊撤退');
  st.b[idx(20, H - 2)] = { s: 'A', t: 'q', n: 2 }; st.turn = 'A'; play(st, [idx(20, H - 2), idx(20, H - 1)]); ok(!st.over, '只吃一顆慈還沒贏');
  st.turn = 'A'; play(st, [idx(20, H - 1), idx(21, H - 1)]); st.turn = 'A'; play(st, [idx(21, H - 1), idx(22, H - 1)]); ok(st.over && st.over.win === 'A', '慈禧都被吃聯軍贏'); }

// ---- 打包解包；切回十字形完全一樣 ----
{ const st = ctx.bgNew(OWN); for (let k = 0; k < 6; k++) play(st, ctx.bgAI(st));
  const pk = JSON.parse(JSON.stringify(ctx.bgPack(st))); ok(pk.map === 'l', '長條地圖打包帶 map:l');
  E('bgSetMap("x")'); ok(E('BG_W') === crossW, '換回十字形');
  const u = ctx.bgUnpack(pk); ok(E('BG_MAP') === 'l' && E('BG_W') === W, '解包時換成長條地圖'); ok(key(u) === key(st), '打包解包後局面一樣');
  ok(ctx.bgAll(u, u.turn, false).length === ctx.bgAll(st, st.turn, false).length, '解包後可走的一樣');
  const sr = ctx.bgNew(OWN, true); for (let k = 0; k < 5; k++) play(sr, ctx.bgAI(sr)); const pr = JSON.parse(JSON.stringify(ctx.bgPack(sr))), ur = ctx.bgUnpack(pr);
  ok(pr.map === 'l' && pr.rr === 1 && key(ur) === key(sr), '長條＋新輪流方式打包解包');
  E('bgSetMap("x")'); const sx = ctx.bgNew(OWN), px = ctx.bgPack(sx); ok(!('map' in px), '十字形打包不帶 map');
  ok(E('BG_W') === crossW && E('BG_H') === crossH && JSON.stringify(E('BG_NATIONS')) === crossNat && ctx.bgUnpack(px).b.length === crossW * crossH, '十字形設定完全不變');
  E('bgSetMap("l")'); ctx.bgUnpack(px); ok(E('BG_MAP') === 'x', '收到十字形局面就換回十字形');
  E('bgUse("w2")'); ok(E('BG_MAP') === 'x' && E('BG_W') === 36, '二次大戰不受影響'); E('bgUse("bg")'); ok(E('BG_MAP') === 'x' && E('BG_W') === crossW, 'bgUse(bg) 換回十字形'); }

// ---- 控制流程：開局讀設定、不呼叫下棋模型、悔棋 ----
{ store['xq-bg-map'] = 'l'; BG.role = 'solo'; BG.me = 'A'; BG.seats = []; BG.mySeat = 1; E('bgUse("bg");bgNewGame()');
  ok(E('BG_MAP') === 'l' && BG.st.b.length === W * H, '設定 xq-bg-map=l 開新局用長條地圖');
  ctx.BR.ok = true; ctx.__brain = 0; ctx.__t = null; E('bgSchedule()'); ok(typeof ctx.__t === 'function', '清軍（電腦）排了下一步'); ctx.__t();
  ok(ctx.__brain === 0, '長條地圖不呼叫下棋模型'); ok(BG.st.turn === 'A' && BG.st.seq === 1, '電腦清軍走了一步');
  const k0 = key(BG.st), mv = ctx.bgAI(BG.st); E(`bgDo(${mv[0]},${mv[1]})`); ok(BG.st.turn === 'Q', '我（聯軍）走完換清軍');
  E('bgUndo()'); ok(key(BG.st) === k0, '悔棋回到我走之前');
  store['xq-bg-rr'] = '1'; E('bgNewGame()'); ok(BG.st.rr === 1 && E('BG_MAP') === 'l', '長條＋新輪流方式');
  ctx.__brain = 0; ctx.__t = null; E('bgSchedule()'); ctx.__t(); ok(ctx.__brain === 0 && BG.st.turn === 'A' && BG.st.ql === 4, '新輪流方式電腦清軍走了一步、沒呼叫模型');
  // 對照：十字形舊規則有模型時會呼叫
  store['xq-bg-map'] = 'x'; store['xq-bg-rr'] = '0'; E('bgNewGame()'); ctx.__brain = 0; ctx.__t = null; E('bgSchedule()'); ctx.__t(); ok(ctx.__brain === 1 && E('BG_MAP') === 'x', '十字形舊規則照舊呼叫下棋模型');
  ctx.BR.ok = false; store['xq-bg-map'] = 'l'; E('bgSetMap("l")'); }
// 新輪流方式在長條地圖上：清軍一步、四國、清軍一步、另外四國
{ const st = ctx.bgNew(OWN, true), seen = new Set();
  for (let h = 0; h < 2; h++) { ok(st.turn === 'Q', '清軍第 ' + (h + 1) + ' 步'); play(st, ctx.bgAI(st)); let n = 0;
    while (st.turn === 'A' && !st.over && n < 10) { const mv = ctx.bgAI(st), who = st.b[mv[0]].n; ok(!seen.has(who), '一輪同一國走兩次'); seen.add(who); play(st, mv); n++; }
    ok(st.over || n === 4, '半輪走 4 國（' + n + '）'); }
  ok(st.over || (seen.size === 8 && st.turn === 'Q'), '一輪八國各走一次'); }
console.log(fail ? '失敗 ' + fail : '長條地圖規則檢查通過');

// ---- 電腦自我對局 ----
if (games > 0) {
  E('bgSetMap("l")');
  const res = { Q: 0, A: 0, d: 0 }; let t0 = Date.now(), plies = 0;
  for (let g = 0; g < games; g++) {
    const st = ctx.bgNew(OWN, RR); let k = 0;
    for (; k < MAXP && !st.over; k++) { const mv = ctx.bgAI(st); if (!mv) break; ok(st.b[mv[0]].s === st.turn, '走錯邊'); play(st, mv); }
    if (st.over) res[st.over.win]++; else res.d++; plies += k;
    console.log('局', g, st.over ? st.over.win + ' ' + st.over.why : '未分勝負', k, '步', '陣亡國', st.dead.filter(x => x).length, '慈禧', st.b.filter(p => p && (p.t === 'X' || p.t === 'Y')).length);
  }
  console.log('RESULT', RR ? 'rr' : 'alt', JSON.stringify(res), '平均每局', (plies / games).toFixed(0), '步', '平均每步 ms', ((Date.now() - t0) / plies).toFixed(1));
  console.log(fail ? '失敗 ' + fail : '自我對局檢查通過');
}
process.exitCode = fail ? 1 : 0;
