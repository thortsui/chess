// 暗棋轉接器 vs index.html 的 UI 規則（dkAllActs / dkApply / dkCheckEnd）逐步對照。
// 用法：node ai/test/dk_ui.js [局數=300]
// 做法：在 vm 裡跑 UI 原始碼（真實蓋法），每一步比對 legal() 集合；套用同一步後，
// 用「強制抽到 UI 真實翻出的那顆」的 rng 讓轉接器 play，比對盤面、輪誰、連吃、和棋計數、終局。
const fs = require('fs'), path = require('path'), vm = require('vm');
const G = require('../games/dk.js');
const html = fs.readFileSync(path.join(__dirname, '..', '..', 'index.html'), 'utf8');
const a = html.indexOf('/* ---------- 暗棋 ---------- */'), e = html.indexOf('function dkTap(');
const ui = html.slice(a, e) + "\nconst dkEncB=B=>B.map(p=>!p?'.':!p.up?'?':p.s==='r'?p.t:p.t.toLowerCase()).join('');\n" +
  "function dkPool(){const P={};board.forEach(p=>{if(p&&!p.up){const k=p.s==='r'?p.t:p.t.toLowerCase();P[k]=(P[k]||0)+1;}});return P;}\n" +
  "this.U={init:dkInit,acts:dkAllActs,apply:dkApply,enc:()=>dkEncB(board),pool:dkPool,get:()=>({turn,colors:dkColors,quiet:dkQuiet,chain:dkChain,over,board})};";
const ctx = vm.createContext({ Math, JSON, console,
  D4: [[1, 0], [-1, 0], [0, 1], [0, -1]], opp: s => s === 'r' ? 'b' : 'r' });
vm.runInContext('var board=[],turn,hist=[],sel=null,targets=[],last=null,over=null,seq=0,undoAsk,myUndoReq,mode="local",mySide="A",role=null;' +
  'function render(){}function announce(){}function broadcast(){}function maybeAI(){}\n' + ui, ctx);
const U = ctx.U;
const N = +process.argv[2] || 300; let steps = 0, fail = 0;
const bad = (m, x) => { fail++; if (fail < 15) console.log('✗', m, JSON.stringify(x).slice(0, 400)); };
const enc = m => JSON.stringify(G.toRes(null, m));
for (let g = 0; g < N; g++) {
  U.init();
  // 第一手：UI 顏色未定時一定翻棋（dkMaybeAI 的 !col 分支）
  const A0 = U.acts(U.get().turn); U.apply(A0[(Math.random() * A0.length) | 0]);
  for (let ply = 0; ply < 500; ply++) {
    const u = U.get(); const col = u.colors[u.turn];
    const st = G.fromReq({ v: 'dk', b: U.enc(), s: col, pool: U.pool(), chain: u.chain, quiet: u.quiet });
    const term = G.terminal(st);
    if (!!term !== !!u.over) { bad('終局判定不同', { ui: u.over, me: term, b: U.enc() }); break; }
    if (u.over) { const w = u.over.winner === 'draw' ? -1 : u.colors[u.over.winner] === 'r' ? 0 : 1; if (w !== term.win) bad('勝方不同', { ui: u.over, term }); break; }
    const ua = U.acts(u.turn).map(x => JSON.stringify(x.a === 'f' ? { a: 'f', i: x.i } : x.a === 'stop' ? { a: 'stop' } : { a: 'm', f: x.f, t: x.t })).sort();
    const L = G.legal(st), ma = L.map(enc).sort();
    if (ua.join() !== ma.join()) { bad('合法走法不同', { b: U.enc(), ui: ua, me: ma }); break; }
    const m = L[(Math.random() * L.length) | 0], res = G.toRes(st, m);
    U.apply(res.a === 'f' ? { a: 'f', i: res.i } : res);
    const v = U.get(), tgt = res.a === 'f' ? res.i : res.t;
    // 強制 rng 抽到 UI 真正翻出來的那顆
    let rng = () => 0.5;
    if (res.a !== 'stop' && st.b[tgt] === 8) {
      // 探草吃到時翻出來的那顆被吃掉了：從 UI 的 pool 差異找出來
      const before = st.pool, after = G.fromReq({ b: U.enc(), s: 'r', pool: U.pool() }).pool;
      let k = 1; for (; k < 16; k++) if (before[k] !== after[k]) break;
      let off = 0; for (let j = 1; j < k; j++) off += before[j]; rng = () => (off + 0.5) / st.n; }
    const out = G.play(st, m, rng).s, req = G.toReq(out);
    const vc = v.over ? null : v.colors[v.turn];
    if (req.b !== U.enc() || out.chain !== v.chain || out.quiet !== v.quiet || (vc && req.s !== vc)) {
      bad('套用結果不同', { move: res, me: [req.b, req.s, out.chain, out.quiet], ui: [U.enc(), vc, v.chain, v.quiet] }); break; }
    steps++;
  }
}
console.log(`${N} 局、${steps} 步對照`, fail ? `✗ ${fail} 個不一致` : '✓ 與 UI 規則完全一致');
process.exit(fail ? 1 : 0);
