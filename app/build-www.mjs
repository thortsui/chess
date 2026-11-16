// 把網站根目錄的檔案複製成 App 用的 www/（拿掉網頁安裝提示，改用 iOS 觸覺回饋）
import fs from 'node:fs';import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..'),www=path.resolve(import.meta.dirname,'www');
fs.rmSync(www,{recursive:true,force:true});fs.mkdirSync(www);
for(const d of['lib','fonts','models'])fs.cpSync(path.join(root,d),path.join(www,d),{recursive:true});
let s=fs.readFileSync(path.join(root,'index.html'),'utf8');
const a=s.indexOf('<div id="pwaBar"'),b=s.indexOf('</script>',a);
if(a<0||b<0)throw new Error('PWA block not found');
s=s.slice(0,a)+s.slice(b+'</script>\n'.length);
s=s.replace(/<link rel="manifest"[^>]*>\n|<link rel="(apple-touch-)?icon"[^>]*>\n|<meta name="apple-mobile-web-app-[^>]*>\n|<meta name="mobile-web-app-capable"[^>]*>\n/g,'');
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
