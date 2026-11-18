// 五子棋 15×15 規則轉接器（自由式：黑先、無禁手、五連以上即勝、下滿和棋）
// 規則依據 index.html：gmApply()（落子後 gmLine() 檢查經過該子的連線 ≥5 即勝；board.every 全滿則和）
//   UI 沒有任何禁手判定，任何空格都能下。
// 請求（gmMaybeAI）：{v:'gm', b:'225 字元 b/w/.', s:'b'|'w', time, depth}；舊引擎回傳 {i}。
//
// 內部狀態（純資料）：
//   b: Int8Array(225)  0 空、1 黑、2 白
//   t: 0 黑走 / 1 白走
//   n: 盤上子數
//   l: 上一手位置（-1 無）
//   w: -2 未結束、0 黑勝、1 白勝、-1 和棋
// 走法：落子點的整數 0～224（列*15+行）。keys → {p}。
//
// 通道（以輪到的一方視角；棋盤上下左右對稱，不翻轉）：
//   0  自己的棋子
//   12 對手的棋子
//   24 有效格（全 1）
//   26 自己「再一手就成五」的空點（四連缺一）
//   27 對手「再一手就成五」的空點
//   33 遊戲代號 gm（28+5）
//   36 上一手位置
//   37 盤上子數 / 225（整面）
//   38 自己是白方時整面 1（先後手資訊）
(function (root) {
  const N = 15, NN = 225;
  const DIRS = [[0, 1], [1, 0], [1, 1], [1, -1]];
  // 預先算好所有「五格窗口」，encode 找成五點用
  const WIN5 = [];
  for (const [dr, dc] of DIRS) for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
    const er = r + 4 * dr, ec = c + 4 * dc; if (er < 0 || er >= N || ec < 0 || ec >= N) continue;
    for (let k = 0; k < 5; k++) WIN5.push((r + k * dr) * N + c + k * dc);
  }
  const NW = WIN5.length / 5;

  // 經過 i 的任一方向是否有 ≥5 連（和 UI 的 gmLine 相同）
  function line5(b, i) {
    const c = b[i]; if (!c) return false;
    const r = (i / N) | 0, cc = i % N;
    for (let d = 0; d < 4; d++) {
      const dr = DIRS[d][0], dc = DIRS[d][1]; let n = 1;
      for (let s = 1; s >= -1; s -= 2) {
        let rr = r + dr * s, c2 = cc + dc * s;
        while (rr >= 0 && rr < N && c2 >= 0 && c2 < N && b[rr * N + c2] === c) { n++; rr += dr * s; c2 += dc * s; }
      }
      if (n >= 5) return true;
    }
    return false;
  }

  const G = { id: 'gm', name: '五子棋', H: N, W: N };

  G.fromReq = function (req) {
    const b = new Int8Array(NN); let n = 0;
    const str = req.b || '';
    for (let i = 0; i < NN; i++) { const ch = str[i]; if (ch === 'b') { b[i] = 1; n++; } else if (ch === 'w') { b[i] = 2; n++; } }
    const s = { b, t: req.s === 'w' ? 1 : 0, n, l: -1, w: -2 };
    // 請求不帶上一手：掃全盤找五連（理論上 UI 不會在終局後再送請求）
    for (let i = 0; i < NN && s.w === -2; i++) if (b[i] && line5(b, i)) s.w = b[i] - 1;
    if (s.w === -2 && n >= NN) s.w = -1;
    return s;
  };

  G.toRes = (s, m) => ({ i: m });

  G.legal = function (s) {
    const out = [], b = s.b;
    for (let i = 0; i < NN; i++) if (!b[i]) out.push(i);
    return out;
  };

  G.play = function (s, m) {
    const src = s.b, b = new Int8Array(NN);
    for (let i = 0; i < NN; i++) b[i] = src[i];
    b[m] = s.t + 1;
    const n = s.n + 1;
    let w = -2;
    if (line5(b, m)) w = s.t; else if (n >= NN) w = -1;
    return { s: { b, t: 1 - s.t, n, l: m, w } };
  };

  G.terminal = s => (s.w === -2 ? null : { win: s.w });
  G.team = s => s.t;

  G.encode = function (s, buf) {
    const HW = NN, b = s.b, me = s.t + 1, op = 2 - s.t;
    for (let i = 0; i < NN; i++) {
      const v = b[i];
      if (v === me) buf[i] = 1; else if (v === op) buf[12 * HW + i] = 1;
      buf[24 * HW + i] = 1;
      buf[33 * HW + i] = 1;
      buf[37 * HW + i] = s.n / NN;
      if (s.t === 1) buf[38 * HW + i] = 1;
    }
    // 四連缺一的空點
    for (let w = 0; w < NW; w++) {
      let nm = 0, no = 0, e = -1;
      for (let k = 0; k < 5; k++) { const x = WIN5[w * 5 + k], v = b[x]; if (v === me) nm++; else if (v === op) no++; else e = x; }
      if (nm === 4 && !no) buf[26 * HW + e] = 1; else if (no === 4 && !nm) buf[27 * HW + e] = 1;
    }
    if (s.l >= 0) buf[36 * HW + s.l] = 1;
  };

  G.keys = (s, m) => ({ p: m });

  G.starts = () => [{ v: 'gm', b: '.'.repeat(NN), s: 'b' }];

  G.teacher = function (s) {
    let str = '';
    for (let i = 0; i < NN; i++) { const v = s.b[i]; str += v === 1 ? 'b' : v === 2 ? 'w' : '.'; }
    return { v: 'gm', req: { v: 'gm', b: str, s: s.t ? 'w' : 'b', time: 1000, depth: 6 } };
  };
  G.fromTeacher = (s, res) => (res && Number.isInteger(res.i) && res.i >= 0 && res.i < NN && !s.b[res.i] ? res.i : null);

  (root.AI_GAMES = root.AI_GAMES || {})[G.id] = G;
  if (typeof module !== 'undefined') module.exports = G;
})(typeof self !== 'undefined' ? self : globalThis);
