/* ===== 狼人殺：規則引擎（遊戲自動當法官）＋電腦玩家。全部在房主（或單機）端運算 ===== */
// 座位 0..n-1，畫面上顯示成 1..n 號。時間都用房主的時鐘（毫秒）
const WW_ROLES={
  wolf:{n:'狼人',side:'wolf',ic:'🐺',tip:'每晚和狼隊友選一位玩家殺掉'},
  wolfKing:{n:'狼王',side:'wolf',ic:'👑',tip:'狼人之一；出局時可以開槍帶走一人（被毒死不能）'},
  whiteWolf:{n:'白狼王',side:'wolf',ic:'💥',tip:'狼人之一；白天發言階段可以自爆並帶走一人，直接進入黑夜'},
  hiddenWolf:{n:'隱狼',side:'wolf',ic:'🥷',tip:'狼人陣營但不知道隊友、不參與殺人，預言家查驗是好人；其他狼都出局後才能殺人'},
  seer:{n:'預言家',side:'god',ic:'🔮',tip:'每晚查驗一位玩家是好人還是狼人'},
  witch:{n:'女巫',side:'god',ic:'🧪',tip:'一瓶解藥（可以救自己）、一瓶毒藥，同一晚只能用一瓶'},
  hunter:{n:'獵人',side:'god',ic:'🏹',tip:'出局時可以開槍帶走一人（被毒死不能）'},
  guard:{n:'守衛',side:'god',ic:'🛡️',tip:'每晚守護一人不被狼殺，不能連兩晚守同一人'},
  idiot:{n:'白痴',side:'god',ic:'🤪',tip:'被投票出局時翻牌免死，但之後不能投票'},
  knight:{n:'騎士',side:'god',ic:'⚔️',tip:'白天發言階段可以和一人決鬥一次：對方是狼就出局並直接入夜，否則騎士出局'},
  gravekeeper:{n:'守墓人',side:'god',ic:'🪦',tip:'每晚得知前一天被投票出局的人是好人還是狼人'},
  crow:{n:'烏鴉',side:'god',ic:'🪶',tip:'每晚詛咒一人，隔天投票時他多算一票'},
  bear:{n:'熊',side:'god',ic:'🐻',tip:'每天早上，如果左右最近的活人有狼，法官會說「熊咆哮了」'},
  villager:{n:'平民',side:'vil',ic:'🙂',tip:'沒有特殊能力，靠發言和投票找出狼人'}};
const WW_WOLVES=['wolf','wolfKing','whiteWolf','hiddenWolf'];
const WW_GODS=['seer','witch','hunter','guard','idiot','knight','gravekeeper','crow','bear'];
const WW_KEYS=[...WW_WOLVES,...WW_GODS];
// 各人數的預設身份（平民自動補滿）
const WW_PRESET={6:{wolf:2,seer:1,witch:1},7:{wolf:2,seer:1,witch:1,hunter:1},8:{wolf:3,seer:1,witch:1,hunter:1},9:{wolf:3,seer:1,witch:1,hunter:1},
  10:{wolf:3,seer:1,witch:1,hunter:1,guard:1},11:{wolf:4,seer:1,witch:1,hunter:1,guard:1},12:{wolf:4,seer:1,witch:1,hunter:1,idiot:1}};
const WW_T={night:45000,witch:25000,hunter:20000,vote:30000};
const wwNo=s=>(s+1)+' 號';
function wwCfgFix(c){const r={};WW_KEYS.forEach(k=>r[k]=Math.max(0,c&&c.roles?(c.roles[k]|0):0));return{n:c.n,roles:r,win:c.win==='all'?'all':'side',speak:[30,60,90,120].includes(c.speak)?c.speak:60};}
function wwCfgFor(n){return wwCfgFix({n,roles:WW_PRESET[n]||{wolf:2,seer:1,witch:1}});}
function wwVil(cfg){return cfg.n-WW_KEYS.reduce((a,k)=>a+(cfg.roles[k]|0),0);}
function wwWolfN(cfg){return WW_WOLVES.reduce((a,k)=>a+(cfg.roles[k]|0),0);}
function wwCfgErr(cfg){
  if(!(cfg.n>=5&&cfg.n<=12))return'人數要在 5～12 人';
  const w=wwWolfN(cfg),killers=w-(cfg.roles.hiddenWolf|0);if(killers<1)return'至少要 1 隻會殺人的狼（狼人、狼王或白狼王）';if(wwVil(cfg)<0)return'身份比人數還多';
  if(w*2>=cfg.n)return'狼人陣營太多了（要少於一半）';if(cfg.n-w<2)return'好人至少要 2 位';return null;}
function wwMsg(st,to,txt,seat){st.msgs.push({id:++st.mid,to,seat:seat==null?-1:seat,txt:String(txt),day:st.day});
  if(st.msgs.length>400)st.msgs.splice(0,st.msgs.length-400);}
const wwSide=(st,s)=>WW_ROLES[st.roles[s]].side;
const wwIsWolf=(st,s)=>wwSide(st,s)==='wolf';
// 會參與殺人的狼（隱狼要等其他狼都出局）
function wwKiller(st,s){const r=st.roles[s];if(r==='hiddenWolf')return!st.roles.some((x,i)=>st.alive[i]&&x!=='hiddenWolf'&&WW_ROLES[x].side==='wolf');return wwIsWolf(st,s);}
const wwAliveOf=(st,f)=>st.roles.map((r,i)=>i).filter(i=>st.alive[i]&&(!f||f(i)));
function wwSeatOf(st,role){return st.roles.indexOf(role);}
function wwNew(cfg,ai,now){
  cfg=wwCfgFix(cfg);const deck=[];WW_KEYS.forEach(k=>{for(let i=0;i<(cfg.roles[k]|0);i++)deck.push(k);});while(deck.length<cfg.n)deck.push('villager');
  for(let i=deck.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[deck[i],deck[j]]=[deck[j],deck[i]];}
  const st={g:'ww',n:cfg.n,cfg,roles:deck,alive:Array(cfg.n).fill(true),ai:ai.slice(),day:1,phase:'',dl:0,
    witchSave:true,witchPoison:true,guardLast:-1,seerRes:{},idiotUp:[],knightUsed:false,crowMark:-1,lastOut:-1,msgs:[],mid:0,over:null,seq:0,aiAt:{},q:[],cur:-1,order:[],si:0,votes:{},night:null};
  wwMsg(st,'all',`遊戲開始，共 ${cfg.n} 人：`+wwCfgText(cfg)+'。');
  st.roles.forEach((r,i)=>{wwMsg(st,i,`你是 ${wwNo(i)}，身份是「${WW_ROLES[r].n}」：${WW_ROLES[r].tip}。`);});
  const ks=wwAliveOf(st,i=>wwKiller(st,i));wwMsg(st,'wolf',`狼隊友：${ks.map(i=>wwNo(i)+(st.roles[i]!=='wolf'?`（${WW_ROLES[st.roles[i]].n}）`:'')).join('、')}。晚上可以在這裡和隊友討論。`);
  wwNight(st,now);return st;}
function wwCfgText(cfg){const p=WW_KEYS.filter(k=>cfg.roles[k]).map(k=>`${WW_ROLES[k].n}×${cfg.roles[k]}`);const v=wwVil(cfg);if(v)p.push(`平民×${v}`);
  return p.join('、')+`（${cfg.win==='all'?'屠城':'屠邊'}）`;}
function wwPhase(st,ph,now,ms){st.phase=ph;st.dl=now+(ms||0);st.aiAt={};st.seq++;}
function wwNight(st,now){
  if(st.phase)st.day++;
  st.night={wolf:{},acted:{},kill:-1,saved:-1,poison:-1,guard:undefined,crow:-1};
  wwPhase(st,'night',now,WW_T.night);wwMsg(st,'all',`第 ${st.day} 夜，天黑請閉眼。`);
  const gk=wwSeatOf(st,'gravekeeper');
  if(gk>=0&&st.alive[gk]&&st.lastOut>=0){wwMsg(st,gk,`守墓人：昨天被投票出局的 ${wwNo(st.lastOut)} 是${wwIsWolf(st,st.lastOut)?'狼人':'好人'}。`);}
  st.lastOut=-1;
  if(wwNightDone(st))wwToWitch(st,now);}
// 晚上需要行動的人
function wwNightNeed(st){const need=wwAliveOf(st,i=>wwKiller(st,i));
  ['seer','guard','crow'].forEach(r=>{const s=wwSeatOf(st,r);if(s>=0&&st.alive[s])need.push(s);});return need;}
function wwNightDone(st){return wwNightNeed(st).every(s=>st.night.acted[s]);}
function wwWolfKill(st){const v={};Object.values(st.night.wolf).forEach(t=>{v[t]=(v[t]||0)+1;});let bn=0,ties=[];
  for(const k in v){if(v[k]>bn){bn=v[k];ties=[+k];}else if(v[k]===bn)ties.push(+k);}
  return ties.length?ties[Math.floor(Math.random()*ties.length)]:-1;}
function wwToWitch(st,now){
  st.night.kill=wwWolfKill(st);const ws=wwSeatOf(st,'witch');
  // 女巫不在、或兩瓶藥都用完：直接天亮
  if(ws<0||!st.alive[ws]||(!st.witchSave&&!st.witchPoison)){wwDawn(st,now);return;}
  wwPhase(st,'witch',now,WW_T.witch);}
function wwShooter(st,s){return st.roles[s]==='hunter'||st.roles[s]==='wolfKing';}
function wwDawn(st,now){
  const n=st.night,deaths=[];const k=n.kill;
  if(k>=0){const g=n.guard===k,s=n.saved===k;if(g===s)deaths.push(k);}   // 同守同救也會死
  if(n.poison>=0&&!deaths.includes(n.poison))deaths.push(n.poison);
  deaths.sort((a,b)=>a-b);deaths.forEach(d=>st.alive[d]=false);st.guardLast=n.guard===undefined?-1:n.guard;
  wwMsg(st,'all',deaths.length?`天亮了。昨晚 ${deaths.map(wwNo).join('、')} 死亡。`:'天亮了。昨晚是平安夜，沒有人死亡。');
  st.crowMark=n.crow>=0&&st.alive[n.crow]?n.crow:-1;
  if(st.crowMark>=0)wwMsg(st,'all',`烏鴉詛咒了 ${wwNo(st.crowMark)}，今天投票時他多算一票。`);
  const bear=wwSeatOf(st,'bear');
  if(bear>=0&&st.alive[bear]){const nb=[];for(const d of[-1,1]){for(let k2=1;k2<st.n;k2++){const s=(bear+d*k2+st.n)%st.n;if(s===bear)break;if(st.alive[s]){nb.push(s);break;}}}
    wwMsg(st,'all',nb.some(s=>wwIsWolf(st,s))?'🐻 熊咆哮了！（熊左右最近的活人裡有狼）':'🐻 熊很安靜，沒有咆哮。');}
  st.lastDeaths=deaths;st.q=[];
  deaths.forEach(d=>{if(st.day===1)st.q.push({ph:'last',s:d});if(wwShooter(st,d)&&d!==n.poison)st.q.push({ph:'hunter',s:d});});
  st.q.push({ph:'speak'});st.q.push({ph:'vote'});
  if(wwCheck(st,now))return;wwNext(st,now);}
function wwNext(st,now){
  if(st.over)return;const it=st.q.shift();if(!it){wwNight(st,now);return;}
  if(it.ph==='last'){st.cur=it.s;wwPhase(st,'last',now,st.cfg.speak*1000);wwMsg(st,'all',`請 ${wwNo(it.s)} 發表遺言。`);return;}
  if(it.ph==='hunter'){st.cur=it.s;wwPhase(st,'hunter',now,WW_T.hunter);wwMsg(st,'all',`${wwNo(it.s)} 是${WW_ROLES[st.roles[it.s]].n}，可以選擇開槍帶走一位玩家。`);return;}
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
  const crow=st.crowMark;const cnt=t=>(by[t]?by[t].length:0)+(t===crow?1:0);
  const cand=new Set(Object.keys(by).map(Number));if(crow>=0&&st.alive[crow])cand.add(crow);
  const rows=[...cand].sort((a,b)=>cnt(b)-cnt(a)||a-b);
  wwMsg(st,'all','投票結果：'+(rows.length?rows.map(t=>`${wwNo(t)} ${cnt(t)} 票（${[...(by[t]||[]).map(s=>s+1),...(t===crow?['烏鴉']:[])].join('、')}）`).join('；'):'沒有人投票')+(ab.length?`；棄票：${ab.map(s=>s+1).join('、')}`:'')+'。');
  st.crowMark=-1;st.q=[];
  if(!rows.length||(rows.length>1&&cnt(rows[0])===cnt(rows[1]))){wwMsg(st,'all',rows.length?'平票，這輪沒有人出局。':'沒有人出局。');wwNight(st,now);return;}
  const out=rows[0];
  if(st.roles[out]==='idiot'&&!st.idiotUp.includes(out)){st.idiotUp.push(out);wwMsg(st,'all',`${wwNo(out)} 翻牌是白痴，不會出局，但之後不能投票。`);wwNight(st,now);return;}
  st.alive[out]=false;st.lastOut=out;wwMsg(st,'all',`${wwNo(out)} 被投票出局。`);
  if(wwCheck(st,now))return;
  st.q.push({ph:'last',s:out});if(wwShooter(st,out))st.q.push({ph:'hunter',s:out});wwNext(st,now);}
function wwCheck(st,now){
  const al=wwAliveOf(st),w=al.filter(i=>wwIsWolf(st,i)).length,g=al.filter(i=>wwSide(st,i)==='god').length,v=al.filter(i=>wwSide(st,i)==='vil').length;
  const G=st.roles.filter(r=>WW_ROLES[r].side==='god').length,V=st.roles.filter(r=>r==='villager').length;
  let win=null;if(!w)win='good';
  else if(st.cfg.win==='all'){if(!g&&!v)win='wolf';}
  else if((G&&!g)||(V&&!v)||(!g&&!v))win='wolf';
  if(!win)return false;
  st.over={win,why:win==='good'?'狼人陣營全部出局':(st.cfg.win==='all'||(!g&&!v)?'好人全部出局':(G&&!g?'神職全部出局':'平民全部出局'))};
  wwPhase(st,'over',now,0);
  wwMsg(st,'all',`遊戲結束：${win==='good'?'好人陣營':'狼人陣營'}獲勝（${st.over.why}）。身份：`+st.roles.map((r,i)=>`${i+1} 號${WW_ROLES[r].n}`).join('、')+'。');
  return true;}
// 白天打斷發言（騎士決鬥、白狼王自爆）之後：處理開槍，再直接入夜
function wwDayBreak(st,now,dead){st.q=[];dead.forEach(d=>{if(wwShooter(st,d))st.q.push({ph:'hunter',s:d});});
  if(wwCheck(st,now))return;wwNext(st,now);}
// 動作：回傳錯誤訊息，成功回傳 null
function wwAct(st,seat,a,now){
  if(!a||typeof a!=='object')return'動作格式錯誤';const ok=t=>Number.isInteger(t)&&t>=0&&t<st.n;const r=st.roles[seat];
  if(a.type==='say'){const txt=String(a.txt||'').replace(/\s+/g,' ').trim().slice(0,200);if(!txt)return'請輸入內容';
    if(st.phase==='over'){wwMsg(st,'all',txt,seat);st.seq++;return null;}
    if(st.phase==='night'&&wwKiller(st,seat)&&st.alive[seat]){wwMsg(st,'wolf',txt,seat);st.seq++;return null;}
    if((st.phase==='speak'||st.phase==='last')&&st.cur===seat){wwMsg(st,'all',txt,seat);st.seq++;return null;}
    return st.phase==='night'?'天黑了，請閉眼（只有狼人能在狼隊頻道說話）':'還沒輪到你發言';}
  if(st.over)return'遊戲已經結束';
  if(a.type==='night'){if(st.phase!=='night')return'現在不是晚上行動的時間';if(!st.alive[seat])return'你已經出局';const t=a.t;
    if(wwKiller(st,seat)){if(t!==-1&&!(ok(t)&&st.alive[t]))return'請選一位活著的玩家';if(t===-1)delete st.night.wolf[seat];else st.night.wolf[seat]=t;st.night.acted[seat]=true;
      wwMsg(st,'wolf',t===-1?`${wwNo(seat)} 選擇空刀。`:`${wwNo(seat)} 選擇殺 ${wwNo(t)}。`);}
    else if(r==='seer'){if(st.night.acted[seat])return'今晚已經查驗過了';if(!(ok(t)&&st.alive[t]&&t!==seat))return'請選一位其他活著的玩家';
      const bad=wwIsWolf(st,t)&&st.roles[t]!=='hiddenWolf';st.night.acted[seat]=true;st.seerRes[t]=bad;wwMsg(st,seat,`查驗結果：${wwNo(t)} 是${bad?'狼人':'好人'}。`);}
    else if(r==='guard'){if(st.night.acted[seat])return'今晚已經守護過了';if(t!==-1&&!(ok(t)&&st.alive[t]))return'請選一位活著的玩家';if(t!==-1&&t===st.guardLast)return'不能連續兩晚守同一個人';
      st.night.guard=t===-1?undefined:t;st.night.acted[seat]=true;wwMsg(st,seat,t===-1?'今晚你不守護任何人。':`今晚你守護 ${wwNo(t)}。`);}
    else if(r==='crow'){if(st.night.acted[seat])return'今晚已經詛咒過了';if(t!==-1&&!(ok(t)&&st.alive[t]&&t!==seat))return'請選一位其他活著的玩家';
      st.night.crow=t;st.night.acted[seat]=true;wwMsg(st,seat,t===-1?'今晚你不詛咒任何人。':`今晚你詛咒 ${wwNo(t)}，明天投票他多一票。`);}
    else return'你的身份晚上沒有行動';
    st.seq++;if(wwNightDone(st))wwToWitch(st,now);return null;}
  if(a.type==='witch'){if(st.phase!=='witch'||r!=='witch'||!st.alive[seat])return'現在不是女巫行動的時間';
    if(a.use==='save'){if(!st.witchSave)return'解藥已經用掉了';const k=st.night.kill;if(k<0)return'今晚沒有人被殺';
      st.witchSave=false;st.night.saved=k;wwMsg(st,seat,k===seat?'你用解藥救了自己。':`你用解藥救了 ${wwNo(k)}。`);}
    else if(a.use==='poison'){if(!st.witchPoison)return'毒藥已經用掉了';const t=a.t;if(!(ok(t)&&st.alive[t]&&t!==seat))return'請選一位其他活著的玩家';
      st.witchPoison=false;st.night.poison=t;wwMsg(st,seat,`你對 ${wwNo(t)} 用了毒藥。`);}
    else wwMsg(st,seat,'今晚你沒有用藥。');
    wwDawn(st,now);return null;}
  if(a.type==='hunter'){if(st.phase!=='hunter'||st.cur!==seat)return'現在不能開槍';const t=a.t;
    if(t===-1){wwMsg(st,'all',`${wwNo(seat)} 選擇不開槍。`);}
    else{if(!(ok(t)&&st.alive[t]&&t!==seat))return'請選一位活著的玩家';st.alive[t]=false;wwMsg(st,'all',`${WW_ROLES[r].n} ${wwNo(seat)} 開槍帶走了 ${wwNo(t)}。`);
      if(wwCheck(st,now))return null;if(wwShooter(st,t))st.q.unshift({ph:'hunter',s:t});}
    wwNext(st,now);return null;}
  if(a.type==='duel'){if(st.phase!=='speak')return'只能在白天發言階段決鬥';if(r!=='knight'||!st.alive[seat])return'只有騎士能決鬥';if(st.knightUsed)return'決鬥已經用過了';
    const t=a.t;if(!(ok(t)&&st.alive[t]&&t!==seat))return'請選一位其他活著的玩家';st.knightUsed=true;
    if(wwIsWolf(st,t)){st.alive[t]=false;wwMsg(st,'all',`⚔️ 騎士 ${wwNo(seat)} 和 ${wwNo(t)} 決鬥：${wwNo(t)} 是狼人，出局！今天直接進入黑夜。`);wwDayBreak(st,now,[t]);return null;}
    st.alive[seat]=false;wwMsg(st,'all',`⚔️ 騎士 ${wwNo(seat)} 和 ${wwNo(t)} 決鬥：${wwNo(t)} 是好人，騎士以死謝罪。`);
    if(wwCheck(st,now))return null;if(st.cur===seat)wwEndSpeak(st,now);else st.seq++;return null;}
  if(a.type==='boom'){if(st.phase!=='speak')return'只能在白天發言階段自爆';if(r!=='whiteWolf'||!st.alive[seat])return'只有白狼王能自爆';
    const t=a.t;if(!(ok(t)&&st.alive[t]&&t!==seat))return'請選一位其他活著的玩家';
    st.alive[seat]=false;st.alive[t]=false;wwMsg(st,'all',`💥 ${wwNo(seat)} 是白狼王，自爆並帶走了 ${wwNo(t)}！今天直接進入黑夜。`);wwDayBreak(st,now,[t]);return null;}
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
  if(ph==='night'){wwToWitch(st,now);return true;}
  if(ph==='witch'){wwMsg(st,wwSeatOf(st,'witch'),'時間到，今晚你沒有用藥。');wwDawn(st,now);return true;}
  if(ph==='hunter'){wwMsg(st,'all',`${wwNo(st.cur)} 時間到，沒有開槍。`);wwNext(st,now);return true;}
  if(ph==='speak'||ph==='last'){wwMsg(st,'all',`${wwNo(st.cur)} 發言時間到。`);wwEndSpeak(st,now);return true;}
  if(ph==='vote'){wwTally(st,now);return true;}
  return false;}
// 電腦玩家
const wwPick=a=>a[Math.floor(Math.random()*a.length)];
function wwHumanWolfPick(st){const hum=wwAliveOf(st,i=>wwKiller(st,i)&&!st.ai[i]);for(const i of hum)if(st.night.wolf[i]!=null)return st.night.wolf[i];return null;}
function wwAIAct(st,s,now){
  const al=wwAliveOf(st),others=al.filter(i=>i!==s),r=st.roles[s],good=others.filter(i=>!wwIsWolf(st,i));
  if(st.phase==='night'){
    if(wwKiller(st,s)){const hp=wwHumanWolfPick(st);const t=hp!=null?hp:(Object.values(st.night.wolf)[0]??(good.length?wwPick(good):-1));return{type:'night',t};}
    if(r==='seer'){const c=others.filter(i=>!(i in st.seerRes));return{type:'night',t:wwPick(c.length?c:others)};}
    if(r==='guard'){const c=al.filter(i=>i!==st.guardLast);return{type:'night',t:c.length?wwPick(c):-1};}
    if(r==='crow')return{type:'night',t:others.length?wwPick(others):-1};
    return null;}
  if(st.phase==='witch'){const k=st.night.kill;
    if(st.witchSave&&k>=0&&(st.day===1||Math.random()<.5))return{type:'witch',use:'save'};
    if(st.witchPoison&&st.day>1&&Math.random()<.12&&others.length)return{type:'witch',use:'poison',t:wwPick(others)};
    return{type:'witch',use:'none'};}
  if(st.phase==='hunter'){const c=wwIsWolf(st,s)?good:others;return{type:'hunter',t:Math.random()<.75&&c.length?wwPick(c):-1};}
  if(st.phase==='speak'||st.phase==='last')return{type:'endSpeak',say:'過。'};
  if(st.phase==='vote'){const c=others;
    if(wwIsWolf(st,s))return{type:'vote',t:good.length?wwPick(good):-1};
    if(r==='seer'){const k=c.filter(i=>st.seerRes[i]);if(k.length)return{type:'vote',t:k[0]};}
    // 跟著目前票最多的人投，沒有就隨機
    const tally={};Object.values(st.votes).forEach(t=>{if(t>=0&&t!==s)tally[t]=(tally[t]||0)+1;});const top=Object.keys(tally).sort((a,b)=>tally[b]-tally[a])[0];
    if(top!=null&&Math.random()<.55)return{type:'vote',t:+top};
    return{type:'vote',t:Math.random()<.15||!c.length?-1:wwPick(c)};}
  return null;}
// 哪些電腦玩家現在要行動
function wwAINeed(st){const ai=i=>st.ai[i],out=[];
  if(st.phase==='night'){wwNightNeed(st).forEach(s=>{if(ai(s)&&!st.night.acted[s])out.push(s);});}
  else if(st.phase==='witch'){const w=wwSeatOf(st,'witch');if(w>=0&&ai(w)&&st.alive[w])out.push(w);}
  else if(st.phase==='hunter'||st.phase==='speak'||st.phase==='last'){if(ai(st.cur))out.push(st.cur);}
  else if(st.phase==='vote')wwVoters(st).forEach(s=>{if(ai(s)&&!(s in st.votes))out.push(s);});
  return out;}
// 電腦操作 5～10 秒；發言「過」比較快
const wwAIDelay=ph=>ph==='speak'||ph==='last'?1100+Math.random()*900:5000+Math.random()*5000;
// 每隔一段時間呼叫：處理時間到與電腦玩家，有變化回傳 true
function wwTick(st,now){
  if(!st||st.over)return false;const seq=st.seq,ph=st.phase,dl0=st.dl;
  // 電腦狼人跟著真人狼隊友改目標
  if(ph==='night'){const hp=wwHumanWolfPick(st);if(hp!=null)wwAliveOf(st,i=>wwKiller(st,i)&&st.ai[i]&&st.night.acted[i]).forEach(i=>{if(st.night.wolf[i]!==hp)st.night.wolf[i]=hp;});}
  for(const s of wwAINeed(st)){
    if(st.aiAt[s]==null){st.aiAt[s]=now+wwAIDelay(st.phase);continue;}
    if(now<st.aiAt[s])continue;
    const a=wwAIAct(st,s,now);if(!a)continue;
    if(a.say){wwMsg(st,'all',a.say,s);}
    const e=wwAct(st,s,a,now);if(e&&a.type==='witch')wwAct(st,s,{type:'witch',use:'none'},now);
    if(st.phase!==ph||st.dl!==dl0)break;}
  if(now>=st.dl&&st.phase===ph&&st.dl===dl0)wwTimeout(st,now);
  return st.seq!==seq||st.phase!==ph;}
// 每個人看得到的資料
function wwView(st,seat,now){
  const r=st.roles[seat],killer=wwKiller(st,seat),ph=st.phase,end=!!st.over;
  return{g:'ww',seq:st.seq,mid:st.mid,me:seat,n:st.n,cfg:st.cfg,phase:ph,day:st.day,dl:Math.max(0,st.dl-now),alive:st.alive.slice(),cur:st.cur,order:ph==='speak'?st.order:null,
    role:r,killer,wolves:killer||end?st.roles.map((x,i)=>wwKiller(st,i)||(end&&wwIsWolf(st,i))?i:-1).filter(i=>i>=0):null,seerRes:r==='seer'?st.seerRes:null,
    witch:r==='witch'?{save:st.witchSave,poison:st.witchPoison,kill:ph==='witch'&&st.alive[seat]&&st.witchSave?st.night.kill:null}:null,
    guardLast:r==='guard'?st.guardLast:null,knightOk:r==='knight'&&!st.knightUsed,crowMark:st.crowMark,
    acted:ph==='night'?!!st.night.acted[seat]:ph==='vote'?(seat in st.votes):false,myVote:ph==='vote'&&seat in st.votes?st.votes[seat]:null,
    voted:ph==='vote'?Object.keys(st.votes).map(Number):null,canVote:ph==='vote'&&wwVoters(st).includes(seat),
    wolfPicks:killer&&ph==='night'?st.night.wolf:null,idiotUp:st.idiotUp.slice(),over:st.over,roles:end?st.roles.slice():null,ai:st.ai.slice(),
    msgs:st.msgs.filter(m=>m.to==='all'||m.to===seat||(m.to==='wolf'&&(killer||end))).slice(-160)};}

if(typeof module!=='undefined')module.exports={wwNew,wwAct,wwTick,wwView,wwCfgFor,wwCfgErr,wwVil,WW_ROLES,wwCfgFix};
