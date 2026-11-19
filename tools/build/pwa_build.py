# Turn /home/claude/gh/index.html (built by gh_build.py) into an installable, offline PWA in /home/claude/chess
import re, os, shutil, hashlib, urllib.request, json, subprocess
SRC = '/home/claude/gh/index.html'; OUT = '/home/claude/chess'
s = open(SRC).read()
os.makedirs(OUT + '/lib', exist_ok=True); os.makedirs(OUT + '/fonts', exist_ok=True); os.makedirs(OUT + '/icons', exist_ok=True)
UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'
def get(u):
    return urllib.request.urlopen(urllib.request.Request(u, headers={'User-Agent': UA}), timeout=60).read()

# 1) libraries -> lib/
libs = {
    'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js': 'lib/three.min.js',
    'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/loaders/GLTFLoader.js': 'lib/GLTFLoader.js',
    'https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js': 'lib/peerjs.min.js',
}
for u, p in libs.items():
    if not os.path.exists(OUT + '/' + p): open(OUT + '/' + p, 'wb').write(get(u))
    s = s.replace(u, p)

# 2) Google Fonts (text= subset) -> fonts/*.woff2 + fonts/fonts.css
m = re.search(r'<link rel="stylesheet" href="(https://fonts.googleapis.com/css2\?[^"]*)">', s)
css = get(m.group(1).replace('&amp;', '&')).decode()
for f in os.listdir(OUT + '/fonts'): os.remove(OUT + '/fonts/' + f)
def dl(mm):
    u = mm.group(1); name = hashlib.md5(u.encode()).hexdigest()[:12] + '.woff2'
    open(OUT + '/fonts/' + name, 'wb').write(get(u)); return 'url(' + name + ')'
css = re.sub(r'url\((https://fonts.gstatic.com/[^)]+)\)', dl, css)
open(OUT + '/fonts/fonts.css', 'w').write(css)
s = s.replace(m.group(0), '<link rel="stylesheet" href="fonts/fonts.css">')
s = s.replace('<link rel="preconnect" href="https://fonts.googleapis.com">\n', '')

# 3) online availability follows network state
s = s.replace("R=typeof Peer!=='undefined';\nsetOnlineButtons();\nmenuMsg(R?'':'連線元件載入失敗，請檢查網路；仍可玩單機或 AI 對戰',!R);",
"""function netState(){R=typeof Peer!=='undefined'&&navigator.onLine!==false;setOnlineButtons();
  menuMsg(R?'':'目前離線：單機與 AI 對戰照常可玩，線上對戰需要網路',!R);}
netState();addEventListener('online',netState);addEventListener('offline',netState);""")
assert 'function netState' in s

# 4) manifest, icons, service worker registration, install button
head_add = '''<link rel="manifest" href="manifest.webmanifest">
<link rel="icon" href="icons/icon-192.png">
<link rel="apple-touch-icon" href="icons/icon-180.png">
<meta name="apple-mobile-web-app-title" content="對坐象棋">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
'''
SPL=[(1320,2868,3),(1290,2796,3),(1206,2622,3),(1179,2556,3),(1284,2778,3),(1170,2532,3),(1125,2436,3),(1242,2688,3),(828,1792,2),(750,1334,2),(640,1136,2)]
for w,h,r in SPL:
    head_add+=f'<link rel="apple-touch-startup-image" media="(device-width: {w//r}px) and (device-height: {h//r}px) and (-webkit-device-pixel-ratio: {r}) and (orientation: portrait)" href="icons/splash-{w}x{h}.jpg">\n'
s = s.replace('<title>對坐象棋</title>\n', '<title>對坐象棋</title>\n' + head_add, 1)
pwa_js = r'''
<div id="pwaBar" hidden style="position:fixed;left:50%;bottom:calc(14px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);z-index:9999;background:#2b2f33;color:#fff;border-radius:14px;padding:10px 12px;display:flex;gap:10px;align-items:center;box-shadow:0 6px 24px rgba(0,0,0,.3);font:14px/1.4 system-ui,sans-serif;max-width:calc(100vw - 32px)">
  <span id="pwaTxt">安裝成 App，離線也能玩</span>
  <button id="pwaGo" style="border:0;border-radius:10px;padding:6px 12px;background:#c8372d;color:#fff;font:inherit;font-weight:700">安裝</button>
  <button id="pwaX" aria-label="關閉" style="border:0;background:none;color:#aaa;font:18px/1 system-ui;padding:4px">×</button>
</div>
<script>
(function(){
  if('serviceWorker' in navigator&&location.protocol!=='file:'){
    navigator.serviceWorker.register('sw.js').then(reg=>{
      reg.addEventListener('updatefound',()=>{const w=reg.installing;w&&w.addEventListener('statechange',()=>{
        if(w.state==='installed'&&navigator.serviceWorker.controller)showBar('有新版本，重新開啟即可更新','重新整理',()=>location.reload());});});
    }).catch(()=>{});
  }
  const bar=document.getElementById('pwaBar'),txt=document.getElementById('pwaTxt'),go=document.getElementById('pwaGo');
  let act=null;function showBar(t,b,f){txt.textContent=t;go.textContent=b;act=f;go.hidden=!f;bar.hidden=false;}
  go.onclick=()=>{bar.hidden=true;act&&act();};
  // 選單右上角：手動檢查更新（比對伺服器上 sw.js 記錄的版本號；有新版就清掉離線快取重新載入）
  if('serviceWorker' in navigator&&location.protocol!=='file:'){
    const ver=document.querySelector('.menu .ver'),menu=document.getElementById('menu');
    const st=document.createElement('style');st.textContent='.updbtn{position:absolute;z-index:3;top:calc(5px + env(safe-area-inset-top,0px));right:max(10px,env(safe-area-inset-right,0px));border:1px solid var(--sc-line,rgba(0,0,0,.15));border-radius:999px;padding:4px 11px;font-size:12px;font-weight:700;background:var(--bar);color:var(--bar-fg);cursor:pointer;-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px)}.updbtn:disabled{opacity:.85}.updbtn b{font-weight:500;opacity:.75;margin-right:6px;font-variant-numeric:tabular-nums}.menu .ver{display:none}';
    document.head.appendChild(st);
    const b=document.createElement('button');b.className='updbtn';b.type='button';b.setAttribute('aria-label','檢查有沒有新版本');menu.appendChild(b);
    const cur=()=>((ver&&ver.textContent.match(/\d+\.\d+\.\d+/))||[''])[0];
    const idle=()=>{b.innerHTML='<b>v'+cur()+'</b>⟳ 檢查更新';};idle();
    const done=(t,ms)=>{b.textContent=t;setTimeout(()=>{idle();b.disabled=false;},ms||2500);};
    b.onclick=async()=>{if(b.disabled)return;b.disabled=true;b.textContent='檢查中…';
      try{const r=await fetch('sw.js?fresh='+Date.now(),{cache:'no-store'});if(!r.ok)throw 0;const t=await r.text();const m=t.match(/APPV='([\d.]+)'/),remote=m&&m[1];
        if(remote&&remote!==cur()){b.textContent='下載 v'+remote+'…';
          try{const regs=await navigator.serviceWorker.getRegistrations();await Promise.all(regs.map(x=>x.unregister()));}catch(e){}
          try{const ks=await caches.keys();await Promise.all(ks.filter(k=>k!=='ww-talk-model').map(k=>caches.delete(k)));}catch(e){}
          location.replace(location.pathname+'?v='+remote);return;}
        try{const reg=await navigator.serviceWorker.getRegistration();if(reg)await reg.update();}catch(e){}
        done('✓ 已是最新版 v'+cur());}
      catch(e){done(navigator.onLine===false?'沒有網路，連上網再試':'連不到伺服器，稍後再試',3000);}};
    if(/[?&]v=/.test(location.search))history.replaceState(null,'',location.pathname);
  }
  document.getElementById('pwaX').onclick=()=>{bar.hidden=true;try{localStorage.setItem('xq-pwa-x',Date.now());}catch(e){}};
  const standalone=matchMedia('(display-mode: standalone)').matches||navigator.standalone;
  let dismissed=0;try{dismissed=+localStorage.getItem('xq-pwa-x')||0;}catch(e){}
  const quiet=standalone||Date.now()-dismissed<7*864e5;
  let ev=null;addEventListener('beforeinstallprompt',e=>{e.preventDefault();ev=e;if(!quiet)showBar('安裝成 App，離線也能玩','安裝',()=>{ev.prompt();ev=null;});});
  addEventListener('appinstalled',()=>{bar.hidden=true;});
  const ios=/iP(hone|ad|od)/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
  if(ios&&!quiet)setTimeout(()=>showBar('iPhone/iPad：點 Safari 的「分享」→「加入主畫面」，就能離線玩',null,null),1500);
})();
</script>
'''
s = s.replace('\n</body>\n</html>', pwa_js + '</body>\n</html>', 1)
open(OUT + '/index.html', 'w').write(s)

# 5) models from gh build
os.makedirs(OUT + '/models', exist_ok=True)
for f in os.listdir('/home/claude/gh/models'): shutil.copy('/home/claude/gh/models/' + f, OUT + '/models/' + f)

manifest = {
    "name": "對坐象棋", "short_name": "對坐象棋", "lang": "zh-Hant",
    "description": "象棋、暗棋、西洋棋、五子棋、圍棋：單機、AI、線上對戰",
    "start_url": "./", "scope": "./", "display": "standalone", "orientation": "portrait",
    "background_color": "#d9dde0", "theme_color": "#d9dde0",
    "icons": [{"src": "icons/icon-192.png", "sizes": "192x192", "type": "image/png"},
              {"src": "icons/icon-512.png", "sizes": "512x512", "type": "image/png"},
              {"src": "icons/icon-maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable"}]}
open(OUT + '/manifest.webmanifest', 'w').write(json.dumps(manifest, ensure_ascii=False, indent=1))

# 6) service worker: precache everything, version = hash of contents
files = ['./', 'index.html', 'manifest.webmanifest'] + sorted(
    os.path.relpath(os.path.join(d, f), OUT) for sub in ['lib', 'fonts', 'models', 'icons']
    for d, _, fs in os.walk(OUT + '/' + sub) for f in fs if not f.startswith('splash-'))
h = hashlib.sha1()
for f in files[1:]:
    if os.path.exists(OUT + '/' + f): h.update(open(OUT + '/' + f, 'rb').read())
ver = h.hexdigest()[:10]
import re as _re
appv = _re.search(r'<span class="ver"[^>]*>v([\d.]+)<', s).group(1)
sw = '''// 對坐象棋 offline cache (generated)
const APPV='%s',V='dzxq-%s',FILES=%s;
self.addEventListener('install',e=>{e.waitUntil(caches.open(V).then(c=>c.addAll(FILES)).then(()=>self.skipWaiting()));});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==V).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',e=>{
  const r=e.request;if(r.method!=='GET')return;const u=new URL(r.url);if(u.origin!==location.origin||u.searchParams.has('fresh'))return;
  if(r.mode==='navigate'){e.respondWith(fetch(r).then(res=>{const cp=res.clone();caches.open(V).then(c=>c.put('index.html',cp));return res;}).catch(()=>caches.match('index.html')));return;}
  e.respondWith(caches.match(r,{ignoreSearch:true}).then(hit=>hit||fetch(r).then(res=>{if(res.ok){const cp=res.clone();caches.open(V).then(c=>c.put(r,cp));}return res;})));
});
''' % (appv, ver, json.dumps(files))
open(OUT + '/sw.js', 'w').write(sw)
print('pwa built', ver, len(files), 'files')
