/* 網頁用的 AI Worker：載入共用網路與 8 種棋的規則，收到請求就想一步。
   訊息：{id, cmd:'init'} → {id, ok, version}；{id, game, req, level, best} → {id, r}
   best=true 時（AI 提示）不加失誤、直接給最好的走法。 */
const Q = self.location.search || '';   // 版本參數：更新後一定載入新檔
importScripts('brain.js' + Q, 'games/manifest.js' + Q);
importScripts(...self.AI_GAME_FILES.map(f => 'games/' + f + Q));
let ev = null, ready = null;
function init() {
  if (ready) return ready;
  ready = Promise.all([fetch('model.json' + Q).then(r => { if (!r.ok) throw new Error('沒有模型'); return r.json(); }),
                       fetch('model.bin' + Q).then(r => { if (!r.ok) throw new Error('沒有模型'); return r.arrayBuffer(); })])
    .then(([meta, bin]) => { ev = new AI.Evaluator(new AI.Net(meta, bin)); return meta.version; });
  return ready;
}
onmessage = e => {
  const d = e.data;
  if (d.cmd === 'init') { init().then(v => postMessage({ id: d.id, ok: true, version: v, games: Object.keys(self.AI_GAMES) }), err => postMessage({ id: d.id, ok: false, err: String(err) })); return; }
  init().then(() => {
    const G = self.AI_GAMES[d.game];
    if (!G) return postMessage({ id: d.id, r: null });
    ev.evals = 0;
    let r = null;
    try { r = AI.think(G, ev, d.req, { level: d.level, best: !!d.best, time: d.time }); } catch (err) { r = null; console.warn('[AI]', err); }
    postMessage({ id: d.id, r });
  }, () => postMessage({ id: d.id, r: null }));
};
