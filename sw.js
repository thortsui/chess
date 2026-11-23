// 對坐象棋 offline cache (generated)
const APPV='0.29.1',V='dzxq-ai0291',FILES=["./", "index.html", "manifest.webmanifest", "fonts/07d63d1ef22a.woff2", "fonts/1016841c1cff.woff2", "fonts/186d297aca63.woff2", "fonts/2696b61c76d4.woff2", "fonts/279b8f0d917e.woff2", "fonts/64ef4d75a176.woff2", "fonts/7ceaabd3571a.woff2", "fonts/905130525fd1.woff2", "fonts/990a52be53f5.woff2", "fonts/b71c2ddf56bc.woff2", "fonts/c358445376bc.woff2", "fonts/e96a2dabfc6f.woff2", "fonts/fonts.css", "icons/icon-180.png", "icons/icon-192.png", "icons/icon-512.png", "icons/icon-maskable-512.png", "lib/GLTFLoader.js", "lib/peerjs.min.js", "lib/three.min.js", "models/elephant.glb", "models/fig-advisor.glb", "models/fig-cannon.glb", "models/fig-chariot.glb", "models/fig-elephant.glb", "models/fig-general.glb", "models/fig-horse.glb", "models/fig-soldier.glb", "models/horse.glb", "ai/worker.js", "ai/ww/mini.js", "ai/brain.js", "ai/model.json", "ai/model.bin", "ai/games/manifest.js", "ai/games/_xq_common.js", "ai/games/xq.js", "ai/games/qf.js", "ai/games/jw.js", "ai/games/ch.js", "ai/games/dk.js", "ai/games/gm.js", "ai/games/go.js", "ai/games/bg.js"];
self.addEventListener('install',e=>{e.waitUntil(caches.open(V).then(c=>c.addAll(FILES)).then(()=>self.skipWaiting()));});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==V&&k.startsWith('dzxq-')).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',e=>{
  const r=e.request;if(r.method!=='GET')return;const u=new URL(r.url);if(u.origin!==location.origin||u.searchParams.has('fresh'))return;
  // 狼人殺 AI 發言模型（ai/ww/tiny/）由設定頁自己下載存進「ww-tiny-model」快取，這裡不經手（避免存兩份）
  if(u.pathname.includes('/ai/ww/tiny/'))return;
  if(r.mode==='navigate'){e.respondWith(fetch(r).then(res=>{const cp=res.clone();caches.open(V).then(c=>c.put('index.html',cp));return res;}).catch(()=>caches.match('index.html')));return;}
  e.respondWith(caches.match(r,{ignoreSearch:true}).then(hit=>hit||fetch(r).then(res=>{if(res.ok){const cp=res.clone();caches.open(V).then(c=>c.put(r,cp));}return res;})));
});
