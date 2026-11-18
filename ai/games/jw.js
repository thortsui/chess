// 甲午戰爭規則轉接器（清軍＝象棋子，紅方，隊伍 0；日軍＝將棋子，黑方，隊伍 1，日軍先走；日軍可升變、可打入吃到的棋子）。
// 需要 _xq_common.js：Node 會自動 require；Worker 請先 importScripts('_xq_common.js') 再載入本檔。
//
// 12 個棋子槽（0～11 自己、12～23 對手）：
//   0 帥／王將 Y  1 仕  2 相  3 馬  4 車／飛車 T／龍王 Z  5 炮  6 兵／歩 U  7 角行 F／龍馬 X
//   8 金 G 與成銀 Q、成桂 J、成香 E、と金 O（走法都同金）  9 銀 S  10 香 L  11 桂 M
//   （升變過的子另外在通道 38 標 1，所以 Z/X/成金類 和原本的子分得開）
// 視角：輪到日軍時把列上下翻（r → 9−r），左右不翻；keys() 用同一套翻過的座標。打入的 keys 是 {p, k}，k＝手上棋種 0～5（U,L,M,S,G,T）。
// 通道：26 清軍九宮（真實第 7～9 列、第 3～5 行，跟著視角翻）；27 日軍升變區（真實第 7～9 列，跟著視角翻）；
//   36 日軍手上棋子：第 k 行（k＝0～5 依 U,L,M,S,G,T）整行填 數量/上限（上限 9,2,2,2,2,4），不跟視角翻；
//   37 輪到的一方正被將軍；38 已升變的子；39 和棋計數（沒吃子的手數 / 120，轉接器自訂）。
// 規則（index.html）：
//   - 佈局 init() 約 2034 行：日軍 'LMSGYGSML'／'.T.....F.'／9 歩；清軍兵 9 隻、炮前一格、1、9 路前一格各多一隻俥；日軍先走。
//   - 走法 pseudo() 2047 行（將棋子在交叉點上照將棋走法、沒有九宮）；applyMove() 2131 行：日軍走進或走出第 7～9 列
//     就強制升變（JW_PROMO：飛→龍、角→馬、銀→全、桂→圭、香→杏、歩→と）；日軍吃到清軍的子收進手上
//     （JW_CAP：車→飛、馬→桂、相→銀、仕→金、炮→香、兵→歩）。
//   - 打入 jwDropOk() 2142 行：空格；歩、香不能打在第 9 列；桂不能打在第 8、9 列；同一路不能有兩個未升變的歩；
//     打完自己的王不能被將。沒有「打歩詰」限制，打入也不受長將限制。
//   - 長將 perpForbidden()：jw 的 variant 也是 'xq'，所以日軍、清軍的一般走子都受長將限制（局面鍵只看盤面＋輪到誰，不含手上棋子）。
//     UI 給 jw 舊引擎的請求沒有 rep；本轉接器接受選用的 req.rep（格式同象棋），沒給就從請求局面開始記。
//   - jwAfter() 2152 行：輪到的一方沒有走法（日軍還要沒有能打入的子）就輸。UI 沒有和棋規則，本轉接器另加 120 手沒吃子判和。
// 請求 {v:'jw',b,s,hand,time,depth}，回傳 {f,t} 或 {drop,t}。
(function (root) {
  const X = root.XQC || (typeof require === 'function' ? require('./_xq_common.js') : null);
  const C = X.core('jw');
  const SLOT = []; SLOT[1] = 0; SLOT[12] = 0; SLOT[2] = 1; SLOT[3] = 2; SLOT[4] = 3; SLOT[5] = 4; SLOT[8] = 4; SLOT[19] = 4; SLOT[6] = 5;
  SLOT[7] = 6; SLOT[18] = 6; SLOT[10] = 7; SLOT[20] = 7; SLOT[14] = 8; SLOT[21] = 8; SLOT[22] = 8; SLOT[23] = 8; SLOT[24] = 8;
  SLOT[15] = 9; SLOT[17] = 10; SLOT[16] = 11;
  const Z26 = X.zone((r, c) => r >= 7 && c >= 3 && c <= 5), Z27 = X.zone(r => r >= 7);
  const START = 'lmsgygsml' + '.t.....f.' + 'uuuuuuuuu' + '.........' + '.........' + '.........' + 'PPPPPPPPP' + '.C.....C.' + 'R.......R' + 'RNBAKABNR';
  const G = {
    id: 'jw', name: '甲午戰爭', H: 10, W: 9,
    fromReq: req => C.make(req.b, req.s, req.hand, req.rep),
    toRes: (st, m) => X.toRes(m),
    legal: C.legal,
    play: (st, m) => C.play(st, m),
    terminal: C.terminal,
    team: st => st.s,
    encode(st, buf) {
      X.encodeBase(st, buf, SLOT, 2, Z26, Z27, true);
      for (let k = 0; k < 6; k++) { const v = Math.min(1, st.hd[k] / X.HMAX[k]); if (v) for (let r = 0; r < 10; r++) buf[36 * 90 + r * 9 + k] = v; }
      X.fill(buf, 37, st.r.c);
      const b = st.b; for (let i = 0; i < 90; i++) if (b[i] <= -19) buf[38 * 90 + (st.s ? X.FLIP[i] : i)] = 1;
      X.fill(buf, 39, st.q / X.QCAP);
    },
    keys: X.keyMove,
    starts: () => [{ v: 'jw', b: START, s: 'b', hand: {} }],
    teacher: st => { const hand = {}; X.HL.forEach((k, i) => { hand[k] = st.hd[i]; }); return { v: 'jw', req: { b: X.toStr(st.b), s: st.s ? 'b' : 'r', hand } }; },
    fromTeacher: (st, res) => X.fromRes(res),
  };
  (root.AI_GAMES = root.AI_GAMES || {})[G.id] = G;
  if (typeof module !== 'undefined') module.exports = G;
})(typeof self !== 'undefined' ? self : globalThis);
