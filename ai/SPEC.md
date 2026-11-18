# 下棋模型（ai/）介面規格

手機本地跑的下棋 AI：**一個共用的全卷積神經網路**（8 種棋共用同一份權重）＋ **PUCT 蒙地卡羅樹搜尋（MCTS）** ＋ **像真人的機率選步**。
訓練在 DGX：先用遊戲裡原本的引擎當老師產生資料（蒸餾），之後可再自我對弈強化。

```
ai/
  SPEC.md            這份文件
  brain.js           共用：神經網路推論、MCTS、機率選步（Worker 與 Node 都能載入）
  worker.js          網頁用的 Worker 入口
  games/<id>.js      各棋的規則轉接器（adapter）
  model.bin / model.json   訓練好的權重（沒有時遊戲自動用舊引擎）
  test/check.js      轉接器自動檢查：node ai/test/check.js <id>
train/               DGX 上的資料產生與訓練程式
```

## 遊戲代號

| id | 棋 | 舊引擎（老師） | UI 請求從哪裡來 |
|----|----|----|----|
| `xq` | 象棋 | `<script id="engine">` 的 `api(d)` | `maybeAI()`，請求 `{b,s,rep,time,depth}` |
| `qf` | 清法戰爭 | `qfEngine.think(d)` | `maybeAI()`，請求 `{v:'qf',b,s,time,depth}` |
| `jw` | 甲午戰爭 | `jwEngine.think(d)` | `maybeAI()`，請求 `{v:'jw',b,s,hand,time,depth}` |
| `dk` | 暗棋 | `dkApi(d)` | `dkMaybeAI()`，請求 `{v:'dk',b,s,pool,rep,chain,time,depth}` |
| `ch` | 西洋棋 | `chEngine.think(d)` | `chMaybeAI()`，請求 `{v:'ch',fen,rep,time,depth}` |
| `gm` | 五子棋 | `gmEngine.think(d)` | `gmMaybeAI()`，請求 `{v:'gm',b,s,time,depth}` |
| `go` | 圍棋 9×9 | `goEngine.think(d)` | `goMaybeAI()`，請求 `goReq(...)` |
| `bg` | 八國聯軍 | `bgAI(st,opts)`（主執行緒、1 層啟發式） | `bgMaybeAI` 一帶，傳 `st` 物件 |

原則：**轉接器吃的就是 UI 原本送給舊引擎的請求，吐出的就是舊引擎原本回傳的格式**。這樣 index.html 只要在 `runEngine` 前面換掉一層，UI 的檢查與套用流程完全不用改。

## 轉接器介面（`ai/games/<id>.js`）

檔案格式（Worker 的 `importScripts` 與 Node 的 `require` 都要能用；不可用 ES module、不可碰 DOM）：

```js
(function(root){
  const G = { id:'xq', name:'象棋', H:10, W:9, /* ... */ };
  (root.AI_GAMES = root.AI_GAMES || {})[G.id] = G;
  if (typeof module !== 'undefined') module.exports = G;
})(typeof self !== 'undefined' ? self : globalThis);
```

必備欄位與函式：

- `id`, `name`, `H`, `W`：神經網路看到的棋盤高、寬（格點數）。八國聯軍用整張地圖的外框。
- `fromReq(req) -> state`：把 UI 送給舊引擎的請求變成內部狀態。`state` 要能用 `structuredClone`／JSON 複製（純資料，不放函式）。
- `toRes(state, move) -> res`：把選到的走法變成舊引擎回傳的格式（例如象棋 `{f,t}`、暗棋 `{a:'f',i}`／`{a:'m',f,t}`／`{a:'stop'}`）。
- `legal(state) -> move[]`：**完整且正確**的合法走法（含特殊規則：長將禁著、入堡、吃過路兵、升變、打劫、連吃停手、打入…）。必須和 index.html 的 UI 判定一致，否則 UI 會拒絕。`move` 用小整數或小物件都可以，只要 `play`、`keys`、`toRes` 認得。
- `play(state, move, rng) -> {s, ck}`：回傳**新狀態**（不可改動傳入的 state）。有隨機性（暗棋翻棋）時用 `rng()`（回傳 [0,1)）抽結果，並把抽到的結果放在 `ck`（字串或數字，用來區分機會節點的分支）；沒有隨機性時 `ck` 省略。
- `terminal(state) -> null | {win: 0|1|-1}`：對局結束時回傳勝方隊伍（`-1` 和棋）。包含所有判和規則（重複、步數上限、無子可動…）。
- `team(state) -> 0|1`：現在輪到哪一隊。兩隊制：象棋紅 0 黑 1；西洋棋白 0 黑 1；五子棋／圍棋黑 0 白 1；暗棋依先翻者；八國聯軍清軍 0、聯軍 1。**同一隊連走兩次是允許的**（暗棋連吃、八國聯軍各國輪流），MCTS 會照 `team` 決定正負號。
- `encode(state, buf)`：把狀態寫進 `buf`（`Float32Array(NC*H*W)`，呼叫前已清成 0），版面是 `[通道][列][行]`。**一律以輪到的那一隊的視角**：棋盤要翻成「自己在下方」（第二隊時把列反過來，必要時左右也翻），座標轉換要和 `keys` 一致。
- `keys(state, move) -> key`：走法在網路輸出上的位置（都是 encode 後的座標，`idx = 列*W + 行`）：
  - 一般走子：`{f, t}`；若有升變或選子（西洋棋升變、將棋升／不升），加 `k`（0～7 的種類格）。
  - 落子／翻棋／打入：`{p}`；打入哪種子加 `k`。
  - 虛手、停手：`{pass:1}`。
- `starts() -> req[]`：這種棋所有開局佈局的請求（格式同 `fromReq` 的輸入），訓練與檢查從這裡開局。不同佈局（例如八國聯軍各國用不同棋、暗棋隨機蓋法）都要列出或能隨機產生。
- `teacher(state) -> {v, req}`（訓練用，可選）：產生給舊引擎的請求，讓 DGX 用舊引擎當老師。`v` 是要呼叫哪一個舊引擎（同上表）。
- `fromTeacher(state, res) -> move`（訓練用，可選）：把舊引擎回傳值轉回 `move`。

### 輸入通道（NC = 40）

| 通道 | 內容 |
|----|----|
| 0–11 | 自己的棋子，依「走法相近」分到 12 個槽（各轉接器自訂對應，寫在檔案開頭註解） |
| 12–23 | 對手的棋子，同樣的槽 |
| 24 | 這一格是棋盤上的有效格（八國聯軍十字形地圖、暗棋 4×8 等形狀用） |
| 25 | 蓋著的棋子（暗棋） |
| 26 | 區域 A（自己的九宮、升變區…，各轉接器自訂） |
| 27 | 區域 B（河界的己方半邊、對方九宮…，各轉接器自訂） |
| 28–35 | 遊戲代號 one-hot：xq, qf, jw, dk, ch, gm, go, bg 依序，整面填 1 |
| 36–39 | 輔助數值（0～1）：手上的子數、和棋計數、打劫點、上一手位置…各轉接器自訂 |

常數：`NC=40`、遊戲順序 `['xq','qf','jw','dk','ch','gm','go','bg']`，`brain.js` 匯出 `AI.NC`、`AI.GAMES`。

## 神經網路（brain.js 內的推論，訓練端 PyTorch 結構要一模一樣）

- 主幹：3×3 卷積 NC→C、BN、ReLU；之後 B 個殘差塊（3×3 conv–BN–ReLU–3×3 conv–BN＋捷徑–ReLU）。BN 在匯出時併進卷積。邊界補 0。
- 走法頭（1×1 卷積）：`Q`（16 通道，起點特徵）、`K`（16 通道，終點特徵）、`P`（1 通道，落子／翻棋／打入）。
- 全域頭：主幹 → 平均池化（只算有效格）→ 全連接 → `value`（tanh，輪到的一方視角）、`pass`、`kind[8]`。
- 走法分數：走子 `Q[f]·K[t]/4 + (k!=null ? kind[k] : 0)`；落子 `P[p] + kind[k]`；虛手 `pass`。合法走法之間做 softmax 得到先驗機率。
- 權重檔 `model.bin`：float32 小端序，順序與形狀寫在 `model.json`。

## 搜尋與選步（brain.js）

- 等級 L = 1～10。**預判步數上限 D = L²**（樹的深度上限）；思考時間 `T = 1 + 4·(L−1)/9` 秒；一步棋明顯最好時可以提早停。回報實際搜到的最深步數。
- MCTS（PUCT）：先驗用網路走法機率，葉節點用網路 value；機會節點（暗棋翻棋）依 `ck` 分支。
- 機率選步（像真人）：
  1. 根節點每個走法的訪問次數 N 與平均價值 Q。
  2. **主要候選**：Q 不比最好的差超過 δ(L)（L 越高 δ 越小，越完美）。候選之間機率 ∝ N^(1/τ(L))，τ 隨等級降低。
  3. **相鄰機率差距盡量不超過 20 個百分點**：由高往低檢查，超過就把多的往下分。
  4. **失誤空間**：其他走法合計 m(L)（Lv1 50% → Lv10 0%，Lv10 不失誤），依網路先驗分配，看起來像「真人會下的錯棋」；高等級排除會直接輸掉的大漏著。
  5. 能一步直接獲勝時（Lv3 以上）一定下。
- 回傳：`{res, probs:[{key, p}], depth, sims, ms}`，`res` 是舊引擎格式。
