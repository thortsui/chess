// 把 index.html 裡的狼人殺規則引擎那一段抄成 tools/ww_engine.js（測試與訓練腳本用的獨立副本）：node tools/ww_sync.js
// 改了 index.html 的狼人殺引擎／發言檢查之後跑一次，兩邊就不會不同步
const fs=require('fs'),path=require('path');
const src=path.join(__dirname,'../index.html'),dst=path.join(__dirname,'ww_engine.js');
const html=fs.readFileSync(src,'utf8'),eol=html.includes('\r\n')?'\r\n':'\n';
const fixed=html.replace(/\r?\n/g,eol);if(fixed!==html)fs.writeFileSync(src,fixed);   // 換行統一
const L=fixed.split(eol),a=L.findIndex(l=>l.startsWith('/* ===== 狼人殺：規則引擎')),b=L.findIndex(l=>l.startsWith('/* ===== 狼人殺：控制流程、畫面'));
if(a<0||b<a){console.log('找不到狼人殺引擎的起訖註解');process.exit(1);}
const EXPORT='wwSetTalk,wwTalkTic,wwTalkNewb,wwTalkCopy,wwTalkCover,wwTalkBack,wwAccuse,wwDanger,wwMates,wwTalkPrompt,wwTalkParse,wwTalkCheck,wwTalkStated,wwTalkClaims,WW_STYLE,wwNew,wwAct,wwTick,wwView,wwJudge,wwBelief,wwCanned,WW_AI,WW_PRESET,wwCfgFor,wwCfgErr,wwVil,WW_ROLES,wwCfgFix';
const names=EXPORT.split(',').filter(n=>new RegExp('(function|const|let) '+n+'\\b').test(L.slice(a,b).join('\n')));
fs.writeFileSync(dst,L.slice(a,b).join(eol)+eol+eol+`if(typeof module!=='undefined')module.exports={${names.join(',')}};`+eol);
console.log(`tools/ww_engine.js 已更新（index.html 第 ${a+1}～${b} 行，匯出 ${names.length} 個）`);
