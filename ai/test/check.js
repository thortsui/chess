// 轉接器自動檢查：node ai/test/check.js <id> [對局數=20] [--teacher]
// 檢查：介面齊全、play 不改動輸入、encode 數值合理、keys 在範圍內、隨機對局能正常結束；
// 加 --teacher 時再用舊引擎下棋，確認舊引擎選的每一步都在 legal() 裡（規則一致）。
const path = require('path');
const id = process.argv[2]; if (!id) { console.log('用法：node ai/test/check.js <id> [games] [--teacher]'); process.exit(1); }
const games = +process.argv[3] || 20, useTeacher = process.argv.includes('--teacher');
const G = require(path.join(__dirname, '..', 'games', id + '.js'));
const NC = 40, ORDER = ['xq', 'qf', 'jw', 'dk', 'ch', 'gm', 'go', 'bg'];
let fail = 0; const bad = (msg, extra) => { fail++; if (fail <= 30) console.log('✗', msg, extra !== undefined ? JSON.stringify(extra).slice(0, 300) : ''); };
for (const k of ['id', 'name', 'H', 'W']) if (G[k] === undefined) bad('缺少欄位 ' + k);
for (const k of ['fromReq', 'toRes', 'legal', 'play', 'terminal', 'team', 'encode', 'keys', 'starts']) if (typeof G[k] !== 'function') bad('缺少函式 ' + k);
if (fail) process.exit(1);
let x = 12345; const rng = () => ((x = (x * 1103515245 + 12345) >>> 0) / 4294967296);
const HW = G.H * G.W, buf = new Float32Array(NC * HW), gi = ORDER.indexOf(G.id);
const E = useTeacher ? require('./engines.js') : null;
const starts = G.starts(); if (!starts.length) bad('starts() 是空的');
const stat = { plies: 0, ends: { 0: 0, 1: 0, '-1': 0, none: 0 }, maxLegal: 0, teacherMoves: 0, teacherIllegal: 0, keyDup: 0 };
const keyStr = k => k.pass ? 'pass' : k.p !== undefined ? 'p' + k.p + ':' + (k.k ?? '') : k.f + '>' + k.t + ':' + (k.k ?? '');
for (let g = 0; g < games; g++) {
  let s = G.fromReq(JSON.parse(JSON.stringify(starts[g % starts.length])));
  let ply = 0, res = null;
  for (; ply < 400; ply++) {
    res = G.terminal(s); if (res) break;
    const L = G.legal(s);
    if (!L.length) { bad('沒有終局卻沒有合法走法', { ply }); break; }
    stat.maxLegal = Math.max(stat.maxLegal, L.length);
    const tm = G.team(s); if (tm !== 0 && tm !== 1) bad('team 不是 0/1', tm);
    buf.fill(0); G.encode(s, buf);
    for (let i = 0; i < buf.length; i++) if (!Number.isFinite(buf[i]) || buf[i] < -1e-6 || buf[i] > 1 + 1e-6) { bad('encode 數值超出 0～1', { i, v: buf[i] }); break; }
    if (gi >= 0) for (let c = 28; c < 36; c++) { const want = c - 28 === gi ? 1 : 0; if (buf[c * HW] !== want && buf[c * HW + HW - 1] !== want) { bad('遊戲代號通道不對', { c }); break; } }
    const seen = new Set();
    for (const m of L) {
      const k = G.keys(s, m), ks = keyStr(k);
      if (seen.has(ks)) stat.keyDup++; seen.add(ks);
      for (const q of ['f', 't', 'p']) if (k[q] !== undefined && !(k[q] >= 0 && k[q] < HW)) bad('keys 超出棋盤', k);
      if (k.k !== undefined && !(k.k >= 0 && k.k < 8)) bad('keys.k 超出 0～7', k);
    }
    let m;
    if (E && G.teacher && G.fromTeacher && ply % 2 === 0 && rng() < 0.7) {
      const t = G.teacher(s); const r = E.call({ ...t.req, v: t.v, time: 30, depth: 3 });
      const tm2 = r ? G.fromTeacher(s, r) : null; stat.teacherMoves++;
      const ok = tm2 !== null && tm2 !== undefined && L.some(q => JSON.stringify(q) === JSON.stringify(tm2));
      if (!ok) { stat.teacherIllegal++; if (stat.teacherIllegal <= 5) bad('舊引擎的走法不在 legal() 裡', { ply, r, tm2 }); m = L[(rng() * L.length) | 0]; } else m = tm2;
    } else m = L[(rng() * L.length) | 0];
    const before = JSON.stringify(s);
    const out = G.play(s, m, rng);
    if (JSON.stringify(s) !== before) bad('play 改動了傳入的 state', { ply });
    if (!out || !out.s) { bad('play 沒有回傳 {s}', { ply }); break; }
    const r = G.toRes(s, m); try { JSON.stringify(r); } catch (e) { bad('toRes 無法 JSON 化'); }
    s = out.s;
  }
  stat.plies += ply; stat.ends[res ? res.win : 'none']++;
}
console.log(`[${G.id}] ${games} 局，平均 ${(stat.plies / games).toFixed(1)} 手，最多合法走法 ${stat.maxLegal}，結果`, stat.ends,
  E ? `，老師走法 ${stat.teacherMoves} 步、不合法 ${stat.teacherIllegal}` : '', stat.keyDup ? `，keys 重複 ${stat.keyDup} 次（同一位置不同走法，請用 k 區分）` : '');
console.log(fail ? `✗ 共 ${fail} 個問題` : '✓ 全部通過');
process.exit(fail ? 1 : 0);
