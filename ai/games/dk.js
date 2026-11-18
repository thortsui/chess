// 暗棋（台灣半盤）規則轉接器。規則以 index.html 的 UI 為準：
//   dkCanCap / dkTargets / dkCapTargets / dkAllActs / dkLegal / dkApply / dkCheckEnd / dkPool / dkMaybeAI（約 2265–2368 行）
//   連吃、探草沒有設定開關，永遠開啟；請求的 chain = 連吃中那顆棋的位置（-1 = 沒有連吃）。
//
// 棋盤：4 行 × 8 列，idx = r*4 + c（和 UI、舊引擎一樣）。
// 內部棋子代碼（和舊引擎相同）：0 空、8 蓋著、+1..+7 紅、-1..-7 黑；種類 1帥 2仕 3相 4俥 5傌 6炮 7兵。
// 隊伍：team 0 = 紅、team 1 = 黑（整局固定）。請求的 s（'r'/'b'）就是輪到的顏色。
//
// state = { b:[32]代碼, pool:[16] 蓋著的子（索引 1..7 紅種類、9..15 黑種類）, n:蓋著的總數,
//           side: 1 紅 / -1 黑, chain:-1 或連吃中棋子位置, quiet:連續沒吃子沒翻棋的步數 }
// move（小整數）：f<<5|t = 走子／吃子／探草（走到蓋著的棋上），1024+i = 翻棋，2048 = 停手。
//
// encode 通道（以輪到的一方視角；黑方時把列上下翻轉 r → 7-r，行不翻）：
//   0..6   自己翻開的 帥 仕 相 俥 傌 炮 兵
//   7..11  自己還蓋著的子（整面同值）：7 帥/1、8 仕+相/4、9 俥+傌/4、10 炮/2、11 兵/5
//   12..18 對手翻開的 帥 仕 相 俥 傌 炮 兵
//   19..23 對手還蓋著的子，同 7..11
//   24 有效格（全 1）  25 蓋著的棋子
//   26 連吃中那顆棋的位置  27 自己翻開的棋中「正被對手吃得到」的格子
//   28..35 遊戲代號（dk = 31）
//   36 自己蓋著的總數/16  37 對手蓋著的總數/16  38 和棋計數 quiet/60  39 連吃中旗標
(function (root) {
  const LIMIT = 60, HID = 8, FLIP = 1024, STOP = 2048;
  const LET = { K: 1, A: 2, B: 3, R: 4, N: 5, C: 6, P: 7 }, CH = '.KABRNCP';
  const TOTAL = [0, 1, 2, 2, 2, 2, 2, 5];
  // 每格的四個鄰格（-1 = 出界），順序：下、上、右、左
  const NB = new Int8Array(128);
  for (let i = 0; i < 32; i++) { const r = i >> 2, c = i & 3;
    NB[i * 4] = r < 7 ? i + 4 : -1; NB[i * 4 + 1] = r > 0 ? i - 4 : -1; NB[i * 4 + 2] = c < 3 ? i + 1 : -1; NB[i * 4 + 3] = c > 0 ? i - 1 : -1; }
  const DR = [1, -1, 0, 0], DC = [0, 0, 1, -1];
  // 大吃小、同級互吃、兵吃帥、帥不吃兵；炮不能直接吃相鄰（UI dkCanCap）
  const canCap = (a, v) => a === 6 ? false : a === 1 && v === 7 ? false : a === 7 && v === 1 ? true : a <= v;

  // 把 f 這顆翻開棋的所有目標（UI dkTargets）推進 out；capOnly = 只要有棋的目標（dkCapTargets）
  function targets(b, f, out, capOnly) {
    const p = b[f], a = p < 0 ? -p : p, s = p > 0 ? 1 : -1;
    for (let k = 0; k < 4; k++) { const t = NB[f * 4 + k]; if (t < 0) continue; const q = b[t];
      if (q === 0) { if (!capOnly) out.push(f << 5 | t); }
      else if (q === HID) { if (a !== 6) out.push(f << 5 | t); }               // 探草（炮不行）
      else if (a !== 6 && q * s < 0 && canCap(a, q < 0 ? -q : q)) out.push(f << 5 | t); }
    if (a === 6) { const r0 = f >> 2, c0 = f & 3;
      for (let k = 0; k < 4; k++) { let r = r0 + DR[k], c = c0 + DC[k], scr = false;
        while (r >= 0 && r < 8 && c >= 0 && c < 4) { const t = r * 4 + c, q = b[t];
          if (q) { if (!scr) scr = true; else { if (q === HID || q * s < 0) out.push(f << 5 | t); break; } }
          r += DR[k]; c += DC[k]; } } }
    return out;
  }
  function hasCapTarget(b, f) { // 不配置記憶體的 dkCapTargets(f).length>0
    const p = b[f], a = p < 0 ? -p : p, s = p > 0 ? 1 : -1;
    for (let k = 0; k < 4; k++) { const t = NB[f * 4 + k]; if (t < 0) continue; const q = b[t];
      if (q === HID) { if (a !== 6) return true; }
      else if (q && a !== 6 && q * s < 0 && canCap(a, q < 0 ? -q : q)) return true; }
    if (a === 6) { const r0 = f >> 2, c0 = f & 3;
      for (let k = 0; k < 4; k++) { let r = r0 + DR[k], c = c0 + DC[k], scr = false;
        while (r >= 0 && r < 8 && c >= 0 && c < 4) { const q = b[r * 4 + c];
          if (q) { if (!scr) scr = true; else { if (q === HID || q * s < 0) return true; break; } }
          r += DR[k]; c += DC[k]; } } }
    return false;
  }
  function hasAnyTarget(b, f) {
    for (let k = 0; k < 4; k++) { const t = NB[f * 4 + k]; if (t >= 0 && b[t] === 0) return true; }
    return hasCapTarget(b, f);
  }
  // 某顏色（1/-1）在棋盤上（含蓋著的）還有沒有子
  function alive(st, s) {
    const b = st.b, o = s > 0 ? 0 : 8;
    for (let k = 1; k < 8; k++) if (st.pool[o + k]) return true;
    for (let i = 0; i < 32; i++) { const p = b[i]; if (p && p !== HID && p * s > 0) return true; }
    return false;
  }
  // 依蓋著的子數抽一顆（rng 回傳 [0,1)）
  function draw(pool, n, rng) {
    let x = (rng() * n) | 0;
    for (let k = 1; k < 16; k++) { const c = pool[k]; if (!c) continue; if (x < c) return k < 8 ? k : -(k - 8); x -= c; }
    for (let k = 15; k > 0; k--) if (pool[k]) return k < 8 ? k : -(k - 8);
    return 0;
  }
  const pk = code => code > 0 ? code : 8 - code; // 代碼 → pool 索引

  const G = { id: 'dk', name: '暗棋', H: 8, W: 4 };

  G.fromReq = function (req) {
    const b = new Array(32), str = req.b;
    for (let i = 0; i < 32; i++) { const ch = str[i];
      if (ch === '.') b[i] = 0; else if (ch === '?') b[i] = HID;
      else { const t = LET[ch.toUpperCase()]; b[i] = ch === ch.toUpperCase() ? t : -t; } }
    const pool = new Array(16).fill(0); let n = 0; const P = req.pool || {};
    for (const ch in P) { const t = LET[ch.toUpperCase()]; if (!t) continue; const v = P[ch] | 0; pool[ch === ch.toUpperCase() ? t : 8 + t] += v; n += v; }
    let quiet = 0;
    if (Number.isInteger(req.quiet)) quiet = req.quiet;
    else if (Array.isArray(req.rep) && req.rep.length) {
      // UI 沒有送 dkQuiet：從 rep（之前各手「走之前」的盤面）往回數，蓋子數與子數都沒變的就是安靜步（下限估計）
      const sig = s => { let h = 0, m = 0; for (let i = 0; i < 32; i++) { const c = s[i]; if (c === '?') h++; else if (c !== '.') m++; } return h * 64 + m; };
      let next = str, nx = sig(str);
      for (let j = req.rep.length - 1; j >= 0; j--) { const pb = req.rep[j].b, ps = sig(pb);
        if (ps !== nx) break; if (pb !== next) quiet++; next = pb; nx = ps; }
    }
    const chain = Number.isInteger(req.chain) && req.chain >= 0 && req.chain < 32 ? req.chain : -1;
    return { b, pool, n, side: req.s === 'b' ? -1 : 1, chain, quiet };
  };

  G.toRes = (st, m) => m === STOP ? { a: 'stop' } : m >= FLIP ? { a: 'f', i: m - FLIP } : { a: 'm', f: m >> 5, t: m & 31 };

  G.legal = function (st) {
    const b = st.b, out = [];
    if (st.chain >= 0) { out.push(STOP); targets(b, st.chain, out, true); return out; }
    const s = st.side;
    for (let i = 0; i < 32; i++) { const p = b[i];
      if (p === HID) out.push(FLIP + i); else if (p && p * s > 0) targets(b, i, out, false); }
    return out;
  };

  G.play = function (st, m, rng) {
    const s = st.side;
    if (m === STOP) return { s: { b: st.b, pool: st.pool, n: st.n, side: -s, chain: -1, quiet: st.quiet } };
    const b = st.b.slice();
    if (m >= FLIP) {
      const i = m - FLIP, pool = st.pool.slice(), code = draw(pool, st.n, rng);
      b[i] = code; pool[pk(code)]--;
      return { s: { b, pool, n: st.n - 1, side: -s, chain: -1, quiet: 0 }, ck: code };
    }
    const f = m >> 5, t = m & 31, P = b[f], Q = b[t], a = P < 0 ? -P : P;
    let pool = st.pool, n = st.n, quiet, cap = false, ck;
    if (Q === HID) { // 探草：翻開後吃得到就吃，吃不到就留在原地（棋子不動）
      pool = pool.slice(); const code = draw(pool, n, rng); pool[pk(code)]--; n--; ck = code; quiet = 0;
      if (code * P < 0 && (a === 6 || canCap(a, code < 0 ? -code : code))) cap = true; else b[t] = code;
    } else if (Q === 0) quiet = st.quiet + 1;
    else { cap = true; quiet = 0; }
    if (cap || Q === 0) { b[t] = P; b[f] = 0; }
    let chain = -1, side = -s;
    if (cap) { // 連吃：對手還有子（含蓋著的）且這顆棋還有能吃／探草的目標
      const ns = { b, pool, n, side: s, chain: -1, quiet };
      if (alive(ns, -s) && hasCapTarget(b, t)) { ns.chain = t; return ck === undefined ? { s: ns } : { s: ns, ck }; }
    }
    const ns = { b, pool, n, side, chain, quiet };
    return ck === undefined ? { s: ns } : { s: ns, ck };
  };

  // UI dkCheckEnd：只在換手後判定（連吃中不判）
  G.terminal = function (st) {
    if (st.chain >= 0) return null;
    const s = st.side, w = s > 0 ? 1 : 0;
    if (!alive(st, s)) return { win: w };
    if (st.n === 0) { let any = false; const b = st.b;
      for (let i = 0; i < 32 && !any; i++) { const p = b[i]; if (p && p * s > 0 && hasAnyTarget(b, i)) any = true; }
      if (!any) return { win: w }; }
    if (st.quiet >= LIMIT) return { win: -1 };
    return null;
  };

  G.team = st => st.side > 0 ? 0 : 1;

  const vi = (st, i) => st.side > 0 ? i : (7 - (i >> 2)) * 4 + (i & 3);
  G.encode = function (st, buf) {
    const HW = 32, b = st.b, s = st.side, P = st.pool, own = s > 0 ? 0 : 8, op = s > 0 ? 8 : 0;
    const fill = (c, v) => { if (v) buf.fill(v, c * HW, c * HW + HW); };
    const tmp = [];
    for (let i = 0; i < 32; i++) { const p = b[i], j = vi(st, i);
      if (p === HID) buf[25 * HW + j] = 1;
      else if (p) { const a = p < 0 ? -p : p; buf[((p * s > 0 ? 0 : 12) + a - 1) * HW + j] = 1;
        if (p * s < 0) { tmp.length = 0; targets(b, i, tmp, true);
          for (let k = 0; k < tmp.length; k++) { const t = tmp[k] & 31; if (b[t] !== HID) buf[27 * HW + vi(st, t)] = 1; } } } }
    for (const [base, o] of [[7, own], [19, op]]) {
      fill(base, P[o + 1]); fill(base + 1, (P[o + 2] + P[o + 3]) / 4); fill(base + 2, (P[o + 4] + P[o + 5]) / 4);
      fill(base + 3, P[o + 6] / 2); fill(base + 4, P[o + 7] / 5); }
    let no = 0, nop = 0; for (let k = 1; k < 8; k++) { no += P[own + k]; nop += P[op + k]; }
    fill(24, 1); fill(31, 1); fill(36, no / 16); fill(37, nop / 16); fill(38, Math.min(1, st.quiet / LIMIT));
    if (st.chain >= 0) { buf[26 * HW + vi(st, st.chain)] = 1; fill(39, 1); }
  };

  G.keys = (st, m) => m === STOP ? { pass: 1 } : m >= FLIP ? { p: vi(st, m - FLIP) } : { f: vi(st, m >> 5), t: vi(st, m & 31) };

  // state → UI 格式的請求
  function toReq(st) {
    let b = ''; for (let i = 0; i < 32; i++) { const p = st.b[i]; b += p === 0 ? '.' : p === HID ? '?' : p > 0 ? CH[p] : CH[-p].toLowerCase(); }
    const pool = {}; for (let k = 1; k < 8; k++) { if (st.pool[k]) pool[CH[k]] = st.pool[k]; if (st.pool[8 + k]) pool[CH[k].toLowerCase()] = st.pool[8 + k]; }
    return { v: 'dk', b, s: st.side > 0 ? 'r' : 'b', pool, rep: [], chain: st.chain, quiet: st.quiet };
  }
  G.toReq = toReq;

  // 開局：全蓋的盤面已由 UI 自己處理（第一手一定是翻棋、顏色未定），所以這裡產生「第一顆翻開之後」的請求，
  // 另外一半再隨機下幾手（翻棋為主）當作中盤局面。n = 幾個，r = 亂數（預設 Math.random）
  G.starts = function (n, r) {
    n = n || 64; r = r || Math.random; const out = [];
    const full = new Array(16).fill(0); for (let k = 1; k < 8; k++) { full[k] = TOTAL[k]; full[8 + k] = TOTAL[k]; }
    for (let g = 0; g < n; g++) {
      const b = new Array(32).fill(HID), pool = full.slice(), i = (r() * 32) | 0, code = draw(pool, 32, r);
      b[i] = code; pool[pk(code)]--;
      let st = { b, pool, n: 31, side: code > 0 ? -1 : 1, chain: -1, quiet: 0 };
      if (g & 1) { const k = 1 + ((r() * 24) | 0);
        for (let j = 0; j < k && !G.terminal(st); j++) {
          const L = G.legal(st); const fl = L.filter(m => m >= FLIP && m < STOP);
          const m = fl.length && r() < 0.5 ? fl[(r() * fl.length) | 0] : L[(r() * L.length) | 0];
          st = G.play(st, m, r).s; }
        if (G.terminal(st)) { g--; continue; } }
      out.push(toReq(st));
    }
    return out;
  };

  G.teacher = st => ({ v: 'dk', req: toReq(st) });
  G.fromTeacher = (st, res) => !res ? null : res.a === 'stop' ? STOP : res.a === 'f' ? FLIP + res.i : res.a === 'm' ? (res.f << 5 | res.t) : null;

  (root.AI_GAMES = root.AI_GAMES || {})[G.id] = G;
  if (typeof module !== 'undefined') module.exports = G;
})(typeof self !== 'undefined' ? self : globalThis);
