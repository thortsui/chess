// 在 Node 裡載入 index.html 內嵌的舊引擎（和網頁 Worker 的 ENG_SRC 一樣串起來），當老師或拿來對照規則。
// 用法：const E=require('./engines.js'); E.call({v:'ch',fen,...})
const fs = require('fs'), path = require('path'), vm = require('vm');
const HTML = path.join(__dirname, '..', '..', 'index.html');
const IDS = ['engine', 'dkengine', 'chengine', 'gmengine', 'goengine', 'qfengine', 'jwengine'];
let ctx = null, bgCtx = null;
function load() {
  if (ctx) return ctx;
  const html = fs.readFileSync(HTML, 'utf8');
  const src = IDS.map(id => {
    const a = html.indexOf('<script type="text/plain" id="' + id + '">'), b = a < 0 ? -1 : html.indexOf('</script>', a);
    const m = a < 0 || b < 0 ? null : [null, html.slice(html.indexOf('>', a) + 1, b)];
    if (!m) throw new Error('找不到引擎 ' + id);
    return m[1];
  }).join('\n');
  ctx = vm.createContext({ Date, Math, console, Int8Array, Int16Array, Int32Array, Uint8Array, Uint16Array, Uint32Array, Float32Array, Float64Array, Map, Set, Array, Object, JSON });
  vm.runInContext(src + '\nthis.__call=d=>d.v==="jw"?jwEngine.think(d):d.v==="qf"?qfEngine.think(d):d.v==="dk"?dkApi(d):d.v==="ch"?chEngine.think(d):d.v==="gm"?gmEngine.think(d):d.v==="go"?goEngine.think(d):api(d);', ctx);
  return ctx;
}
// 八國聯軍的舊引擎 bgAI 在主執行緒（不在 text/plain 引擎裡）：直接從 index.html 切出「規則引擎＋電腦玩家」那一段來跑，
// 這樣永遠和網頁同一份規則（tools/bg_engine.js 是同一段的複本）。
function loadBg() {
  if (bgCtx) return bgCtx;
  const html = fs.readFileSync(HTML, 'utf8');
  const a = html.indexOf('/* ===== 八國聯軍：規則引擎'), b = html.indexOf('/* ===== 八國聯軍：控制流程');
  if (a < 0 || b < 0) throw new Error('找不到八國聯軍規則引擎');
  bgCtx = vm.createContext({ Math, console, Uint8Array, Array, Object, JSON });
  // 請求：{v:'bg', st（UI 的 st 物件）, kinds（這局各國棋種，即 BG_KIND）, only（這一手能動的國家編號陣列或 null）}；回傳 [f,t] 或 null
  vm.runInContext(html.slice(a, b) + '\nthis.__bg=d=>{if(bgKindsOk(d.kinds))BG_KIND=d.kinds.slice();const o=d.only;return bgAI(d.st,o?{only:p=>p.s==="Q"||o.includes(p.n)}:null);};', bgCtx);
  return bgCtx;
}
// d 的格式和 index.html 送給 runEngine 的一樣（象棋不帶 v）；八國聯軍用 v:'bg'
exports.call = d => d.v === 'bg' ? loadBg().__bg(d) : load().__call(d);
exports.context = load;
exports.bgContext = loadBg;
