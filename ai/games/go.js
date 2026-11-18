// 圍棋 9×9 規則轉接器（中國數子法、貼 6.5 目、禁自殺、全局同形禁著、可虛手、連續兩次虛手終局）
// 規則依據 index.html：
//   goLegal()  ：空點、舊引擎 playMove()（含禁自殺、單劫點 goKo）合法，且落子後的盤面不能和 hist 裡任何一個盤面相同
//                （全局同形；只比盤面字串，不比輪到誰）。UI 不禁止填自己的眼。
//   goApply()  ：虛手 p<0 → goPasses++、goKo=-1；連續兩次虛手進入點目（goPhase='score'），由 ownership 估死子後數子。
//   goScore()  ：盤上子數＋只被單色包圍的空地；白方加 KOMI=6.5；黑 > 白 才算黑勝。
//   goReq()    ：{v:'go', b:'81 字元 b/w/.', s, ko, passes, hist:[之前每一手前的盤面字串], time}
//   舊引擎回傳 {p, wr, n}，p=-1 代表虛手。
// 轉接器的 terminal()：兩次虛手或超過步數上限時，直接用「不提死子」的數子法（Tromp-Taylor 式）算勝負。
//
// 內部狀態（純資料，可 structuredClone）：
//   b: Int8Array(81) 0 空、1 黑、2 白     t: 0 黑走 / 1 白走
//   ko: 單劫禁著點（-1 無）              ps: 連續虛手次數
//   l: 上一手落點（-1 無或虛手）          n: 總手數（含 fromReq 時的 hist 長度）   lim: 步數上限（到了就數子終局）
//   h1,h2: 目前盤面的 zobrist 雜湊（兩個 32 位元）
//   hs: 之前所有盤面的雜湊（53 位元數字，用來判全局同形）
//   b0,t0,h0,mv: 起始盤面字串、起始輪次、起始 hist 字串陣列、之後的走法字串（老師請求重建 hist 用）
// 走法：0～80 落子（列*9+行），81 虛手。keys：落子 {p}，虛手 {pass:1}。
//
// 通道（輪到的一方視角；圍棋棋盤對稱，不翻轉）：
//   0  自己的棋子          1/2/3   自己 1 氣／2 氣／3 氣以上的棋子
//   12 對手的棋子          13/14/15 對手 1 氣／2 氣／3 氣以上的棋子
//   24 有效格（全 1）
//   26 自己可以合法落子的空點
//   27 對手上一手虛手（整面 1；這時再虛手就終局）
//   34 遊戲代號 go（28+6）
//   36 單劫禁著點
//   37 上一手落點
//   38 手數 / 步數上限（整面）
//   39 自己是白方（拿貼目）時整面 1
(function (root) {
  const N = 9, NN = 81, PASS = 81, KOMI = 6.5, LIM = 200;
  // 鄰點表（-1 代表棋盤外）
  const NB = new Int16Array(NN * 4);
  for (let i = 0; i < NN; i++) {
    const r = (i / N) | 0, c = i % N;
    NB[i * 4] = r > 0 ? i - N : -1; NB[i * 4 + 1] = c < N - 1 ? i + 1 : -1;
    NB[i * 4 + 2] = r < N - 1 ? i + N : -1; NB[i * 4 + 3] = c > 0 ? i - 1 : -1;
  }
  // zobrist 亂數表（固定種子，讓雜湊在 Worker 與 Node 之間一致）
  const Z1 = new Int32Array(3 * NN), Z2 = new Int32Array(3 * NN);
  { let x = 0x9e3779b9 | 0; const nx = () => { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; return x | 0; };
    for (let i = 0; i < 3 * NN; i++) { Z1[i] = nx(); Z2[i] = nx(); } }
  const key = (h1, h2) => (h1 >>> 0) * 2097152 + (h2 >>> 11); // 53 位元，可精確存成 double

  // 預先配置的工作緩衝（避免 MCTS 內大量配置記憶體）
  const MARK = new Int32Array(NN), LMARK = new Int32Array(NN), STK = new Int16Array(NN), GRP = new Int16Array(NN);
  let stamp = 0, gsz = 0, H1 = 0, H2 = 0;
  const fresh = () => { if (stamp > 2000000000) { MARK.fill(0); LMARK.fill(0); stamp = 0; } };

  // 從 p 找同色棋塊，回傳氣數（except 點不算氣；數到 need 就提早停）。棋子放進 GRP[0..gsz)
  function group(b, p, except, need) {
    stamp++;
    const c = b[p]; let sp = 0, libs = 0; gsz = 0;
    STK[sp++] = p; MARK[p] = stamp;
    while (sp) {
      const x = STK[--sp]; GRP[gsz++] = x;
      for (let d = 0; d < 4; d++) {
        const q = NB[x * 4 + d]; if (q < 0) continue;
        const v = b[q];
        if (v === 0) { if (q !== except && LMARK[q] !== stamp) { LMARK[q] = stamp; if (++libs >= need) return libs; } }
        else if (v === c && MARK[q] !== stamp) { MARK[q] = stamp; STK[sp++] = q; }
      }
    }
    return libs;
  }

  // 在 b 上直接落子（b 必須是自己新建的陣列）；更新 H1/H2；回傳提子數，提子點寫進 lastCap
  let lastCap = -1;
  function place(b, p, c) {
    const o = 3 - c; let cap = 0;
    b[p] = c; H1 ^= Z1[c * NN + p]; H2 ^= Z2[c * NN + p];
    for (let d = 0; d < 4; d++) {
      const q = NB[p * 4 + d]; if (q < 0 || b[q] !== o) continue;
      if (group(b, q, -1, 1) === 0) {
        for (let k = 0; k < gsz; k++) { const x = GRP[k]; b[x] = 0; H1 ^= Z1[o * NN + x]; H2 ^= Z2[o * NN + x]; }
        cap += gsz; lastCap = q;
      }
    }
    return cap;
  }

  // 是否能在 p 落子（不改動 s）
  function isLegal(s, p) {
    const b = s.b;
    if (b[p] || p === s.ko) return false;
    fresh();
    const c = s.t + 1, o = 3 - c, st0 = stamp;
    let d1 = Z1[c * NN + p], d2 = Z2[c * NN + p], cap = false, safe = false;
    for (let d = 0; d < 4; d++) {
      const q = NB[p * 4 + d]; if (q < 0) continue;
      const v = b[q];
      if (v === 0) safe = true;
      else if (v === o) {
        if (MARK[q] > st0) continue; // 同一塊已經查過
        if (group(b, q, p, 1) === 0) {
          cap = true;
          for (let k = 0; k < gsz; k++) { const x = GRP[k]; d1 ^= Z1[o * NN + x]; d2 ^= Z2[o * NN + x]; }
        }
      } else if (!safe && group(b, q, p, 1) > 0) safe = true;
    }
    if (!cap && !safe) return false; // 自殺
    const hs = s.hs;
    if (hs.length) { const k = key(s.h1 ^ d1, s.h2 ^ d2); for (let i = hs.length - 1; i >= 0; i--) if (hs[i] === k) return false; }
    return true;
  }

  function parse(str) {
    const b = new Int8Array(NN); H1 = 0; H2 = 0;
    for (let i = 0; i < NN; i++) {
      const ch = str ? str[i] : '.'; const v = ch === 'b' ? 1 : ch === 'w' ? 2 : 0;
      if (v) { b[i] = v; H1 ^= Z1[v * NN + i]; H2 ^= Z2[v * NN + i]; }
    }
    return b;
  }
  function str(b) { let s = ''; for (let i = 0; i < NN; i++) { const v = b[i]; s += v === 1 ? 'b' : v === 2 ? 'w' : '.'; } return s; }

  // 數子：盤上子數＋只鄰接單色的空地。回傳 黑 − 白 − 貼目
  const SEEN = new Int32Array(NN);
  let sstamp = 0;
  function score(b) {
    if (++sstamp > 2000000000) { SEEN.fill(0); sstamp = 1; }
    let sc = 0;
    for (let i = 0; i < NN; i++) {
      const v = b[i];
      if (v === 1) { sc++; continue; } if (v === 2) { sc--; continue; }
      if (SEEN[i] === sstamp) continue;
      let sp = 0, cnt = 0, tb = 0, tw = 0; STK[sp++] = i; SEEN[i] = sstamp;
      while (sp) {
        const x = STK[--sp]; cnt++;
        for (let d = 0; d < 4; d++) {
          const q = NB[x * 4 + d]; if (q < 0) continue; const w = b[q];
          if (w === 1) tb = 1; else if (w === 2) tw = 1; else if (SEEN[q] !== sstamp) { SEEN[q] = sstamp; STK[sp++] = q; }
        }
      }
      if (tb && !tw) sc += cnt; else if (tw && !tb) sc -= cnt;
    }
    return sc - KOMI;
  }

  const G = { id: 'go', name: '圍棋', H: N, W: N, KOMI, LIM };

  G.fromReq = function (req) {
    const hist = Array.isArray(req.hist) ? req.hist : [];
    const hs = [];
    for (const h of hist) { parse(h); hs.push(key(H1, H2)); }
    const b = parse(req.b);
    const n = hist.length;
    const ko = Number.isInteger(req.ko) && req.ko >= 0 && req.ko < NN ? req.ko : -1;
    return { b, t: req.s === 'w' ? 1 : 0, ko, ps: Math.min(2, req.passes | 0), l: -1, n, lim: Math.max(LIM, n + 60),
      h1: H1, h2: H2, hs, b0: str(b), t0: req.s === 'w' ? 1 : 0, h0: hist, mv: '' };
  };

  G.toRes = (s, m) => (m === PASS ? { p: -1 } : { p: m });

  G.legal = function (s) {
    const out = [];
    for (let p = 0; p < NN; p++) if (isLegal(s, p)) out.push(p);
    out.push(PASS);
    return out;
  };

  G.play = function (s, m) {
    const hs = s.hs.slice(); hs.push(key(s.h1, s.h2));
    if (m === PASS) {
      return { s: { b: s.b, t: 1 - s.t, ko: -1, ps: s.ps + 1, l: -1, n: s.n + 1, lim: s.lim, h1: s.h1, h2: s.h2, hs,
        b0: s.b0, t0: s.t0, h0: s.h0, mv: s.mv + '!' } };
    }
    const src = s.b, b = new Int8Array(NN);
    for (let i = 0; i < NN; i++) b[i] = src[i];
    H1 = s.h1; H2 = s.h2; fresh();
    const cap = place(b, m, s.t + 1);
    let ko = -1;
    // 單劫：只提一子、落下的子自成一塊且只剩一氣（和舊引擎相同定義）
    if (cap === 1 && group(b, m, -1, 2) === 1 && gsz === 1) ko = lastCap;
    return { s: { b, t: 1 - s.t, ko, ps: 0, l: m, n: s.n + 1, lim: s.lim, h1: H1, h2: H2, hs,
      b0: s.b0, t0: s.t0, h0: s.h0, mv: s.mv + String.fromCharCode(48 + m) } };
  };

  G.terminal = function (s) {
    if (s.ps < 2 && s.n < s.lim) return null;
    return { win: score(s.b) > 0 ? 0 : 1 };
  };
  G.score = s => score(s.b); // 黑 − 白 − 貼目（除錯／訓練用）

  G.team = s => s.t;

  G.encode = function (s, buf) {
    const HW = NN, b = s.b, me = s.t + 1;
    for (let i = 0; i < NN; i++) {
      buf[24 * HW + i] = 1; buf[34 * HW + i] = 1;
      buf[38 * HW + i] = Math.min(1, s.n / s.lim);
      if (s.t === 1) buf[39 * HW + i] = 1;
      if (s.ps === 1) buf[27 * HW + i] = 1;
      const v = b[i];
      if (!v && isLegal(s, i)) buf[26 * HW + i] = 1;
    }
    // 棋塊的氣（isLegal 也會動 stamp，所以另外一輪）
    fresh();
    const st1 = stamp;
    for (let i = 0; i < NN; i++) {
      const v = b[i]; if (!v || MARK[i] > st1) continue;
      const libs = group(b, i, -1, 99), base = v === me ? 0 : 12, sl = base + (libs >= 3 ? 3 : libs);
      for (let k = 0; k < gsz; k++) { const x = GRP[k]; buf[base * HW + x] = 1; buf[sl * HW + x] = 1; }
    }
    if (s.ko >= 0) buf[36 * HW + s.ko] = 1;
    if (s.l >= 0) buf[37 * HW + s.l] = 1;
  };

  G.keys = (s, m) => (m === PASS ? { pass: 1 } : { p: m });

  G.starts = () => [{ v: 'go', b: '.'.repeat(NN), s: 'b', ko: -1, passes: 0, hist: [] }];

  // 老師請求：照 UI 的 goReq 格式，hist 由起始盤面重播走法還原
  G.teacher = function (s) {
    const hist = s.h0.slice(), b = parse(s.b0);
    let c = s.t0 + 1;
    for (let k = 0; k < s.mv.length; k++) {
      hist.push(str(b));
      const ch = s.mv.charCodeAt(k);
      if (ch !== 33) { fresh(); place(b, ch - 48, c); }
      c = 3 - c;
    }
    return { v: 'go', req: { v: 'go', b: str(s.b), s: s.t ? 'w' : 'b', ko: s.ko, passes: s.ps, hist, time: 1000 } };
  };
  G.fromTeacher = function (s, res) {
    if (!res || !Number.isInteger(res.p)) return null;
    if (res.p < 0) return PASS;
    return res.p < NN ? res.p : null;
  };

  (root.AI_GAMES = root.AI_GAMES || {})[G.id] = G;
  if (typeof module !== 'undefined') module.exports = G;
})(typeof self !== 'undefined' ? self : globalThis);
