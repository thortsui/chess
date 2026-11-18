// 象棋規則轉接器。需要 _xq_common.js：Node 會自動 require；Worker 請先 importScripts('_xq_common.js') 再載入本檔。
//
// 12 個棋子槽（0～11 自己、12～23 對手）：
//   0 帥／將  1 仕／士  2 相／象  3 馬  4 車  5 炮  6 兵／卒  （7～11 象棋不用）
// 視角：輪到黑方時把列上下翻（r → 9−r），左右不翻；keys() 用同一套翻過的座標。
// 通道：26 自己的九宮；27 自己這半邊（河界以下 5 列）；
//   36 和棋計數（沒吃子的手數 / 120，轉接器自訂的收尾規則）；37 輪到的一方正被將軍（整面 1）；
//   38 目前局面先前出現過的次數 / 2（長將規則要看）；39 不用。
// 規則（index.html）：pseudo()／inCheck()（含王見王）／legal() 約 2047–2115 行；長將 perpForbidden() 2117 行
//   （「一路將軍又讓同一局面第三次出現的那一步不能走」）；jwAfter() 2152 行：輪到的一方沒有合法走法就輸（將死、困斃都輸）。
//   UI 沒有任何步數判和；本轉接器另加「連續 120 手沒吃子判和」只給訓練／搜尋收尾。
// 請求 {b,s,rep,time,depth}，回傳 {f,t}（格子＝列*9+行）。state.r 是重複局面鏈（存 rep 給長將與老師用）。
(function (root) {
  const X = root.XQC || (typeof require === 'function' ? require('./_xq_common.js') : null);
  const C = X.core('xq');
  const SLOT = []; SLOT[1] = 0; SLOT[2] = 1; SLOT[3] = 2; SLOT[4] = 3; SLOT[5] = 4; SLOT[6] = 5; SLOT[7] = 6;
  const Z26 = X.zone((r, c) => r >= 7 && c >= 3 && c <= 5), Z27 = X.zone(r => r >= 5);
  const START = 'rnbakabnr' + '.........' + '.c.....c.' + 'p.p.p.p.p' + '.........' + '.........' + 'P.P.P.P.P' + '.C.....C.' + '.........' + 'RNBAKABNR';
  const G = {
    id: 'xq', name: '象棋', H: 10, W: 9,
    fromReq: req => C.make(req.b, req.s, null, req.rep),
    toRes: (st, m) => X.toRes(m),
    legal: C.legal,
    play: (st, m) => C.play(st, m),
    terminal: C.terminal,
    team: st => st.s,
    encode(st, buf) {
      X.encodeBase(st, buf, SLOT, 0, Z26, Z27, false);   // 視角座標：自己的九宮／半邊一律在下方
      X.fill(buf, 36, st.q / X.QCAP); X.fill(buf, 37, st.r.c); X.fill(buf, 38, C.repCount(st) / 2);
    },
    keys: X.keyMove,
    starts: () => [{ b: START, s: 'r', rep: [] }],
    teacher: st => ({ v: 'xq', req: { b: X.toStr(st.b), s: st.s ? 'b' : 'r', rep: C.repOf(st) } }),
    fromTeacher: (st, res) => X.fromRes(res),
  };
  (root.AI_GAMES = root.AI_GAMES || {})[G.id] = G;
  if (typeof module !== 'undefined') module.exports = G;
})(typeof self !== 'undefined' ? self : globalThis);
