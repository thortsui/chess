// 象棋棋盤（9×10）共用規則核心：給 xq.js（象棋）、qf.js（清法戰爭）、jw.js（甲午戰爭）三個轉接器用。
// 載入方式：Node 由各轉接器 require('./_xq_common.js')；Worker 要先 importScripts('_xq_common.js') 再載入轉接器。
// 規則完全照 index.html 的 UI：pseudo()／inCheck()／legal()（約 2047–2115 行）、perpForbidden()（長將，2117 行）、
// applyMove()（升變、收子，2131 行）、jwDropOk()（打入，2142 行）、jwAfter()（無合法走法＝輪到的一方輸，2152 行）。
//
// 棋子代碼（紅方／清軍為正、黑方／法軍／日軍為負；同 jwEngine／qfEngine 的字母）：
//  1 K 帥將  2 A 仕  3 B 相  4 N 馬  5 R 車  6 C 炮  7 P 兵
//  8 T 城堡／飛車  9 H 騎士  10 F 主教／角行  11 D 皇后  12 Y 國王／王將  13 I 士兵（西洋棋兵）
//  14 G 金  15 S 銀  16 M 桂  17 L 香  18 U 歩  19 Z 龍王  20 X 龍馬  21 Q 成銀  22 J 成桂  23 E 成香  24 O と金
// 走法編碼：一般走子 f*90+t（格子＝列*9+行）；打入 8100+k*90+t，k 是手上棋種（U,L,M,S,G,T 的順序，同 jwEngine）。
(function (root) {
  const LET = { K: 1, A: 2, B: 3, N: 4, R: 5, C: 6, P: 7, T: 8, H: 9, F: 10, D: 11, Y: 12, I: 13, G: 14, S: 15, M: 16, L: 17, U: 18, Z: 19, X: 20, Q: 21, J: 22, E: 23, O: 24 };
  const CH = []; for (const k in LET) CH[LET[k]] = k;
  const DROP = 8100;
  const HL = ['U', 'L', 'M', 'S', 'G', 'T'], HT = [18, 17, 16, 15, 14, 8], HMAX = [9, 2, 2, 2, 2, 4];
  const JPROMO = []; JPROMO[8] = 19; JPROMO[10] = 20; JPROMO[15] = 21; JPROMO[16] = 22; JPROMO[17] = 23; JPROMO[18] = 24;
  const JCAP = []; JCAP[5] = 5; JCAP[4] = 2; JCAP[3] = 3; JCAP[2] = 4; JCAP[6] = 1; JCAP[7] = 0;   // 清軍棋子被吃 → 日軍手上棋種索引（車→飛、馬→桂、相→銀、仕→金、炮→香、兵→歩）
  const QCAP = 120;   // 轉接器自訂：連續 120 手（雙方各 60 手）沒有吃子就判和（UI 本身沒有和棋規則，只給訓練／搜尋收尾用）
  const FLIP = new Int8Array(90); for (let i = 0; i < 90; i++) FLIP[i] = (9 - ((i / 9) | 0)) * 9 + i % 9;

  // ---------- Zobrist（重複局面用；長將規則的「同一局面」＝UI 的 enc(board)+turn，不含手上棋子） ----------
  const Z1 = new Int32Array(49 * 90), Z2 = new Int32Array(49 * 90);
  let ZS1 = 0, ZS2 = 0;
  (function () { let x = 0x9E3779B9 | 0; const rnd = () => { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; return x | 0; };
    for (let i = 0; i < Z1.length; i++) { Z1[i] = rnd(); Z2[i] = rnd(); } ZS1 = rnd(); ZS2 = rnd(); })();
  const zi = (p, sq) => (p + 24) * 90 + sq;
  const keyOf = (h1, h2, team) => { if (team) { h1 ^= ZS1; h2 ^= ZS2; } return (h1 >>> 0) * 2097152 + ((h2 >>> 0) & 0x1FFFFF); };

  function parse(str) { const b = new Array(90); for (let i = 0; i < 90; i++) { const ch = str[i]; if (!ch || ch === '.') { b[i] = 0; continue; } const t = LET[ch.toUpperCase()] || 0; b[i] = ch === ch.toUpperCase() ? t : -t; } return b; }
  function toStr(b) { let s = ''; for (let i = 0; i < 90; i++) { const p = b[i]; s += !p ? '.' : p > 0 ? CH[p] : CH[-p].toLowerCase(); } return s; }
  function hashOf(b) { let h1 = 0, h2 = 0; for (let i = 0; i < 90; i++) if (b[i]) { h1 ^= Z1[zi(b[i], i)]; h2 ^= Z2[zi(b[i], i)]; } return [h1, h2]; }

  // ---------- 走法產生（照 UI pseudo() 一個一個翻） ----------
  const D4 = [1, 0, -1, 0, 0, 1, 0, -1], DG = [1, 1, 1, -1, -1, 1, -1, -1], D8 = D4.concat(DG);
  const KN = [2, 1, 2, -1, -2, 1, -2, -1, 1, 2, 1, -2, -1, 2, -1, -2];
  const inPal = (r, c, sg) => c >= 3 && c <= 5 && (sg > 0 ? r >= 7 : r <= 2);
  // 在 B 上產生顏色 sg（+1 紅／-1 黑）的偽合法走法，寫進 out，回傳個數
  function gen(B, sg, out) {
    let n = 0;
    for (let f = 0; f < 90; f++) {
      const p = B[f]; if (p * sg <= 0) continue;
      const a = p > 0 ? p : -p, r = (f / 9) | 0, c = f - r * 9, fw = sg > 0 ? -1 : 1, base = f * 90;
      // add：目標在盤內且不是自己的子
      const add = (rr, cc) => { if (rr < 0 || rr > 9 || cc < 0 || cc > 8) return; const t = rr * 9 + cc; if (B[t] * sg > 0) return; out[n++] = base + t; };
      const slide = (D, from, to) => { for (let d = from; d < to; d += 2) { const dr = D[d], dc = D[d + 1]; let rr = r + dr, cc = c + dc;
        while (rr >= 0 && rr <= 9 && cc >= 0 && cc <= 8) { const t = rr * 9 + cc, q = B[t]; if (!q) out[n++] = base + t; else { if (q * sg < 0) out[n++] = base + t; break; } rr += dr; cc += dc; } } };
      switch (a) {
        case 5: case 8: slide(D4, 0, 8); break;
        case 10: slide(DG, 0, 8); break;
        case 11: slide(D8, 0, 16); break;
        case 6: for (let d = 0; d < 8; d += 2) { const dr = D4[d], dc = D4[d + 1]; let rr = r + dr, cc = c + dc, j = false;
          while (rr >= 0 && rr <= 9 && cc >= 0 && cc <= 8) { const t = rr * 9 + cc, q = B[t];
            if (!j) { if (!q) out[n++] = base + t; else j = true; } else if (q) { if (q * sg < 0) out[n++] = base + t; break; }
            rr += dr; cc += dc; } } break;
        case 4: for (let d = 0; d < 16; d += 2) { const dr = KN[d], dc = KN[d + 1];
          const lr = (dr === 2 || dr === -2) ? r + dr / 2 : r, lc = (dc === 2 || dc === -2) ? c + dc / 2 : c;
          if (lr >= 0 && lr <= 9 && lc >= 0 && lc <= 8 && !B[lr * 9 + lc]) add(r + dr, c + dc); } break;
        case 9: for (let d = 0; d < 16; d += 2) add(r + KN[d], c + KN[d + 1]); break;
        case 3: for (let d = 0; d < 8; d += 2) { const rr = r + 2 * DG[d], cc = c + 2 * DG[d + 1];
          if (rr < 0 || rr > 9 || cc < 0 || cc > 8) continue; if (sg > 0 ? rr < 5 : rr > 4) continue; if (B[(r + DG[d]) * 9 + c + DG[d + 1]]) continue; add(rr, cc); } break;
        case 2: for (let d = 0; d < 8; d += 2) { const rr = r + DG[d], cc = c + DG[d + 1]; if (inPal(rr, cc, sg)) add(rr, cc); } break;
        case 1: for (let d = 0; d < 8; d += 2) { const rr = r + D4[d], cc = c + D4[d + 1]; if (inPal(rr, cc, sg)) add(rr, cc); } break;
        case 7: add(r + fw, c); if (sg > 0 ? r <= 4 : r >= 5) { add(r, c - 1); add(r, c + 1); } break;
        case 14: case 21: case 22: case 23: case 24: add(r + fw, c); add(r + fw, c + 1); add(r + fw, c - 1); add(r, c + 1); add(r, c - 1); add(r - fw, c); break;
        case 15: add(r + fw, c); add(r + fw, c + 1); add(r + fw, c - 1); add(r - fw, c + 1); add(r - fw, c - 1); break;
        case 16: add(r + 2 * fw, c - 1); add(r + 2 * fw, c + 1); break;
        case 17: { let rr = r + fw; while (rr >= 0 && rr <= 9) { const t = rr * 9 + c, q = B[t]; if (!q) out[n++] = base + t; else { if (q * sg < 0) out[n++] = base + t; break; } rr += fw; } break; }
        case 18: add(r + fw, c); break;
        case 19: slide(D4, 0, 8); for (let d = 0; d < 8; d += 2) add(r + DG[d], c + DG[d + 1]); break;
        case 20: slide(DG, 0, 8); for (let d = 0; d < 8; d += 2) add(r + D4[d], c + D4[d + 1]); break;
        case 12: for (let d = 0; d < 16; d += 2) add(r + D8[d], c + D8[d + 1]); break;
        case 13: { const rr = r + fw;
          if (rr >= 0 && rr <= 9 && !B[rr * 9 + c]) { out[n++] = base + rr * 9 + c; const start = sg < 0 ? r === 1 : r === 8;
            if (start && rr + fw >= 0 && rr + fw <= 9 && !B[(rr + fw) * 9 + c]) out[n++] = base + (rr + fw) * 9 + c; }
          for (let dc = -1; dc <= 1; dc += 2) { const cc = c + dc; if (rr >= 0 && rr <= 9 && cc >= 0 && cc <= 8) { const q = B[rr * 9 + cc]; if (q && q * sg < 0) out[n++] = base + rr * 9 + cc; } }
          break; }
      }
    }
    return n;
  }
  function findKing(B, sg) { for (let i = 0; i < 90; i++) { const p = B[i] * sg; if (p === 1 || p === 12) return i; } return -1; }

  // ---------- 被將軍判定（照 UI inCheck()：王不在＝被將；王見王；任何對方棋子的 pseudo 打得到王） ----------
  // 反向從王的位置往外找攻擊者，結果和「對方每顆子產生 pseudo 走法看有沒有打到王」完全相同。
  function attacked(B, k, sg) {
    if (k < 0) return true;
    const o = -sg, fo = o > 0 ? -1 : 1, kr = (k / 9) | 0, kc = k - kr * 9;
    // 直線四方向
    for (let d = 0; d < 8; d += 2) { const dr = D4[d], dc = D4[d + 1]; let r = kr + dr, c = kc + dc, dist = 1, scr = false;
      while (r >= 0 && r <= 9 && c >= 0 && c <= 8) { const p = B[r * 9 + c];
        if (p) {
          if (scr) { if (p === o * 6) return true; break; }
          if (p * o > 0) { const a = p > 0 ? p : -p;
            if (a === 5 || a === 8 || a === 11 || a === 19) return true;
            if (a === 17 && dc === 0 && -dr === fo) return true;          // 香：只往前
            if (dc === 0 && (a === 1 || a === 12)) return true;           // 王見王
            if (dist === 1) { const vr = -dr, vc = -dc;                    // 從攻擊者走到王的向量
              if (a === 12 || a === 20) return true;
              if (a === 1 && inPal(kr, kc, o)) return true;
              if (a === 14 || a >= 21) return true;                         // 金類：前、左右、後都有
              if (a === 15 && vr === fo) return true;                       // 銀：直的只有往前
              if ((a === 7 || a === 18) && vr === fo) return true;
              if (a === 7 && vr === 0 && (o > 0 ? r <= 4 : r >= 5)) return true; }
          }
          scr = true;
        }
        r += dr; c += dc; dist++; } }
    // 斜線四方向
    for (let d = 0; d < 8; d += 2) { const dr = DG[d], dc = DG[d + 1]; let r = kr + dr, c = kc + dc, dist = 1;
      while (r >= 0 && r <= 9 && c >= 0 && c <= 8) { const p = B[r * 9 + c];
        if (p) {
          if (p * o > 0) { const a = p > 0 ? p : -p;
            if (a === 10 || a === 11 || a === 20) return true;
            if (dist === 1) { const vr = -dr;
              if (a === 12 || a === 19 || a === 15) return true;
              if (a === 2 && inPal(kr, kc, o)) return true;
              if ((a === 14 || a >= 21) && vr === fo) return true;         // 金類：只有斜前
              if (a === 13 && vr === fo) return true; }                    // 西洋棋兵斜前吃
            if (dist === 2 && a === 3 && (o > 0 ? kr >= 5 : kr <= 4)) return true;   // 相（象眼就是 dist 1 那格，已確定是空的）
          }
          break;
        }
        r += dr; c += dc; dist++; } }
    // 馬類
    for (let d = 0; d < 16; d += 2) { const dr = KN[d], dc = KN[d + 1], ar = kr - dr, ac = kc - dc;
      if (ar < 0 || ar > 9 || ac < 0 || ac > 8) continue; const p = B[ar * 9 + ac]; if (p * o <= 0) continue; const a = p > 0 ? p : -p;
      if (a === 9) return true;
      if (a === 16 && dr === 2 * fo) return true;
      if (a === 4) { const lr = (dr === 2 || dr === -2) ? ar + dr / 2 : ar, lc = (dc === 2 || dc === -2) ? ac + dc / 2 : ac; if (!B[lr * 9 + lc]) return true; } }
    return false;
  }

  // ---------- 規則核心（依變體設定） ----------
  // V：'xq' | 'qf' | 'jw'。state = { b:number[90], s:0|1(0 紅／清軍，1 黑／法軍／日軍), h1,h2:盤面雜湊, q:沒吃子的手數,
  //   hd:[6]（只有 jw：日軍手上棋子，U,L,M,S,G,T）, r:{k,c,p[,b]} 重複局面鏈（k=局面鍵，c=該局面輪到的一方是否被將，p=前一局面；xq 另存盤面 b 給老師用） }
  function core(V) {
    const JW = V === 'jw', KEEPB = V === 'xq';
    const SB = new Int8Array(90), PM = new Int32Array(1024), CB = new Int32Array(2048);
    let cS = null, cN = 0;

    // 長將禁著（UI perpForbidden）：這步走完會將軍，且走完的局面先前已出現兩次，且從上一次出現到現在我方每一步都在將軍 → 不能走
    function perp(st, k) {
      let node = st.r.p, d = 1, found = false;
      while (node) {
        if (d & 1) { if (node.k === k) { if (found) return true; found = true; } else if (!found && !node.c) return false; }
        node = node.p; d++;
      }
      return false;
    }
    function genLegal(st, out) {
      const B = SB, b = st.b; for (let i = 0; i < 90; i++) B[i] = b[i];
      const sg = st.s ? -1 : 1, ks = findKing(B, sg), ko = findKing(B, -sg);
      const n0 = gen(B, sg, PM); let n = 0;
      const rp = st.r, perpOn = !!(rp && rp.p && rp.p.p && rp.p.p.p);
      for (let i = 0; i < n0; i++) {
        const m = PM[i], f = (m / 90) | 0, t = m - f * 90, p = B[f], q = B[t];
        B[t] = p; B[f] = 0;   // UI 判定時不套用升變（perpForbidden／legal 都是直接搬子）
        const a = p > 0 ? p : -p;
        if (!attacked(B, (a === 1 || a === 12) ? t : ks, sg)) {
          let ok = true;
          if (perpOn && attacked(B, ko, -sg)) {
            let h1 = st.h1 ^ Z1[zi(p, f)] ^ Z1[zi(p, t)], h2 = st.h2 ^ Z2[zi(p, f)] ^ Z2[zi(p, t)];
            if (q) { h1 ^= Z1[zi(q, t)]; h2 ^= Z2[zi(q, t)]; }
            ok = !perp(st, keyOf(h1, h2, 1 - st.s));
          }
          if (ok) out[n++] = m;
        }
        B[f] = p; B[t] = q;
      }
      if (JW && sg < 0) {   // 打入（UI jwDropOk）：空格；歩、香不能打在最後一排；桂不能打在最後兩排；二歩；打完自己的王不能被將
        let pawnCol = 0; for (let i = 0; i < 90; i++) if (B[i] === -18) pawnCol |= 1 << (i % 9);
        const chk = !!rp.c;
        for (let k = 0; k < 6; k++) { if (!st.hd[k]) continue; const tp = HT[k];
          for (let j = 0; j < 90; j++) { if (B[j]) continue; const r = (j / 9) | 0, c = j - r * 9;
            if ((tp === 18 || tp === 17) && r === 9) continue; if (tp === 16 && r >= 8) continue; if (tp === 18 && (pawnCol >> c & 1)) continue;
            if (chk) { B[j] = -tp; const bad = attacked(B, ks, sg); B[j] = 0; if (bad) continue; }
            out[n++] = DROP + k * 90 + j; } }
      }
      return n;
    }
    function count(st) { if (cS !== st) { cN = genLegal(st, CB); cS = st; } return cN; }
    function legal(st) { const n = count(st), a = new Array(n); for (let i = 0; i < n; i++) a[i] = CB[i]; return a; }
    function play(st, m) {
      const b = st.b.slice(); let h1 = st.h1, h2 = st.h2, hd = st.hd, trunc = false, cap = 0;
      if (m >= DROP) { const k = ((m - DROP) / 90) | 0, t = (m - DROP) % 90, p = -HT[k]; hd = hd.slice(); hd[k]--; b[t] = p; h1 ^= Z1[zi(p, t)]; h2 ^= Z2[zi(p, t)]; }
      else {
        const f = (m / 90) | 0, t = m - f * 90, p = b[f]; cap = b[t]; let np = p;
        if (p === -13 && t >= 81) np = -11; else if (p === 13 && t < 9) np = 11;   // 法軍士兵到底升皇后（UI applyMove）
        if (JW && p < 0) { const a = -p; if (JPROMO[a] && (t >= 63 || f >= 63)) np = -JPROMO[a];   // 日軍走進或走出最後三排就升變（強制）
          if (cap > 0 && JCAP[cap] !== undefined) { hd = hd.slice(); hd[JCAP[cap]]++; } }
        b[t] = np; b[f] = 0;
        h1 ^= Z1[zi(p, f)] ^ Z1[zi(np, t)]; h2 ^= Z2[zi(p, f)] ^ Z2[zi(np, t)];
        if (cap) { h1 ^= Z1[zi(cap, t)]; h2 ^= Z2[zi(cap, t)]; }
        // 吃子之後先前的局面不可能再出現，重複鏈可以截斷（jw：只有日軍吃清軍時清軍子數永久減少才截斷）
        trunc = cap !== 0 && (!JW || p < 0);
      }
      const s = 1 - st.s; for (let i = 0; i < 90; i++) SB[i] = b[i];
      const sg = s ? -1 : 1, c = attacked(SB, findKing(SB, sg), sg) ? 1 : 0;
      const node = { k: keyOf(h1, h2, s), c, p: trunc ? null : st.r }; if (KEEPB) node.b = b;
      const ns = { b, s, h1, h2, q: cap ? 0 : st.q + 1, r: node }; if (JW) ns.hd = hd;
      return { s: ns };
    }
    function terminal(st) {
      if (!count(st)) return { win: 1 - st.s };   // 將死或困斃都算輪到的一方輸（UI jwAfter）；所有走法都是長將禁著時也當輸（UI 會卡住）
      if (st.q >= QCAP) return { win: -1 };
      return null;
    }
    // 從盤面字串建立 state；rep 是 UI 的 [{b,s,chk}]（較舊在前，可省略）
    function make(bs, s, hand, rep) {
      const b = parse(bs), [h1, h2] = hashOf(b), team = s === 'b' ? 1 : 0;
      for (let i = 0; i < 90; i++) SB[i] = b[i];
      const sg = team ? -1 : 1, c = attacked(SB, findKing(SB, sg), sg) ? 1 : 0;
      const cnt = bb => { let n = 0; for (let i = 0; i < 90; i++) if (JW ? bb[i] > 0 : bb[i]) n++; return n; }, n0 = cnt(b);
      let prev = null, q = 0;
      if (rep && rep.length) {
        let i0 = rep.length; const parsed = [];
        while (i0 > 0) { const rb = parse(rep[i0 - 1].b); if (cnt(rb) !== n0) break; parsed.unshift(rb); i0--; }
        q = parsed.length;
        for (let i = 0; i < parsed.length; i++) { const e = rep[i0 + i], [a1, a2] = hashOf(parsed[i]);
          const nd = { k: keyOf(a1, a2, e.s === 'b' ? 1 : 0), c: e.chk ? 1 : 0, p: prev }; if (KEEPB) nd.b = parsed[i]; prev = nd; }
      }
      const node = { k: keyOf(h1, h2, team), c, p: prev }; if (KEEPB) node.b = b;
      const st = { b, s: team, h1, h2, q, r: node };
      if (JW) st.hd = HL.map(k => (hand && hand[k]) | 0);
      return st;
    }
    // 給舊引擎的 rep（最多 40 筆，較舊在前）
    function repOf(st) { const out = []; let node = st.r.p, s = 1 - st.s; while (node && out.length < 40) { if (node.b) out.unshift({ b: toStr(node.b), s: s ? 'b' : 'r', chk: !!node.c }); node = node.p; s = 1 - s; } return out; }
    function repCount(st) { let node = st.r.p, d = 1, n = 0; const k = st.r.k; while (node) { if (!(d & 1) && node.k === k) n++; node = node.p; d++; } return n; }
    return { genLegal, legal, play, terminal, make, repOf, repCount, count };
  }

  // ---------- 編碼共用 ----------
  // slot：棋子代碼 → 0～11 槽；gi：遊戲代號 one-hot 的序號；z26/z27：區域旗標（Uint8Array 90）。
  // real=true 表示區域用真實座標（會跟著視角翻），false 表示已經是視角座標（自己在下方）
  function encodeBase(st, buf, slot, gi, z26, z27, real) {
    const HW = 90, b = st.b, fl = st.s === 1, red = st.s === 0;
    for (let i = 0; i < 90; i++) { const p = b[i]; const e = fl ? FLIP[i] : i;
      if (p) { const own = (p > 0) === red, a = p > 0 ? p : -p; buf[((own ? 0 : 12) + slot[a]) * HW + e] = 1; }
      buf[24 * HW + e] = 1; buf[(28 + gi) * HW + e] = 1;
      const zi2 = real ? i : e; if (z26[zi2]) buf[26 * HW + e] = 1; if (z27[zi2]) buf[27 * HW + e] = 1; }
  }
  const fill = (buf, ch, v) => { if (v) buf.fill(v > 1 ? 1 : v, ch * 90, ch * 90 + 90); };
  function zone(fn) { const z = new Uint8Array(90); for (let i = 0; i < 90; i++) z[i] = fn((i / 9) | 0, i % 9) ? 1 : 0; return z; }
  const keyMove = (st, m) => { const fl = st.s === 1;
    if (m >= DROP) { const k = ((m - DROP) / 90) | 0, t = (m - DROP) % 90; return { p: fl ? FLIP[t] : t, k }; }
    const f = (m / 90) | 0, t = m % 90; return fl ? { f: FLIP[f], t: FLIP[t] } : { f, t }; };
  const toRes = m => m >= DROP ? { drop: HL[((m - DROP) / 90) | 0], t: (m - DROP) % 90 } : { f: (m / 90) | 0, t: m % 90 };
  const fromRes = r => { if (!r) return null; if (r.drop) { const k = HL.indexOf(r.drop); return k < 0 ? null : DROP + k * 90 + r.t; } return r.f * 90 + r.t; };

  const XQC = { LET, CH, DROP, HL, HT, HMAX, QCAP, FLIP, parse, toStr, gen, attacked, findKing, core, encodeBase, fill, zone, keyMove, toRes, fromRes };
  root.XQC = XQC;
  if (typeof module !== 'undefined') module.exports = XQC;
})(typeof self !== 'undefined' ? self : globalThis);
