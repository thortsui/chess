/* ===== 下棋模型核心：神經網路推論 + MCTS + 像真人的機率選步（規格見 ai/SPEC.md） =====
   Worker（importScripts）與 Node（require）都能載入；不碰 DOM。 */
(function (root) {
  const NC = 40, GAMES = ['xq', 'qf', 'jw', 'dk', 'ch', 'gm', 'go', 'bg'];
  const QD = 16, NK = 8, NG = 2 + NK;   // 起點／終點特徵維度、種類格數、全域頭輸出數（value, pass, kind×8）

  /* ---------- 神經網路 ---------- */
  // model.json：{C,B,NC,QD,FC, tensors:{名稱:[offset,長度]}}；model.bin：float32 小端序
  function Net(meta, bin) {
    const f = new Float32Array(bin), T = n => { const t = meta.tensors[n]; if (!t) throw new Error('權重缺 ' + n); return f.subarray(t[0], t[0] + t[1]); };
    this.C = meta.C; this.B = meta.B; this.FC = meta.FC;
    this.stem = { w: T('stem.w'), b: T('stem.b') };
    this.blocks = [];
    for (let i = 0; i < this.B; i++) this.blocks.push({ w1: T(`b${i}.w1`), b1: T(`b${i}.b1`), w2: T(`b${i}.w2`), b2: T(`b${i}.b2`) });
    this.hq = { w: T('hq.w'), b: T('hq.b') }; this.hk = { w: T('hk.w'), b: T('hk.b') }; this.hp = { w: T('hp.w'), b: T('hp.b') };
    this.fc1 = { w: T('fc1.w'), b: T('fc1.b') }; this.fc2 = { w: T('fc2.w'), b: T('fc2.b') };
    this.bufs = {};
  }
  // 3×3 卷積（邊界補 0）。輸入、輸出都存在 (H+2)×(W+2) 的補邊平面裡，省掉邊界判斷。
  // 速度：把「第 1 列第 1 格到第 H 列第 W 格」當成一整段連續記憶體一次算完（中間的補邊格會算到垃圾，最後清回 0），
  // 並且一次算 4 個輸出通道共用同一次輸入讀取。
  function conv3(inp, cin, out, cout, w, b, H, W, relu, res) {
    const PW = W + 2, PS = (H + 2) * PW, S0 = PW + 1, LEN = (H - 1) * PW + W;
    let co = 0;
    for (; co + 4 <= cout; co += 4) {
      const o0 = co * PS + S0, o1 = o0 + PS, o2 = o1 + PS, o3 = o2 + PS;
      for (let i = 0; i < LEN; i++) { out[o0 + i] = b[co]; out[o1 + i] = b[co + 1]; out[o2 + i] = b[co + 2]; out[o3 + i] = b[co + 3]; }
      const CK = cin * 9;
      for (let ci = 0; ci < cin; ci++) {
        const ib = ci * PS + S0;
        for (let k = 0; k < 9; k++) {
          const wi = co * CK + ci * 9 + k, w0 = w[wi], w1 = w[wi + CK], w2 = w[wi + 2 * CK], w3 = w[wi + 3 * CK];
          const s = ib + ((k / 3) | 0) * PW - PW + (k % 3) - 1;
          for (let i = 0; i < LEN; i++) {
            const v = inp[s + i];
            out[o0 + i] += w0 * v; out[o1 + i] += w1 * v; out[o2 + i] += w2 * v; out[o3 + i] += w3 * v;
          }
        }
      }
    }
    for (; co < cout; co++) {
      const o0 = co * PS + S0, CK = cin * 9;
      for (let i = 0; i < LEN; i++) out[o0 + i] = b[co];
      for (let ci = 0; ci < cin; ci++) for (let k = 0; k < 9; k++) {
        const w0 = w[co * CK + ci * 9 + k], s = ci * PS + S0 + ((k / 3) | 0) * PW - PW + (k % 3) - 1;
        for (let i = 0; i < LEN; i++) out[o0 + i] += w0 * inp[s + i];
      }
    }
    // ReLU／殘差，並把補邊格清回 0（下一層會讀到）
    for (let c = 0; c < cout; c++) {
      const ob = c * PS;
      for (let y = 1; y <= H; y++) {
        const r = ob + y * PW;
        out[r] = 0; out[r + W + 1] = 0;
        if (res) for (let x = 1; x <= W; x++) { const v = out[r + x] + res[r + x]; out[r + x] = v > 0 ? v : 0; }
        else if (relu) for (let x = 1; x <= W; x++) { const v = out[r + x]; out[r + x] = v > 0 ? v : 0; }
      }
    }
  }
  Net.prototype.forward = function (H, W, planes) {
    const C = this.C, PW = W + 2, PS = (H + 2) * PW, HW = H * W, key = H + 'x' + W;
    let bb = this.bufs[key];
    if (!bb) bb = this.bufs[key] = { x: new Float32Array(NC * PS), a: new Float32Array(C * PS), t: new Float32Array(C * PS), c: new Float32Array(C * PS) };
    const x = bb.x;
    for (let c = 0; c < NC; c++) for (let y = 0; y < H; y++) { const r = c * PS + (y + 1) * PW + 1, s = c * HW + y * W; for (let i = 0; i < W; i++) x[r + i] = planes[s + i]; }
    let a = bb.a, t = bb.t, c2 = bb.c;
    conv3(x, NC, a, C, this.stem.w, this.stem.b, H, W, true, null);
    for (const blk of this.blocks) {
      conv3(a, C, t, C, blk.w1, blk.b1, H, W, true, null);
      conv3(t, C, c2, C, blk.w2, blk.b2, H, W, true, a);
      const tmp = a; a = c2; c2 = tmp;
    }
    // 1×1 頭：Q、K（QD 通道）、P（1 通道）
    const Q = new Float32Array(QD * HW), K = new Float32Array(QD * HW), P = new Float32Array(HW);
    const head = (wt, bs, n, dst) => {
      for (let o = 0; o < n; o++) for (let y = 0; y < H; y++) for (let i = 0; i < W; i++) {
        const p = (y + 1) * PW + i + 1; let s = bs[o];
        for (let ci = 0; ci < C; ci++) s += wt[o * C + ci] * a[ci * PS + p];
        dst[o * HW + y * W + i] = s;
      }
    };
    head(this.hq.w, this.hq.b, QD, Q); head(this.hk.w, this.hk.b, QD, K); head(this.hp.w, this.hp.b, 1, P);
    // 全域頭：只平均有效格（通道 24）
    const g = new Float32Array(C); let cnt = 0;
    for (let y = 0; y < H; y++) for (let i = 0; i < W; i++) {
      if (planes[24 * HW + y * W + i] < 0.5) continue; cnt++;
      const p = (y + 1) * PW + i + 1; for (let ci = 0; ci < C; ci++) g[ci] += a[ci * PS + p];
    }
    if (cnt) for (let ci = 0; ci < C; ci++) g[ci] /= cnt;
    const FC = this.FC, h = new Float32Array(FC), o = new Float32Array(NG);
    for (let j = 0; j < FC; j++) { let s = this.fc1.b[j]; for (let ci = 0; ci < C; ci++) s += this.fc1.w[j * C + ci] * g[ci]; h[j] = s > 0 ? s : 0; }
    for (let j = 0; j < NG; j++) { let s = this.fc2.b[j]; for (let i = 0; i < FC; i++) s += this.fc2.w[j * FC + i] * h[i]; o[j] = s; }
    return { Q, K, P, value: Math.tanh(o[0]), pass: o[1], kind: o.subarray(2) };
  };
  // 走法分數（訓練端 train/model.py 的 move_logits 要一樣）
  function moveLogit(out, HW, k) {
    if (k.pass) return out.pass;
    let s;
    if (k.p !== undefined) s = out.P[k.p];
    else { s = 0; for (let d = 0; d < QD; d++) s += out.Q[d * HW + k.f] * out.K[d * HW + k.t]; s *= 0.25; }
    if (k.k !== undefined && k.k !== null) s += out.kind[k.k];
    return s;
  }

  /* ---------- 估值：網路（沒有網路時用均勻先驗＋隨機走子當替身，只供測試） ---------- */
  function Evaluator(net) { this.net = net; this.bufs = {}; this.evals = 0; }
  Evaluator.prototype.eval = function (G, s, moves, rng) {
    this.evals++;
    const n = moves.length, pri = new Float32Array(n);
    if (!this.net) {
      for (let i = 0; i < n; i++) pri[i] = 1 / n;
      return { pri, value: rollout(G, s, rng) };
    }
    const HW = G.H * G.W; let buf = this.bufs[G.id];
    if (!buf) buf = this.bufs[G.id] = new Float32Array(NC * HW);
    buf.fill(0); G.encode(s, buf);
    const out = this.net.forward(G.H, G.W, buf);
    let mx = -1e30;
    for (let i = 0; i < n; i++) { pri[i] = moveLogit(out, HW, G.keys(s, moves[i])); if (pri[i] > mx) mx = pri[i]; }
    let z = 0; for (let i = 0; i < n; i++) { pri[i] = Math.exp(pri[i] - mx); z += pri[i]; }
    for (let i = 0; i < n; i++) pri[i] /= z;
    return { pri, value: out.value };
  };
  function rollout(G, s, rng) {
    const me = G.team(s);
    for (let i = 0; i < 60; i++) {
      const r = G.terminal(s); if (r) return r.win === -1 ? 0 : r.win === me ? 1 : -1;
      const L = G.legal(s); if (!L.length) return 0;
      s = G.play(s, L[(rng() * L.length) | 0], rng).s;
    }
    return 0;
  }

  /* ---------- MCTS（PUCT） ---------- */
  function Node(s, team, depth) { this.s = s; this.team = team; this.depth = depth; this.moves = null; this.pri = null; this.N = null; this.W = null; this.kids = null; this.term = undefined; this.v0 = 0; this.n = 0; }
  const CPUCT = 1.6;
  function termValue(r, team) { return r.win === -1 ? 0 : r.win === team ? 1 : -1; }
  function expand(G, ev, node, rng) {
    const r = G.terminal(node.s);
    if (r) { node.term = r; return termValue(r, node.team); }
    node.term = null;
    const moves = G.legal(node.s);
    if (!moves.length) { node.term = { win: -1 }; return 0; }
    const e = ev.eval(G, node.s, moves, rng);
    node.moves = moves; node.pri = e.pri; node.N = new Int32Array(moves.length); node.W = new Float32Array(moves.length); node.kids = new Array(moves.length);
    node.v0 = e.value; return e.value;
  }
  // 一次模擬：回傳「這個節點輪到的那一隊」視角的價值
  function simulate(G, ev, node, maxD, rng, st) {
    if (node.term) return termValue(node.term, node.team);
    if (node.moves === null) { const v = expand(G, ev, node, rng); node.n++; if (node.depth > st.depth) st.depth = node.depth; return v; }
    if (node.depth >= maxD) { node.n++; return node.v0; }   // 到達預判步數上限：只看網路的判斷，不再往下
    const n = node.moves.length, sq = Math.sqrt(node.n + 1);
    const fpu = (node.n ? 0 : node.v0) - 0.25;
    let best = 0, bs = -1e30;
    for (let i = 0; i < n; i++) {
      const q = node.N[i] ? node.W[i] / node.N[i] : fpu;
      const u = q + CPUCT * node.pri[i] * sq / (1 + node.N[i]);
      if (u > bs) { bs = u; best = i; }
    }
    let kid = node.kids[best];
    const out = (kid && !(kid instanceof Map)) ? null : G.play(node.s, node.moves[best], rng);
    if (out && out.ck !== undefined) {           // 機會節點：依抽到的結果分支
      if (!kid) kid = node.kids[best] = new Map();
      let k2 = kid.get(out.ck); if (!k2) { k2 = new Node(out.s, G.team(out.s), node.depth + 1); kid.set(out.ck, k2); }
      kid = k2;
    } else if (!kid) kid = node.kids[best] = new Node(out.s, G.team(out.s), node.depth + 1);
    const v = simulate(G, ev, kid, maxD, rng, st);
    const vp = kid.team === node.team ? v : -v;
    node.N[best]++; node.W[best] += vp; node.n++;
    return vp;
  }

  /* ---------- 分步搜尋樹（自我對弈用：很多局一起跑，估值集中丟給 GPU 一次算） ----------
     用法：leaf = tree.select()；leaf 不是 null 就把 leaf.s、leaf.moves 拿去估值，再 tree.feed(pri, value)。
     select() 回傳 null 代表這次模擬碰到終局或步數上限，已經自己算完。 */
  function Tree(G, s0, maxD, rng) { this.G = G; this.maxD = maxD; this.rng = rng; this.root = new Node(s0, G.team(s0), 0); this.leaf = null; this.path = null; }
  Tree.prototype.select = function () {
    const G = this.G; let node = this.root; const path = [];
    for (;;) {
      if (node.term === undefined) {
        const r = G.terminal(node.s);
        if (r) node.term = r;
        else {
          const mv = G.legal(node.s);
          if (!mv.length) node.term = { win: -1 };
          else { node.term = null; node.moves = mv; this.leaf = node; this.path = path; return node; }
        }
      }
      if (node.term) { this._backup(path, node, termValue(node.term, node.team)); return null; }
      if (node.pri === null) { this.leaf = node; this.path = path; return node; }
      if (node.depth >= this.maxD) { this._backup(path, node, node.v0); return null; }
      const n = node.moves.length, sq = Math.sqrt(node.n + 1), fpu = (node.n ? 0 : node.v0) - 0.25;
      let best = 0, bs = -1e30;
      for (let i = 0; i < n; i++) {
        const q = node.N[i] ? node.W[i] / node.N[i] : fpu, u = q + CPUCT * node.pri[i] * sq / (1 + node.N[i]);
        if (u > bs) { bs = u; best = i; }
      }
      let kid = node.kids[best];
      const out = (kid && !(kid instanceof Map)) ? null : G.play(node.s, node.moves[best], this.rng);
      if (out && out.ck !== undefined) {
        if (!kid) kid = node.kids[best] = new Map();
        let k2 = kid.get(out.ck); if (!k2) { k2 = new Node(out.s, G.team(out.s), node.depth + 1); kid.set(out.ck, k2); }
        kid = k2;
      } else if (!kid) kid = node.kids[best] = new Node(out.s, G.team(out.s), node.depth + 1);
      path.push(node, best); node = kid;
    }
  };
  Tree.prototype.feed = function (pri, value) {
    const n = this.leaf, m = n.moves.length;
    n.pri = pri; n.N = new Int32Array(m); n.W = new Float32Array(m); n.kids = new Array(m); n.v0 = value;
    this._backup(this.path, n, value); this.leaf = null;
  };
  Tree.prototype._backup = function (path, leaf, v) {
    leaf.n++; let child = leaf;
    for (let i = path.length - 2; i >= 0; i -= 2) {
      const p = path[i], b = path[i + 1];
      if (child.team !== p.team) v = -v;
      p.N[b]++; p.W[b] += v; p.n++; child = p;
    }
  };
  // 根節點加 Dirichlet 雜訊（自我對弈時讓它多試沒想過的走法）
  Tree.prototype.noise = function (alpha, eps) {
    const r = this.root; if (!r.pri) return;
    const g = Array.from(r.pri, () => gamma(alpha, this.rng)); const z = g.reduce((a, b) => a + b, 0) || 1;
    const p = new Float32Array(r.pri.length); for (let i = 0; i < p.length; i++) p[i] = (1 - eps) * r.pri[i] + eps * g[i] / z;
    r.pri = p;
  };
  // 走一步後把樹移到那個子節點（保留已經算過的部分）；機會節點就重新開始
  // fresh=true：不保留舊的子樹（很多局同時下時記憶體才不會越積越大）
  Tree.prototype.advance = function (i, fresh) {
    const k = this.root.kids && this.root.kids[i];
    if (k && !(k instanceof Map)) this.root = fresh ? new Node(k.s, k.team, 0) : k;
    else { const out = this.G.play(this.root.s, this.root.moves[i], this.rng); this.root = new Node(out.s, this.G.team(out.s), 0); }
    this.leaf = null; return this.root.s;
  };
  function gamma(a, rng) {   // Marsaglia–Tsang
    if (a < 1) return gamma(1 + a, rng) * Math.pow(rng() || 1e-12, 1 / a);
    const d = a - 1 / 3, c = 1 / Math.sqrt(9 * d);
    for (;;) {
      let x, v;
      do { const u1 = rng() || 1e-12, u2 = rng(); x = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2); v = 1 + c * x; } while (v <= 0);
      v = v * v * v; const u = rng() || 1e-12;
      if (Math.log(u) < 0.5 * x * x + d - d * v + d * Math.log(v)) return d * v;
    }
  }

  /* ---------- 依等級調整的參數 ---------- */
  const lvT = L => (L - 1) / 9;                              // 0（Lv1）～1（Lv10）
  const PARAM = {
    depth: L => L * L,                                       // 預判步數上限 = 等級²
    time: L => 1000 + 4000 * lvT(L),                         // 思考時間 1～5 秒
    tau: L => 1.6 - 1.3 * lvT(L),                            // 溫度：越高越平均（低等級），越低越果斷（高等級）
    delta: L => 0.49 - 0.45 * lvT(L),                        // 和最佳走法差多少以內算「主要候選」
    mistake: L => 0.5 * (1 - lvT(L)),                        // 失誤機率：Lv1 50% → Lv10 0%（Lv10 不失誤）
    gap: 0.20,                                               // 相鄰候選機率差距上限
  };

  // 把根節點的搜尋結果變成「像真人」的機率分布
  function humanize(G, root, L) {
    const n = root.moves.length, team = root.team;
    const N = root.N, Q = new Float32Array(n);
    for (let i = 0; i < n; i++) Q[i] = N[i] ? root.W[i] / N[i] : -2;
    const p = new Float64Array(n);
    // 一步就贏：Lv3 以上一定下
    if (L >= 3) for (let i = 0; i < n; i++) {
      const k = root.kids[i]; if (k && !(k instanceof Map) && k.term && k.term.win === team) { p[i] = 1; return { p, main: [i] }; }
    }
    let bi = 0; for (let i = 1; i < n; i++) if (N[i] > N[bi] || (N[i] === N[bi] && Q[i] > Q[bi])) bi = i;
    const qb = Q[bi], dl = PARAM.delta(L);
    let main = [];
    for (let i = 0; i < n; i++) if (N[i] > 0 && Q[i] >= qb - dl) main.push(i);
    main.sort((a, b) => N[b] - N[a]); main = main.slice(0, 6);
    if (!main.includes(bi)) main.unshift(bi);
    // 候選太少就不像真人（一步 90% 其他都很低）：Lv1～6 至少 3 個、Lv7～9 至少 2 個，補「沒有明顯比較差」的走法
    const kMin = L <= 6 ? 3 : L <= 9 ? 2 : 1;
    if (main.length < kMin) {
      const rest = [];
      for (let i = 0; i < n; i++) if (!main.includes(i) && N[i] > 0 && Q[i] >= qb - Math.max(0.35, dl)) rest.push(i);
      rest.sort((a, b) => N[b] - N[a] || root.pri[b] - root.pri[a]);
      main = main.concat(rest.slice(0, kMin - main.length));
    }
    const tau = PARAM.tau(L);
    // 權重＝搜尋次數＋一點直覺（網路先驗）：搜尋次數少時（八國聯軍）也會偏向「看起來自然」的走法
    let NT = 0, PT = 0; for (const i of main) { NT += N[i]; PT += root.pri[i]; }
    let z = 0; for (const i of main) { p[i] = Math.pow(N[i] + 0.5 * NT * root.pri[i] / (PT || 1), 1 / tau); z += p[i]; }
    // 失誤候選：其餘走法，依網路先驗（開根號讓它更平均）分配；高等級排除已知的大漏著
    const mis = [];
    for (let i = 0; i < n; i++) {
      if (main.includes(i)) continue;
      if (L >= 7 && N[i] > 0 && Q[i] < -0.9) continue;
      mis.push(i);
    }
    const m = mis.length ? PARAM.mistake(L) : 0;
    for (const i of main) p[i] = p[i] / z * (1 - m);
    // 相鄰差距不超過 20 個百分點（盡量）：多的往下一名分
    for (let it = 0; it < 60; it++) {
      let moved = false;
      for (let j = 0; j + 1 < main.length; j++) {
        const a = main[j], b = main[j + 1], gp = p[a] - p[b];
        if (gp > PARAM.gap + 1e-9) { const t = (gp - PARAM.gap) / 2; p[a] -= t; p[b] += t; moved = true; }
      }
      if (!moved) break;
      main.sort((a, b) => p[b] - p[a]);
    }
    if (m) {
      let wz = 0; const w = mis.map(i => { const v = Math.sqrt(root.pri[i]) + 1e-6; wz += v; return v; });
      mis.forEach((i, j) => { p[i] = m * w[j] / wz; });
    }
    return { p, main };
  }

  /* ---------- 對外：想一步 ---------- */
  function makeRng(seed) { let x = (seed >>> 0) || 0x9e3779b9; return () => { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; return (x >>> 0) / 4294967296; }; }
  function think(G, ev, req, opt) {
    const L = Math.max(1, Math.min(10, opt.level | 0 || 1));
    const rng = opt.rng || makeRng(opt.seed ?? (Date.now() ^ (Math.random() * 1e9)));
    const t0 = Date.now(), T = opt.time ?? PARAM.time(L), maxD = opt.depth ?? PARAM.depth(L);
    const s0 = G.fromReq(req), root = new Node(s0, G.team(s0), 0), st = { depth: 0 };
    expand(G, ev, root, rng); root.n = 1;
    if (root.term) return null;
    if (root.moves.length === 1) return finish(G, root, L, rng, t0, st, 0, opt);
    let sims = 0;
    const maxSims = opt.sims ?? Infinity, minT = Math.min(T, opt.minTime ?? 1000);
    let lastEv = ev.evals, stall = 0;
    while (sims < maxSims) {
      simulate(G, ev, root, maxD, rng, st); sims++;
      if (ev.evals === lastEv) { if (++stall > 3000) break; } else { lastEv = ev.evals; stall = 0; }   // 樹已經長到步數上限、沒有新局面可算
      if ((sims & 7) === 0) {
        const el = Date.now() - t0;
        if (el >= T) break;
        if (el >= minT && sims >= 64) {   // 最好的走法已經追不上了就提早停
          let a = 0, b = 0; for (let i = 0; i < root.N.length; i++) { const v = root.N[i]; if (v > a) { b = a; a = v; } else if (v > b) b = v; }
          const left = sims / el * (T - el); if (a - b > left) break;
        }
      }
    }
    return finish(G, root, L, rng, t0, st, sims, opt);
  }
  function finish(G, root, L, rng, t0, st, sims, opt) {
    let p;
    if (opt && opt.best) {   // AI 提示：不加失誤，直接最多訪問次數的走法
      p = new Float64Array(root.moves.length); let bi = 0;
      for (let i = 1; i < p.length; i++) if (root.N[i] > root.N[bi]) bi = i;
      p[bi] = 1;
    } else p = humanize(G, root, L).p;
    let r = rng(), pick = 0;
    for (let i = 0; i < p.length; i++) { r -= p[i]; if (r <= 0) { pick = i; break; } pick = i; }
    if (!(p[pick] > 0)) { let bi = 0; for (let i = 1; i < p.length; i++) if (p[i] > p[bi]) bi = i; pick = bi; }
    const probs = [];
    for (let i = 0; i < p.length; i++) if (p[i] > 0.005) probs.push({ i, p: +p[i].toFixed(3), n: root.N[i], q: root.N[i] ? +(root.W[i] / root.N[i]).toFixed(3) : null, key: G.keys(root.s, root.moves[i]) });
    probs.sort((a, b) => b.p - a.p);
    return { res: G.toRes(root.s, root.moves[pick]), move: root.moves[pick], chosenP: +p[pick].toFixed(3), probs: probs.slice(0, 12), depth: st.depth, maxDepth: PARAM.depth(L), sims, ms: Date.now() - t0, value: +root.v0.toFixed(3) };
  }

  const AI = { NC, GAMES, QD, NK, Net, Evaluator, Tree, think, humanize, PARAM, makeRng, moveLogit };
  root.AI = AI;
  if (typeof module !== 'undefined') module.exports = AI;
})(typeof self !== 'undefined' ? self : globalThis);
