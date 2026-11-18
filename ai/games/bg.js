/* 八國聯軍（bg）規則轉接器 —— 規則照 index.html「八國聯軍：規則引擎」那一段（bgMoves / bgApply，約 4989–5120 行；tools/bg_engine.js 是同一段的複本）
 *
 * ■ 地圖：40 寬 × 34 高（BG_W×BG_H），十字形；H=34、W=40，通道 24 標出有效格。
 * ■ 隊伍：0＝清軍（st.turn==='Q'）、1＝聯軍八國（st.turn==='A'）。
 *   回合順序：清軍、聯軍嚴格輪流各走一步（bgApply 每步都把 turn 在 Q/A 間切換）。聯軍那一步只由「一個操作者」走：
 *   UI 的 bgCtrls() 把聯軍分成數個操作者（每位真人一國＋電腦接手的國家合成一位），聯軍回合依序輪流（BG.ac），
 *   電腦走時 bgAI(st,{only:p=>p.s==='Q'||nations.includes(p.n)}) 只准動那幾國的棋。
 *   轉接器的處理：請求帶 only（國家編號陣列），只限制「這一手」（根節點的聯軍回合）；走完之後的聯軍回合在搜尋裡視為整個聯軍都能動
 *   （之後輪到哪位操作者，搜尋看不到，把聯軍當成同一隊合作）。若 only 那幾國剛好一步都不能走，退回成全部聯軍（UI 的 bgAI 此時回傳 null 會卡住）。
 * ■ 勝負（bgApply 結尾）：慈、禧都被吃 → 聯軍勝；八國國王全被吃 → 清軍勝；輪到的一方沒有任何棋可走 → 該方輸。
 *   國王被吃 → 那一國所有棋子撤出地圖。UI 沒有步數上限；轉接器另加 CAP 手（從 fromReq 起算）→ 和棋，讓隨機對局一定會結束。
 * ■ 沒有打入：index.html 的將棋國吃到的子直接消失（沒有持駒），升變是強制的（走進清軍腹地或走到地圖盡頭），所以不需要 k、也沒有 {p} 走法。
 *
 * ■ 請求格式（fromReq 的輸入，純 JSON）：
 *   { st:    UI 的 BG.st（{b:[{s:'Q'|'A',t,n,m}|null ×1360], turn:'Q'|'A', over, seq, dead:[bool×8], ...}），也接受 bgPack() 的壓縮格式 {pc,turn,over,seq,dead,kinds}
 *     kinds: 這局各國實際用的棋（= index.html 的全域 BG_KIND，順序 俄 日 英 美 法 德 義 奧；省略時用 st.kinds 或 BG_OWN 代表棋）
 *     only:  這一手能動的國家編號陣列（= bgSchedule 傳給 bgAI 的 w.nations），null/省略＝不限制 }
 *   toRes 回傳 [f,t]（地圖格號 y*40+x），和 bgAI 一樣，UI 直接 bgDo(f,t)。
 *
 * ■ 12 個棋子槽（依走法相近分組；自己 0–11、對手 12–23）
 *   0 要害（被吃就出事）：國王 k、慈 X、禧 Y
 *   1 直線滑行：清車 R、城堡／飛車 r、香車 l（只往前直衝）
 *   2 斜線滑行：主教／角行 b、信使 c
 *   3 皇后 q
 *   4 跳馬類：清馬 H（拐腳）、騎士 n、桂馬 j（只往前跳）
 *   5 炮 C
 *   6 直走一步：將 G、弄臣 w
 *   7 斜走一步：士 A、小后 f
 *   8 八方／金銀類一步：謀士 m、金將 g、成金 t、銀將 s
 *   9 斜跳兩格：相 E（塞象眼）、弓手 a（可越子）
 *   10 兵類：清兵 P、士兵 p、王前兵 o、步兵 u
 *   11 複合強子：赫爾吉 e（后＋馬）、龍王 d（車＋斜一步）、龍馬 y（象＋直一步）
 * ■ 其他通道
 *   24 有效格；26 清軍腹地（將士相慈禧的活動範圍，也是將棋國的升變區）；27 這一手可以動的聯軍棋子（只在聯軍回合，套用 only）
 *   36 左邊國家（俄、日，往右進攻）的棋子；37 右邊國家（義、奧，往左進攻）的棋子；其餘聯軍是上方四國（往下）
 *   38 特殊旗標：還能走兩格的士兵（未動過、不是信使棋）或將棋國會升變的子（飛 角 銀 桂 香 歩）
 *   39 步數進度 ply/CAP（整面）
 *   視角：清軍回合照原圖（清軍在下方）；聯軍回合把列上下翻轉（聯軍上方四國變到下方），keys 用同樣的翻轉。
 *
 * ■ 內部狀態：{b:Uint16Array(1360), turn, seq, ply, dead(位元), gens(慈禧剩幾個), kings(活著的國王數), kinds, only(位元), over}
 *   棋子碼 = (種類+1) | (國家+1)<<5 | 動過<<9（清軍國家欄為 0）；空格 0。可用 structuredClone 複製（JSON 化後 b 會變成物件，
 *   legal/play 會自動轉回）。走法是整數 f*1360+t。
 */
(function (root) {
  const W = 40, H = 34, N = W * H, TH = 2, AW = 4, CW = 32, PY = 18, PX = 10, PW = 20, RIVER = PY - 1, CAP = 800;
  const TYPES = 'kqrbnpoecmfwagsjludytRHCPAEGXY';   // 0..20 聯軍、21..29 清軍
  const TI = {}; for (let i = 0; i < TYPES.length; i++) TI[TYPES[i]] = i;
  const SLOT = { k: 0, X: 0, Y: 0, R: 1, r: 1, l: 1, b: 2, c: 2, q: 3, H: 4, n: 4, j: 4, C: 5, G: 6, w: 6, A: 7, f: 7, m: 8, g: 8, t: 8, s: 8, E: 9, a: 9, P: 10, p: 10, o: 10, u: 10, e: 11, d: 11, y: 11 };
  const SLOTI = new Int8Array(32); for (const k in SLOT) SLOTI[TI[k] + 1] = SLOT[k];
  // 種類代碼（存在棋子碼裡的是 +1）
  const K_ = TI.k + 1, Q_ = TI.q + 1, R_ = TI.r + 1, B_ = TI.b + 1, N_ = TI.n + 1, P_ = TI.p + 1, O_ = TI.o + 1, E_ = TI.e + 1, C_ = TI.c + 1, M_ = TI.m + 1,
    F_ = TI.f + 1, WZ_ = TI.w + 1, AL_ = TI.a + 1, G_ = TI.g + 1, S_ = TI.s + 1, J_ = TI.j + 1, L_ = TI.l + 1, U_ = TI.u + 1, D_ = TI.d + 1, Y_ = TI.y + 1, T_ = TI.t + 1,
    QR = TI.R + 1, QH = TI.H + 1, QC = TI.C + 1, QP = TI.P + 1, QA = TI.A + 1, QE = TI.E + 1, QG = TI.G + 1, QX = TI.X + 1, QY = TI.Y + 1;
  const JPUP = new Int8Array(32); JPUP[R_] = D_; JPUP[B_] = Y_; JPUP[S_] = T_; JPUP[J_] = T_; JPUP[L_] = T_; JPUP[U_] = T_;   // 將棋國的升變（同 BG_JPUP）

  // 地圖（同 BG_ROWS / BG_VALID / bgPalm）
  const VALID = new Uint8Array(N), PALM = new Uint8Array(N);
  for (let y = 0; y < H; y++) { const a = y < TH ? AW : y < PY ? 0 : PX, b = y < TH ? AW + CW - 1 : y < PY ? W - 1 : PX + PW - 1; for (let x = a; x <= b; x++) VALID[y * W + x] = 1; }
  for (let y = PY; y < H; y++) for (let x = PX; x < PX + PW; x++) PALM[y * W + x] = 1;
  const inb = (x, y) => x >= 0 && y >= 0 && x < W && y < H && VALID[y * W + x] === 1;
  // 各國：side（l 左 t 上 r 右）、at、前進方向（同 BG_NATIONS / bgDir）
  const NSIDE = ['l', 'l', 't', 't', 't', 't', 'r', 'r'], NAT = [8, 0, 0, 8, 16, 24, 0, 8];
  const NDX = NSIDE.map(s => s === 'l' ? 1 : s === 'r' ? -1 : 0), NDY = NSIDE.map(s => s === 't' ? 1 : 0);
  const KINDS = ['ch', 'f9', 'vi', 'co', 'sh', 'ta'], OWN = ['ta', 'sh', 'ch', 'f9', 'ch', 'co', 'ch', 'vi'];
  const kindsOk = k => Array.isArray(k) && k.length === 8 && k.every(x => KINDS.includes(x));

  const D4 = [[1, 0], [-1, 0], [0, 1], [0, -1]], DG = [[1, 1], [1, -1], [-1, 1], [-1, -1]], D8 = D4.concat(DG),
    KN = [[1, 2], [2, 1], [-1, 2], [-2, 1], [1, -2], [2, -1], [-1, -2], [-2, -1]];
  const SH_G = [[1, 0], [1, 1], [1, -1], [0, 1], [0, -1], [-1, 0]], SH_S = [[1, 0], [1, 1], [1, -1], [-1, 1], [-1, -1]], SH_J = [[2, 1], [2, -1]];
  const nat = c => (c >> 5) & 15;   // 0＝清軍，1..8＝國家+1
  const typ = c => c & 31;

  // 產生 i 這格棋子的走法（push f*N+t 到 out）；同 bgMoves(st,i,false)
  function gen(b, kinds, i, out) {
    const c = b[i], tp = c & 31, nn = (c >> 5) & 15, x = i % W, y = (i / W) | 0, base = i * N;
    const add = (xx, yy) => {
      if (xx < 0 || yy < 0 || xx >= W || yy >= H) return false; const j = yy * W + xx; if (!VALID[j]) return false;
      const q = b[j]; if (q && (nn === 0) === (((q >> 5) & 15) === 0)) return false; out.push(base + j); return !q;
    };
    const slide = (dx, dy) => { let xx = x + dx, yy = y + dy; while (add(xx, yy)) { xx += dx; yy += dy; } };
    if (nn) {
      const n = nn - 1;
      switch (tp) {
        case K_: case M_: for (const d of D8) add(x + d[0], y + d[1]); break;
        case Q_: for (const d of D8) slide(d[0], d[1]); break;
        case R_: for (const d of D4) slide(d[0], d[1]); break;
        case B_: case C_: for (const d of DG) slide(d[0], d[1]); break;
        case N_: for (const d of KN) add(x + d[0], y + d[1]); break;
        case E_: for (const d of D8) slide(d[0], d[1]); for (const d of KN) add(x + d[0], y + d[1]); break;
        case F_: for (const d of DG) add(x + d[0], y + d[1]); break;
        case WZ_: for (const d of D4) add(x + d[0], y + d[1]); break;
        case AL_: for (const d of DG) add(x + 2 * d[0], y + 2 * d[1]); break;
        case D_: for (const d of D4) slide(d[0], d[1]); for (const d of DG) add(x + d[0], y + d[1]); break;
        case Y_: for (const d of DG) slide(d[0], d[1]); for (const d of D4) add(x + d[0], y + d[1]); break;
        case L_: slide(NDX[n], NDY[n]); break;
        case G_: case T_: case S_: case J_: case U_: {
          const dx = NDX[n], dy = NDY[n], L = tp === U_ ? [[1, 0]] : tp === J_ ? SH_J : tp === S_ ? SH_S : SH_G;
          for (const [f, sd] of L) add(x + f * dx + sd * dy, y + f * dy + sd * dx); break;
        }
        case P_: case O_: {
          const dx = NDX[n], dy = NDY[n], fx = x + dx, fy = y + dy;
          if (inb(fx, fy) && !b[fy * W + fx]) {
            out.push(base + fy * W + fx);
            if (!(c & 512) && kinds[n] !== 'co' && inb(fx + dx, fy + dy) && !b[(fy + dy) * W + fx + dx]) out.push(base + (fy + dy) * W + fx + dx);   // 信使棋的兵第一步不能走兩格
          }
          for (const s of [-1, 1]) {
            const cx = fx + (dy ? s : 0), cy = fy + (dx ? s : 0);
            if (inb(cx, cy)) { const q = b[cy * W + cx]; if (q && ((q >> 5) & 15) === 0) out.push(base + cy * W + cx); }
          }
          break;
        }
      }
    } else {
      switch (tp) {
        case QR: for (const d of D4) slide(d[0], d[1]); break;
        case QC: for (const [dx, dy] of D4) {
          let xx = x + dx, yy = y + dy, jmp = false;
          while (inb(xx, yy)) {
            const j = yy * W + xx, q = b[j];
            if (!jmp) { if (!q) out.push(base + j); else jmp = true; }
            else if (q) { if (((q >> 5) & 15) !== 0) out.push(base + j); break; }
            xx += dx; yy += dy;
          }
        } break;
        case QH: for (const [dx, dy] of KN) {
          const lx = Math.abs(dx) === 2 ? x + dx / 2 : x, ly = Math.abs(dy) === 2 ? y + dy / 2 : y;
          if (inb(lx, ly) && !b[ly * W + lx]) add(x + dx, y + dy);
        } break;
        case QP: add(x, y - 1); if (y <= RIVER) { add(x - 1, y); add(x + 1, y); } break;
        case QG: case QX: case QY: for (const [dx, dy] of D4) { const xx = x + dx, yy = y + dy; if (yy >= PY && yy < H && xx >= PX && xx < PX + PW) add(xx, yy); } break;
        case QA: for (const [dx, dy] of DG) { const xx = x + dx, yy = y + dy; if (yy >= PY && yy < H && xx >= PX && xx < PX + PW) add(xx, yy); } break;
        case QE: for (const [dx, dy] of DG) {
          const xx = x + 2 * dx, yy = y + 2 * dy;
          if (yy >= PY && yy < H && xx >= PX && xx < PX + PW && inb(x + dx, y + dy) && !b[(y + dy) * W + x + dx]) add(xx, yy);
        } break;
      }
    }
  }
  const asB = b => b instanceof Uint16Array ? b : Uint16Array.from(Array.isArray(b) ? b : Object.keys(b).map(k => b[k]));
  // side：0 清軍、1 聯軍；mask：只產生這些國家（位元）的棋，0＝不限制
  function genAll(b, kinds, side, mask, out) {
    for (let i = 0; i < N; i++) {
      const c = b[i]; if (!c) continue; const nn = (c >> 5) & 15;
      if (side === 0 ? nn !== 0 : (nn === 0 || (mask && !(mask & (1 << (nn - 1)))))) continue;
      gen(b, kinds, i, out);
    }
    return out;
  }
  const scratch = [];
  function hasMove(b, kinds, side) {
    for (let i = 0; i < N; i++) {
      const c = b[i]; if (!c || ((((c >> 5) & 15) === 0) ? 0 : 1) !== side) continue;
      scratch.length = 0; gen(b, kinds, i, scratch); if (scratch.length) return true;
    }
    return false;
  }

  // ---- UI 物件 <-> 內部 ----
  function fromUI(st, kinds, only) {
    const b = new Uint16Array(N);
    const put = (i, s, t, n, m) => { if (TI[t] === undefined) throw new Error('不認得的棋 ' + t); b[i] = (TI[t] + 1) | (s === 'Q' ? 0 : (n + 1) << 5) | (s !== 'Q' && m ? 512 : 0); };
    if (st.pc) for (const [i, c, m] of st.pc) { if (c.length === 1 && /[RHCPAEGXY]/.test(c)) put(i, 'Q', c, -1, 0); else put(i, 'A', c[0], +c.slice(1), m); }
    else st.b.forEach((p, i) => { if (p) put(i, p.s, p.t, p.n, p.m); });
    let gens = 0; for (let i = 0; i < N; i++) { const t = b[i] & 31; if (t === QX || t === QY) gens++; }
    const deadArr = st.dead || [], dead = deadArr.reduce((a, d, n) => a | (d ? 1 << n : 0), 0);
    const turn = st.turn === 'A' ? 1 : 0;
    let om = 0; if (turn === 1 && Array.isArray(only)) for (const n of only) om |= 1 << n;
    const over = st.over ? (st.over.win === 'A' ? 1 : st.over.win === 'Q' ? 0 : -1) : null;
    return { b, turn, seq: st.seq | 0, ply: 0, dead, gens, kings: 8 - deadArr.filter(Boolean).length, kinds: kinds.slice(), only: om, over };
  }
  function toUI(s) {
    const b = asB(s.b), arr = Array(N).fill(null);
    for (let i = 0; i < N; i++) {
      const c = b[i]; if (!c) continue; const nn = (c >> 5) & 15, t = TYPES[(c & 31) - 1];
      arr[i] = nn ? (c & 512 ? { s: 'A', t, n: nn - 1, m: 1 } : { s: 'A', t, n: nn - 1 }) : { s: 'Q', t, n: -1 };
    }
    const over = s.over === null || s.over === undefined ? null : { win: s.over === 1 ? 'A' : s.over === 0 ? 'Q' : 'D' };
    return { b: arr, turn: s.turn ? 'A' : 'Q', over, last: null, seq: s.seq, dead: [0, 1, 2, 3, 4, 5, 6, 7].map(n => !!(s.dead & (1 << n))), log: [] };
  }

  // ---- 開局（同 bgNew / bgRanks / BG_QING，但用可重現的亂數） ----
  const QING = (() => {
    const rev = t => [...t].reverse().join(''), mir = h => h + rev(h), E = '.'.repeat(20), edge = 'RR' + '.'.repeat(16) + 'RR', C = '..' + 'C.'.repeat(8) + '..';
    return ['G.'.repeat(10), '.G'.repeat(10), E, C, '.H'.repeat(10), C, E, E, E, E, edge, edge, edge, mir('RRH..RH..R'), mir('RR.RHC.RHA'), mir('RRHCERHAX.').replace('X..X', 'X..Y')];
  })();
  function ranks(k, rnd) {
    const P = 'pppppppp';
    if (k === 'ta') return ['rnbqkbnr', 'ppppoppp']; if (k === 'sh') return ['ljsgkgsl', '.r....b.', 'uuuuuuuu']; if (k === 'co') return ['racmkfwr', P];
    if (k === 'f9' || k === 'vi') for (;;) {
      const a = [...'rnbqkbnr']; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
      const s = a.join(''); if ((s.indexOf('b') + s.lastIndexOf('b')) % 2 !== 1) continue;
      if (k === 'vi' || (s.indexOf('r') < s.indexOf('k') && s.indexOf('k') < s.lastIndexOf('r'))) return [s, P];
    }
    return ['rnbqkbnr', P];
  }
  function newReq(kinds, rnd) {
    const b = Array(N).fill(null);
    QING.forEach((row, ry) => [...row].forEach((ch, rx) => { if (ch !== '.') b[(PY + ry) * W + PX + rx] = { s: 'Q', t: ch, n: -1 }; }));
    for (let n = 0; n < 8; n++) {
      const rk = ranks(kinds[n], rnd);
      for (let d = 0; d < rk.length; d++) for (let a = 0; a < 8; a++) {
        const t = rk[d][a]; if (t === '.') continue; let x, y;
        if (NSIDE[n] === 't') { x = AW + NAT[n] + a; y = d; } else if (NSIDE[n] === 'l') { x = d; y = TH + NAT[n] + a; } else { x = W - 1 - d; y = TH + NAT[n] + a; }
        b[y * W + x] = { s: 'A', t, n };
      }
    }
    return { st: { b, turn: 'Q', over: null, last: null, seq: 0, dead: Array(8).fill(false), log: [] }, kinds: kinds.slice(), only: null };
  }

  const G = {
    id: 'bg', name: '八國聯軍', H, W, CAP,
    fromReq(req) {
      const st = req.st || req, kinds = kindsOk(req.kinds) ? req.kinds : kindsOk(st.kinds) ? st.kinds : OWN;
      return fromUI(st, kinds, req.only);
    },
    toRes(s, m) { const f = (m / N) | 0; return [f, m - f * N]; },
    legal(s) {
      if (s.over !== null && s.over !== undefined) return [];
      const b = asB(s.b);
      if (s.turn === 1 && s.only) { const L = genAll(b, s.kinds, 1, s.only, []); if (L.length) return L; }
      return genAll(b, s.kinds, s.turn, 0, []);
    },
    play(s, m) {
      const b = asB(s.b).slice(), f = (m / N) | 0, t = m - f * N, p = b[f], q = b[t];
      let { dead, gens, kings } = s;
      b[t] = p; b[f] = 0;
      const pn = (p >> 5) & 15;
      if (pn) {   // 聯軍：標記動過、升變（同 bgApply）
        const n = pn - 1, tp = p & 31, x = t % W, y = (t / W) | 0, end = !inb(x + NDX[n], y + NDY[n]);
        let c = p | 512;
        if ((tp === P_ || tp === O_) && end) c = (c & ~31) | (tp === O_ ? E_ : s.kinds[n] === 'co' ? F_ : Q_);
        else if (s.kinds[n] === 'sh' && JPUP[tp] && (PALM[t] || end)) c = (c & ~31) | JPUP[tp];
        b[t] = c;
      }
      if (q) {
        const qn = (q >> 5) & 15, qt = q & 31;
        if (qn && qt === K_) {   // 國王被吃：整國撤退
          dead |= 1 << (qn - 1); kings--;
          for (let i = 0; i < N; i++) if (b[i] && ((b[i] >> 5) & 15) === qn) b[i] = 0;
        } else if (!qn && (qt === QX || qt === QY)) gens--;
      }
      const turn = s.turn ^ 1, ply = s.ply + 1;
      let over = null;
      if (!gens) over = 1; else if (!kings) over = 0;
      else if (!hasMove(b, s.kinds, turn)) over = turn ^ 1;
      else if (ply >= CAP) over = -1;
      return { s: { b, turn, seq: s.seq + 1, ply, dead, gens, kings, kinds: s.kinds, only: 0, over } };
    },
    terminal(s) { return s.over === null || s.over === undefined ? null : { win: s.over }; },
    team(s) { return s.turn; },
    encode(s, buf) {
      const b = asB(s.b), HW = N, flip = s.turn === 1, A = s.turn === 1;
      for (let y = 0; y < H; y++) {
        const ry = flip ? H - 1 - y : y;
        for (let x = 0; x < W; x++) {
          const i = y * W + x, o = ry * W + x;
          if (VALID[i]) buf[24 * HW + o] = 1;
          if (PALM[i]) buf[26 * HW + o] = 1;
          const c = b[i]; if (!c) continue;
          const nn = (c >> 5) & 15, tp = c & 31, team = nn ? 1 : 0;
          buf[((team === s.turn ? 0 : 12) + SLOTI[tp]) * HW + o] = 1;
          if (nn) {
            const n = nn - 1;
            if (A && (!s.only || (s.only & (1 << n)))) buf[27 * HW + o] = 1;
            if (NSIDE[n] === 'l') buf[36 * HW + o] = 1; else if (NSIDE[n] === 'r') buf[37 * HW + o] = 1;
            if (((tp === P_ || tp === O_) && !(c & 512) && s.kinds[n] !== 'co') || (s.kinds[n] === 'sh' && JPUP[tp])) buf[38 * HW + o] = 1;
          }
        }
      }
      buf.fill(1, 35 * HW, 36 * HW);   // 遊戲代號 bg（第 8 個）
      buf.fill(Math.min(1, s.ply / CAP), 39 * HW, 40 * HW);
    },
    keys(s, m) {
      const f = (m / N) | 0, t = m - f * N;
      if (s.turn !== 1) return { f, t };
      const fl = i => (H - 1 - ((i / W) | 0)) * W + i % W;
      return { f: fl(f), t: fl(t) };
    },
    starts() {
      // 可重現的亂數：菲舍爾／維也納的底線、隨機混搭的棋種
      let z = 20240611; const rnd = () => ((z = (z * 1103515245 + 12345) >>> 0) / 4294967296);
      const out = [];
      for (let i = 0; i < 4; i++) out.push(newReq(OWN, rnd));                 // 預設「各國代表棋」（每次菲舍爾、維也納底線不同）
      out.push(newReq(Array(8).fill('ch'), rnd));                              // 全部西洋棋
      for (const k of KINDS) if (k !== 'ch') out.push(newReq(Array(8).fill(k), rnd));   // 全部同一種
      for (let i = 0; i < 9; i++) out.push(newReq(Array.from({ length: 8 }, () => KINDS[(rnd() * KINDS.length) | 0]), rnd));   // 隨機混搭
      return out;
    },
    teacher(s) {
      const only = []; if (s.turn === 1 && s.only) for (let n = 0; n < 8; n++) if (s.only & (1 << n)) only.push(n);
      return { v: 'bg', req: { st: toUI(s), kinds: s.kinds.slice(), only: only.length ? only : null } };
    },
    fromTeacher(s, r) { return Array.isArray(r) ? r[0] * N + r[1] : null; },
    toUI,   // 測試用：內部狀態 → UI 的 st 物件
  };
  (root.AI_GAMES = root.AI_GAMES || {})[G.id] = G;
  if (typeof module !== 'undefined') module.exports = G;
})(typeof self !== 'undefined' ? self : globalThis);
