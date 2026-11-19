// 用目前的檢查規則（tools/ww_engine.js 的 wwTalkCheck）重新檢查老師資料，更新 err 欄位
// node train/ww/recheck.js <輸入.jsonl> <輸出.jsonl>
const fs=require('fs'),path=require('path');const E=require(path.join(__dirname,'../../tools/ww_engine.js'));
const [src,dst]=process.argv.slice(2);
// 早期資料有些沒轉正體：先用 OpenCC（cn→twp）轉發言再檢查
let CONV=null;try{CONV=require('opencc-js').Converter({from:'cn',to:'twp'});}catch(e){}
const out=[];const why={};let ok=0;
for(const l of fs.readFileSync(src,'utf8').split('\n')){if(!l)continue;const d=JSON.parse(l);if(!d.st)continue;
  if(CONV){const i=d.out.lastIndexOf('\n');d.out=CONV(d.out.slice(0,i))+d.out.slice(i);}
  const st={...d.st,cfg:{n:d.st.n},msgs:[]};const p=E.wwTalkParse(d.out);d.err=E.wwTalkCheck(st,d.seat,p&&{...p,lines:p.lines.slice()});
  if(d.err)why[d.err]=(why[d.err]||0)+1;else ok++;out.push(JSON.stringify(d));}
fs.writeFileSync(dst,out.join('\n')+'\n');console.log('通過',ok,'／',out.length,JSON.stringify(why));
