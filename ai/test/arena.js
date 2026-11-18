// 新模型 vs 舊引擎對戰：node ai/test/arena.js <id> [局數=10] [模型資料夾=ai] [新模型每步ms=1000] [舊引擎每步ms=300] [等級=10]
// 新模型用 best（不加失誤）測真實強度；兩邊輪流先手。
const fs = require('fs'), path = require('path');
const AI = require('../brain.js'), E = require('./engines.js');
const [id, N = 10, dir = path.join(__dirname, '..'), tNew = 1000, tOld = 300, LV = 10] = process.argv.slice(2);
const G = require(path.join(__dirname, '..', 'games', id + '.js'));
const meta = JSON.parse(fs.readFileSync(path.join(dir, 'model.json'), 'utf8')), bin = fs.readFileSync(path.join(dir, 'model.bin'));
const ev = new AI.Evaluator(new AI.Net(meta, bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength)));
const rng = AI.makeRng(42), starts = G.starts();
const res = { 新: 0, 舊: 0, 和: 0 };
// brain.think 吃的是 UI 請求；這裡直接從 state 搜尋，所以包一層「請求就是 state」的轉接器
const Gs = Object.assign({}, G, { fromReq: s => s });
for (let g = 0; g < +N; g++) {
  let s = G.fromReq(JSON.parse(JSON.stringify(starts[g % starts.length])));
  const newTeam = g % 2; let ply = 0, term = null;
  for (; ply < 400; ply++) {
    term = G.terminal(s); if (term) break;
    const L = G.legal(s); if (!L.length) break;
    let m;
    if (G.team(s) === newTeam) { const r = AI.think(Gs, ev, s, { level: +LV, best: true, time: +tNew, rng }); m = r ? r.move : L[0]; }
    else { const t = G.teacher(s), r = E.call({ ...t.req, v: t.v, time: +tOld, depth: 40 }); m = r ? G.fromTeacher(s, r) : null;
      const ms = JSON.stringify(m); if (!L.some(q => JSON.stringify(q) === ms)) m = L[(rng() * L.length) | 0]; }
    s = G.play(s, m, rng).s;
  }
  const w = term ? term.win : -1;
  if (w === -1) res.和++; else if (w === newTeam) res.新++; else res.舊++;
  process.stdout.write(`第 ${g + 1} 局（新模型執${newTeam ? '後' : '先'}）：${w === -1 ? '和' : w === newTeam ? '新模型勝' : '舊引擎勝'}，${ply} 手\n`);
}
console.log(`[${id}] 新模型 ${res.新} 勝、舊引擎 ${res.舊} 勝、和 ${res.和}`);
