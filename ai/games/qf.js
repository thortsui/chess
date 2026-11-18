// 清法戰爭規則轉接器（清軍＝象棋子，紅方，隊伍 0；法軍＝西洋棋子，黑方，隊伍 1，法軍先走）。
// 需要 _xq_common.js：Node 會自動 require；Worker 請先 importScripts('_xq_common.js') 再載入本檔。
//
// 12 個棋子槽（0～11 自己、12～23 對手）：
//   0 帥／國王 Y  1 仕  2 相  3 馬  4 車／城堡 T  5 炮  6 兵  7 主教 F  8 皇后 D  9 騎士 H  10 士兵 I  （11 不用）
// 視角：輪到法軍時把列上下翻（r → 9−r），左右不翻；keys() 用同一套翻過的座標。
// 通道：26 清軍九宮（真實座標第 7～9 列、第 3～5 行，跟著視角翻）；27 清軍半邊（真實第 5～9 列，含法軍士兵升變的底線）；
//   36 和棋計數（沒吃子的手數 / 120，轉接器自訂）；37 輪到的一方正被將軍；38 目前局面先前出現過的次數 / 2；39 不用。
// 規則（index.html）：
//   - 佈局 init() 約 2026 行：法軍 'THFDYDFHT' 與 9 個士兵；清軍底線角落空、俥 4 隻、炮前一格、兵 5 隻在河邊；法軍先走。
//   - 走法 pseudo() 2047 行：法軍照西洋棋走法、沒有九宮與河界；士兵在第 1 列可走兩步、斜前吃，沒有吃過路兵與入堡。
//   - applyMove() 2131 行：士兵走到第 9 列升皇后（強制）。
//   - inCheck() 2103 行：國王 Y 與帥一樣有「王見王」；王不能被吃（走完自己的王被打到就不合法）。
//   - 長將 perpForbidden() 只看 variant==='xq'，清法戰爭的 variant 也是 'xq'，所以一樣適用；
//     但 UI 給 qf 舊引擎的請求沒有 rep，本轉接器可以接受選用的 req.rep（格式同象棋），沒給就只從請求局面開始記。
//   - jwAfter() 2152 行：輪到的一方沒有合法走法就輸。UI 沒有和棋規則，本轉接器另加 120 手沒吃子判和。
// 請求 {v:'qf',b,s,time,depth}，回傳 {f,t}。
(function (root) {
  const X = root.XQC || (typeof require === 'function' ? require('./_xq_common.js') : null);
  const C = X.core('qf');
  const SLOT = []; SLOT[1] = 0; SLOT[12] = 0; SLOT[2] = 1; SLOT[3] = 2; SLOT[4] = 3; SLOT[5] = 4; SLOT[8] = 4; SLOT[6] = 5; SLOT[7] = 6;
  SLOT[10] = 7; SLOT[11] = 8; SLOT[9] = 9; SLOT[13] = 10;
  const Z26 = X.zone((r, c) => r >= 7 && c >= 3 && c <= 5), Z27 = X.zone(r => r >= 5);
  const START = 'thfdydfht' + 'iiiiiiiii' + '.........' + '.........' + '.........' + 'P.P.P.P.P' + '.C.....C.' + 'R.......R' + 'R.......R' + '.NBAKABN.';
  const G = {
    id: 'qf', name: '清法戰爭', H: 10, W: 9,
    fromReq: req => C.make(req.b, req.s, null, req.rep),
    toRes: (st, m) => X.toRes(m),
    legal: C.legal,
    play: (st, m) => C.play(st, m),
    terminal: C.terminal,
    team: st => st.s,
    encode(st, buf) {
      X.encodeBase(st, buf, SLOT, 1, Z26, Z27, true);
      X.fill(buf, 36, st.q / X.QCAP); X.fill(buf, 37, st.r.c); X.fill(buf, 38, C.repCount(st) / 2);
    },
    keys: X.keyMove,
    starts: () => [{ v: 'qf', b: START, s: 'b' }],
    teacher: st => ({ v: 'qf', req: { b: X.toStr(st.b), s: st.s ? 'b' : 'r' } }),
    fromTeacher: (st, res) => X.fromRes(res),
  };
  (root.AI_GAMES = root.AI_GAMES || {})[G.id] = G;
  if (typeof module !== 'undefined') module.exports = G;
})(typeof self !== 'undefined' ? self : globalThis);
