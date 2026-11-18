// 圍棋規則對照：隨機對局中，每一步都拿 go.js 的 legal() 和 UI 的判定（舊引擎 playMove＋全局同形 hist 比對）比較；
// 也比對 play() 後的盤面、劫點，以及數子結果和 UI goScore（不提死子）是否一致。
// 用法：node ai/test/go_rules.js [對局數=200]
const G = require('../games/go.js'), fs = require('fs'), path = require('path');
// 直接從 index.html 切出圍棋舊引擎（UI 的 goEngine2() 也是這樣載入）
const html = fs.readFileSync(path.join(__dirname, '..', '..', 'index.html'), 'utf8');
const ge = new Function(html.match(/<script type="text\/plain" id="goengine">([\s\S]*?)<\/script>/)[1] + ';return goEngine;')();
const games = +process.argv[2] || 200;
let x = 777; const rng = () => ((x = (x * 1103515245 + 12345) >>> 0) / 4294967296);
const str = b => Array.from(b, v => v === 1 ? 'b' : v === 2 ? 'w' : '.').join('');
let bad = 0, pos = 0, superko = 0;
for (let g = 0; g < games; g++) {
  let s = G.fromReq(G.starts()[0]); const hist = []; let ko = -1;
  while (!G.terminal(s)) {
    const cur = str(s.b), c = s.t ? 'w' : 'b';
    const ui = [];
    for (let i = 0; i < 81; i++) { if (s.b[i]) continue; const r = ge.playMove(cur, c, i, ko); if (r && !hist.includes(r.b)) ui.push(i); else if (r) superko++; }
    const mine = G.legal(s).filter(m => m !== 81);
    pos++;
    if (JSON.stringify(ui) !== JSON.stringify(mine)) { if (++bad <= 5) console.log('✗ 合法走法不同', g, s.n, cur, ui.filter(i => !mine.includes(i)), mine.filter(i => !ui.includes(i))); }
    // 偏向落子，讓對局長一點、多出現打劫
    const L = G.legal(s); const m = rng() < 0.03 || L.length === 1 ? 81 : L[(rng() * (L.length - 1)) | 0];
    hist.push(cur);
    if (m === 81) ko = -1; else { const r = ge.playMove(cur, c, m, ko); ko = r.ko; s = G.play(s, m).s; if (str(s.b) !== r.b || s.ko !== ko) { if (++bad <= 5) console.log('✗ 落子結果不同', g, m); } continue; }
    s = G.play(s, m).s;
  }
  // UI goScore（goDead 空）：黑 B 比 白 W+KOMI
  const b = str(s.b); let B = 0, W = 0; const seen = new Set();
  for (let i = 0; i < 81; i++) { if (b[i] === 'b') B++; else if (b[i] === 'w') W++; else if (!seen.has(i)) {
    const q = [i], reg = []; seen.add(i); let tb = 0, tw = 0;
    while (q.length) { const y = q.pop(); reg.push(y); const r = (y / 9) | 0, cc = y % 9;
      for (const [a, b2] of [[r - 1, cc], [r + 1, cc], [r, cc - 1], [r, cc + 1]]) { if (a < 0 || a > 8 || b2 < 0 || b2 > 8) continue; const z = a * 9 + b2;
        if (b[z] === 'b') tb = 1; else if (b[z] === 'w') tw = 1; else if (!seen.has(z)) { seen.add(z); q.push(z); } } }
    if (tb && !tw) B += reg.length; else if (tw && !tb) W += reg.length; } }
  const uiWin = B > W + 6.5 ? 0 : 1;
  if (uiWin !== G.terminal(s).win) { if (++bad <= 5) console.log('✗ 數子不同', g, B, W); }
}
console.log(`${games} 局、${pos} 個局面，全局同形擋掉 ${superko} 個點，不一致 ${bad}`);
// 指定測試：hist 裡放「在 0 落子後的盤面」→ 0 不能下（全局同形）；單劫點不能下；自殺不能下；提子後的自殺點可以下
{
  const e = '.'.repeat(81), set = (s, i, c) => s.slice(0, i) + c + s.slice(i + 1);
  let t = 0;
  const s1 = G.fromReq({ b: e, s: 'b', hist: [set(e, 0, 'b')] });
  if (G.legal(s1).includes(0)) { t++; console.log('✗ 全局同形沒擋'); }
  // 角落自殺：白 1、9 包住 0，黑下 0 是自殺
  const s2 = G.fromReq({ b: set(set(e, 1, 'w'), 9, 'w'), s: 'b', hist: [] });
  if (G.legal(s2).includes(0)) { t++; console.log('✗ 自殺沒擋'); }
  // 黑 2、10 圍住白 1；白 9 已在、黑下 0 可提白 1？0 鄰 1(白)、9(白)：白 1 只剩 0 一氣 → 提子合法
  const s3 = G.fromReq({ b: set(set(set(set(e, 1, 'w'), 9, 'w'), 2, 'b'), 10, 'b'), s: 'b', hist: [] });
  if (!G.legal(s3).includes(0)) { t++; console.log('✗ 提子點被誤擋'); }
  // 打劫：. b w . / b w . w / . b w .（列 0～2）黑下 2 提白 1？改用標準劫形：白提後黑不能立刻提回
  // 盤面：黑 1、9、19；白 2、12、20；白 10 在劫裡被黑 11 提
  let k = e; for (const i of [1, 9, 19]) k = set(k, i, 'b'); for (const i of [2, 12, 20, 10]) k = set(k, i, 'w');
  let s = G.fromReq({ b: k, s: 'b', hist: [] });
  s = G.play(s, 11).s; // 黑 11 提白 10
  if (s.b[10] !== 0 || s.ko !== 10) { t++; console.log('✗ 劫點沒設好', s.ko); }
  if (G.legal(s).includes(10)) { t++; console.log('✗ 打劫沒擋'); }
  console.log(t ? `✗ 指定測試失敗 ${t}` : '✓ 指定測試通過（全局同形、自殺、提子）');
  if (t) process.exit(1);
}
process.exit(bad ? 1 : 0);
