// 八國聯軍「每四國走完，清軍走一步」輪流方式的規則測試與電腦自我對局：node tools/bgrrtest.js [局數=0] [--seed=N] [--max=步數上限]
// 直接從 index.html 切出「八國聯軍：規則引擎」「控制流程（誰可以走、開局、悔棋）」「打包／解包」與「二次大戰：規則引擎」來跑，永遠和網頁同一份規則。
// 檢查：清軍一次一步、聯軍每半輪 4 國、每輪八國各走一次、中途國王被吃、活著不足 4 國、中途獲勝、沒棋可走的國家跳過、打包解包、悔棋、連線順序；舊規則局面不帶新欄位。
// 局數 > 0 時用 bgAI 跑新規則的電腦自我對局（兩方都是啟發式，上限預設 1100 步≈110 輪），統計清軍勝／聯軍勝／未分。
const fs = require('fs'), vm = require('vm'), path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const cut = (a, b) => { const i = html.indexOf(a), j = html.indexOf(b, i); if (i < 0 || j < 0) throw new Error('找不到段落 ' + a); return html.slice(i, j); };
const line = a => { const i = html.indexOf(a); if (i < 0) throw new Error('找不到 ' + a); return html.slice(i, html.indexOf('\n', i)); };
const src = cut('/* ===== 八國聯軍：規則引擎', '/* ===== 八國聯軍：控制流程') + '\n'
  + cut('/* ===== 二次大戰：規則引擎＋', '/* ===== 二次大戰：規則引擎（完）') + '\n'
  + cut('/* ===== 八國聯軍：控制流程', '/* ---------- 畫面') + '\n'
  + line('function bgPack(') + '\n' + line('function bgUnpack(') + '\n';
const args = process.argv.slice(2), opt = k => { const a = args.find(x => x.startsWith('--' + k + '=')); return a ? a.slice(k.length + 3) : null; };
const pos = args.filter(a => !a.startsWith('--')), games = +pos[0] || 0, MAXP = +opt('max') || 1100;
let z = +opt('seed') | 0;
const M = Object.create(Math); if (z) M.random = () => { z ^= z << 13; z ^= z >>> 17; z ^= z << 5; return (z >>> 0) / 4294967296; };
const noop = () => {}, el = new Proxy({}, { get: () => noop });
const ctx = vm.createContext({ Math: M, console, Uint8Array, Array, Object, JSON, Set, Map, Date,
  document: { addEventListener: noop, querySelectorAll: () => [] }, localStorage: { getItem: () => null, setItem: noop },
  $: () => ({ style: {}, classList: { toggle: noop }, dataset: {} }), setTimeout: () => 0, clearTimeout: noop, R: null, BR: { ok: false }, aiLevel: 3,
  bgRender: noop, bgFit: noop, bgShow: noop, bgPush: noop });
vm.runInContext(src + '\nthis.__BG=BG;', ctx);
const E = k => vm.runInContext(k, ctx), BG = ctx.__BG;
// 控制流程段落裡的 bgAfter 會呼叫畫面函式；畫面段落沒有載入，用空函式代替
E('bgRender=()=>{};bgPush=()=>{};bgShow=()=>{};bgFit=()=>{};');
let fail = 0; const ok = (c, m) => { if (!c) { fail++; console.log('FAIL', m); } };
const OWN = E('BG_OWN'), W = E('BG_W'), idx = (x, y) => y * W + x;
const nNat = st => st.b.filter(p => p && p.s === 'A').map(p => p.n);
const alive = st => [0, 1, 2, 3, 4, 5, 6, 7].filter(n => !st.dead[n]);
const key = st => st.b.map(p => p ? p.s + p.t + p.n + (p.m ? 'm' : '') : '').join(',') + '|' + st.turn + st.ql + JSON.stringify(st.mv) + st.seq + JSON.stringify(st.dead);
const play = (st, mv) => ctx.bgApply(st, mv[0], mv[1]);
const ai = st => ctx.bgAI(st);

// ---- 每四國走完，清軍走一步 ----
const qCnt = st => st.b.filter(p => p && p.s === 'Q').length;
{ const st = ctx.bgNew(OWN, true); ok(st.rr === 1 && st.ql === 4 && st.mv.length === 8 && st.turn === 'Q', '新規則開局');
  ok(qCnt(st) === qCnt(ctx.bgNew(OWN)), '新規則清軍陣形和舊規則一樣（不再少一排炮）');
  const rounds = [];
  for (let r = 0; r < 2; r++) {   // 跑兩輪：Q A×4 Q A×4 Q A×4 Q A×4
    const seen = new Set();
    for (let h = 0; h < 2; h++) {
      ok(st.turn === 'Q', `第 ${r + 1} 輪第 ${h + 1} 個半輪前是清軍`); play(st, ai(st)); if (st.over) break;
      ok(st.turn === 'A' && st.ql === 4, '清軍只走一步就換聯軍（半輪 4 國）');
      if (h === 0) ok(st.mv.every((x, n) => !x || st.dead[n]), '新的一輪：國家全部重新可走');
      const want = Math.min(4, ctx.bgRoundLeft(st, true).length); let n = 0;
      while (st.turn === 'A' && !st.over) {
        const L = ctx.bgAll(st, 'A', false), ns = new Set(L.map(([f]) => st.b[f].n));
        seen.forEach(x => ok(!ns.has(x), '這輪走過的國家還能走 ' + x));
        ok(ctx.bgRoundLeft(st, true).length === ns.size, 'bgRoundLeft 和 bgAll 不一致');
        const mv = ai(st), who = st.b[mv[0]].n; ok(!seen.has(who), '電腦挑了走過的國家'); seen.add(who); play(st, mv); n++;
        if (st.turn === 'A') ok(st.mv[who] && st.ql === 4 - n, '走完要記下來、半輪少一國');
      }
      if (!st.over) ok(n === want, `半輪走 ${want} 國（實際 ${n}）`);
    }
    rounds.push(seen.size);
  }
  ok(rounds.every(k => k === 8) || st.dead.some(x => x), '每輪八國各走一次 ' + rounds.join(','));
  // 第二個半輪走完、清軍走一步之後，開始新的一輪
  ok(st.turn === 'Q' || st.over, '兩個半輪後換清軍'); }

// ---- 中途國王被吃、沒棋可走的國家跳過、活著不足 4 國、中途獲勝 ----
// 自訂小局面：清軍一隻車、慈、禧；英國（2）國王＋一隻城堡、法國（4）國王＋一隻兵（被擋住）、德國（5）國王
const mk = () => { const st = ctx.bgNew(OWN, true); st.b.fill(null);
  st.b[idx(20, 33)] = { s: 'Q', t: 'X', n: -1 }; st.b[idx(22, 33)] = { s: 'Q', t: 'Y', n: -1 }; st.b[idx(4, 5)] = { s: 'Q', t: 'R', n: -1 };
  st.b[idx(4, 1)] = { s: 'A', t: 'k', n: 2 }; st.b[idx(10, 0)] = { s: 'A', t: 'r', n: 2 };
  st.b[idx(20, 0)] = { s: 'A', t: 'k', n: 4 }; st.b[idx(22, 8)] = { s: 'A', t: 'p', n: 4, m: 1 }; st.b[idx(22, 9)] = { s: 'Q', t: 'R', n: -1 };
  st.b[idx(28, 0)] = { s: 'A', t: 'k', n: 5 };
  for (const n of [0, 1, 3, 6, 7]) st.dead[n] = true; return st; };
{ const st = mk();
  play(st, [idx(4, 5), idx(4, 1)]);   // 清軍車吃英國國王
  ok(st.dead[2] && !nNat(st).includes(2), '英國國王被吃整隊撤退'); ok(st.turn === 'A' && st.ql === 4 && !st.over, '吃王後換聯軍');
  ok(JSON.stringify(ctx.bgRoundLeft(st, false)) === '[4,5]', '撤退的國家不用走');
  play(st, [idx(28, 0), idx(28, 1)]); ok(st.turn === 'A' && st.mv[5] && st.ql === 3, '德國走完還輪聯軍');
  ok(ctx.bgAll(st, 'A', false).every(([f]) => st.b[f].n === 4), '只剩法國能走');
  play(st, [idx(20, 0), idx(20, 1)]); ok(st.turn === 'Q', '活著的國家不足 4 國：都走過就換清軍');
  play(st, [idx(4, 1), idx(4, 2)]); ok(st.turn === 'A' && st.mv.every(x => !x), '這輪都走過了，清軍一步後開始新的一輪'); }
{ // 某國這輪沒有棋可走就跳過
  const st = mk(); st.turn = 'A'; st.b[idx(20, 0)] = null; st.b[idx(22, 7)] = { s: 'A', t: 'k', n: 4 };
  for (const [x, y] of [[21, 6], [23, 6], [21, 7], [23, 7], [21, 8], [23, 8]]) st.b[idx(x, y)] = { s: 'A', t: 'r', n: 2 };   // 法國國王四周被英國的城堡圍住（同一陣營不能互吃）
  st.b[idx(22, 6)] = { s: 'A', t: 'r', n: 2 }; st.b[idx(22, 8)] = { s: 'A', t: 'p', n: 4, m: 1 };
  ok(!ctx.bgAll(st, 'A', false).some(([f]) => st.b[f].n === 4), '法國被圍住沒有棋可走');
  ok(JSON.stringify(ctx.bgRoundLeft(st, true)) === '[2,5]', '沒棋可走的法國不算在還沒走的國家');
  const r1 = ctx.bgAll(st, 'A', false).find(([f, t]) => st.b[f].n === 5); play(st, r1); ok(st.turn === 'A', '德國走完輪英國');
  const r2 = ctx.bgAll(st, 'A', false).find(([f, t]) => st.b[f].n === 2 && f !== idx(22, 6)); play(st, r2);
  ok(st.turn === 'Q' && !st.over, '法國沒棋可走被跳過、換清軍（不判輸）'); }
{ // 中途獲勝：清軍吃掉最後一個國王
  const st = mk(); st.dead[4] = st.dead[5] = true; st.b[idx(20, 0)] = st.b[idx(28, 0)] = st.b[idx(22, 8)] = null; st.b[idx(10, 0)] = null;
  play(st, [idx(4, 5), idx(4, 1)]); ok(st.over && st.over.win === 'Q', '清軍吃掉最後一個國王，清軍贏'); }
{ // 中途獲勝：聯軍半輪第一國就吃掉最後的慈禧
  const st = mk(); st.b[idx(22, 33)] = null; st.turn = 'A'; st.b[idx(20, 20)] = { s: 'A', t: 'q', n: 4 };
  play(st, [idx(20, 20), idx(20, 33)]); ok(st.over && st.over.win === 'A', '聯軍這半輪第一國吃掉最後的慈禧，立刻結束'); }

// ---- 打包解包 ----
{ const st = ctx.bgNew(OWN, true); play(st, ai(st)); play(st, ai(st)); play(st, ai(st));
  ok(st.turn === 'A' && st.mv.filter(x => x).length === 2 && st.ql === 2, '聯軍這半輪走了兩國');
  const pk = JSON.parse(JSON.stringify(ctx.bgPack(st))), u = ctx.bgUnpack(pk);
  ok(key(u) === key(st), '打包解包後局面一樣（含 ql、mv）'); ok(pk.rr === 1 && pk.ql === st.ql && pk.mv.length === 8, '打包帶 rr/ql/mv');
  const L1 = ctx.bgAll(st, 'A', false).length, L2 = ctx.bgAll(u, 'A', false).length; ok(L1 === L2, '解包後可走的一樣');
  const c = ctx.bgClone(st); ok(key(c) === key(st) && c.mv !== st.mv, 'clone 複製 mv'); }

// ---- 悔棋（單機）：用控制流程的 bgDo／bgUndo（舊存檔 xq-bg-rr='1' 直接對應到新規則） ----
E('localStorage.getItem=k=>k==="xq-bg-rr"?"1":null;');
{ BG.role = 'solo'; BG.me = 'Q'; BG.seats = []; BG.mySeat = 0; E('bgNewGame()'); ok(BG.st.rr === 1, '設定 xq-bg-rr=1 時開新局用新規則');
  const s0 = key(BG.st);
  let mv = ai(BG.st); E(`bgDo(${mv[0]},${mv[1]})`); ok(BG.st.turn === 'A' && BG.st.ql === 4, '我（清軍）走一步就換電腦聯軍');
  let k = 0; while (BG.st.turn === 'A' && k++ < 20) { mv = ctx.bgAI(BG.st); E(`bgDo(${mv[0]},${mv[1]})`); }
  ok(k === 4 && BG.st.turn === 'Q', '電腦聯軍走 4 國換我（' + k + '）'); const s1 = key(BG.st);
  mv = ai(BG.st); E(`bgDo(${mv[0]},${mv[1]})`); k = 0; while (BG.st.turn === 'A' && k++ < 20) { mv = ctx.bgAI(BG.st); E(`bgDo(${mv[0]},${mv[1]})`); }
  ok(k === 4 && BG.st.mv.filter(x => x).length === 8, '第二個半輪走剩下的 4 國');
  E('bgUndo()'); ok(key(BG.st) === s1, '悔棋退過電腦的半輪，回到我第 2 步之前');
  E('bgUndo()'); ok(key(BG.st) === s0, '再悔棋回到開局'); }
{ BG.role = 'solo'; BG.me = 'A'; BG.mySeat = 1; E('bgNewGame()'); let mv = ctx.bgAI(BG.st); E(`bgDo(${mv[0]},${mv[1]})`);
  ok(BG.st.turn === 'A', '電腦清軍一步後換我（聯軍）'); const a0 = key(BG.st);
  mv = ai(BG.st); const who = BG.st.b[mv[0]].n; E(`bgDo(${mv[0]},${mv[1]})`); ok(BG.st.mv[who] && BG.st.ql === 3, '我走了一國，這半輪還剩 3 國');
  const p2 = BG.st.b.findIndex((p, i) => p && p.s === 'A' && p.n === who && ctx.bgMoves(BG.st, i, false).length);
  ok(!E(`bgCanPick(${p2})`), '走過的國家不能再選'); ok(!E(`bgDo(${p2},${ctx.bgMoves(BG.st, p2, false)[0]})`), '走過的國家 bgDo 不接受');
  E('bgUndo()'); ok(key(BG.st) === a0 && !BG.st.mv[who], '悔棋退回、那一國又可以走'); }
// 連線：真人只動自己的國家，電腦國家由電腦補（座位 0 清軍電腦、英國 seat 3 與法國 seat 5 是真人）；每半輪真人照座位順序先走
{ BG.role = 'host'; BG.seats = Array(9).fill(null).map(() => ({ kind: 'ai' })); BG.seats[3] = { kind: 'me' }; BG.seats[5] = { kind: 'net', peer: 'x' }; BG.mySeat = 3; E('bgNewGame()');
  const halves = []; let mv;
  for (let h = 0; h < 4 && !BG.st.over; h++) {
    let k = 0; while (BG.st.turn === 'Q' && k++ < 5) { mv = ctx.bgAI(BG.st); E(`bgDo(${mv[0]},${mv[1]})`); }
    const order = []; k = 0;
    while (BG.st.turn === 'A' && k++ < 20) { const w = E('bgWho()'); order.push(w.ai ? 'ai' : w.seat);
      if (w.ai) ok(w.nations.every(n => ![2, 4].includes(n)), '電腦不能動真人的國家'); else ok(w.nations.length === 1 && w.nations[0] === w.seat - 1, '真人只動自己的國家');
      mv = ctx.bgAI(BG.st, { only: p => w.nations.includes(p.n) }); E(`bgDo(${mv[0]},${mv[1]})`); }
    halves.push(order.join(','));
  }
  console.log('連線每半輪的順序', halves.join(' ｜ '));
  ok(halves[0] === '3,5,ai,ai' && halves[1] === 'ai,ai,ai,ai' && halves[2] === '3,5,ai,ai', '連線輪流順序（真人每輪各一次、照座位順序先走）');
  BG.role = 'solo'; }
console.log(fail ? '失敗 ' + fail : '新輪流方式規則檢查通過');

// ---- 電腦自我對局 ----
if (games > 0) {
  const res = { Q: 0, A: 0, d: 0 }; let t0 = Date.now(), plies = 0, rounds = 0;
  for (let g = 0; g < games; g++) {
    const st = ctx.bgNew(OWN, true); let k = 0, r = 0, prev = 'Q';
    for (; k < MAXP && !st.over; k++) { const mv = ai(st); if (!mv) break; const p = st.b[mv[0]];
      ok(p && p.s === st.turn, '走錯邊'); if (st.turn === 'A') ok(!st.mv[p.n], '同一國一輪走兩次'); play(st, mv); if (st.turn === 'A' && prev === 'Q' && st.mv.every(x => !x)) r++; prev = st.turn; }   // 一輪＝八國都走過一次
    if (st.over) res[st.over.win]++; else res.d++; plies += k; rounds += r;
    console.log('局', g, st.over ? st.over.win + ' ' + st.over.why : '未分勝負', k, '步', r, '輪', '陣亡國', st.dead.filter(x => x).length, '慈禧', st.b.filter(p => p && (p.t === 'X' || p.t === 'Y')).length);
  }
  console.log('RESULT', JSON.stringify(res), '平均每局', (plies / games).toFixed(0), '步', (rounds / games).toFixed(1), '輪', '平均每步 ms', ((Date.now() - t0) / plies).toFixed(1));
  console.log(fail ? '失敗 ' + fail : '自我對局檢查通過');
}
process.exitCode = fail ? 1 : 0;
