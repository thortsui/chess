// 狼人殺 AI 發言（迷你模型）：用已經訓練好的 0.8B 模型大量產生訓練資料
// 兩種跑法：
//  (1) 0.8B 模型用 vLLM 開成服務（快）：WW_URL=http://localhost:8102 node train/ww/gen_bulk.js <輸出.jsonl> <目標合格筆數> [同時幾局=384]
//  (2) 沒有 vLLM：由 gen_bulk.py 啟動（python 用 transformers 批次生成，這裡管對局），兩邊用標準輸入／輸出傳 JSON
// 跑全電腦對局（規則引擎 tools/ww_engine.js），每到電腦發言／遺言就把提示（wwTalkPrompt）排進佇列，湊成一批請模型寫；
// 通過檢查（wwTalkCheck、wwTalkCopy）的才在對局裡採用（不通過重試一次，再不行說「過」），所有回答都記下來。
// 和老師資料（gen_talk.js）不同的地方：每局有一部分座位固定只說「過」（模擬真人不講話或模型逾時）、偶爾有騎士決鬥與白狼王自爆。
const fs=require('fs'),path=require('path'),readline=require('readline');
const E=require(path.join(__dirname,'../../tools/ww_engine.js'));
const [OUT,TARGET='1000',CON='384',BMAX='256']=process.argv.slice(2);
let CONV=s=>s;try{CONV=require('opencc-js').Converter({from:'cn',to:'twp'});}catch(e){}
const log=(...a)=>process.stderr.write(a.join(' ')+'\n');
// ---- 問模型：有設 WW_URL 就直接問 vLLM（/v1/completions，連續批次，快很多）；沒有就經由 gen_bulk.py（標準輸入／輸出，一次一批）----
const URL=process.env.WW_URL||'';
const TEMPS=[0.7,0.8,0.8,0.9,0.9,1.0,1.0,1.1],TOPPS=[0.85,0.9,0.9,0.95,0.97];
const pick=a=>a[Math.floor(Math.random()*a.length)];
async function askHttp(prompt){const temp=pick(TEMPS),topp=pick(TOPPS);
  const body={model:'ww',prompt:'<|im_start|>user\n'+prompt+'<|im_end|>\n<|im_start|>assistant\n',max_tokens:110,temperature:temp,top_p:topp,repetition_penalty:1.05,stop:['<|im_end|>']};
  for(let k=0;k<4;k++){try{const r=await fetch(URL+'/v1/completions',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
      const j=await r.json();return{text:j.choices[0].text,temp,topp};}catch(e){await new Promise(r=>setTimeout(r,1500));}}
  return{text:'',temp,topp};}
let queue=[],flying=null,bid=0,timer=null,stopping=false;
function ask(prompt){if(URL)return askHttp(prompt);return new Promise(res=>{queue.push({prompt,res});kick();});}
function kick(){if(flying||!queue.length)return;if(timer)clearTimeout(timer);
  // 等一下讓其他對局也排進來；滿一批就馬上送
  if(queue.length>=+BMAX)send();else timer=setTimeout(send,25);}
function send(){timer=null;if(flying||!queue.length)return;
  // 長度相近的放一批，少一點補白
  queue.sort((a,b)=>a.prompt.length-b.prompt.length);
  const k=Math.min(queue.length,+BMAX),s=Math.floor(Math.random()*(queue.length-k+1));
  flying=queue.splice(s,k);process.stdout.write(JSON.stringify({id:++bid,prompts:flying.map(q=>q.prompt)})+'\n');}
if(!URL)readline.createInterface({input:process.stdin}).on('line',l=>{let d;try{d=JSON.parse(l);}catch(e){return;}
  const f=flying;flying=null;if(f)f.forEach((q,i)=>q.res({text:d.texts[i],temp:d.temp,topp:d.topp}));kick();});
// ---- 對局 ----
const EXTRA=['wolfKing','whiteWolf','hiddenWolf','guard','idiot','knight','gravekeeper','crow','bear'];
function randCfg(){const n=6+Math.floor(Math.random()*7);let c=E.wwCfgFor(n);
  if(Math.random()<.45){const r={...c.roles};for(const k of EXTRA)if(Math.random()<.22){
      if(k.endsWith('olf')||k==='wolfKing'){if(r.wolf>1){r.wolf--;r[k]=1;}}else r[k]=1;}
    const c2=E.wwCfgFix({n,roles:r,win:c.win,speak:60});if(E.wwVil(c2)>=1&&!E.wwCfgErr(c2))c=c2;}
  if(Math.random()<.3)c.win='all';return c;}
const out=fs.createWriteStream(OUT,{flags:'a'});const TAG=Date.now().toString(36)+Math.floor(Math.random()*1296).toString(36);
const stat={ok:0,bad:0,why:{},games:0};
function toOut(text){let t=String(text||'').replace(/<\|im_end\|>[\s\S]*$/,'').replace(/\r/g,'').trim();const i=t.lastIndexOf('\n');
  return i<0?CONV(t):CONV(t.slice(0,i))+t.slice(i);}
async function play(gid){
  const cfg=randCfg();const st=E.wwNew(cfg,Array(cfg.n).fill(true),0);st.gid=TAG+'-'+gid;
  // 一部分座位整局只說「過」（約一成；四分之一的對局沒有）
  const q=Math.random()<.25?0:.13;st.mute=st.roles.map(()=>Math.random()<q);
  let t=0,steps=0;
  while(!st.over&&steps<30000){t+=300;steps++;
    if(st.phase==='speak'&&Math.random()<.004){const k=st.roles.indexOf('knight'),w=st.roles.indexOf('whiteWolf'),al=st.alive.map((a,i)=>a?i:-1).filter(i=>i>=0);
      if(k>=0&&st.alive[k]&&Math.random()<.5)E.wwAct(st,k,{type:'duel',t:al[Math.floor(Math.random()*al.length)]},t);
      else if(w>=0&&st.alive[w])E.wwAct(st,w,{type:'boom',t:al.filter(i=>i!==w)[Math.floor(Math.random()*(al.length-1))]},t);}
    E.wwTick(st,t);
    if(st.talk&&st.talk.res===undefined&&st.talk.p)await st.talk.p;}
  stat.games++;}
E.wwSetTalk(async(prompt,st,seat,n)=>{
  if(st.mute&&st.mute[seat])return null;if(stopping)return null;
  const r=await ask(prompt);const txt=toOut(r.text);const p=E.wwTalkParse(txt);
  const err=E.wwTalkCheck(st,seat,p&&{...p,lines:p.lines.slice()})||(p&&E.wwTalkCopy(st,seat,p.speech))||null;
  if(err){stat.bad++;stat.why[err]=(stat.why[err]||0)+1;}else stat.ok++;
  out.write(JSON.stringify({prompt,out:txt,err,role:st.roles[seat],phase:st.phase,day:st.day,n:st.n,try:n,gid:st.gid,seat,temp:r.temp,topp:r.topp,
    st:{roles:st.roles,alive:st.alive,seerRes:st.seerRes,strat:st.strat,phase:st.phase,day:st.day,n:st.n}})+'\n');
  if(stat.ok>=+TARGET||fs.existsSync(OUT+'.stop'))stopping=true;
  return txt;});
(async()=>{const C=+CON;let next=0;const t0=Date.now();
  const iv=setInterval(()=>log(new Date().toISOString().slice(11,19),'局',stat.games,'合格',stat.ok,'不合格',stat.bad,
    ((stat.ok+stat.bad)/((Date.now()-t0)/60000)).toFixed(0)+'筆/分',JSON.stringify(stat.why)),60000);
  await Promise.all(Array.from({length:C},async()=>{while(!stopping){const g=next++;try{await play(g);}catch(e){log('錯誤',e&&e.stack);}}}));
  clearInterval(iv);out.end(()=>{log('完成',JSON.stringify(stat));process.exit(0);});})();
