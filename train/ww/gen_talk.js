// 狼人殺 AI 發言：用老師模型（DGX 上的 vLLM）產生訓練資料
// node train/ww/gen_talk.js <輸出.jsonl> <局數> [同時幾局=48] [老師網址=http://localhost:8101]
// 跑全電腦對局（規則引擎 tools/ww_engine.js），每到電腦發言／遺言，就把「這位玩家看得到的資訊」整理成提示（wwTalkPrompt，
// 和遊戲裡給小模型的提示完全一樣），請老師寫發言＋投票對象。通過檢查（wwTalkCheck）的發言才會被採用，投票也照著發言投。
const fs=require('fs'),path=require('path');
const E=require(path.join(__dirname,'../../tools/ww_engine.js'));
const [OUT,NG='100',CON='48',URL='http://localhost:8101']=process.argv.slice(2);
// 老師偶爾會寫出簡體字或中國用語，一律轉成台灣正體（OpenCC：cn→twp）
const CONV=require('opencc-js').Converter({from:'cn',to:'twp'});
const SYS=fs.readFileSync(path.join(__dirname,'teacher_prompt.txt'),'utf8');
let MODEL=null;
async function model(){if(MODEL)return MODEL;const r=await fetch(URL+'/v1/models');MODEL=(await r.json()).data[0].id;return MODEL;}
const SCHEMA={type:'object',properties:{speech:{type:'string'},vote:{type:'integer'}},required:['speech','vote']};
async function teacher(prompt){
  const body={model:await model(),messages:[{role:'system',content:SYS},{role:'user',content:prompt}],temperature:0.95,top_p:0.95,max_tokens:300,
    chat_template_kwargs:{enable_thinking:false}};  // 不用 json_schema 強制格式（vLLM 的格式約束吃 CPU，DGX 的 CPU 被下棋訓練佔滿時會很慢），自己解析
  for(let k=0;k<3;k++){try{const r=await fetch(URL+'/v1/chat/completions',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
      const j=await r.json();const c=j.choices[0].message.content;const m=/\{[\s\S]*\}/.exec(c||'');if(!m)return null;const o=JSON.parse(m[0]);
      if(typeof o.speech!=='string')return null;o.vote=parseInt(o.vote)||0;return o;}catch(e){await new Promise(r=>setTimeout(r,2000));}}
  return null;}
// 老師的 JSON 轉成小模型要學的輸出格式
function toOut(o){let ls=CONV(String(o.speech||'')).replace(/\r/g,'').split(/\n+/).map(s=>s.trim()).filter(Boolean);
  if(ls.length>1)ls=ls.filter(s=>!/^過[。.]?$/.test(s));const sp=ls.join('\n');
  const v=o.vote|0;return sp+'\n投:'+(v>0?v:'棄');}
// 隨機身份組合（有時用預設）
const EXTRA=['wolfKing','whiteWolf','hiddenWolf','guard','idiot','knight','gravekeeper','crow','bear'];
function randCfg(){const n=6+Math.floor(Math.random()*7);let c=E.wwCfgFor(n);
  if(Math.random()<.45){const r={...c.roles};for(const k of EXTRA)if(Math.random()<.22){
      if(k.endsWith('olf')||k==='wolfKing'){if(r.wolf>1){r.wolf--;r[k]=1;}}else r[k]=1;}
    const c2=E.wwCfgFix({n,roles:r,win:c.win,speak:60});if(E.wwVil(c2)>=1&&!E.wwCfgErr(c2))c=c2;}
  if(Math.random()<.3)c.win='all';return c;}
const out=fs.createWriteStream(OUT,{flags:'a'});const TAG=Date.now().toString(36);
const stat={ok:0,bad:0,null:0,why:{},games:0};
async function play(gid){
  const cfg=randCfg();const st=E.wwNew(cfg,Array(cfg.n).fill(true),0);st.gid=TAG+'-'+gid;let t=0,steps=0;
  while(!st.over&&steps<30000){t+=300;steps++;E.wwTick(st,t);
    if(st.talk&&st.talk.res===undefined&&st.talk.p)await st.talk.p;}
  stat.games++;}
// 遊戲裡呼叫的發言函式：問老師、記下樣本
E.wwSetTalk(async(prompt,st,seat,n)=>{
  const o=await teacher(prompt);if(!o){stat.null++;return null;}
  const txt=toOut(o);const p=E.wwTalkParse(txt);const err=E.wwTalkCheck(st,seat,p&&{...p,lines:p.lines.slice()})||(p&&E.wwTalkCopy(st,seat,p.speech));
  if(err){stat.bad++;stat.why[err]=(stat.why[err]||0)+1;}else stat.ok++;
  // st：之後評估學生模型時要重建檢查用的狀態（只存檢查會用到的欄位）
  out.write(JSON.stringify({prompt,out:txt,err,role:st.roles[seat],phase:st.phase,day:st.day,n:st.n,try:n,gid:st.gid,seat,
    st:{roles:st.roles,alive:st.alive,seerRes:st.seerRes,strat:st.strat,phase:st.phase,day:st.day,n:st.n}})+'\n');
  return txt;});
(async()=>{const N=+NG,C=+CON;let next=0;const t0=Date.now();
  const iv=setInterval(()=>console.log(new Date().toISOString().slice(11,19),'局',stat.games,'採用',stat.ok,'不採用',stat.bad,'失敗',stat.null,
    ((stat.ok+stat.bad)/((Date.now()-t0)/60000)).toFixed(0)+'筆/分',JSON.stringify(stat.why)),60000);
  await Promise.all(Array.from({length:C},async()=>{while(next<N){const g=next++;try{await play(g);}catch(e){console.log('錯誤',e&&e.stack);}}}));
  clearInterval(iv);out.end();console.log('完成',JSON.stringify(stat));})();
