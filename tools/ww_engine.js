/* ===== 狼人殺：規則引擎（遊戲自動當法官）＋電腦玩家。全部在房主（或單機）端運算 ===== */
// 座位 0..n-1，畫面上顯示成 1..n 號。時間都用房主的時鐘（毫秒）
const WW_ROLES={wolf:{n:'狼人',side:'wolf',ic:'🐺'},seer:{n:'預言家',side:'god',ic:'🔮'},witch:{n:'女巫',side:'god',ic:'🧪'},
  hunter:{n:'獵人',side:'god',ic:'🏹'},guard:{n:'守衛',side:'god',ic:'🛡️'},idiot:{n:'白痴',side:'god',ic:'🤪'},villager:{n:'平民',side:'vil',ic:'🙂'}};
const WW_GODS=['seer','witch','hunter','guard','idiot'];
// 各人數的預設身份（平民自動補滿）
const WW_PRESET={6:{wolf:2,seer:1,witch:1},7:{wolf:2,seer:1,witch:1,hunter:1},8:{wolf:3,seer:1,witch:1,hunter:1},9:{wolf:3,seer:1,witch:1,hunter:1},
  10:{wolf:3,seer:1,witch:1,hunter:1,guard:1},11:{wolf:4,seer:1,witch:1,hunter:1,guard:1},12:{wolf:4,seer:1,witch:1,hunter:1,idiot:1}};
const WW_T={night:45000,witch:25000,hunter:20000,vote:30000,nightMin:7000};
const wwNo=s=>(s+1)+' 號';
function wwCfgFor(n){const r={wolf:0,seer:0,witch:0,hunter:0,guard:0,idiot:0,...WW_PRESET[n]};return{n,roles:r,win:'side',speak:60};}
function wwVil(cfg){return cfg.n-['wolf',...WW_GODS].reduce((a,k)=>a+(cfg.roles[k]|0),0);}
function wwCfgErr(cfg){
  if(!(cfg.n>=5&&cfg.n<=12))return'人數要在 5～12 人';
  const w=cfg.roles.wolf|0;if(w<1)return'至少要 1 隻狼人';if(wwVil(cfg)<0)return'身份比人數還多';
  if(w*2>=cfg.n)return'狼人太多了（要少於一半）';if(cfg.n-w<2)return'好人至少要 2 位';return null;}
function wwMsg(st,to,txt,seat){st.msgs.push({id:++st.mid,to,seat:seat==null?-1:seat,txt:String(txt),day:st.day,night:st.phase==='night'||st.phase==='witch'});
  if(st.msgs.length>400)st.msgs.splice(0,st.msgs.length-400);}
const wwIsWolf=(st,s)=>st.roles[s]==='wolf';
const wwAliveOf=(st,f)=>st.roles.map((r,i)=>i).filter(i=>st.alive[i]&&(!f||f(i)));
function wwSeatOf(st,role){return st.roles.indexOf(role);}
function wwNew(cfg,ai,now){
  const deck=[];['wolf',...WW_GODS].forEach(k=>{for(let i=0;i<(cfg.roles[k]|0);i++)deck.push(k);});while(deck.length<cfg.n)deck.push('villager');
  for(let i=deck.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[deck[i],deck[j]]=[deck[j],deck[i]];}
  const st={g:'ww',n:cfg.n,cfg:JSON.parse(JSON.stringify(cfg)),roles:deck,alive:Array(cfg.n).fill(true),ai:ai.slice(),day:1,phase:'',dl:0,t0:now,
    witchSave:true,witchPoison:true,guardLast:-1,seerRes:{},idiotUp:[],msgs:[],mid:0,over:null,seq:0,aiAt:{},q:[],cur:-1,order:[],si:0,votes:{},night:null,hunterGone:false};
  wwMsg(st,'all',`遊戲開始，共 ${cfg.n} 人：`+wwCfgText(st.cfg)+'。');
  st.roles.forEach((r,i)=>{wwMsg(st,i,`你是 ${wwNo(i)}，身份是「${WW_ROLES[r].n}」。`+wwRoleTip(r));});
  const wolves=wwAliveOf(st,i=>wwIsWolf(st,i));wwMsg(st,'wolf',`狼隊友：${wolves.map(wwNo).join('、')}。晚上可以在這裡和隊友討論。`);
  wwNight(st,now);return st;}
function wwCfgText(cfg){const p=['wolf',...WW_GODS].filter(k=>cfg.roles[k]).map(k=>`${WW_ROLES[k].n}×${cfg.roles[k]}`);const v=wwVil(cfg);if(v)p.push(`平民×${v}`);
  return p.join('、')+`（${cfg.win==='all'?'屠城':'屠邊'}）`;}
function wwRoleTip(r){return{wolf:'每晚和狼隊友選一位玩家殺掉。',seer:'每晚可以查驗一位玩家是好人還是狼人。',witch:'有一瓶解藥（救當晚被殺的人，不能救自己）和一瓶毒藥，同一晚只能用一瓶。',
  hunter:'被殺或被投票出局時可以開槍帶走一人（被毒死不能開槍）。',guard:'每晚守護一位玩家不被狼人殺，不能連續兩晚守同一人。',idiot:'被投票出局時翻牌免死，但之後不能投票。',villager:'沒有特殊能力，靠發言和投票找出狼人。'}[r]||'';}
function wwPhase(st,ph,now,ms){st.phase=ph;st.dl=now+(ms||0);st.aiAt={};st.seq++;}
function wwNight(st,now){
  if(st.phase)st.day++;
  st.night={wolf:{},seer:null,guard:undefined,acted:{},kill:-1,saved:-1,poison:-1,min:now+WW_T.nightMin+Math.random()*4000};
  wwPhase(st,'night',now,WW_T.night);wwMsg(st,'all',`第 ${st.day} 夜，天黑請閉眼。`);}
// 晚上需要行動的人
function wwNightNeed(st){const need=[];
  wwAliveOf(st,i=>wwIsWolf(st,i)).forEach(i=>need.push(i));
  ['seer','guard'].forEach(r=>{const s=wwSeatOf(st,r);if(s>=0&&st.alive[s])need.push(s);});return need;}
function wwNightDone(st,now){return now>=st.night.min&&wwNightNeed(st).every(s=>st.night.acted[s]);}
function wwWolfKill(st){const v={};Object.values(st.night.wolf).forEach(t=>{v[t]=(v[t]||0)+1;});let best=-1,bn=0,ties=[];
  for(const k in v){if(v[k]>bn){bn=v[k];ties=[+k];}else if(v[k]===bn)ties.push(+k);}
  if(!ties.length)return-1;best=ties[Math.floor(Math.random()*ties.length)];return best;}
function wwToWitch(st,now){
  st.night.kill=wwWolfKill(st);
  const ws=wwSeatOf(st,'witch');
  if(ws<0){wwDawn(st,now);return;}
  const can=st.alive[ws]&&(st.witchSave||st.witchPoison);
  wwPhase(st,'witch',now,can?WW_T.witch:3000+Math.random()*3000);   // 女巫不在了也等一下，免得大家猜到
  if(!can)st.night.witchFake=true;}
function wwDawn(st,now){
  const n=st.night,deaths=[];const k=n.kill;
  if(k>=0){const g=n.guard===k,s=n.saved===k;if(g===s)deaths.push(k);}   // 同守同救也會死
  if(n.poison>=0&&!deaths.includes(n.poison))deaths.push(n.poison);
  deaths.sort((a,b)=>a-b);deaths.forEach(d=>st.alive[d]=false);st.guardLast=n.guard===undefined?-1:n.guard;
  wwMsg(st,'all',deaths.length?`天亮了。昨晚 ${deaths.map(wwNo).join('、')} 死亡。`:'天亮了。昨晚是平安夜，沒有人死亡。');
  st.lastDeaths=deaths;st.q=[];
  deaths.forEach(d=>{if(st.day===1)st.q.push({ph:'last',s:d});if(st.roles[d]==='hunter'&&d!==n.poison)st.q.push({ph:'hunter',s:d});});
  st.q.push({ph:'speak'});st.q.push({ph:'vote'});
  if(wwCheck(st,now))return;wwNext(st,now);}
function wwNext(st,now){
  if(st.over)return;const it=st.q.shift();if(!it){wwNight(st,now);return;}
  if(it.ph==='last'){st.cur=it.s;wwPhase(st,'last',now,st.cfg.speak*1000);wwMsg(st,'all',`請 ${wwNo(it.s)} 發表遺言。`);return;}
  if(it.ph==='hunter'){st.cur=it.s;wwPhase(st,'hunter',now,WW_T.hunter);wwMsg(st,'all',`${wwNo(it.s)} 是獵人，可以選擇開槍帶走一位玩家。`);return;}
  if(it.ph==='speak'){const al=wwAliveOf(st);if(!al.length){wwNext(st,now);return;}
    let start;const d=st.lastDeaths||[];if(d.length){start=(d[0]+1)%st.n;}else start=al[Math.floor(Math.random()*al.length)];
    const ord=[];for(let k=0;k<st.n;k++){const s=(start+k)%st.n;if(st.alive[s])ord.push(s);}
    st.order=ord;st.si=0;st.cur=ord[0];wwPhase(st,'speak',now,st.cfg.speak*1000);
    wwMsg(st,'all',`開始發言，順序：${ord.map(s=>s+1).join('→')}。請 ${wwNo(st.cur)} 發言。`);return;}
  if(it.ph==='vote'){st.votes={};st.cur=-1;wwPhase(st,'vote',now,WW_T.vote);wwMsg(st,'all','發言結束，請投票（可以棄票）。');return;}
}
function wwVoters(st){return wwAliveOf(st,i=>!st.idiotUp.includes(i));}
function wwTally(st,now){
  const by={},ab=[];wwVoters(st).forEach(s=>{const t=st.votes[s];if(t==null||t<0)ab.push(s);else(by[t]=by[t]||[]).push(s);});
  const rows=Object.keys(by).map(Number).sort((a,b)=>by[b].length-by[a].length||a-b);
  wwMsg(st,'all','投票結果：'+(rows.length?rows.map(t=>`${wwNo(t)} ${by[t].length} 票（${by[t].map(s=>s+1).join('、')}）`).join('；'):'沒有人投票')+(ab.length?`；棄票：${ab.map(s=>s+1).join('、')}`:'')+'。');
  st.lastVote={by,ab};st.q=[];
  if(!rows.length||(rows.length>1&&by[rows[0]].length===by[rows[1]].length)){wwMsg(st,'all',rows.length?'平票，這輪沒有人出局。':'沒有人出局。');wwNight(st,now);return;}
  const out=rows[0];
  if(st.roles[out]==='idiot'&&!st.idiotUp.includes(out)){st.idiotUp.push(out);wwMsg(st,'all',`${wwNo(out)} 翻牌是白痴，不會出局，但之後不能投票。`);wwNight(st,now);return;}
  st.alive[out]=false;wwMsg(st,'all',`${wwNo(out)} 被投票出局。`);
  if(wwCheck(st,now))return;
  st.q.push({ph:'last',s:out});if(st.roles[out]==='hunter')st.q.push({ph:'hunter',s:out});wwNext(st,now);}
function wwCheck(st,now){
  const al=wwAliveOf(st),w=al.filter(i=>wwIsWolf(st,i)).length,g=al.filter(i=>WW_ROLES[st.roles[i]].side==='god').length,v=al.filter(i=>st.roles[i]==='villager').length;
  const G=st.roles.filter(r=>WW_ROLES[r].side==='god').length,V=st.roles.filter(r=>r==='villager').length;
  let win=null;if(!w)win='good';
  else if(st.cfg.win==='all'){if(!g&&!v)win='wolf';}
  else if((G&&!g)||(V&&!v)||(!g&&!v))win='wolf';
  if(!win)return false;
  st.over={win,why:win==='good'?'狼人全部出局':(st.cfg.win==='all'?'好人全部出局':(G&&!g?'神職全部出局':'平民全部出局'))};
  wwPhase(st,'over',now,0);
  wwMsg(st,'all',`遊戲結束：${win==='good'?'好人陣營':'狼人陣營'}獲勝（${st.over.why}）。身份：`+st.roles.map((r,i)=>`${i+1} 號${WW_ROLES[r].n}`).join('、')+'。');
  return true;}
// 動作：回傳錯誤訊息，成功回傳 null
function wwAct(st,seat,a,now){
  if(!a||typeof a!=='object')return'動作格式錯誤';const ok=t=>Number.isInteger(t)&&t>=0&&t<st.n;
  if(a.type==='say'){const txt=String(a.txt||'').replace(/\s+/g,' ').trim().slice(0,200);if(!txt)return'請輸入內容';
    if(st.phase==='over'){wwMsg(st,'all',txt,seat);st.seq++;return null;}
    if(st.phase==='night'&&wwIsWolf(st,seat)&&st.alive[seat]){wwMsg(st,'wolf',txt,seat);st.seq++;return null;}
    if((st.phase==='speak'||st.phase==='last')&&st.cur===seat){wwMsg(st,'all',txt,seat);st.seq++;return null;}
    return st.phase==='night'?'天黑了，請閉眼（只有狼人能在狼隊頻道說話）':'還沒輪到你發言';}
  if(st.over)return'遊戲已經結束';
  if(a.type==='night'){if(st.phase!=='night')return'現在不是晚上行動的時間';if(!st.alive[seat])return'你已經出局';const r=st.roles[seat],t=a.t;
    if(r==='wolf'){if(t!==-1&&!(ok(t)&&st.alive[t]))return'請選一位活著的玩家';if(t===-1)delete st.night.wolf[seat];else st.night.wolf[seat]=t;st.night.acted[seat]=true;
      wwMsg(st,'wolf',t===-1?`${wwNo(seat)} 選擇空刀。`:`${wwNo(seat)} 選擇殺 ${wwNo(t)}。`);}
    else if(r==='seer'){if(st.night.acted[seat])return'今晚已經查驗過了';if(!(ok(t)&&st.alive[t]&&t!==seat))return'請選一位其他活著的玩家';
      st.night.seer=t;st.night.acted[seat]=true;st.seerRes[t]=wwIsWolf(st,t);wwMsg(st,seat,`查驗結果：${wwNo(t)} 是${st.seerRes[t]?'狼人':'好人'}。`);}
    else if(r==='guard'){if(st.night.acted[seat])return'今晚已經守護過了';if(t!==-1&&!(ok(t)&&st.alive[t]))return'請選一位活著的玩家';if(t!==-1&&t===st.guardLast)return'不能連續兩晚守同一個人';
      st.night.guard=t===-1?undefined:t;st.night.acted[seat]=true;wwMsg(st,seat,t===-1?'今晚你不守護任何人。':`今晚你守護 ${wwNo(t)}。`);}
    else return'你的身份晚上沒有行動';
    st.seq++;if(wwNightDone(st,now))wwToWitch(st,now);return null;}
  if(a.type==='witch'){if(st.phase!=='witch'||st.roles[seat]!=='witch'||!st.alive[seat]||st.night.witchFake)return'現在不是女巫行動的時間';
    if(a.use==='save'){if(!st.witchSave)return'解藥已經用掉了';const k=st.night.kill;if(k<0)return'今晚沒有人被殺';if(k===seat)return'女巫不能救自己';
      st.witchSave=false;st.night.saved=k;wwMsg(st,seat,`你用解藥救了 ${wwNo(k)}。`);}
    else if(a.use==='poison'){if(!st.witchPoison)return'毒藥已經用掉了';const t=a.t;if(!(ok(t)&&st.alive[t]&&t!==seat))return'請選一位其他活著的玩家';
      st.witchPoison=false;st.night.poison=t;wwMsg(st,seat,`你對 ${wwNo(t)} 用了毒藥。`);}
    else wwMsg(st,seat,'今晚你沒有用藥。');
    wwDawn(st,now);return null;}
  if(a.type==='hunter'){if(st.phase!=='hunter'||st.cur!==seat)return'現在不能開槍';const t=a.t;
    if(t===-1){wwMsg(st,'all',`${wwNo(seat)} 選擇不開槍。`);}
    else{if(!(ok(t)&&st.alive[t]&&t!==seat))return'請選一位活著的玩家';st.alive[t]=false;wwMsg(st,'all',`獵人 ${wwNo(seat)} 開槍帶走了 ${wwNo(t)}。`);
      if(wwCheck(st,now))return null;}
    wwNext(st,now);return null;}
  if(a.type==='endSpeak'){if((st.phase!=='speak'&&st.phase!=='last')||st.cur!==seat)return'還沒輪到你發言';wwEndSpeak(st,now);return null;}
  if(a.type==='vote'){if(st.phase!=='vote')return'現在不是投票時間';if(!wwVoters(st).includes(seat))return st.alive[seat]?'白痴翻牌後不能投票':'你已經出局';
    const t=a.t;if(t!==-1&&!(ok(t)&&st.alive[t]))return'請投給活著的玩家';st.votes[seat]=t;st.seq++;
    if(wwVoters(st).every(s=>s in st.votes))wwTally(st,now);return null;}
  return'不認得的動作';}
function wwEndSpeak(st,now){
  if(st.phase==='last'){wwNext(st,now);return;}
  st.si++;while(st.si<st.order.length&&!st.alive[st.order[st.si]])st.si++;
  if(st.si>=st.order.length){wwNext(st,now);return;}
  st.cur=st.order[st.si];wwPhase(st,'speak',now,st.cfg.speak*1000);wwMsg(st,'all',`請 ${wwNo(st.cur)} 發言。`);}
// 時間到
function wwTimeout(st,now){
  const ph=st.phase;
  if(ph==='night'){if(!wwNightDone(st,now)&&now<st.dl)return false;wwToWitch(st,now);return true;}
  if(ph==='witch'){if(!st.night.witchFake)wwMsg(st,wwSeatOf(st,'witch'),'時間到，今晚你沒有用藥。');wwDawn(st,now);return true;}
  if(ph==='hunter'){wwMsg(st,'all',`${wwNo(st.cur)} 時間到，沒有開槍。`);wwNext(st,now);return true;}
  if(ph==='speak'||ph==='last'){wwMsg(st,'all',`${wwNo(st.cur)} 發言時間到。`);wwEndSpeak(st,now);return true;}
  if(ph==='vote'){wwTally(st,now);return true;}
  return false;}
// 電腦玩家
const wwPick=a=>a[Math.floor(Math.random()*a.length)];
function wwAIAct(st,s,now){
  const al=wwAliveOf(st),others=al.filter(i=>i!==s),r=st.roles[s];
  if(st.phase==='night'){
    if(r==='wolf'){const hum=wwAliveOf(st,i=>wwIsWolf(st,i)&&!st.ai[i]),picks=hum.map(i=>st.night.wolf[i]).filter(t=>t!=null);
      const t=picks.length?picks[0]:(Object.values(st.night.wolf)[0]??wwPick(al.filter(i=>!wwIsWolf(st,i))));return{type:'night',t};}
    if(r==='seer'){const c=others.filter(i=>!(i in st.seerRes));return{type:'night',t:wwPick(c.length?c:others)};}
    if(r==='guard'){const c=al.filter(i=>i!==st.guardLast);return{type:'night',t:c.length?wwPick(c):-1};}
    return null;}
  if(st.phase==='witch'){const k=st.night.kill;
    if(st.witchSave&&k>=0&&k!==s&&(st.day===1||Math.random()<.5))return{type:'witch',use:'save'};
    if(st.witchPoison&&st.day>1&&Math.random()<.12){const c=others;if(c.length)return{type:'witch',use:'poison',t:wwPick(c)};}
    return{type:'witch',use:'none'};}
  if(st.phase==='hunter')return{type:'hunter',t:Math.random()<.75&&others.length?wwPick(wwIsWolf(st,s)?others.filter(i=>!wwIsWolf(st,i)):others):-1};
  if(st.phase==='speak'||st.phase==='last')return{type:'endSpeak',say:'過。'};
  if(st.phase==='vote'){const c=al.filter(i=>i!==s);
    if(wwIsWolf(st,s)){const g=c.filter(i=>!wwIsWolf(st,i));return{type:'vote',t:g.length?wwPick(g):-1};}
    if(r==='seer'){const k=c.filter(i=>st.seerRes[i]);if(k.length)return{type:'vote',t:k[0]};}
    // 跟著目前票最多的人投，沒有就隨機
    const tally={};Object.values(st.votes).forEach(t=>{if(t>=0&&t!==s)tally[t]=(tally[t]||0)+1;});const top=Object.keys(tally).sort((a,b)=>tally[b]-tally[a])[0];
    if(top!=null&&Math.random()<.55)return{type:'vote',t:+top};
    return{type:'vote',t:Math.random()<.15?-1:wwPick(c)};}
  return null;}
// 哪些電腦玩家現在要行動
function wwAINeed(st){const ai=i=>st.ai[i],out=[];
  if(st.phase==='night'){wwNightNeed(st).forEach(s=>{if(ai(s)&&!st.night.acted[s])out.push(s);});}
  else if(st.phase==='witch'){const w=wwSeatOf(st,'witch');if(w>=0&&ai(w)&&st.alive[w]&&!st.night.witchFake)out.push(w);}
  else if(st.phase==='hunter'||st.phase==='speak'||st.phase==='last'){if(ai(st.cur))out.push(st.cur);}
  else if(st.phase==='vote')wwVoters(st).forEach(s=>{if(ai(s)&&!(s in st.votes))out.push(s);});
  return out;}
// 每隔一段時間呼叫：處理時間到與電腦玩家，有變化回傳 true
function wwTick(st,now){
  if(!st||st.over)return false;const seq=st.seq,ph=st.phase,dl0=st.dl;
  for(const s of wwAINeed(st)){
    if(st.aiAt[s]==null){let d=1200+Math.random()*2600;if(st.phase==='speak'||st.phase==='last')d=1100+Math.random()*700;
      // 電腦狼人先等真人狼隊友決定
      if(st.phase==='night'&&wwIsWolf(st,s)&&wwAliveOf(st,i=>wwIsWolf(st,i)&&!st.ai[i]&&!(i in st.night.wolf)).length)d=Math.max(d,st.dl-now-12000);
      st.aiAt[s]=now+d;continue;}
    if(now<st.aiAt[s])continue;
    if(st.phase==='night'&&wwIsWolf(st,s)){const hum=wwAliveOf(st,i=>wwIsWolf(st,i)&&!st.ai[i]&&!(i in st.night.wolf));if(hum.length&&st.dl-now>12000)continue;}
    const a=wwAIAct(st,s,now);if(!a)continue;
    if(a.say){wwMsg(st,'all',a.say,s);}
    const e=wwAct(st,s,a,now);if(e&&a.type==='witch')wwAct(st,s,{type:'witch',use:'none'},now);
    if(st.phase!==ph||st.dl!==dl0)break;}
  if(st.phase==='night'&&wwNightDone(st,now))wwToWitch(st,now);
  else if(now>=st.dl&&st.phase===ph&&st.dl===dl0)wwTimeout(st,now);
  return st.seq!==seq||st.phase!==ph;}
// 每個人看得到的資料
function wwView(st,seat,now){
  const r=st.roles[seat],wolf=r==='wolf',ph=st.phase,end=!!st.over;
  return{g:'ww',seq:st.seq,mid:st.mid,me:seat,n:st.n,cfg:st.cfg,phase:ph,day:st.day,dl:Math.max(0,st.dl-now),alive:st.alive.slice(),cur:st.cur,order:ph==='speak'?st.order:null,
    role:r,wolves:wolf||end?st.roles.map((x,i)=>x==='wolf'?i:-1).filter(i=>i>=0):null,seerRes:r==='seer'?st.seerRes:null,
    witch:r==='witch'?{save:st.witchSave,poison:st.witchPoison,kill:ph==='witch'&&st.alive[seat]&&st.witchSave&&!st.night.witchFake?st.night.kill:null,fake:ph==='witch'&&!!st.night.witchFake}:null,
    guardLast:r==='guard'?st.guardLast:null,acted:ph==='night'?!!st.night.acted[seat]:ph==='vote'?(seat in st.votes):false,myVote:ph==='vote'&&seat in st.votes?st.votes[seat]:null,
    voted:ph==='vote'?Object.keys(st.votes).map(Number):null,canVote:ph==='vote'&&wwVoters(st).includes(seat),
    wolfPicks:wolf&&ph==='night'?st.night.wolf:null,idiotUp:st.idiotUp.slice(),over:st.over,roles:end?st.roles.slice():null,ai:st.ai.slice(),
    msgs:st.msgs.filter(m=>m.to==='all'||m.to===seat||(m.to==='wolf'&&(wolf||end))).slice(-160)};}

if(typeof module!=='undefined')module.exports={wwNew,wwAct,wwTick,wwView,wwCfgFor,wwCfgErr,wwVil,WW_ROLES};
