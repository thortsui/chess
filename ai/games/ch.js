/* ===== 西洋棋（ch）規則轉接器 =====
 * 規則完全照 index.html 的 chEngine（<script type="text/plain" id="chengine">）與 chCheckEnd()：
 *   - 走法產生＝chEngine.legal(fen)：入堡（王在 e1/e8、該角落還有自己的車、經過格皆空、王起點/經過/終點不被攻擊）、
 *     吃過路兵（兵每走兩格就設 ep 格，FEN 照寫）、升變 Q/R/B/N（吃子升變也四種）。
 *   - 終局判定順序＝chCheckEnd()：沒有合法走法 → 被將軍＝將死、否則逼和；half≥100 → 50 步和；
 *     目前局面的 chKey（FEN 前四欄：盤面、輪走方、入堡權、ep 格）出現 ≥3 次 → 三次重複和；
 *     子力不足（雙方都沒有兵/車/后，且雙方馬＋象合計 ≤1）→ 和。
 *   - 西洋棋模式只從 CH_START 標準開局開始（沒有 960 等變體佈局）。
 *
 * 內部狀態（純資料，可 JSON/structuredClone）：
 *   b[64]：UI 的格號 i=r*8+c，r=0 是第 8 橫列（黑方底線）。白子正、黑子負：1兵 2馬 3象 4車 5后 6王
 *   side：0 白、1 黑；cr：入堡權位元（1=K 2=Q 4=k 8=q，同 chEngine）；ep：吃過路兵目標格或 -1
 *   half、full：同 FEN；h：自從上一次「不可逆」走法（兵動或吃子）以來每個局面的雜湊（含目前局面）
 *   tx（可選）：同樣範圍的 chKey 文字，只有請求帶 keepFen:1 時才保留（給 teacher() 組 rep 用，手機上不需要）
 *
 * 走法：整數 m = f | t<<6 | pr<<12（f、t 為 UI 格號；pr＝升變子種 2馬 3象 4車 5后，0＝不升變）
 *
 * encode（一律以輪到的一方視角；黑方時把列上下翻轉 r→7-r，左右不翻；keys 用同樣的翻轉）：
 *   槽 0 兵、1 馬、2 象、3 車、4 后、5 王；6–11 不用。通道 0–11 自己、12–23 對手。
 *   24 有效格（全 1）；26 區域 A＝升變列（翻轉後的第 0 列）；27 區域 B＝己方半場（翻轉後第 4–7 列）
 *   32（=28+4）遊戲代號 ch 整面 1
 *   36 入堡權：仍可入堡那一側的「車的原始格」標 1（雙方都標）
 *   37 吃過路兵目標格標 1
 *   38 50 步計數 half/100（整面）
 *   39 重複次數：(目前局面已出現次數−1)/2（整面）
 * keys：{f,t}（翻轉後座標）；升變再加 k：0馬 1象 2車 3后。
 */
(function (root) {
  const P = 1, N = 2, B = 3, R = 4, Q = 5, K = 6;
  const CH_START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
  // 0x88 方向
  const NO = [-33, -31, -18, -14, 14, 18, 31, 33], KO = [-17, -16, -15, -1, 1, 15, 16, 17], BO = [-17, -15, 15, 17], RO = [-16, -1, 1, 16];
  // 入堡權遮罩（64 格號）：e1/h1/a1/e8/h8/a8 被動到或被吃就失去對應權利
  const CM = new Int8Array(64).fill(15); CM[60] = 12; CM[63] = 14; CM[56] = 13; CM[4] = 3; CM[7] = 11; CM[0] = 7;
  // Zobrist 雜湊（兩組 32 位元，合成 53 位元整數）
  const Z1 = new Int32Array(13 * 64), Z2 = new Int32Array(13 * 64), ZC1 = new Int32Array(16), ZC2 = new Int32Array(16),
    ZE1 = new Int32Array(64), ZE2 = new Int32Array(64);
  let ZS1 = 0, ZS2 = 0;
  (function () {
    let x = 0x2C4F6E1B; const r = () => { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; return x | 0; };
    for (let i = 0; i < Z1.length; i++) { Z1[i] = r(); Z2[i] = r(); }
    for (let i = 0; i < 16; i++) { ZC1[i] = r(); ZC2[i] = r(); }
    for (let i = 0; i < 64; i++) { ZE1[i] = r(); ZE2[i] = r(); }
    ZS1 = r(); ZS2 = r();
  })();
  function hashOf(b, side, cr, ep) {
    let h1 = ZC1[cr], h2 = ZC2[cr];
    if (ep >= 0) { h1 ^= ZE1[ep]; h2 ^= ZE2[ep]; }
    if (side) { h1 ^= ZS1; h2 ^= ZS2; }
    for (let i = 0; i < 64; i++) { const p = b[i]; if (p) { const k = (p + 6) * 64 + i; h1 ^= Z1[k]; h2 ^= Z2[k]; } }
    return (h1 >>> 0) * 2097152 + (h2 >>> 11);
  }

  // ---- 共用暫存（0x88 棋盤），走法產生時用，不配置新記憶體 ----
  const bd = new Int8Array(128), mvBuf = new Int32Array(256);
  let wk = 0, bk = 0; // 王的 0x88 位置
  const s88 = i => ((i >> 3) << 4) | (i & 7), i64 = s => ((s >> 4) << 3) | (s & 7);
  function load(b) {
    for (let i = 0; i < 64; i++) {
      const p = b[i], s = s88(i); bd[s] = p;
      if (p === K) wk = s; else if (p === -K) bk = s;
    }
  }
  // by：+1 白方攻擊、-1 黑方攻擊
  function attacked(s, by) {
    if (by > 0) { let t = s + 15; if (!(t & 0x88) && bd[t] === P) return true; t = s + 17; if (!(t & 0x88) && bd[t] === P) return true; }
    else { let t = s - 15; if (!(t & 0x88) && bd[t] === -P) return true; t = s - 17; if (!(t & 0x88) && bd[t] === -P) return true; }
    const n = N * by, k = K * by, bb = B * by, rr = R * by, qq = Q * by;
    for (let i = 0; i < 8; i++) {
      let t = s + NO[i]; if (!(t & 0x88) && bd[t] === n) return true;
      t = s + KO[i]; if (!(t & 0x88) && bd[t] === k) return true;
    }
    for (let i = 0; i < 4; i++) {
      let o = BO[i], t = s + o;
      while (!(t & 0x88)) { const p = bd[t]; if (p) { if (p === bb || p === qq) return true; break; } t += o; }
      o = RO[i]; t = s + o;
      while (!(t & 0x88)) { const p = bd[t]; if (p) { if (p === rr || p === qq) return true; break; } t += o; }
    }
    return false;
  }
  // 產生「擬合法」走法到 mvBuf（0x88 編碼：f | t<<7 | pr<<14 | 旗標<<17；旗標 1=吃過路兵 2=入堡），回傳數量
  // sd：+1 白、-1 黑
  function gen(sd, cr, ep88) {
    let n = 0;
    const promR = sd > 0 ? 0 : 7, startR = sd > 0 ? 6 : 1, dir = sd > 0 ? -16 : 16, c0 = sd > 0 ? -17 : 15, c1 = sd > 0 ? -15 : 17;
    for (let f = 0; f < 120; f++) {
      if (f & 0x88) { f += 7; continue; }
      const p = bd[f]; if (!p || (p > 0) !== (sd > 0)) continue;
      const a = p < 0 ? -p : p;
      if (a === P) {
        const t = f + dir;
        if (!(t & 0x88) && !bd[t]) {
          if ((t >> 4) === promR) { mvBuf[n++] = f | t << 7 | Q << 14; mvBuf[n++] = f | t << 7 | R << 14; mvBuf[n++] = f | t << 7 | B << 14; mvBuf[n++] = f | t << 7 | N << 14; }
          else { mvBuf[n++] = f | t << 7; if ((f >> 4) === startR && !bd[t + dir]) mvBuf[n++] = f | (t + dir) << 7; }
        }
        for (let j = 0; j < 2; j++) {
          const t2 = f + (j ? c1 : c0); if (t2 & 0x88) continue;
          const q = bd[t2];
          if (q && (q > 0) !== (sd > 0)) {
            if ((t2 >> 4) === promR) { mvBuf[n++] = f | t2 << 7 | Q << 14; mvBuf[n++] = f | t2 << 7 | R << 14; mvBuf[n++] = f | t2 << 7 | B << 14; mvBuf[n++] = f | t2 << 7 | N << 14; }
            else mvBuf[n++] = f | t2 << 7;
          } else if (t2 === ep88 && !q) mvBuf[n++] = f | t2 << 7 | 1 << 17;
        }
      } else if (a === N || a === K) {
        const O = a === N ? NO : KO;
        for (let i = 0; i < 8; i++) {
          const t = f + O[i]; if (t & 0x88) continue;
          const q = bd[t]; if (!q || (q > 0) !== (sd > 0)) mvBuf[n++] = f | t << 7;
        }
        if (a === K) {
          if (sd > 0 && f === 116) {
            if ((cr & 1) && !bd[117] && !bd[118] && bd[119] === R && !attacked(116, -1) && !attacked(117, -1) && !attacked(118, -1)) mvBuf[n++] = 116 | 118 << 7 | 2 << 17;
            if ((cr & 2) && !bd[115] && !bd[114] && !bd[113] && bd[112] === R && !attacked(116, -1) && !attacked(115, -1) && !attacked(114, -1)) mvBuf[n++] = 116 | 114 << 7 | 2 << 17;
          }
          if (sd < 0 && f === 4) {
            if ((cr & 4) && !bd[5] && !bd[6] && bd[7] === -R && !attacked(4, 1) && !attacked(5, 1) && !attacked(6, 1)) mvBuf[n++] = 4 | 6 << 7 | 2 << 17;
            if ((cr & 8) && !bd[3] && !bd[2] && !bd[1] && bd[0] === -R && !attacked(4, 1) && !attacked(3, 1) && !attacked(2, 1)) mvBuf[n++] = 4 | 2 << 7 | 2 << 17;
          }
        }
      } else {
        const O = a === B ? BO : a === R ? RO : KO, lim = a === Q ? 8 : 4;
        for (let i = 0; i < lim; i++) {
          const o = O[i]; let t = f + o;
          while (!(t & 0x88)) { const q = bd[t]; if (!q) mvBuf[n++] = f | t << 7; else { if ((q > 0) !== (sd > 0)) mvBuf[n++] = f | t << 7; break; } t += o; }
        }
      }
    }
    return n;
  }
  // 試走一步（只在 bd 上），看自己的王會不會被攻擊；做完還原
  function safe(m, sd) {
    const fl = m >> 17; if (fl & 2) return true; // 入堡在產生時已檢查三格
    const f = m & 127, t = (m >> 7) & 127, p = bd[f], q = bd[t];
    let cs = -1, cq = 0;
    if (fl & 1) { cs = t - (sd > 0 ? -16 : 16); cq = bd[cs]; bd[cs] = 0; }
    bd[t] = p; bd[f] = 0;
    const ks = (p === K || p === -K) ? t : (sd > 0 ? wk : bk);
    const bad = attacked(ks, -sd);
    bd[f] = p; bd[t] = q; if (cs >= 0) bd[cs] = cq;
    return !bad;
  }
  const to64 = m => i64(m & 127) | i64((m >> 7) & 127) << 6 | ((m >> 14) & 7) << 12;

  function legal(s) {
    load(s.b);
    const sd = s.side ? -1 : 1, n = gen(sd, s.cr, s.ep >= 0 ? s88(s.ep) : -1), out = [];
    for (let i = 0; i < n; i++) { const m = mvBuf[i]; if (safe(m, sd)) out.push(to64(m)); }
    return out;
  }
  function hasLegal(s) {
    load(s.b);
    const sd = s.side ? -1 : 1, n = gen(sd, s.cr, s.ep >= 0 ? s88(s.ep) : -1);
    for (let i = 0; i < n; i++) if (safe(mvBuf[i], sd)) return true;
    return false;
  }
  function inCheck(s) { load(s.b); return s.side ? attacked(bk, 1) : attacked(wk, -1); }
  // 子力不足：同 chEngine.insufficient()
  function insufficient(b) {
    let minors = 0;
    for (let i = 0; i < 64; i++) {
      const p = b[i]; if (!p) continue; const a = p < 0 ? -p : p;
      if (a === P || a === R || a === Q) return false;
      if (a === N || a === B) { if (++minors > 1) return false; }
    }
    return true;
  }

  // ---- FEN ----
  const LT = { p: P, n: N, b: B, r: R, q: Q, k: K };
  function keyOf(s) { // = UI 的 chKey：FEN 前四欄
    let out = '';
    for (let r = 0; r < 8; r++) {
      let e = 0;
      for (let c = 0; c < 8; c++) {
        const p = s.b[r * 8 + c]; if (!p) { e++; continue; }
        if (e) { out += e; e = 0; }
        const ch = 'pnbrqk'[(p < 0 ? -p : p) - 1]; out += p > 0 ? ch.toUpperCase() : ch;
      }
      if (e) out += e; if (r < 7) out += '/';
    }
    const cs = (s.cr & 1 ? 'K' : '') + (s.cr & 2 ? 'Q' : '') + (s.cr & 4 ? 'k' : '') + (s.cr & 8 ? 'q' : '');
    const eps = s.ep >= 0 ? String.fromCharCode(97 + (s.ep & 7)) + (8 - (s.ep >> 3)) : '-';
    return out + ' ' + (s.side ? 'b' : 'w') + ' ' + (cs || '-') + ' ' + eps;
  }
  const toFen = s => keyOf(s) + ' ' + s.half + ' ' + s.full;
  function parseFen(fen) {
    const [pos, stm, cas, eps, hm, fm] = fen.trim().split(/\s+/);
    const b = new Array(64).fill(0); let r = 0, c = 0;
    for (const ch of pos) {
      if (ch === '/') { r++; c = 0; } else if (/\d/.test(ch)) c += +ch;
      else { const t = LT[ch.toLowerCase()]; b[r * 8 + c] = ch === ch.toLowerCase() ? -t : t; c++; }
    }
    let cr = 0;
    if (cas && cas !== '-') { if (cas.includes('K')) cr |= 1; if (cas.includes('Q')) cr |= 2; if (cas.includes('k')) cr |= 4; if (cas.includes('q')) cr |= 8; }
    const ep = eps && eps !== '-' ? (8 - (+eps[1])) * 8 + (eps.charCodeAt(0) - 97) : -1;
    return { b, side: stm === 'b' ? 1 : 0, cr, ep, half: +hm || 0, full: +fm || 1 };
  }

  const G = { id: 'ch', name: '西洋棋', H: 8, W: 8 };
  G.CH_START = CH_START;
  G.toFen = toFen;
  G.keyOf = keyOf;
  G.inCheck = inCheck;

  // req = {v:'ch', fen, rep:[前面局面的 fen…], keepFen?:1}
  G.fromReq = function (req) {
    const s = parseFen(req.fen || CH_START);
    s.h = [];
    const rep = req.rep || [], from = Math.max(0, rep.length - s.half); // 不可逆走法之前的局面不可能再出現
    const keep = !!req.keepFen;
    if (keep) s.tx = [];
    for (let i = from; i < rep.length; i++) {
      const q = parseFen(rep[i]); s.h.push(hashOf(q.b, q.side, q.cr, q.ep));
      if (keep) s.tx.push(keyOf(q));
    }
    s.h.push(hashOf(s.b, s.side, s.cr, s.ep));
    if (keep) s.tx.push(keyOf(s));
    return s;
  };
  G.toRes = (s, m) => ({ f: m & 63, t: (m >> 6) & 63, p: (m >> 12) ? ' pnbrq'[m >> 12] : '' });
  G.legal = legal;
  G.play = function (s, m) {
    const f = m & 63, t = (m >> 6) & 63, pr = m >> 12;
    const b = s.b.slice(), p = b[f], a = p < 0 ? -p : p; let q = b[t];
    if (a === P && (f & 7) !== (t & 7) && !q) { const cs = (f & 56) | (t & 7); q = b[cs]; b[cs] = 0; } // 吃過路兵
    if (a === K && (t - f === 2 || f - t === 2)) { if (t > f) { b[f + 1] = b[f + 3]; b[f + 3] = 0; } else { b[f - 1] = b[f - 4]; b[f - 4] = 0; } } // 入堡
    b[t] = pr ? (p > 0 ? pr : -pr) : p; b[f] = 0;
    const cr = s.cr & CM[f] & CM[t];
    const ep = (a === P && (t - f === 16 || f - t === 16)) ? (f + t) >> 1 : -1;
    const half = (a === P || q) ? 0 : s.half + 1;
    const side = s.side ^ 1, full = s.full + (s.side ? 1 : 0);
    const hh = hashOf(b, side, cr, ep);
    let h;
    if (half === 0) h = [hh]; else { const o = s.h, n = o.length; h = new Array(n + 1); for (let i = 0; i < n; i++) h[i] = o[i]; h[n] = hh; }
    const ns = { b, side, cr, ep, half, full, h };
    if (s.tx) { const k = keyOf(ns); ns.tx = half === 0 ? [k] : s.tx.concat(k); }
    return { s: ns };
  };
  const repCount = s => { const h = s.h, x = h[h.length - 1]; let c = 0; for (let i = h.length - 1; i >= 0; i -= 2) if (h[i] === x) c++; return c; };
  G.terminal = function (s) {
    if (!hasLegal(s)) {
      const chk = s.side ? attacked(bk, 1) : attacked(wk, -1); // hasLegal 已 load 過
      return chk ? { win: s.side ^ 1 } : { win: -1 };
    }
    if (s.half >= 100) return { win: -1 };
    if (repCount(s) >= 3) return { win: -1 };
    if (insufficient(s.b)) return { win: -1 };
    return null;
  };
  G.team = s => s.side;
  G.encode = function (s, buf) {
    const HW = 64, fl = s.side ? 56 : 0, mine = s.side ? -1 : 1;
    const b = s.b;
    for (let i = 0; i < 64; i++) {
      const p = b[i]; if (!p) continue;
      const own = (p > 0) === (mine > 0), a = p < 0 ? -p : p;
      buf[((own ? 0 : 12) + a - 1) * HW + (i ^ fl)] = 1;
    }
    for (let i = 0; i < 64; i++) {
      buf[24 * HW + i] = 1; buf[32 * HW + i] = 1;
      if (i < 8) buf[26 * HW + i] = 1;
      if (i >= 32) buf[27 * HW + i] = 1;
    }
    if (s.cr & 1) buf[36 * HW + (63 ^ fl)] = 1;
    if (s.cr & 2) buf[36 * HW + (56 ^ fl)] = 1;
    if (s.cr & 4) buf[36 * HW + (7 ^ fl)] = 1;
    if (s.cr & 8) buf[36 * HW + (0 ^ fl)] = 1;
    if (s.ep >= 0) buf[37 * HW + (s.ep ^ fl)] = 1;
    const hv = Math.min(1, s.half / 100), rv = Math.min(1, (repCount(s) - 1) / 2);
    if (hv || rv) for (let i = 0; i < 64; i++) { buf[38 * HW + i] = hv; buf[39 * HW + i] = rv; }
  };
  G.keys = function (s, m) {
    const fl = s.side ? 56 : 0, pr = m >> 12, k = { f: (m & 63) ^ fl, t: ((m >> 6) & 63) ^ fl };
    if (pr) k.k = pr - 2; // 0馬 1象 2車 3后
    return k;
  };
  // 西洋棋模式只用標準開局；keepFen 讓狀態保留 chKey 文字，teacher() 才能組出 rep
  G.starts = () => [{ v: 'ch', fen: CH_START, rep: [], keepFen: 1 }];
  G.teacher = s => ({ v: 'ch', req: { v: 'ch', fen: toFen(s), rep: s.tx ? s.tx.slice(0, -1).map(k => k + ' 0 1') : [] } });
  G.fromTeacher = function (s, res) {
    if (!res) return null;
    const pr = res.p ? ' pnbrq'.indexOf(res.p) : 0;
    return res.f | res.t << 6 | (pr > 0 ? pr : 0) << 12;
  };

  (root.AI_GAMES = root.AI_GAMES || {})[G.id] = G;
  if (typeof module !== 'undefined') module.exports = G;
})(typeof self !== 'undefined' ? self : globalThis);
