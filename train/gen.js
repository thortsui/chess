// 用舊引擎當老師產生訓練資料（DGX 上用很多個行程一起跑）
// node train/gen.js <game> <局數> <種子> <輸出檔> [老師最短ms=60] [老師最長ms=250]
// 每個局面都問老師該怎麼走（當作走法標籤）；實際下出去的棋 85% 用老師的、15% 隨機，讓局面更多樣。
// 對局結束後把結果（輪到的一方視角 +1/0/-1）寫進每一筆。
const fs = require('fs'), path = require('path');
const [id, nGames, seed, outFile, tMin = 60, tMax = 250] = process.argv.slice(2);
const G = require(path.join(__dirname, '..', 'ai', 'games', id + '.js'));
const E = require(path.join(__dirname, '..', 'ai', 'test', 'engines.js'));
const NC = 40, ORDER = ['xq', 'qf', 'jw', 'dk', 'ch', 'gm', 'go', 'bg'], HW = G.H * G.W;
const NB = 36, BITB = Math.ceil(NB * HW / 8), AUXB = 4 * HW;
// 舊引擎分數換算成 -1～1 用的尺度（不知道尺度的就不用，只用勝負）
const SCALE = { xq: 600, qf: 900, jw: 900, ch: 400 };
let x = (+seed * 2654435761) >>> 0 || 1;
const rng = () => { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; return (x >>> 0) / 4294967296; };
const fd = fs.openSync(outFile, 'w');
const hdr = Buffer.alloc(16); hdr.write('CHAI', 0); hdr.writeUInt16LE(1, 4); hdr.writeUInt16LE(ORDER.indexOf(G.id), 6); hdr.writeUInt16LE(G.H, 8); hdr.writeUInt16LE(G.W, 10);
fs.writeSync(fd, hdr);
const planes = new Float32Array(NC * HW);
const starts = G.starts();
let total = 0, illegal = 0, t0 = Date.now();
function keyArr(k) { return k.pass ? [2, 0, 0, -1] : k.p !== undefined ? [1, k.p, 0, k.k ?? -1] : [0, k.f, k.t, k.k ?? -1]; }
for (let g = 0; g < +nGames; g++) {
  let s = G.fromReq(JSON.parse(JSON.stringify(starts[(rng() * starts.length) | 0])));
  const recs = []; let res = null;
  const randomOpen = (rng() * 8) | 0;
  for (let ply = 0; ply < 400; ply++) {
    res = G.terminal(s); if (res) break;
    const L = G.legal(s); if (!L.length) { res = { win: -1 }; break; }
    let label = -1, tv = NaN;
    if (L.length > 1 || ply >= randomOpen) {
      const t = G.teacher(s), ms = +tMin + rng() * (tMax - tMin);
      let r = null; try { r = E.call({ ...t.req, v: t.v, time: ms, depth: 40 }); } catch (e) { r = null; }
      const m = r ? G.fromTeacher(s, r) : null;
      if (m !== null && m !== undefined) {
        const ms2 = JSON.stringify(m); label = L.findIndex(q => JSON.stringify(q) === ms2);
        if (label < 0) illegal++;
        if (r && typeof r.s === 'number' && SCALE[G.id] && Math.abs(r.s) < 20000) tv = Math.tanh(r.s / SCALE[G.id]);
      }
    }
    if (label >= 0 && L.length > 1) {
      planes.fill(0); G.encode(s, planes);
      const bits = Buffer.alloc(BITB), aux = Buffer.alloc(AUXB);
      for (let i = 0; i < NB * HW; i++) if (planes[i] > 0.5) bits[i >> 3] |= 1 << (i & 7);
      for (let i = 0; i < AUXB; i++) aux[i] = Math.round(Math.max(0, Math.min(1, planes[NB * HW + i])) * 255);
      const ks = new Int16Array(L.length * 4);
      L.forEach((m, j) => { const a = keyArr(G.keys(s, m)); ks.set(a, j * 4); });
      recs.push({ team: G.team(s), label, tv, bits, aux, ks, n: L.length });
    }
    let mv;
    if (ply < randomOpen || label < 0 || rng() < 0.15) mv = L[(rng() * L.length) | 0]; else mv = L[label];
    s = G.play(s, mv, rng).s;
  }
  const win = res ? res.win : -1;
  for (const r of recs) {
    const z = win === -1 ? 0 : win === r.team ? 1 : -1;
    const head = Buffer.alloc(16);
    head.writeUInt32LE(16 + BITB + AUXB + r.ks.byteLength, 0); head.writeUInt16LE(r.n, 4); head.writeUInt16LE(r.label, 6);
    head.writeFloatLE(z, 8); head.writeFloatLE(Number.isNaN(r.tv) ? -9 : r.tv, 12);
    fs.writeSync(fd, head); fs.writeSync(fd, r.bits); fs.writeSync(fd, r.aux); fs.writeSync(fd, Buffer.from(r.ks.buffer));
  }
  total += recs.length;
}
fs.closeSync(fd);
console.log(`[${id}] ${nGames} 局 ${total} 筆，老師走法不合法 ${illegal}，${((Date.now() - t0) / 1000).toFixed(0)} 秒`);
