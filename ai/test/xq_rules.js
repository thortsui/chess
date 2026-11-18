// 象棋棋盤三種棋（xq／qf／jw）的規則對照測試：把 index.html 裡 UI 的規則程式碼（init、pseudo、inCheck、legal、
// perpForbidden、applyMove、jwDropOk、applyDrop、jwAfter）原封不動放進 vm 執行，逐手比對轉接器的 legal()／play()／terminal()。
// 用法：node ai/test/xq_rules.js [局數=200] [最多手數=300]
const fs = require('fs'), path = require('path'), vm = require('vm');
const html = fs.readFileSync(path.join(__dirname, '..', '..', 'index.html'), 'utf8');
const line = pre => { const i = html.indexOf('\n' + pre); if (i < 0) throw new Error('找不到 ' + pre); return html.slice(i + 1, html.indexOf('\n', i + 1)); };
const between = (a, b) => { const i = html.indexOf('\n' + a), j = html.indexOf('\n' + b, i); if (i < 0 || j < 0) throw new Error('找不到 ' + a); return html.slice(i + 1, j); };
const SRC = [line('const JW_PROMO='), line('const D4=[[1,0]'), line('const enc='),
  'let board,turn,hist,sel=null,targets=[],last,over,variant="xq",qf=false,jw=false,jwHand={},jwDrop=null,role=null,mode="ai",seq=0,undoAsk=false,myUndoReq=false;',
  'const render=()=>{},announce=()=>{},broadcast=()=>{},maybeAI=()=>{},hideBanner=()=>{};',
  between('function init(){', '/* ---------- AI ----------'),
  `this.U={setV(v){qf=v==='qf';jw=v==='jw';variant='xq';init();},
    st(){return{b:enc(board),turn,hand:{...jwHand},over}},
    moves(){const o=[];for(let r=0;r<10;r++)for(let c=0;c<9;c++){const p=board[r][c];if(p&&p.s===turn)legalNP(r,c).forEach(([tr,tc])=>o.push((r*9+c)*90+tr*9+tc));}
      if(jw&&turn==='b')JW_HAND.forEach(t=>{if(jwHand[t]>0)jwDrops(t).forEach(([r,c])=>o.push('d'+t+(r*9+c)));});return o;},
    rawCount(){let n=0;for(let r=0;r<10;r++)for(let c=0;c<9;c++){const p=board[r][c];if(p&&p.s===turn)n+=legal(board,r,c).length;}return n;},
    move(m){const f=(m/90)|0,t=m%90;applyMove((f/9)|0,f%9,(t/9)|0,t%9);},
    drop(t,sq){applyDrop(t,(sq/9)|0,sq%9);},
    chk(){return inCheck(board,turn)}};`].join('\n');
const ctx = vm.createContext({ Math, JSON, Object, Array, console });
vm.runInContext(SRC, ctx);
const U = ctx.U, X = require('../games/_xq_common.js');
const games = +process.argv[2] || 200, maxPly = +process.argv[3] || 300;
let x = 987654321; const rng = () => ((x = (x * 1103515245 + 12345) >>> 0) / 4294967296);
let fail = 0; const bad = (...a) => { fail++; if (fail <= 20) console.log('✗', ...a); };
for (const id of ['xq', 'qf', 'jw']) {
  const G = require('../games/' + id + '.js');
  const stat = { plies: 0, perpBlocked: 0, stuck: 0, mates: 0, drops: 0, promos: 0, checks: 0 };
  U.setV(id);
  { const s0 = U.st(), r0 = G.starts()[0]; if (s0.b !== r0.b || (s0.turn !== r0.s)) bad(id, 'starts() 和 UI init() 不同', s0.b, r0.b); }
  for (let g = 0; g < games; g++) {
    U.setV(id); let s = G.fromReq(JSON.parse(JSON.stringify(G.starts()[0])));
    const histM = [];
    for (let ply = 0; ply < maxPly; ply++) {
      const u = U.st();
      if (X.toStr(s.b) !== u.b || (s.s ? 'b' : 'r') !== u.turn) { bad(id, g, ply, '盤面不同', u.b, X.toStr(s.b)); break; }
      if (id === 'jw') { const h = X.HL.map(k => u.hand[k] | 0); if (h.join() !== s.hd.join()) { bad(id, g, ply, '手上棋子不同', h, s.hd); break; } }
      if (!!s.r.c !== U.chk()) bad(id, g, ply, '被將軍旗標不同');
      const um = U.moves().map(m => typeof m === 'string' ? X.DROP + X.HL.indexOf(m[1]) * 90 + (+m.slice(2)) : m).sort((a, b) => a - b);
      const L = G.legal(s).slice().sort((a, b) => a - b);
      if (um.join() !== L.join()) { bad(id, g, ply, '合法走法不同', { ui: um.filter(m => !L.includes(m)), ad: L.filter(m => !um.includes(m)) }); break; }
      const term = G.terminal(s);
      if (u.over) { if (!term || term.win !== (u.over.winner === 'r' ? 0 : 1)) bad(id, g, ply, '終局不同', u.over, term); stat.mates++; break; }
      if (!um.length) { stat.stuck++; if (!term || term.win !== 1 - s.s) bad(id, g, ply, 'UI 卡住（只剩長將禁著）但 terminal 沒判輸'); break; }
      if (term && term.win !== -1) { bad(id, g, ply, 'UI 沒結束但 terminal 判勝負', term); break; }
      // 刻意製造長將：偏好將軍的走法，以及把兩手前自己的棋走回去
      let m = null; const back = histM[histM.length - 2];
      if (back !== undefined && back < X.DROP && rng() < 0.6) { const f = (back / 90) | 0, t = back % 90, rv = t * 90 + f; if (L.includes(rv)) m = rv; }
      if (m === null && rng() < 0.5) { const ck = L.filter(q => G.play(s, q).s.r.c); if (ck.length) m = ck[(rng() * ck.length) | 0]; }
      if (m === null) m = L[(rng() * L.length) | 0];
      stat.perpBlocked += U.rawCount() - um.filter(q => q < X.DROP).length;   // 被長將規則擋掉的走法數
      const nx = G.play(s, m).s;
      if (nx.r.c) stat.checks++;
      if (m >= X.DROP) { stat.drops++; U.drop(X.HL[((m - X.DROP) / 90) | 0], (m - X.DROP) % 90); } else U.move(m);
      histM.push(m); s = nx; stat.plies++;
    }
  }
  console.log(`[${id}] ${games} 局 ${stat.plies} 手，將死/困斃 ${stat.mates}，UI 卡住 ${stat.stuck}，長將禁著 ${stat.perpBlocked} 次，將軍 ${stat.checks}，打入 ${stat.drops}`);
}
console.log(fail ? `✗ 共 ${fail} 個問題` : '✓ 轉接器與 UI 規則完全一致');
process.exit(fail ? 1 : 0);
