// 把網站根目錄的檔案複製成 App 用的 www/（拿掉網頁安裝提示，改用 iOS 觸覺回饋）
import fs from 'node:fs';import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..'),www=path.resolve(import.meta.dirname,'www');
fs.rmSync(www,{recursive:true,force:true});fs.mkdirSync(www);
for(const d of['lib','fonts','models'])fs.cpSync(path.join(root,d),path.join(www,d),{recursive:true});
// 下棋模型：只複製手機要用的檔案（不含測試）
fs.mkdirSync(path.join(www,'ai'));for(const f of['brain.js','worker.js','model.json','model.bin'])if(fs.existsSync(path.join(root,'ai',f)))fs.copyFileSync(path.join(root,'ai',f),path.join(www,'ai',f));
fs.cpSync(path.join(root,'ai','games'),path.join(www,'ai','games'),{recursive:true});
// 狼人殺 AI 發言：推論程式（mini.js）和迷你模型（ai/ww/tiny/，約 12 MB）都放進 App；設定頁按「下載」時是從 App 自己的檔案讀進快取，不用網路
fs.mkdirSync(path.join(www,'ai','ww'));fs.copyFileSync(path.join(root,'ai','ww','mini.js'),path.join(www,'ai','ww','mini.js'));fs.cpSync(path.join(root,'ai','ww','tiny'),path.join(www,'ai','ww','tiny'),{recursive:true});
let s=fs.readFileSync(path.join(root,'index.html'),'utf8');
const a=s.indexOf('<div id="pwaBar"'),b=s.indexOf('</script>',a);
if(a<0||b<0)throw new Error('PWA block not found');
s=s.slice(0,a)+s.slice(b+'</script>\n'.length);
s=s.replace(/<link rel="manifest"[^>]*>\n|<link rel="(apple-touch-)?icon"[^>]*>\n|<link rel="apple-touch-startup-image"[^>]*>\n|<meta name="apple-mobile-web-app-[^>]*>\n|<meta name="mobile-web-app-capable"[^>]*>\n/g,'');
const app=`<script>
// App 版：iOS 沒有 navigator.vibrate，改用系統觸覺回饋
(function(){const H=()=>window.Capacitor&&Capacitor.Plugins&&Capacitor.Plugins.Haptics;
  navigator.vibrate=p=>{const h=H();if(!h)return false;const big=Array.isArray(p);
    h.impact({style:big?'HEAVY':'MEDIUM'}).catch(()=>{});if(big)setTimeout(()=>h.impact({style:'HEAVY'}).catch(()=>{}),120);return true;};
  document.addEventListener('contextmenu',e=>e.preventDefault());})();
</script>
`;
s=s.replace('</body>',app+'</body>');
if(s.includes('serviceWorker'))throw new Error('service worker left in');
fs.writeFileSync(path.join(www,'index.html'),s);
console.log('www ready',(JSON.stringify(fs.readdirSync(www))));
