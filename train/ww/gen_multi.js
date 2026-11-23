// 狼人殺 AI 發言：多種大模型同桌對局，產生「各種語氣、各種懷疑方式」的訓練素材（0.29.1）
// node train/ww/gen_multi.js <輸出.jsonl> <目標合格筆數> [同時幾局=8] [迷你模型資料夾=ai/ww/tiny]
//
// 每一局的每個座位隨機指定：
//   1. 由誰來講：Claude Haiku／Sonnet／Opus（用本機的 claude 指令，不需要金鑰）、迷你模型自己（讓大模型也看到迷你模型講的話；迷你模型講的不記錄）、
//      有設 OPENAI_API_KEY／GEMINI_API_KEY／XAI_API_KEY（或一把 OPENROUTER_API_KEY）時加上 GPT／Gemini／Grok，而且以它們為主。比例用 WW_MIX 調
//   2. 人設：語氣 × 看事情的角度 × 懷疑別人的方式 × 小習慣（下面四張表隨機組合，約 2 萬種）。人設只寫在給大模型的指示裡，
//      不放進要讓迷你模型學的提示，這樣同一種提示會對到很多種講法。
// 記憶隔開：每一次發言都開一個全新的行程（不帶工具、不存對話、不讀專案設定），只給「這個座位看得到的東西」（遊戲裡同一套 wwTalkPrompt，
//   tools/wwtest.js 有洗牌測試守著）。同桌的其他座位各自是另一個行程，彼此完全看不到對方的提示。
// 盲猜檢查：第 1 天好人（不含預言家）手上沒有任何資訊，投票投中狼的比例應該接近亂猜；跑完會印出「實際投中率 vs 亂猜的機率」，
//   高出很多就代表有資訊外洩。
// 通過遊戲同一套檢查（wwTalkCover／wwTalkCheck／wwTalkCopy）的發言才會在對局裡採用、才記錄。
const fs=require('fs'),path=require('path'),os=require('os'),{spawn}=require('child_process');
const R=path.join(__dirname,'../../');
const E=require(R+'tools/ww_engine.js'),M=require(R+'ai/ww/mini.js');
const [OUT,TARGET='1000',CON='8',MINI=path.join(R,'ai/ww/tiny')]=process.argv.slice(2);
let CONV=s=>s;try{CONV=require('opencc-js').Converter({from:'cn',to:'twp'});}catch(e){}
const pick=a=>a[Math.floor(Math.random()*a.length)];
const TONE=['衝、講話很直','冷靜、一句一句慢慢講','愛開玩笑、嘴賤','委屈、覺得自己被冤枉','很有自信、像在主持','碎碎念、想到什麼講什麼','老手、愛講邏輯鏈','情緒化、容易激動','客氣有禮貌','不耐煩、想快點投票','疑神疑鬼','懶洋洋、不太想講','像在講故事','酸人、愛反問','認真到有點囉嗦','大而化之','謹慎、話留三分','熱心、想幫大家整理'];
const ANGLE=['先看誰的發言前後矛盾','先看投票紀錄','先看誰在划水、沒內容','先看誰跟誰站同一邊','從昨晚誰出局反推','從發言順序推（前面的人資訊少）','先替自己澄清再談別人','先回應上一位的話','只挑一個人深入講','把場上的人快速分成可信和可疑兩堆','從身份宣稱合不合理看','從誰最急著帶票看','從誰太安靜看','先講自己的結論再補理由'];
const DOUBT=['直接點名說他像狼','用問句逼對方解釋','先肯定一個人再轉頭懷疑另一個','說「我不確定，但是…」','拿兩個人比較誰比較像狼','只說感覺怪、不下定論','語氣很重地咬定一個人','半開玩笑地懷疑','列出一兩個具體疑點','先保留，說要再聽一輪','替被圍攻的人說話、反過來懷疑帶頭的人','說誰都還看不出來，先不亂投'];
const QUIRK=['開頭不要用「我覺得」','用一個生活化的比喻','句子短、不要連接詞','結尾丟一個問題給下一位','用「欸」「蛤」「齁」之類的口語詞','不講廢話，直接講結論','先講一句跟場上氣氛有關的話','稍微自嘲一下','','','',''];
function persona(){return{tone:pick(TONE),angle:pick(ANGLE),doubt:pick(DOUBT),quirk:pick(QUIRK)};}
const SYS=fs.readFileSync(path.join(__dirname,'teacher_prompt.txt'),'utf8')+`
另外三條（一定要守）：
- 可以沒有根據就懷疑人、可以亂玩；但說過自己是某個身份之後，不能再改口成另一個（只有先說平民、後來亮出真身份可以）。
- 只能引用提示的「紀錄」裡真的出現過的事：沒人講過的話、沒人報過的身份／查殺／金水、沒發生的投票都不能講。第1天沒有「昨天」。
- 提示裡沒寫的事你就是不知道，不要去猜別人的真身份當成事實講。`;
const WORK=fs.mkdtempSync(path.join(os.tmpdir(),'wwgen-'));const SYSF=path.join(WORK,'sys.txt');fs.writeFileSync(SYSF,SYS);
const log=(...a)=>console.log(new Date().toISOString().slice(11,19),...a);
// ---- 問大模型 ----
// Windows 上直接叫 claude.exe（不經過 shell，空字串參數才不會被吃掉）；其他系統用 PATH 裡的 claude。WW_CLAUDE 可以指定路徑
const CLAUDE=process.env.WW_CLAUDE||(process.platform==='win32'?path.join(os.homedir(),'.local/bin/claude.exe'):'claude');
function askClaude(model,user){return new Promise(res=>{
  const p=spawn(CLAUDE,['-p','--model',model,'--system-prompt-file',SYSF,'--tools','','--strict-mcp-config','--disable-slash-commands','--no-session-persistence','--setting-sources','','--output-format','json'],{cwd:WORK,windowsHide:true});
  let o='';const kill=setTimeout(()=>{try{p.kill();}catch(e){}},90000);
  p.stdout.on('data',d=>o+=d);p.on('error',()=>{clearTimeout(kill);res(null);});
  p.on('close',()=>{clearTimeout(kill);try{const j=JSON.parse(o);res(j.is_error?null:String(j.result||''));}catch(e){res(null);}});
  p.stdin.end(user);});}
async function askHttp(base,key,model,user){
  try{const r=await fetch(base+'/chat/completions',{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+key},
      body:JSON.stringify({model,messages:[{role:'system',content:SYS},{role:'user',content:user}],temperature:1})});
    const j=await r.json();return j.choices[0].message.content;}catch(e){return null;}}
const PROV={haiku:u=>askClaude('haiku',u),sonnet:u=>askClaude('sonnet',u),opus:u=>askClaude('opus',u)};
if(process.env.OPENAI_API_KEY)PROV.gpt=u=>askHttp('https://api.openai.com/v1',process.env.OPENAI_API_KEY,process.env.WW_GPT||'gpt-5-mini',u);
if(process.env.GEMINI_API_KEY)PROV.gemini=u=>askHttp('https://generativelanguage.googleapis.com/v1beta/openai',process.env.GEMINI_API_KEY,process.env.WW_GEMINI||'gemini-2.5-flash',u);
if(process.env.XAI_API_KEY)PROV.grok=u=>askHttp('https://api.x.ai/v1',process.env.XAI_API_KEY,process.env.WW_GROK||'grok-4-fast',u);
// OpenRouter：一把金鑰可以同時用 GPT、Gemini、Grok（WW_OR 用逗號列出要用的模型）
if(process.env.OPENROUTER_API_KEY)(process.env.WW_OR||'openai/gpt-5-mini,google/gemini-2.5-flash,x-ai/grok-4-fast').split(',').forEach(m=>{const k=/gpt/.test(m)?'gpt':/gemini/.test(m)?'gemini':/grok/.test(m)?'grok':m;
  if(!PROV[k])PROV[k]=u=>askHttp('https://openrouter.ai/api/v1',process.env.OPENROUTER_API_KEY,m,u);});
// Ethan（2026-11-24）：多用 GPT／Gemini／Grok、少用 Claude。有外部模型時 Claude 只佔一小部分；一個外部模型都沒有時才全用 Claude
const EXT=['gpt','gemini','grok'].some(k=>PROV[k]);
const MIX=[];for(const s of (process.env.WW_MIX||(EXT?'gpt:4,gemini:4,grok:4,haiku:1,sonnet:1,opus:1,mini:3':'haiku:5,sonnet:3,opus:1,mini:3')).split(',')){const [k,w]=s.split(':');if(k==='mini'||PROV[k])for(let i=0;i<+w;i++)MIX.push(k);}
const meta=JSON.parse(fs.readFileSync(path.join(MINI,'model.json'),'utf8')),bin=fs.readFileSync(path.join(MINI,'model.bin'));
const net=new M.Net(meta,bin.buffer.slice(bin.byteOffset,bin.byteOffset+bin.byteLength),{});
function toOut(c){const m=/\{[\s\S]*\}/.exec(c||'');if(!m)return null;let o;try{o=JSON.parse(m[0]);}catch(e){return null;}if(typeof o.speech!=='string')return null;
  let ls=CONV(o.speech).replace(/\r/g,'').split(/\n+/).map(s=>s.trim()).filter(Boolean);if(ls.length>1)ls=ls.filter(s=>!/^過[。.]?$/.test(s));
  const v=parseInt(o.vote)||0;return ls.join('\n')+'\n投:'+(v>0?v:'棄');}
// ---- 對局 ----
const EXTRA=['wolfKing','hiddenWolf','guard','idiot','knight','gravekeeper','crow','bear'];
function randCfg(g){const n=6+Math.floor(Math.random()*7);let c=E.wwCfgFor(n);
  if(g%3===1){const r={...c.roles};for(const k of EXTRA)if(Math.random()<.25){if(k==='wolfKing'||k==='hiddenWolf'){if(r.wolf>1){r.wolf--;r[k]=1;}}else r[k]=1;}
    const c2=E.wwCfgFix({n,roles:r,win:['num','side','all'][g%3],speak:60});if(E.wwVil(c2)>=1&&!E.wwCfgErr(c2))c=c2;}
  return c;}
const out=fs.createWriteStream(OUT,{flags:'a'});const TAG=Date.now().toString(36);
const stat={ok:0,bad:0,fail:0,games:0,why:{},by:{},blind:{}};let stop=false;
const B=k=>stat.by[k]||(stat.by[k]={ok:0,bad:0,fail:0});
E.wwSetTalk(async(prompt,st,seat,n,opt)=>{
  const who=st.gm.who[seat],ps=st.gm.ps[seat];
  if(who==='mini'){const r=net.generate(prompt,opt);return opt&&opt.minLp!=null&&r.lp<opt.minLp?'':r.text;}
  const user=prompt+`\n\n【這次的人設（只影響講法，不要把人設本身講出來）】語氣：${ps.tone}。切入角度：${ps.angle}。懷疑別人的方式：${ps.doubt}。${ps.quirk?'習慣：'+ps.quirk+'。':''}`;
  const txt=toOut(await PROV[who](user));if(!txt){stat.fail++;B(who).fail++;return null;}
  const p=E.wwTalkParse(txt),q=p&&{...p,lines:p.lines.slice()};
  const err=(q&&E.wwTalkCover(st,seat,{...q,lines:q.lines.slice()}))||E.wwTalkCheck(st,seat,q)||(q&&E.wwTalkCopy(st,seat,q.speech))||null;
  if(err){stat.bad++;B(who).bad++;stat.why[err]=(stat.why[err]||0)+1;return txt;}
  stat.ok++;B(who).ok++;
  // 盲猜檢查：第 1 天、好人、不是預言家，投票對象是不是狼
  if(st.day===1&&st.phase==='speak'&&E.WW_ROLES[st.roles[seat]].side!=='wolf'&&st.roles[seat]!=='seer'&&p.vote>=0&&p.vote<st.n&&p.vote!==seat){
    const al=st.alive.map((a,i)=>a&&i!==seat?i:-1).filter(i=>i>=0),w=al.filter(i=>E.WW_ROLES[st.roles[i]].side==='wolf').length;
    const hit=E.WW_ROLES[st.roles[p.vote]].side==='wolf';
    // 「先」＝今天他前面還沒有任何人發言：這時候完全沒有東西可以推理，投中率一定要和亂猜一樣
    const first=!st.msgs.some(m=>m.seat>=0&&m.to==='all'&&m.day===st.day);
    for(const k of first?[who,who+'（第一個發言）']:[who]){const b=stat.blind[k]||(stat.blind[k]={n:0,hit:0,exp:0});b.n++;b.exp+=w/al.length;if(hit)b.hit++;}}
  out.write(JSON.stringify({prompt:E.wwTalkPromptV1(st,seat,true),out:txt,err:null,role:st.roles[seat],phase:st.phase,day:st.day,n:st.n,try:n,gid:st.gid,seat,src:who,persona:ps,roles:st.roles})+'\n');
  if(stat.ok>=+TARGET)stop=true;
  return txt;});
async function play(g){const cfg=randCfg(g),st=E.wwNew(cfg,Array(cfg.n).fill(true),0);st.gid=TAG+'-'+g;
  st.gm={who:st.roles.map(()=>pick(MIX)),ps:st.roles.map(persona)};let t=0,k=0;
  while(!st.over&&k<30000&&!stop){t+=300;k++;E.wwTick(st,t);if(st.talk&&st.talk.res===undefined&&st.talk.p)await st.talk.p;}
  stat.games++;}
function report(){const bl=Object.entries(stat.blind).map(([k,b])=>`${k} 第1天投中狼 ${(100*b.hit/b.n).toFixed(0)}%（亂猜 ${(100*b.exp/b.n).toFixed(0)}%，${b.n} 次）`).join('；');
  log('局',stat.games,'採用',stat.ok,'不合格',stat.bad,'失敗',stat.fail,JSON.stringify(stat.by),JSON.stringify(stat.why));if(bl)log('盲猜檢查：'+bl);}
(async()=>{log('來源比例',MIX.join(','),'目標',TARGET,'同時',CON,'局');
  const iv=setInterval(report,120000);let g=0;
  await Promise.all(Array.from({length:+CON},async()=>{while(!stop&&!fs.existsSync(OUT+'.stop')){try{await play(g++);}catch(e){log('錯誤',e&&e.stack);}}}));
  clearInterval(iv);report();out.end();log('完成');try{fs.rmSync(WORK,{recursive:true,force:true});}catch(e){}})();
