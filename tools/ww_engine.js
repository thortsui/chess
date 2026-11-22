/* ===== 狼人殺：規則引擎（遊戲自動當法官）＋電腦玩家。全部在房主（或單機）端運算 ===== */
// 座位 0..n-1，畫面上顯示成 1..n 號。時間都用房主的時鐘（毫秒）
const WW_ROLES={
  wolf:{n:'狼人',side:'wolf',ic:'🐺',tip:'每晚和狼隊友選一位玩家殺掉'},
  wolfKing:{n:'狼王',side:'wolf',ic:'👑',tip:'狼人之一；出局時可以開槍帶走一人（被毒死不能）'},
  whiteWolf:{n:'白狼王',side:'wolf',ic:'💥',tip:'狼人之一；白天發言階段可以自爆並帶走一人，直接進入黑夜'},
  hiddenWolf:{n:'隱狼',side:'wolf',ic:'🥷',tip:'狼人陣營，知道狼隊友是誰（隊友不知道他）、不參與殺人、看不到狼隊頻道，預言家查驗是好人；其他狼都出局後才能殺人'},
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
function wwCfgFix(c){const r={};WW_KEYS.forEach(k=>r[k]=Math.max(0,c&&c.roles?(c.roles[k]|0):0));return{n:c.n,roles:r,win:c.win==='all'||c.win==='side'?c.win:'num',speak:[30,60,90,120].includes(c.speak)?c.speak:60};}
function wwCfgFor(n){return wwCfgFix({n,roles:WW_PRESET[n]||{wolf:2,seer:1,witch:1}});}
function wwVil(cfg){return cfg.n-WW_KEYS.reduce((a,k)=>a+(cfg.roles[k]|0),0);}
function wwWolfN(cfg){return WW_WOLVES.reduce((a,k)=>a+(cfg.roles[k]|0),0);}
function wwCfgErr(cfg){
  if(!(cfg.n>=5&&cfg.n<=12))return'人數要在 5～12 人';
  const w=wwWolfN(cfg),killers=w-(cfg.roles.hiddenWolf|0);if(killers<1)return'至少要 1 隻會殺人的狼（狼人、狼王或白狼王）';if(wwVil(cfg)<0)return'身份比人數還多';
  if(w*2>=cfg.n)return'狼人陣營太多了（要少於一半）';if(cfg.n-w<2)return'好人至少要 2 位';return null;}
function wwMsg(st,to,txt,seat){st.msgs.push({id:++st.mid,to,seat:seat==null?-1:seat,txt:String(txt),day:st.day});
  if(seat>=0&&to==='all'&&(st.phase==='speak'||st.phase==='last'))wwPubNote(st,seat,String(txt));
  if(st.msgs.length>3000)st.msgs.splice(0,st.msgs.length-3000);}   // 0.27.3 起整局都留著（原本只留 400 則，長局前面的發言會被忘掉）
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
    witchSave:true,witchPoison:true,guardLast:-1,seerRes:{},idiotUp:[],knightUsed:false,crowMark:-1,lastOut:-1,msgs:[],mid:0,over:null,seq:0,aiAt:{},q:[],cur:-1,order:[],si:0,votes:{},night:null,pend:-1,blow:null,nd:[],pub:{seer:{},rep:{}}};
  wwMsg(st,'all',`遊戲開始，共 ${cfg.n} 人：`+wwCfgText(cfg)+'。');
  st.roles.forEach((r,i)=>{wwMsg(st,i,`你是 ${wwNo(i)}，身份是「${WW_ROLES[r].n}」：${WW_ROLES[r].tip}。`);});
  const ks=wwAliveOf(st,i=>wwKiller(st,i));wwMsg(st,'wolf',`狼隊友：${ks.map(i=>wwNo(i)+(st.roles[i]!=='wolf'?`（${WW_ROLES[st.roles[i]].n}）`:'')).join('、')}。晚上可以在這裡和隊友討論。`);
  // 隱狼知道狼隊友是誰（0.26.4 起），但隊友不知道他、他也看不到狼隊頻道
  st.roles.forEach((r,i)=>{if(r==='hiddenWolf')wwMsg(st,i,`你的狼隊友：${ks.map(wwNo).join('、')}。他們不知道你是隱狼；你看不到狼隊頻道，晚上不參與殺人。`);});
  wwTalkInit(st);wwNight(st,now);return st;}
function wwCfgText(cfg){const p=WW_KEYS.filter(k=>cfg.roles[k]).map(k=>`${WW_ROLES[k].n}×${cfg.roles[k]}`);const v=wwVil(cfg);if(v)p.push(`平民×${v}`);
  return p.join('、')+`（${WW_WIN[cfg.win]||WW_WIN.num}）`;}
// 勝利條件：num＝比人數（狼人數追平或超過好人數，狼人贏；0.25.0 起的預設）、side＝屠邊、all＝屠城
const WW_WIN={num:'比人數',side:'屠邊',all:'屠城'};
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
  // 結算順序：狼刀在先、毒在後。被刀和被毒的都死了：被毒的人先記在 st.pend（判勝負時暫時當他還在），狼刀這一步判完才算他
  st.blow=null;st.pend=deaths.length===2?n.poison:-1;st.nd=(st.nd||[]).concat(deaths);
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
  st.alive[out]=false;st.lastOut=out;st.blow=null;wwMsg(st,'all',`${wwNo(out)} 被投票出局。`);
  st.q.push({ph:'last',s:out});if(wwShooter(st,out))st.q.push({ph:'hunter',s:out});
  if(wwCheck(st,now))return;wwNext(st,now);}
// ===== 勝負判定（0.25.0 重寫）=====
// 【怎麼判】wwJudge：
//   好人贏＝狼人陣營（含隱狼）全部出局。
//   狼人贏＝比人數（預設）：還活著的狼人數追平或超過還活著的好人數（平民＋神職）；
//          屠邊：這局有神職而神職全滅，或有平民而平民全滅；屠城：好人全滅。
//   同一步裡兩邊同時達成（只有開槍、自爆才做得到，例如狼王是最後一隻狼、倒下時開槍帶走最後一個平民）：最後出手的那一方贏（st.blow）。
// 【什麼時候判】wwCheck：每一步死亡（天亮的狼刀、毒、投票出局、決鬥、自爆、開槍）都要等它引發的開槍全部開完才判——
//   還有人等著開槍就先不判（回傳 false），開完槍、放棄開槍或時間到都會再判一次。所以獵人就算是最後一個神職，也能先開槍再分勝負。
//   夜裡狼刀在先、毒在後：同一晚被刀和被毒的都死了，先只算狼刀（被毒的人 st.pend 暫時當成還在場），狼刀這一步沒分出勝負才把毒算進去。
function wwJudge(st){
  const c={wolf:0,god:0,vil:0},all={wolf:0,god:0,vil:0};st.roles.forEach((r,i)=>{const sd=WW_ROLES[r].side;all[sd]++;if(st.alive[i]||i===st.pend)c[sd]++;});
  const good=c.god+c.vil,wolfWhy=!good?'好人全部出局':st.cfg.win==='all'?null:st.cfg.win==='side'?(all.god&&!c.god?'神職全部出局':all.vil&&!c.vil?'平民全部出局':null)
    :c.wolf>=good?`狼人數追平好人（狼 ${c.wolf}：好人 ${good}）`:null;
  if(!c.wolf&&wolfWhy)return st.blow==='wolf'?{win:'wolf',both:true,why:wolfWhy+'；狼人也全部出局，但最後出手的是狼人陣營'}
    :{win:'good',both:true,why:'狼人陣營全部出局；'+wolfWhy.replace('全部','也全部')+'，但最後出手的是好人陣營'};
  if(!c.wolf)return{win:'good',why:'狼人陣營全部出局'};
  return wolfWhy?{win:'wolf',why:wolfWhy}:null;}
function wwCheck(st,now){
  if(st.over)return true;
  if(st.q.some(it=>it.ph==='hunter'))return false;   // 還有人要開槍：開完再判
  let r=wwJudge(st);
  if(st.pend>=0){const p=st.pend;st.pend=-1;   // 狼刀這一步判完，再把毒算進去
    if(!r)r=wwJudge(st);else if(r.win==='wolf'&&!wwAliveOf(st,i=>wwIsWolf(st,i)).length)r={win:'wolf',both:true,why:r.why+`；${wwNo(p)} 是最後一隻狼、同一晚被毒死，但狼刀在先`};}
  if(!r)return false;
  st.over={win:r.win,why:r.why};if(r.both)st.over.both=true;
  wwPhase(st,'over',now,0);
  wwMsg(st,'all',`遊戲結束：${r.win==='good'?'好人陣營':'狼人陣營'}獲勝（${r.why}）。身份：`+st.roles.map((x,i)=>`${i+1} 號${WW_ROLES[x].n}${x==='hiddenWolf'?'（狼人陣營，預言家查不出來）':''}`).join('、')+'。');
  // 預言家查過隱狼（看到的是好人）：私下提醒他這是隱狼的特性，不是查錯
  const se=wwSeatOf(st,'seer');if(se>=0)st.roles.forEach((x,i)=>{if(x==='hiddenWolf'&&st.seerRes[i]===false)wwMsg(st,se,`你查驗過的 ${wwNo(i)} 是隱狼：隱狼屬於狼人陣營，但預言家查驗一律顯示好人。`);});
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
    else{if(!(ok(t)&&st.alive[t]&&t!==seat))return'請選一位活著的玩家';st.alive[t]=false;st.blow=wwIsWolf(st,seat)?'wolf':'good';wwMsg(st,'all',`${WW_ROLES[r].n} ${wwNo(seat)} 開槍帶走了 ${wwNo(t)}。`);
      if(wwShooter(st,t))st.q.unshift({ph:'hunter',s:t});}   // 被帶走的也是獵人／狼王：他也能開槍，全部開完才判勝負
    if(!wwCheck(st,now))wwNext(st,now);return null;}
  if(a.type==='duel'){if(st.phase!=='speak')return'只能在白天發言階段決鬥';if(r!=='knight'||!st.alive[seat])return'只有騎士能決鬥';if(st.knightUsed)return'決鬥已經用過了';
    const t=a.t;if(!(ok(t)&&st.alive[t]&&t!==seat))return'請選一位其他活著的玩家';st.knightUsed=true;st.blow=null;
    if(wwIsWolf(st,t)){st.alive[t]=false;wwMsg(st,'all',`⚔️ 騎士 ${wwNo(seat)} 和 ${wwNo(t)} 決鬥：${wwNo(t)} 是狼人，出局！今天直接進入黑夜。`);wwDayBreak(st,now,[t]);return null;}
    st.alive[seat]=false;wwMsg(st,'all',`⚔️ 騎士 ${wwNo(seat)} 和 ${wwNo(t)} 決鬥：${wwNo(t)} 是好人，騎士以死謝罪。`);
    if(wwCheck(st,now))return null;if(st.cur===seat)wwEndSpeak(st,now);else st.seq++;return null;}
  if(a.type==='boom'){if(st.phase!=='speak')return'只能在白天發言階段自爆';if(r!=='whiteWolf'||!st.alive[seat])return'只有白狼王能自爆';
    const t=a.t;if(!(ok(t)&&st.alive[t]&&t!==seat))return'請選一位其他活著的玩家';
    st.alive[seat]=false;st.alive[t]=false;st.blow='wolf';wwMsg(st,'all',`💥 ${wwNo(seat)} 是白狼王，自爆並帶走了 ${wwNo(t)}！今天直接進入黑夜。`);wwDayBreak(st,now,[t]);return null;}
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
  if(ph==='hunter'){wwMsg(st,'all',`${wwNo(st.cur)} 時間到，沒有開槍。`);if(!wwCheck(st,now))wwNext(st,now);return true;}

  if(ph==='speak'||ph==='last'){wwMsg(st,'all',`${wwNo(st.cur)} 發言時間到。`);wwEndSpeak(st,now);return true;}
  if(ph==='vote'){wwTally(st,now);return true;}
  return false;}
// 電腦玩家
const wwPick=a=>a[Math.floor(Math.random()*a.length)];
function wwHumanWolfPick(st){const hum=wwAliveOf(st,i=>wwKiller(st,i)&&!st.ai[i]);for(const i of hum)if(st.night.wolf[i]!=null)return st.night.wolf[i];return null;}
// ===== 公開資訊：誰跳了預言家、報了什麼查驗、說自己是什麼身份（0.25.0 起；0.26.0 加身份宣稱）=====
// 只記公開發言（電腦和真人說的都算），不看任何人的真實身份
const WW_AI={trust1:.95,poison:1,knifeSeer:.6,blind:.35,jump:.3,wagon:.8};   // 只有一個人跳預言家時相信他的機率／女巫毒「高度懷疑」的人的機率／狼優先刀預言家的機率／沒把握時還是投最可疑的人的機率（其餘棄票）／開局有狼悍跳的機率／自己沒把握時跟著今天被點名最多的人投的機率
const WW_SEER_RE=/我[^，。！？,.!?不沒]{0,6}(?:是|跳)(?:真的?|真正的)?預言家|我的(?:查殺|金水)|我(?:昨晚|首夜|昨天)?(?:查驗?|驗)了?\s*\d/;
const WW_VIL_RE=/我(?:就|只|真的|其實|也|確實|本來就)?是(?:個|一個|一般|普通的?|純|單純的?|小)?(?:平民|村民)/;
// 發言裡說自己是什麼身份（「我是女巫」「我其實是獵人」「我是平民」）：誰都可以偽裝，所以這只是「他說的」，不是真的
function wwClaimsOf(sp){const out=[];for(const m of String(sp).replace(/狼人殺/g,'＿').matchAll(WW_CLAIM_RE))if(!/狼/.test(m[1]))out.push(m[1]);if(WW_VIL_RE.test(sp))out.push('平民');return out;}
function wwPubNote(st,seat,txt){const P=st.pub=st.pub||{seer:{},rep:{}},R=P.rep[seat]=P.rep[seat]||{kill:[],gold:[]},cl=wwTalkClaims(txt);
  const ok=t=>t>=0&&t<st.n&&t!==seat;cl.kill.forEach(t=>{if(ok(t)&&!R.kill.includes(t))R.kill.push(t);});cl.gold.forEach(t=>{if(ok(t)&&!R.gold.includes(t)&&!R.kill.includes(t))R.gold.push(t);});
  if(P.seer[seat]==null&&WW_SEER_RE.test(txt))P.seer[seat]=st.day;
  const C=P.claim=P.claim||{};wwClaimsOf(txt).forEach(r=>{const a=C[seat]=C[seat]||[];if(!a.includes(r))a.push(r);});}
// 這位玩家相信哪個預言家：{trust:相信的人（-1＝都不信）, liars:[認定是假跳的…], kills:[他報的查殺…], golds:[他報的金水…]}
//   預言家本人只信自己（別人跳的都是假的）；查殺我的一定是假的（我知道自己是好人）；夜裡被殺的預言家是真的（狼不刀自己人）；
//   只有一個人跳：大多會信；兩個人對跳：各信一邊（被發金水的比較信他），信了一邊就認定另一邊是狼。選了哪邊記在 st.trust[自己]，別人看不到
function wwBelief(st,s){const P=st.pub||{seer:{},rep:{}},rep=c=>P.rep[c]||{kill:[],gold:[]},cs=Object.keys(P.seer).map(Number).filter(c=>c!==s);
  if(st.roles[s]==='seer'){const k=Object.keys(st.seerRes).map(Number);return{trust:s,liars:cs,kills:k.filter(i=>st.seerRes[i]),golds:k.filter(i=>!st.seerRes[i])};}
  const liars=[],cand=[];cs.forEach(c=>(rep(c).kill.includes(s)?liars:cand).push(c));
  const T=st.trust=st.trust||{},nd=cand.filter(x=>(st.nd||[]).includes(x));let c=-1;
  if(nd.length)c=nd[0];
  else if(T[s]&&T[s].key===cand.join())c=T[s].c;   // 跳的人沒變就維持原本的判斷；有新的人跳出來就重新選邊
  else if(cand.length===1)c=Math.random()<WW_AI.trust1?cand[0]:-1;
  else if(cand.length>1)c=wwPick(cand.flatMap(x=>rep(x).gold.includes(s)?[x,x]:[x]));
  T[s]={key:cand.join(),c};if(c>=0)cand.forEach(x=>{if(x!==c)liars.push(x);});
  return{trust:c,liars,kills:c>=0?rep(c).kill:[],golds:c>=0?rep(c).gold:[]};}

// ===== 每位電腦玩家自己的懷疑（0.26.0 起）=====
// 【記憶不互通】wwMind 只讀「這個人看得到的東西」：wwView 過濾後的訊息（公開發言、法官公告、只發給他的私訊——查驗結果、守墓人結果、女巫救了誰）、
//   自己的身份，以及只屬於他自己的 st.gut[自己]（第一印象）、st.trust[自己]（信哪個預言家）。不讀別人的身份、別人的查驗、別人的印象。
//   （tools/wwtest.js 有一個測試：把他不該知道的人的身份全部洗牌，算出來的懷疑必須一模一樣。）
// 【懷疑每個人】每個活著的人都有一個懷疑分數 sus：
//   第一印象（每人各自隨機，有人疑心重、有人疑心輕）
//   ＋確定的事（自己的查驗、守墓人結果、法官公開的身份：開槍的獵人／狼王、翻牌的白痴、自爆的白狼王、決鬥結果）
//   ＋相信的預言家報的查殺／金水、對跳的假預言家
//   ＋身份宣稱（誰都可以偽裝成別的職業，所以只當線索）：有人說他是「我的身份」＝一定在說謊；身份已經被法官公開了還有人說是他＝說謊；兩個人搶同一個神職＝至少一個說謊；前後說了兩種神職＝可疑
//   ＋行為：點名我（我知道自己是好人）、點名我相信的好人、替我懷疑的人講話、投票投給我相信的好人＝可疑；點名我懷疑的人＝稍微放心；被女巫救的人＝被狼刀過、大概是好人
//   分數 ≥4 是「高度懷疑」、≥1.5「中度」、其他「低」。投票、毒、開槍、查驗、詛咒都照這個分數。
const WW_MW={known:20,trust:6,kill:5,gold:3,liar:4,anyKill:1,myRole:6,revealed:5,dupe:1.5,twoGods:2,accMe:1.5,accGood:3,accBad:.8,defBad:1.5,voteGood:2.5,voteBad:.8,saved:3,nightAcc:.8,coVote:1.2};
const WW_DEF_RE=/不像狼|不是狼|不會是狼|是好人|像好人|沒什麼問題|沒問題|保一手|我保|站.{0,3}這邊|相信|先放著|別急著動/;
// 發言裡替誰講話（「3號不像狼」「我保5號」「相信7號」）
function wwDefends(sp){const out=[];for(const c of wwClauses(String(sp))){if(!WW_DEF_RE.test(c)||/查殺|投|出局|歸票/.test(c)||/狼(?![王隊人殺])/.test(c.replace(/不像狼|不是狼|不會是狼/g,'')))continue;
    for(const m of c.matchAll(/(\d{1,2})\s*號/g))out.push(+m[1]-1);}return out;}
// 第一印象：每個人對每個人各自隨機，疑心重的人起伏大
function wwGut(st,s){const G=st.gut=st.gut||{};if(!G[s]){const sd=.3+Math.random()*.9;G[s]=st.roles.map(()=>{let u=0;for(let k=0;k<3;k++)u+=Math.random()-.5;return u*sd*2;});}return G[s];}
const wwLv=x=>x>=4?'高':x>=1.5?'中':'低';
function wwMind(st,s){
  const v={msgs:wwSeen(st,s)},n=st.n,mine=WW_ROLES[st.roles[s]].n,W=WW_MW,known={},rev={},acc=[],def=[],votes=[],claims={},nightDead=[],saved=[];let vr=0;
  const sus=wwGut(st,s).slice();
  for(const m of v.msgs){const t=String(m.txt);let x;
    if(m.seat>=0){if(m.to!=='all'||m.seat===s)continue;
      new Set([...wwTalkStated(t),...wwTalkClaims(t).wolf]).forEach(k=>{if(k>=0&&k<n&&k!==m.seat)acc.push([m.seat,k]);});
      wwDefends(t).forEach(k=>{if(k>=0&&k<n&&k!==m.seat)def.push([m.seat,k]);});
      wwClaimsOf(t).forEach(r=>{const a=claims[m.seat]=claims[m.seat]||[];if(!a.includes(r))a.push(r);});continue;}
    if((x=/^查驗結果：(\d+) 號 是(狼人|好人)/.exec(t))||(x=/^守墓人：昨天被投票出局的 (\d+) 號 是(狼人|好人)/.exec(t)))known[x[1]-1]=x[2]==='狼人'?'wolf':'good';
    else if((x=/^(\d+) 號 是(.+?)，可以選擇開槍/.exec(t))){known[x[1]-1]=x[2]==='狼王'?'wolf':'good';rev[x[2]]=x[1]-1;}
    else if((x=/^(\d+) 號 翻牌是白痴/.exec(t))){known[x[1]-1]='good';rev['白痴']=x[1]-1;}
    else if((x=/^💥 (\d+) 號 是白狼王/.exec(t)))known[x[1]-1]='wolf';
    else if((x=/^⚔️ 騎士 (\d+) 號 和 (\d+) 號 決鬥：\d+ 號 是(狼人|好人)/.exec(t))){known[x[1]-1]='good';rev['騎士']=x[1]-1;known[x[2]-1]=x[3]==='狼人'?'wolf':'good';}
    else if((x=/^你用解藥救了 (\d+) 號/.exec(t)))saved.push(x[1]-1);
    else if((x=/^天亮了。昨晚 (.+) 死亡/.exec(t)))for(const y of x[1].matchAll(/(\d+) 號/g))nightDead.push(y[1]-1);
    else if(/^投票結果：/.test(t)){vr++;for(const y of t.matchAll(/(\d+) 號 \d+ 票（([^）]*)）/g))for(const z of y[2].split('、'))if(/^\d+$/.test(z))votes.push([+z-1,y[1]-1,vr]);}}
  // 確定的事、預言家、被救過的人
  for(const k in known)sus[k]+=known[k]==='wolf'?W.known:-W.known;
  const B=wwBelief(st,s);if(B.trust>=0&&B.trust!==s)sus[B.trust]-=W.trust;
  B.kills.forEach(k=>sus[k]+=W.kill);B.golds.forEach(k=>sus[k]-=W.gold);B.liars.forEach(k=>sus[k]+=W.liar);
  if(B.trust<0&&st.pub)for(const c in st.pub.seer)((st.pub.rep[c]||{}).kill||[]).forEach(k=>sus[k]+=W.anyKill);
  saved.forEach(k=>sus[k]-=W.saved);
  // 驗證預言家：他報的查殺後來被證實是好人、或金水被證實是狼＝假的；查殺被證實是狼＝真的
  if(st.pub)for(const c in st.pub.seer){if(+c===s)continue;const R=st.pub.rep[c]||{kill:[],gold:[]};
    if(R.kill.some(k=>known[k]==='good')||R.gold.some(k=>known[k]==='wolf'))sus[c]+=W.liar*2;else if(R.kill.some(k=>known[k]==='wolf'))sus[c]-=W.trust;}
  // 身份宣稱（預言家另外由 wwBelief 處理）
  const by={};for(const c in claims){const gods=claims[c].filter(r=>r!=='平民'&&r!=='預言家');gods.forEach(r=>(by[r]=by[r]||[]).push(+c));if(gods.length>1)sus[c]+=W.twoGods;}
  for(const r in by){const cs=by[r];
    cs.forEach(c=>{if(r===mine)sus[c]+=W.myRole;else if(rev[r]!=null&&rev[r]!==c)sus[c]+=W.revealed;else if(cs.length>1)sus[c]+=W.dupe;});
    if(!st.cfg.roles[Object.keys(WW_ROLES).find(k=>WW_ROLES[k].n===r)])cs.forEach(c=>sus[c]+=W.revealed);}   // 這局根本沒有這個身份
  // 行為：拿上面的結果當基準，看每個人點名、護航、投票的對象
  const base=sus.slice(),isGood=k=>k===s?!wwIsWolf(st,s):base[k]<=-2.5,isBad=k=>k!==s&&base[k]>=3;
  acc.forEach(([a,t])=>{if(t===s)sus[a]+=W.accMe;else if(isGood(t))sus[a]+=W.accGood;else if(isBad(t))sus[a]-=W.accBad;});
  def.forEach(([d,t])=>{if(isBad(t))sus[d]+=W.defBad;});
  votes.forEach(([a,t])=>{if(t===s)sus[a]+=W.accMe;else if(isGood(t))sus[a]+=W.voteGood;else if(isBad(t))sus[a]-=W.voteBad;});
  nightDead.forEach(x=>{acc.forEach(([a,t])=>{if(t===x)sus[a]+=W.nightAcc;});votes.forEach(([a,t])=>{if(t===x)sus[a]+=W.nightAcc;});});   // 白天推過、投過後來夜裡被刀的人（狼不刀自己人）
  // 跟可疑的人投同一個人（狼人常集中投票）：同一輪和懷疑的人投一樣的，也跟著可疑
  votes.forEach(([a,t,r])=>{if(a===s||!isBad(a))return;votes.forEach(([b,u,r2])=>{if(r2===r&&u===t&&b!==a&&b!==s)sus[b]+=W.coVote;});});
  sus[s]=-99;
  const rank=wwAliveOf(st,i=>i!==s).sort((a,b)=>sus[b]-sus[a]);
  return{sus,rank,B,lv:k=>wwLv(sus[k])};}

// ===== 偽裝身份與固定句型的發言 =====
// 沒有發言模型（或模型這次寫不出合格的話）時：預言家照樣報查驗、悍跳的狼照樣報假查驗（每天多報一個、前後一致）
function wwCanned(st,s){const r=st.roles[s],sg=st.strat&&st.strat[s],last=st.phase==='last',said=(st.pub&&st.pub.rep[s])||{kill:[],gold:[]},first=!(st.pub&&st.pub.seer[s]!=null);
  let res=null,me='我是預言家';
  if(r==='seer'){if(sg==='seerHide'&&st.day<2&&!last&&!Object.keys((st.pub&&st.pub.seer)||{}).some(c=>+c!==s))return null;res=st.seerRes;}   // 藏身份的預言家：有人假跳就馬上對跳
  else if(sg==='jump'&&wwKiller(st,s)){const F=st.fake=st.fake||{},mine=F[s]=F[s]||{res:{},day:0},mates=wwMates(st,s),c=wwAliveOf(st,i=>i!==s&&!(i in mine.res));
    if(!last&&mine.day!==st.day&&c.length){mine.day=st.day;const rival=c.filter(i=>!mates.includes(i)&&st.pub&&st.pub.seer[i]!=null),ms=c.filter(i=>mates.includes(i)),gs=c.filter(i=>!mates.includes(i));
      if(rival.length)mine.res[rival[0]]=true;                               // 有人對跳：查殺他
      else if(ms.length&&Math.random()<.35)mine.res[wwPick(ms)]=false;       // 發金水給隊友
      else if(gs.length)mine.res[wwPick(gs)]=Math.random()<.6;}
    res=mine.res;me='我才是預言家';}
  if(!res)return null;const ks=Object.keys(res).map(Number);if(!ks.length)return null;
  const nw=ks.filter(i=>!(res[i]?said.kill:said.gold).includes(i)),k=ks.find(i=>res[i]&&st.alive[i]);
  if(!first&&!nw.length)return k!=null&&!last?`${k+1}號是我的查殺，今天投${k+1}號。`:null;
  return`${me}，${(first?ks:nw).map(i=>`查驗${i+1}號是${res[i]?'狼人':'好人'}`).join('，')}。`+(k==null?'':last?`大家把${k+1}號投出去。`:`今天投${k+1}號。`);}
// 開局時替每個人選一個「對外的身份」（st.mask）：誰都可以偽裝成別的職業
//   平民：大多說自己是平民，少數假裝神職替真神擋刀；神職（預言家以外）：多半藏成平民，有些假裝成另一個神職，有些直接講真的；
//   狼人：裝平民，或假裝成這局有的神職；悍跳的狼走預言家那套
function wwMaskInit(st){const gods=WW_GODS.filter(k=>st.cfg.roles[k]&&k!=='seer').map(k=>WW_ROLES[k].n);st.mask={};
  st.roles.forEach((r,i)=>{const sg=st.strat[i],own=WW_ROLES[r].n,other=gods.filter(g=>g!==own),x=Math.random();
    if(r==='seer'||sg==='jump')st.mask[i]=null;
    else if(wwIsWolf(st,i))st.mask[i]=sg==='fakegod'&&gods.length?wwPick(gods):'平民';
    else if(r==='villager')st.mask[i]=sg==='vilFake'&&gods.length?wwPick(gods):'平民';
    else st.mask[i]=x<.6?'平民':x<.8&&other.length?wwPick(other):own;});}
// 固定句型的發言：先報查驗（預言家／悍跳）；被點名時說出自己對外的身份，快被投出的神職改講真話；再照自己的懷疑講誰可疑（分高中低）。狼人照掩護規則講
function wwSay(st,s){const last=st.phase==='last',r=st.roles[s],killer=wwKiller(st,s),L=[];
  const P=st.pub||{},said=(P.claim&&P.claim[s])||[],accd=((wwAccuse(st)[s])||[]).length,real=WW_ROLES[r].n,mask=st.mask&&st.mask[s];
  const sc=wwCanned(st,s);if(sc)L.push(sc);
  else if(!wwIsWolf(st,s)&&r!=='villager'&&r!=='seer'&&(accd>=2||last)&&!said.includes(real)&&(mask!==real||said.length))L.push(`我其實是${real}，${!last?'今天別投我':st.lastOut===s?'大家投錯人了':'昨晚被刀了'}。`);
  else if(mask&&!said.length&&(accd>=1||Math.random()<.2)){   // 偽裝的神職已經有別人說過（或法官公開過）就改說平民，不要硬撞
    const taken=Object.keys((P.claim)||{}).some(c=>+c!==s&&P.claim[c].includes(mask))||st.msgs.some(m=>m.seat<0&&m.to==='all'&&m.txt.includes(`是${mask}，可以選擇開槍`));
    L.push(`我是${taken?'平民':mask}${accd?'，不是狼':''}。`);}
  const others=wwAliveOf(st,i=>i!==s);let x=-1,lv='低',y=-1;
  if(wwKnower(st,s)){const mates=wwMates(st,s),goods=others.filter(i=>!mates.includes(i)),dg=wwDanger(st,s),A=wwAccuse(st),sg=st.strat[s];
    if(dg&&dg.tgt>=0&&!mates.includes(dg.tgt))x=dg.tgt;
    else if(goods.length){const hot=goods.slice().sort((a,b)=>(A[b]||[]).length-(A[a]||[]).length)[0];x=(A[hot]||[]).length?hot:sg==='push'||Math.random()<.5?wwPick(goods):-1;}
    lv=x<0?'低':sg==='push'?'高':sg==='hook'?'中':wwPick(['中','低']);}
  else{const M=wwMind(st,s);x=M.rank.length?M.rank[0]:-1;lv=x>=0?M.lv(x):'低';y=M.rank.length>1&&M.sus[M.rank[1]]>=1.5?M.rank[1]:-1;
    if(!sc&&M.B.trust>=0&&M.B.trust!==s&&st.alive[M.B.trust]&&Math.random()<.4)L.push(`我相信${M.B.trust+1}號的查驗。`);}
  if(!sc&&x>=0){
    if(last)L.push(lv==='低'?`我是好人，${x+1}號大家多注意。`:`我是好人，${x+1}號最可疑，大家把他投出去。`);
    else if(lv==='高')L.push(`我覺得${x+1}號就是狼，今天投${x+1}號。`);
    else if(lv==='中')L.push(`${x+1}號有點可疑，我先投${x+1}號。`);
    else L.push(`目前沒什麼頭緒，${x+1}號我會多注意。`);
    if(y>=0&&!last)L.push(`${y+1}號也有點怪。`);}
  const p={lines:L.slice(0,3),speech:L.slice(0,3).join(''),vote:-1};if(wwKnower(st,s)&&!last)wwTalkBack(st,s,p);
  let txt=p.lines.join('');if(!txt)return'過。';if(txt.length>120)txt=p.lines.slice(0,2).join('');
  if(st.phase==='speak'){const sd=wwTalkStated(txt).filter(i=>i>=0&&i<st.n&&st.alive[i]&&i!==s),t=sd.length?sd[sd.length-1]:p.vote;if(t>=0)st.intent[s]={day:st.day,t};}
  return txt;}

// ===== 電腦玩家的行動 =====
// 會殺人的狼知道誰是隊友（所以知道其他人都是好人）；其他人（含隱狼）一律用 wwMind，只靠自己看得到的東西
function wwAIAct(st,s,now){
  const al=wwAliveOf(st),others=al.filter(i=>i!==s),r=st.roles[s],killer=wwKiller(st,s),P=st.pub||{seer:{},rep:{}};
  if(st.phase==='speak'||st.phase==='last')return{type:'endSpeak',say:wwSay(st,s)};
  const knows=wwKnower(st,s),good=knows?others.filter(i=>!wwIsWolf(st,i)):[];   // 知道隊友的狼（含隱狼）知道其他人都是好人
  const M=knows?null:wwMind(st,s),S=k=>M?M.sus[k]:0,top=M&&M.rank.length?M.rank[0]:-1;
  if(st.phase==='night'){
    if(killer){const hp=wwHumanWolfPick(st);let t=hp!=null?hp:Object.values(st.night.wolf)[0];
      if(t==null){const seers=good.filter(i=>P.seer[i]!=null);t=seers.length&&Math.random()<WW_AI.knifeSeer?wwPick(seers):good.length?wwPick(good):-1;}   // 優先刀跳預言家的人
      return{type:'night',t};}
    if(r==='seer'){const c=M.rank.filter(i=>!(i in st.seerRes));return{type:'night',t:c.length?wwPick(c.slice(0,3)):wwPick(others)};}   // 查最可疑的前三名之一
    if(r==='guard'){const c=al.filter(i=>i!==st.guardLast),tr=M.B.trust;if(!c.length)return{type:'night',t:-1};
      return{type:'night',t:tr>=0&&tr!==s&&c.includes(tr)&&Math.random()<.7?tr:Math.random()<.5?c.slice().sort((a,b)=>S(a)-S(b))[0]:wwPick(c)};}   // 守相信的預言家，不然守最放心的人
    if(r==='crow')return{type:'night',t:top>=0&&S(top)>=1?top:others.length?wwPick(others):-1};
    return null;}
  if(st.phase==='witch'){const k=st.night.kill;
    if(st.witchSave&&k>=0&&S(k)<3&&(st.day===1||Math.random()<.5))return{type:'witch',use:'save'};   // 被刀的是自己懷疑的狼就不救
    if(st.witchPoison&&top>=0&&((S(top)>=4&&Math.random()<WW_AI.poison)||(S(top)>=2.5&&st.day>1&&Math.random()<.2)))return{type:'witch',use:'poison',t:top};
    return{type:'witch',use:'none'};}
  if(st.phase==='hunter'){
    if(killer)return{type:'hunter',t:Math.random()<.75&&good.length?wwPick(good):-1};
    return{type:'hunter',t:top>=0&&(S(top)>=2||(S(top)>=1&&Math.random()<.4))?top:-1};}
  if(st.phase==='vote'){
    // 白天說過要投誰，就投誰
    const it=st.intent&&st.intent[s];let iv=it&&it.day===st.day&&it.t!==s&&st.alive[it.t]?it.t:-1;
    if(knows){const dg=wwDanger(st,s);if(iv>=0&&wwMates(st,s).includes(iv)&&wwCut(st,s,dg)!==iv)iv=-1;   // 狼人打掩護：不投隊友；隊友被點名就把票集中到別人身上
      if(iv<0&&dg&&dg.tgt>=0&&st.alive[dg.tgt])return{type:'vote',t:dg.tgt};
      if(iv>=0)return{type:'vote',t:iv};
      const mk=[s,...wwMates(st,s)].flatMap(m=>P.seer[m]!=null&&P.rep[m]?P.rep[m].kill:[]).filter(t=>good.includes(t));   // 跟著悍跳的隊友報的查殺投
      return{type:'vote',t:mk.length?mk[mk.length-1]:good.length?wwPick(good):-1};}
    if(iv>=0)return{type:'vote',t:iv};
    if(top>=0&&S(top)>=1.5)return{type:'vote',t:top};
    // 自己沒把握：跟著今天公開被點名最多的人投（不投自己相信是好人的）
    const A=wwAccuse(st),hot=others.filter(i=>(A[i]||[]).length&&S(i)>-1).sort((a,b)=>A[b].length-A[a].length||S(b)-S(a))[0];
    if(hot!=null&&Math.random()<WW_AI.wagon)return{type:'vote',t:hot};
    return{type:'vote',t:top>=0&&(S(top)>=1||Math.random()<WW_AI.blind)?top:-1};}
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
  // 電腦發言：交給語言模型（有設定時），等結果或逾時
  const talking=WW_TALK&&(ph==='speak'||ph==='last')&&st.ai[st.cur];
  if(talking&&wwTalkTick(st,now))return true;
  for(const s of wwAINeed(st)){
    if(talking&&s===st.cur)continue;
    if(st.aiAt[s]==null){st.aiAt[s]=now+wwAIDelay(st.phase);continue;}
    if(now<st.aiAt[s])continue;
    const a=wwAIAct(st,s,now);if(!a)continue;
    if(a.say){wwMsg(st,'all',a.say,s);}
    const e=wwAct(st,s,a,now);if(e&&a.type==='witch')wwAct(st,s,{type:'witch',use:'none'},now);
    if(st.phase!==ph||st.dl!==dl0)break;}
  if(now>=st.dl&&st.phase===ph&&st.dl===dl0)wwTimeout(st,now);
  return st.seq!==seq||st.phase!==ph;}
// 電腦發言：第一次呼叫送出請求，結果回來（或逾時）才說話並結束發言；檢查不過就重試一次，再不行就「過」
const WW_TALK_MAX=15000;
function wwTalkTick(st,now){const s=st.cur,key=st.phase+s+'@'+st.dl;let T=st.talk;
  if(!T||T.key!==key){T=st.talk={key,n:0,res:undefined,until:now+WW_TALK_MAX};wwTalkReq(st,s,T);return false;}
  if(T.res===undefined&&now<T.until)return false;
  let p=null,err='逾時';if(T.res!=null){p=wwTalkParse(T.res);err=(p&&wwTalkCover(st,s,p))||wwTalkCheck(st,s,p)||(p&&wwTalkCopy(st,s,p.speech));if(!err)wwTalkBack(st,s,p);}
  if(err&&T.n<2&&T.res!==undefined&&now<T.until){T.res=undefined;wwTalkReq(st,s,T);return false;}
  st.talk=null;if(err||!p){wwMsg(st,'all',wwSay(st,s),s);}else wwTalkApply(st,s,p);

  if(typeof console!=='undefined'&&err&&T.res!==undefined&&T.res!==null&&st.talkLog)console.log('AI 發言不採用：',err,T.res);
  wwAct(st,s,{type:'endSpeak'},now);return true;}
// 取樣溫度（0.27.0 起；0.28.0 改成 0.8～1.0，見 WW_SAMPLE）：每位電腦開局各自分到 1.1～1.4 之間的溫度（原本大家都是 0.8），講的內容比較多變、不容易每個人都講同一套；
// 檢查不過要重寫時降 0.3（最低 0.8）求穩。實測 1.3 單次合格率 94.6%（0.8 是 88.1%）、6 字片語只出現一次的比例 94% → 87%；1.6 開始出現亂碼，所以上限 1.4
const WW_SAMPLE={lo:.8,hi:1,retry:.2,min:.7,topp:.95,minLp:-3.5};   // 0.28.0 起從 1.1～1.4 降到 0.8～1.0：高溫時一成的發言是胡言亂語（平均 log 機率 < -3.8），0.8 時幾乎沒有；minLp 再擋掉剩下的
function wwTalkOpt(st,s,n){const t=(st.temp&&st.temp[s])||WW_SAMPLE.lo;return{temp:n>1?Math.max(WW_SAMPLE.min,t-WW_SAMPLE.retry):t,topp:WW_SAMPLE.topp,minLp:WW_SAMPLE.minLp};}
function wwTalkReq(st,s,T){T.n++;const prompt=wwTalkPrompt(st,s),opt=wwTalkOpt(st,s,T.n);
  T.p=Promise.resolve().then(()=>WW_TALK(prompt,st,s,T.n,opt)).then(x=>{T.res=typeof x==='string'?x:null;},()=>{T.res=null;});}
// 每個人看得到的資料
function wwView(st,seat,now){
  const r=st.roles[seat],killer=wwKiller(st,seat),ph=st.phase,end=!!st.over;
  return{g:'ww',seq:st.seq,mid:st.mid,me:seat,n:st.n,cfg:st.cfg,phase:ph,day:st.day,dl:Math.max(0,st.dl-now),alive:st.alive.slice(),cur:st.cur,order:ph==='speak'?st.order:null,
    role:r,killer,wolves:killer||end||r==='hiddenWolf'?st.roles.map((x,i)=>wwKiller(st,i)||(i===seat&&r==='hiddenWolf')||(end&&wwIsWolf(st,i))?i:-1).filter(i=>i>=0):null,seerRes:r==='seer'?st.seerRes:null,
    witch:r==='witch'?{save:st.witchSave,poison:st.witchPoison,kill:ph==='witch'&&st.alive[seat]&&st.witchSave?st.night.kill:null}:null,
    guardLast:r==='guard'?st.guardLast:null,knightOk:r==='knight'&&!st.knightUsed,crowMark:st.crowMark,
    acted:ph==='night'?!!st.night.acted[seat]:ph==='vote'?(seat in st.votes):false,myVote:ph==='vote'&&seat in st.votes?st.votes[seat]:null,
    voted:ph==='vote'?Object.keys(st.votes).map(Number):null,canVote:ph==='vote'&&wwVoters(st).includes(seat),
    wolfPicks:killer&&ph==='night'?st.night.wolf:null,idiotUp:st.idiotUp.slice(),over:st.over,roles:end?st.roles.slice():null,ai:st.ai.slice(),
    msgs:wwSeen(st,seat).slice(-160)};}   // 畫面只送最近 160 則；電腦的記憶（wwMind、wwTalkPrompt）用 wwSeen 拿整局
// 這個人整局看得到的所有訊息（公開的、只給他的、狼隊頻道〔會殺人的狼才有〕）——電腦的記憶只從這裡來
function wwSeen(st,seat){const killer=wwKiller(st,seat),end=!!st.over;return st.msgs.filter(m=>m.to==='all'||m.to===seat||(m.to==='wolf'&&(killer||end)));}

// ===== 狼人殺：AI 發言（小型語言模型）的提示、解析與檢查。訓練資料與遊戲共用同一份 =====
// 提示只用這位玩家看得到的訊息（wwView 過濾後的聊天紀錄）整理，不會洩漏別人的身份
const WW_STYLE=['冷靜分析','直爽衝動','幽默愛開玩笑','謹慎保守','話少','強勢帶節奏','老玩家術語多'];   // 0.24.0 拿掉「新手有點緊張」：電腦不能說自己是新手
const WW_LEN=['短','中','長'];
const WW_STRAT={jump:'悍跳預言家（報假查驗，之後每天維持同一套說法）',vil:'裝平民',fakegod:'裝好人，被懷疑時謊稱自己是神職（獵人、女巫等）',hook:'倒鉤（附和好人，必要時切割隊友來取信）',push:'衝鋒（帶節奏、反咬懷疑你的人）',
  seerJump:'跳身份報查驗',seerHide:'先藏身份，第2天以後再報查驗',godHide:'藏身份，快被投出才跳',vilFake:'必要時假跳神職保護真神（不能假跳預言家）'};
let WW_TALK=null;   // 由畫面設定：function(prompt,st,seat)→Promise<字串|null>；沒有就一律「過」
function wwSetTalk(f){WW_TALK=f||null;}
// 開局時替每個人分配說話風格；狼人另外分配策略（最多一隻狼悍跳）
function wwTalkInit(st){st.style=st.roles.map(()=>wwPick(WW_STYLE)+'，'+wwPick(WW_LEN));st.strat={};st.intent={};
  st.temp=st.roles.map(()=>+(WW_SAMPLE.lo+Math.random()*(WW_SAMPLE.hi-WW_SAMPLE.lo)).toFixed(2));
  const ws=st.roles.map((r,i)=>i).filter(i=>wwIsWolf(st,i)&&st.roles[i]!=='hiddenWolf');const hasSeer=st.roles.includes('seer');
  const jumper=hasSeer&&ws.length&&Math.random()<WW_AI.jump?wwPick(ws):-1;
  st.roles.forEach((r,i)=>{if(wwIsWolf(st,i)){st.strat[i]=i===jumper?'jump':r==='hiddenWolf'?wwPick(['vil','vil','fakegod']):wwPick(['vil','vil','vil','fakegod','hook','hook','push','push']);}
    else if(r==='seer')st.strat[i]=Math.random()<.3?'seerHide':'seerJump';else if(r==='villager'){if(Math.random()<.08)st.strat[i]='vilFake';}else st.strat[i]='godHide';});wwMaskInit(st);}
function wwShort(t){return String(t).replace(/ ?(\d+) 票/g,'$1票').replace(/ ?(\d+) 號 ?/g,'$1號').replace(/\s+/g,' ').trim();}
// 把聊天紀錄壓成短短的事件紀錄
function wwTalkLog(st,seat,msgs){
  const out=[];let last=null;
  for(const m of msgs){const t=m.txt;let s=null;
    if(m.seat>=0){const tx=String(t).slice(0,70);
      if(m.to==='wolf'){s=`（狼隊）${m.seat+1}號：${tx}`;}
      else{if(last&&last.seat===m.seat&&last.day===m.day){last.s+=' '+tx;continue;}s=`${m.seat+1}號：${tx}`;}
      const e={seat:m.seat,day:m.day,s,sp:true};out.push(e);last=m.to==='wolf'?null:e;continue;}
    last=null;
    if(/^遊戲開始|^你是 \d+ 號，身份|^狼隊友：|^你的狼隊友：|^開始發言|^發言結束|發言時間到|可以選擇開槍|選擇(殺|空刀)|^請 \d+ 號 ?發言/.test(t))continue;
    let m2;
    if((m2=/^第 (\d+) 夜/.exec(t)))s=`【第${m2[1]}夜】`;
    else if((m2=/^請 (\d+) 號 ?發表遺言/.exec(t)))s=`（${m2[1]}號遺言）`;
    else if(/^天亮了。昨晚是平安夜/.test(t))s=`【第${m.day}天】平安夜`;
    else if((m2=/^天亮了。昨晚 (.+) 死亡/.exec(t)))s=`【第${m.day}天】昨晚${wwShort(m2[1])}死亡`;
    else s=wwShort(t).replace(/^查驗結果：/,'查驗：').replace(/。$/,'');
    out.push({day:m.day,s});}
  // 太久以前的發言只留事件
  // 前一天和今天的發言整句留著；更早的發言只留重點（0.27.3 起，原本整句丟掉）：說自己是什麼身份、報查驗／查殺／金水、說要投誰、說誰是狼、替誰講話。
  // 自己說過的和別人說過的都一樣處理，所以他記得自己跳過什麼、報過什麼、推過誰，也記得別人的；沒有重點的閒聊才丟
  return out.map(e=>!e.sp||e.day>=st.day-1?e.s:wwKeyLine(e.s)).filter(Boolean);}
function wwKeyLine(line){const m=/^((?:（狼隊）)?\d+號：)(.*)$/.exec(line);if(!m)return line;
  const CL=new RegExp(WW_CLAIM_RE.source),keep=wwClauses(m[2]).filter(c=>CL.test(c.replace(/狼人殺/g,"＿"))||WW_VIL_RE.test(c)||/查驗?|驗了|查殺|金水/.test(c)||wwTalkStated(c).length||wwTalkClaims(c).wolf.length||wwDefends(c).length);
  return keep.length?m[1]+keep.join('，').slice(0,60)+'。':null;}
// 舊順序（0.22～0.26 的格式，身份在最前面）：訓練資料就是這個格式，wwTalkReorder 把它轉成新順序
function wwTalkPromptV1(st,seat,noTrim){
  const v=wwView(st,seat,0),r=st.roles[seat],R=WW_ROLES[r],last=st.phase==='last',L=[];
  L.push(`狼人殺${st.n}人：${wwCfgText(st.cfg).replace('（比人數）','（屠城）')}`);   // 發言模型訓練時只看過屠邊／屠城，「比人數」用最接近的屠城代替

  L.push(`我是${seat+1}號，身份：${R.n}（${R.side==='wolf'?'狼人陣營':'好人陣營'}）`);
  if(v.killer||r==='hiddenWolf'){const mates=v.wolves.filter(i=>i!==seat);L.push(mates.length?`狼隊友：${mates.map(i=>i+1+'號'+(st.roles[i]!=='wolf'?'('+WW_ROLES[st.roles[i]].n+')':'')+(st.alive[i]?'':'(出局)')).join('、')}`:'狼隊友：都出局了');}
  if(r==='seer'){const k=Object.keys(st.seerRes);L.push('我的查驗：'+(k.length?k.map(i=>`${+i+1}號${st.seerRes[i]?'狼人':'好人'}`).join('、'):'還沒有'));}
  if(r==='witch')L.push(`解藥${st.witchSave?'還在':'已用'}，毒藥${st.witchPoison?'還在':'已用'}`);
  const sty=(st.style&&st.style[seat])||'冷靜分析，中';L.push(`風格：${sty}`+(st.strat&&st.strat[seat]?`；策略：${WW_STRAT[st.strat[seat]]}`:''));
  L.push('存活：'+wwAliveOf(st).map(i=>i+1).join('、'));
  L.push('紀錄：');
  const log=wwTalkLog(st,seat,wwSeen(st,seat));let body=log.join('\n');
  while(!noTrim&&body.length>900&&log.length>4){log.shift();body=log.join('\n');}
  L.push(body);
  L.push(last?`現在：我出局了，發表遺言。`:`現在：第${st.day}天，輪到我發言。`);
  return L.join('\n');}
// ===== 提示的順序（0.27.0 起）：公開的在前、私人的在後 =====
// 狼人殺N人：設定 / 規則：一行 / 紀錄： / 公開紀錄（每個人看到的都一樣）/ 存活：（有人死才變，放在公開紀錄後面）/ 我是N號，身份… / 狼隊友・我的查驗・解藥 / 風格 / 私下的紀錄（狼隊頻道、查驗、女巫用藥、守護…）/ 現在：…
// 同一時間每位電腦的提示，前面（到公開紀錄為止）一字不差，模型可以重用那一段的計算（ai/ww/mini.js 的前綴快取），每次只重算後面屬於他自己的部分。
// 快取只在「token 一模一樣」時才重用，重用的結果和整段重算完全相同，所以不會把別人的私人資訊帶進來。
const WW_RULE1={wolf:'狼人夜裡殺人',wolfKing:'狼王出局可開槍',whiteWolf:'白狼王可自爆帶人',hiddenWolf:'隱狼驗是好人',seer:'預言家驗好壞',witch:'女巫一救一毒',hunter:'獵人出局可開槍',guard:'守衛每晚守一人',idiot:'白痴被投免死',knight:'騎士可決鬥',gravekeeper:'守墓人知出局者好壞',crow:'烏鴉詛咒加一票',bear:'熊旁有狼會咆哮'};
function wwRuleLine(cfgLine){const ks=[];for(const m of String(cfgLine).matchAll(/([^：、×（]+)×\d+/g)){const k=Object.keys(WW_RULE1).find(x=>WW_ROLES[x].n===m[1]);if(k)ks.push(WW_RULE1[k]);}
  return'規則：'+ks.join('，')+'；狼全出局好人勝，'+(/屠城/.test(cfgLine)?'好人全滅狼勝':'神或民全滅狼勝');}
const WW_PRIV=/^(?:（狼隊）|查驗：|守墓人：|你|今晚你|時間到，今晚你)/;   // 紀錄裡只有自己看得到的那幾種
function wwTalkReorder(p){const ls=String(p).replace(/\r/g,'').split('\n'),k=ls.indexOf('紀錄：');if(k<1||ls.some(l=>l.startsWith('規則：')))return String(p);
  const head=ls.slice(1,k),pub=[],prv=[];ls.slice(k+1,-1).forEach(l=>{if(l)(WW_PRIV.test(l)?prv:pub).push(l);});
  // 公開紀錄太長（超過 900 字）：從最舊的一天開始，整天只留「誰說自己是什麼身份、誰報了什麼查驗」那幾句（0.27.3 起；原本整天丟掉，
  // 長局裡會忘了自己和別人跳過的身份）；全部壓完還太長，才從最舊的開始丟。只看公開的內容，大家壓的一樣；一次處理一整天，開頭不常變（快取才用得上）
  const len=a=>a.reduce((x,l)=>x+l.length+1,0),CL=new RegExp(WW_CLAIM_RE.source);
  const pin=l=>/^\d+號：/.test(l)&&(CL.test(l.replace(/狼人殺/g,'＿'))||WW_VIL_RE.test(l)||/查驗|查殺|金水/.test(l));
  const mine=wwMineLines(pub,((head.find(l=>/^我是\d+號/.test(l))||'').match(/^我是(\d+)號/)||[])[1]);   // 壓縮前先取出自己說過的話
  const days=[];for(const l of pub){if(!days.length||l.startsWith('【第'))days.push([]);days[days.length-1].push(l);}
  for(let d=0;d<days.length-1&&len(days.flat())>900;d++)days[d]=days[d].filter(l=>l.startsWith('【第')||pin(l));
  let flat=days.flat();while(len(flat)>900&&flat.length>4)flat.shift();
  pub.length=0;pub.push(...flat);
  return[ls[0],wwRuleLine(ls[0]),'紀錄：',...pub,head.find(l=>l.startsWith('存活：'))||'存活：',...head.filter(l=>!l.startsWith('存活：')),...mine,...prv.slice(-8),ls[ls.length-1]].join('\n');}
// 自己說過的話（0.27.4 起，優先於別人的）：放在「自己的部分」裡（不會被丟、每次重算），最近 4 段，舊的只留重點、總長最多 200 字。
// 公開紀錄太長被壓掉時，別人的話可能不見，自己的話一定還在
function wwMineLines(all,me){if(!me)return[];const own=all.filter(l=>l.startsWith(me+'號：'));
  const out=own.map((l,i)=>i>=own.length-2?l:wwKeyLine(l)).filter(Boolean).slice(-4);
  while(out.reduce((x,l)=>x+l.length+1,0)>200&&out.length>1)out.shift();return out;}
function wwTalkPrompt(st,seat){return wwTalkReorder(wwTalkPromptV1(st,seat,true));}
// 口頭禪：小模型很愛說「我手上有點資訊／東西，但先不說」，一出現就從那裡截斷，後面的都不說（0.22.4 起；截斷後沒話可說就重寫）
function wwTalkTic(line){const out=[];for(const c of line.trim().split(/(?<=[，。！？；,.!?;\n])/)){const t=c.replace(/[\s，。！？；,.!?;]/g,'');
    if(/(手上|手裡|手中|身上).{0,10}(資訊|東西|消息|情報|料|底牌|牌)/.test(t)&&!/查|驗|金水|藥|槍|守/.test(t))break;
    if(/^(但|不過|只是|可是|所以)?(我)?(現在|今天|目前)?(先|暫時|暫且|還)(不說|不講|不爆|不透露|不方便說|壓著|保留)(太多|出來|身份)?$/.test(t))break;
    out.push(c);}
  return out.join('').replace(/^[，、；,;\s]+/,'').replace(/[，、；,;]\s*$/,'。').trim();}
// 電腦不能說自己是新手（0.24.0 起）：講到「新手／第一次玩／不太會玩」的那一句拿掉，其他照說
const WW_NEWB=/新手|菜鳥|小白|萌新|第一次玩|頭一次玩|剛(?:學|入局|入門|開始玩|接觸)|不太會玩|不會玩|沒玩過|沒怎麼玩過|還在學/;
function wwTalkNewb(line){return line.trim().split(/(?<=[，。！？；,.!?;\n])/).filter(c=>!WW_NEWB.test(c)).join('').replace(/^[，、；,;\s]+/,'').replace(/[，、；,;]\s*$/,'。').trim();}
// 模型輸出：1～3 句發言，最後一行「投:3」或「投:棄」
function wwTalkParse(txt){
  if(typeof txt!=='string')return null;txt=txt.replace(/<\|im_end\|>[\s\S]*$/,'').replace(/瞭解藥/g,'了解藥').trim();  // 訓練資料轉正體時「用了解藥」被轉成「用瞭解藥」
  const m=/(?:^|\n)\s*投[:：]\s*(\d+|棄)\s*號?\s*$/.exec(txt);if(!m)return null;
  const sp=txt.slice(0,m.index).trim();if(!sp)return null;
  const lines=wwTalkNewb(wwTalkTic(sp)).split(/\n+/).map(s=>s.trim()).filter(Boolean);if(!lines.length)return null;
  return{lines,speech:lines.join(''),vote:m[1]==='棄'?-1:(+m[1]-1)};}
// 發言裡明說要投誰（「投3號」「歸票5」「出7號」）
// 分句（逗號、句號都算），用來分辨「我自己說的」和「轉述別人的」
const wwClauses=sp=>sp.split(/[，。！？；,.!?;\n…～~]+/).filter(Boolean);
// 這一句是不是在講別人做的事（主詞是別的號碼，例如「2號投1號」「9號查殺2號」），而不是自己
const wwOther=pre=>/\d+\s*號/.test(pre)&&!/我|跟|大家|建議|一起|全場|全票|今天/.test(pre);
// 發言裡明說要投誰（「我投3號」「今天歸票5」「出7號」）；別人的投票、否定句（「不能投」）不算
function wwTalkStated(sp){const out=[];
  for(const c of wwClauses(sp)){const re=/(?:投給?|歸票給?|票給|票投|票.{0,4}(?:給|往|向|在)|出掉?|帶走|推|砸|鎖定|集中在?)\s*(\d{1,2})\s*號?|(\d{1,2})\s*號\s*(?:今天)?\s*(?:必須|一定要|直接|就|先)?\s*(?:出局|投出去|票出去|出去)/g;let m;
    while((m=re.exec(c))){const pre=c.slice(0,m.index),k=+(m[1]||m[2]);if(/[不別沒勿莫]\S{0,2}$/.test(pre)||(m[1]&&wwOther(pre)))continue;out.push(k-1);}}
  return out;}
// 發言裡說誰是狼／好人：kill＝自己報的查殺、gold＝自己報的金水（轉述別人的不算），wolf＝認定是狼
function wwTalkClaims(sp){const kill=[],gold=[],wolf=[];
  // 每個符合的地方往前看到上一個標點：前面有別的號碼當主詞（「9號查殺2號」）就是在轉述別人，不算
  const g=(re,arr)=>{let m;re.lastIndex=0;while((m=re.exec(sp))){const pre=sp.slice(0,m.index).split(/[，。！？；,.!?;\n…～~]/).pop();if(wwOther(pre))continue;arr.push(+m[1]-1);}};
  g(/(\d{1,2})\s*號?\s*(?:是|就是)?\s*(?:我的)?\s*查殺/g,kill);g(/查殺\s*(?:了|是)?\s*(\d{1,2})\s*號/g,kill);
  g(/(?:查驗?|驗)了?\s*(\d{1,2})\s*號?\s*[，,]?\s*(?:結果|他)?\s*(?:是|為)?\s*(?:狼|查殺)/g,kill);
  g(/(\d{1,2})\s*號?\s*(?:是|就是)?\s*(?:我的)?\s*金水/g,gold);g(/金水\s*(?:是|給)\s*(\d{1,2})\s*號/g,gold);g(/給\s*(\d{1,2})\s*號\s*(?:發)?\s*(?:了)?\s*金水/g,gold);
  g(/(?:查驗?|驗)了?\s*(\d{1,2})\s*號?\s*[，,]?\s*(?:結果|他)?\s*(?:是|為)?\s*(?:好人|金水)/g,gold);
  g(/(\d{1,2})\s*號\s*(?:是|就是|確定是|肯定是|一定是|絕對是|根本是|應該是|八成是|大概是|鐵定是|百分百是|真的是|才是)\s*(?:一隻|一頭|真)?狼(?![王隊])/g,wolf);
  return{kill,gold,wolf:[...new Set([...wolf,...kill])]};}
// 常見的簡體字（台灣正體不會用到的），模型偶爾會冒出來，冒出來就重寫
const WW_SIMP=/[怀着这们说个为发验杀没还来时对会过开关见让认识讲话谁吗问题么样经现实动当种点头无语东车长门马书买卖钱电从观两举义习乱争亚产亲价众优传伤体侦党兴养况净减击则刚创删别剑剧劝办务励劳势单卫厂历压县参双变号吓员呜响团园围图圆圣场坏块坚坛声处备复够夺奋奖妈学宁宝审导将层岁币师带帮广庆应废异弃张弹归录彻态总恋恶惊惧惨惯战户执扩扫扬扰报担拟拥择挂挡挤挥换据数断旧显晓暂术机杂权条极构枪树检楼欢残毁毕气汇汉沟测济浅渐湾满灭灯灵烂热爷状犹独狱猎献环画疗确碍礼祸离积称稳穷窃竞笔筑签简类粮紧红纪约级纯纳纸线练组织终结给统继绩续维综绿网罗罚职联肤肿胁胆胜脑脚脸艰艺节苏药获营虑补装规觉视论设证评诉词译试诗诚询该详误请诸读课调谈谋谎谓谢谨负贡财责败账货质购贵费贼资赏赛赢赶跃转轮软轻较辆辈输边达运进远违连迟选递遗邮释针钟钢铁银锁错键镇闭闲间闹阅队阳阴阵阶际陆陈险随隐难雾静顶顺须预领频颜风飞饭饮馆骗鱼鸟鸡齐齿龙]/;
const WW_CLAIM_RE=/我(?:才|真的?|就|其實|確實|本來就|當然|也)?是(?:真的?|一隻|個)?(預言家|女巫|獵人|守衛|白痴|騎士|守墓人|烏鴉|熊|狼人|狼王|白狼王|隱狼|狼)(?!人殺)/g;
// 檢查發言能不能用：回傳錯誤原因，沒問題回傳 null；會修正投票對象（跟著發言）
function wwTalkCheck(st,seat,p){
  if(!p)return'格式錯誤';const sp=p.speech,r=st.roles[seat],wolf=wwIsWolf(st,seat),last=st.phase==='last';
  if(sp.length<4||sp.length>120)return'長度不對';if(p.lines.length>4)return'句數太多';
  if(/[A-Za-z<>{}\[\]\\]|法官說|作為(AI|模型)|系統/.test(sp))return'怪字';
  if(/[Ͱ-ϿЀ-ӿ぀-ヿ가-힯]/.test(sp))return'怪字';   // 希臘、俄文字母、日文假名、韓文（溫度高時偶爾冒出來，0.27.0 新增）
  if(/[×【】]|(?:身份|紀錄|存活|策略|風格|狼隊友|現在)：|\d+\s*票（/.test(sp))return'怪字';   // 把提示的格式照抄出來（從頭訓練的小模型偶爾會）
  if(WW_SIMP.test(sp))return'簡體字';
  if(WW_NEWB.test(sp))return'說自己是新手';
  for(const m of sp.matchAll(/(\d+)\s*號/g)){const k=+m[1];if(!(k>=1&&k<=st.n))return'號碼超出範圍';}
  // 把自己的號碼講錯（「我8號覺得…」但他其實是 2 號）：小模型偶爾會（0.23.0 新增）
  for(const m of sp.matchAll(/我(?:是\s*(\d+)\s*號|\s*(\d+)\s*號(?=覺得|認為|先|就|純|今天|目前|這邊|也|還|才|個人|站|投|不|暫時|想|看|聽|表態|真的|當|只是|是|身份|明確|建議|直接|聽完|發言))/g))if(+(m[1]||m[2])!==seat+1)return'號碼說錯';
  // 身份宣稱：好人只能說自己的真身份；狼人不能說自己是狼
  for(const m of sp.replace(/狼人殺/g,'＿').matchAll(WW_CLAIM_RE)){const c=m[1];
    if(/狼/.test(c))return wolf?'狼人自曝':'好人說自己是狼';
    // 0.27.2 起誰都可以冒充任何職業（包括預言家），前後說法不一也可以——說謊是正常的，他自己知道真身份就好。只擋說自己是狼（等於自曝，好人說了也沒意義）
    }
  const cl=wwTalkClaims(sp),mates=wolf&&wwKnower(st,seat)?st.roles.map((x,i)=>i).filter(i=>i!==seat&&wwKiller(st,i)):[];
  // 狼人可以說謊、可以罵「狼隊在帶節奏」，但不能講出「我們狼」「我隊友」「我們昨晚刀」這種只有狼才知道的話
  if(wolf){if(/我們?(?:的)?狼?隊友|狼隊友|我們(?:這隊)?狼|我們(?:昨晚|晚上|今晚)?(?:殺|刀)|我(?:昨晚|晚上)?刀了/.test(sp))return'狼人洩漏';
    if(cl.wolf.some(i=>mates.includes(i)&&!cl.kill.includes(i)))return'狼人說隊友是狼';}
  else if(/狼隊友|我的狼隊友/.test(sp))return'好人說隊友';
  // 真預言家報的查驗要是真的（小模型報錯多半是記錯、不是策略，報錯會誤導整個好人陣營）；其他人冒充預言家報假查驗可以（0.27.2 起）
  // 查驗只會知道好人或狼人，不會知道是什麼職業：「查驗 3 號是女巫」「驗了5號，他是獵人」這種講出具體職業的不行（不管是真預言家還是悍跳的狼）
  if(/(?:查驗?|驗)了?\s*\d+\s*號?[，,]?\s*(?:結果|他|身份)?\s*(?:是|為)\s*(?:一個|個)?(?:預言家|女巫|獵人|守衛|白痴|騎士|守墓人|烏鴉|熊|平民|村民|狼王|白狼王|隱狼|神職?)/.test(sp))return'查驗報出職業';
  if(r==='seer'){if(cl.kill.some(i=>i!==seat&&st.seerRes[i]!==true))return'預言家報假查殺';if(cl.gold.some(i=>i!==seat&&st.seerRes[i]!==false))return'預言家報假金水';}
  if(wolf&&/我(?:才)?是(?:真的?)?預言家|我(?:昨晚|首夜)?(?:查驗?|驗)/.test(sp)&&cl.kill.some(i=>mates.includes(i)))return'狼人查殺隊友';
  const mem=wwTalkMemErr(st,seat,sp);if(mem)return mem;
  if(WW_GROUND.on&&st.gut){const g=wwTalkGround(st,seat,p,cl);if(g)return g;}
  // 投票：要投活著的其他人；發言說要投誰就投誰
  let vote=p.vote;
  if(vote>=0&&(vote>=st.n||!st.alive[vote]||vote===seat)){if(last||!new RegExp('(^|\\D)'+(vote+1)+'\\s*號').test(sp))vote=-1;else return'投票對象不對';}   // 投了不能投的人：發言裡沒提到他就當棄票（0.23.0 起），有提到才算不合格
  const sd=wwTalkStated(sp).filter(i=>i>=0&&i<st.n&&st.alive[i]&&i!==seat);
  if(!last){
    if(sd.length&&!sd.includes(vote))return'投票和發言不一致';
    const cw=cl.wolf.filter(i=>i>=0&&i<st.n&&st.alive[i]&&i!==seat);
    if(!sd.length&&cw.length&&vote>=0&&!cw.includes(vote))return'說誰是狼卻投別人';
    }
  p.vote=vote;return null;}
// 記憶錯亂（0.28.0 起擋）：小模型會講錯「昨晚誰死」、把已出局的人當活人（要投他、要出他）、同一段話自稱兩種職業、
// 或前後自稱不同職業。說謊是正常的，所以改口成自己的「真身份」可以（藏身份後起跳），改成另一個假身份才算記錯
function wwTalkMemErr(st,seat,sp){
  const dawn=st.msgs.slice().reverse().find(m=>m.seat<0&&m.day===st.day&&/^天亮了/.test(m.txt));
  if(dawn){const dead=[...String(dawn.txt).matchAll(/(\d+)\s*號/g)].map(a=>+a[1]-1);
    if(dead.length&&/平安夜|昨晚沒(?:有)?人?(?:死|出局|倒)/.test(sp.replace(/(?:首夜|第一晚|第1晚|第一夜|第1夜|前晚|前一晚|昨天|上一?晚|第\d夜|那晚|那天)(?:是|是個|也是)?平安夜/g,'')))return'記錯昨晚';
    for(const a of sp.matchAll(/(\d+)\s*號\s*昨晚(?:被刀|倒牌|死|出局)|昨晚(?:死的?是|被刀的是|倒的是)\s*(\d+)\s*號/g))if(!dead.includes(+(a[1]||a[2])-1))return'記錯昨晚';}
  for(const a of sp.matchAll(/(?:投|歸票|票給|今天出|先出|要出|直接出)\s*(\d+)\s*號/g)){const v=+a[1]-1;if(v>=0&&v<st.n&&!st.alive[v]&&v!==seat)return'把出局的人當活人';}
  const now=[...new Set(wwClaimsOf(sp).filter(c=>!/狼/.test(c)))];if(now.length>1)return'自稱兩種身份';
  if(now.length){const real=WW_ROLES[st.roles[seat]].n,before=new Set();
    for(const m of st.msgs)if(m.seat===seat&&m.to==='all')wwClaimsOf(m.txt).forEach(c=>before.add(c));
    if(before.size&&!before.has(now[0])&&now[0]!==real)return'身份前後不一';}
  return null;}
// 發言要有根據（0.28.0 起）：好人電腦白天說的「誰是狼、要投誰、替誰講話、給誰金水」要和他自己的判斷（wwMind，只用他看得到的資訊）對得上。
// 原因：投票是照發言投的，小模型隨口點名的人常常沒有任何理由，好人陣營就被自己人帶歪（實測模型發言時好人只贏 14%，規則發言時約 45%）。
// 狼人不受限（他本來就在說謊帶節奏）。對不上就重寫，再不行改用規則發言（wwSay，有講理由）。
const WW_GROUND={on:true,top:2,lvl:1.5};
function wwTalkGround(st,seat,p,cl){if(wwIsWolf(st,seat)||st.phase==='last')return null;
  const M=wwMind(st,seat),S=i=>M.sus[i]||0,top=M.rank.slice(0,WW_GROUND.top).filter(i=>S(i)>0);
  const ok=t=>S(t)>=WW_GROUND.lvl||top.includes(t);
  const tg=new Set([...wwTalkStated(p.speech),...cl.wolf]);if(p.vote>=0)tg.add(p.vote);
  for(const t of tg)if(t>=0&&t<st.n&&t!==seat&&st.alive[t]&&!ok(t))return'沒有根據';
  for(const d of wwDefends(p.speech))if(d>=0&&d<st.n&&S(d)>=4)return'沒有根據';
  if(st.roles[seat]!=='seer')for(const g of cl.gold)if(g>=0&&g<st.n&&S(g)>=WW_GROUND.lvl)return'沒有根據';
  return null;}
// 抄別人：和今天別人說過的話有一段 10 個字以上一模一樣（小模型容易照抄前面的人）
function wwTalkCopy(st,seat,sp){const t=sp.replace(/[\s，。！？、,.!?]/g,'');if(t.length<10)return null;
  const others=st.msgs.filter(m=>m.seat>=0&&m.seat!==seat&&m.to==='all'&&m.day>=st.day-1).map(m=>String(m.txt).replace(/[\s，。！？、,.!?]/g,''));
  for(let i=0;i+10<=t.length;i+=2){const piece=t.slice(i,i+10);if(others.some(o=>o.includes(piece)))return'抄別人';}return null;}
// ===== 狼人互相打掩護（0.24.0 起）：電腦狼不咬、不投還活著的狼隊友；隊友被點名時有人幫他講話，沒表態的狼把票集中到別人身上 =====
// 只用公開發言判斷（電腦和真人說的都算），不偷看還沒開的票。隱狼不知道隊友是誰，不參與
// 知道狼隊友是誰的：會殺人的狼（彼此知道，但不知道隱狼），以及隱狼（知道會殺人的狼，0.26.4 起）
const wwKnower=(st,s)=>wwKiller(st,s)||st.roles[s]==='hiddenWolf';
const wwMates=(st,s)=>wwKnower(st,s)?wwAliveOf(st,i=>i!==s&&wwKiller(st,i)):[];
const wwNoRe=k=>new RegExp('(^|\\D)'+(k+1)+'\\s*號');
// 今天誰被誰點名（發言裡明說要投他、說他是狼、查殺他）：{被點的人:[點他的人…]}
function wwAccuse(st){const acc={};
  for(const m of st.msgs){if(m.seat<0||m.to!=='all'||m.day!==st.day)continue;const sp=String(m.txt);
    new Set([...wwTalkStated(sp),...wwTalkClaims(sp).wolf]).forEach(t=>{if(t>=0&&t<st.n&&t!==m.seat&&st.alive[t]&&!(acc[t]=acc[t]||[]).includes(m.seat))acc[t].push(m.seat);});}
  return acc;}
// 這隻狼或他的隊友有沒有被盯上：{m:被點最多次的那隻（可能是自己）, by:[點他的人…], tgt:票該集中到誰身上（場上被點最多的非隊友，沒有就是帶頭點隊友的人）}，沒有回傳 null
function wwDanger(st,s){const mates=wwMates(st,s);if(!mates.length)return null;const acc=wwAccuse(st),mine=i=>i===s||mates.includes(i);
  let best=null;for(const m of [s,...mates]){const by=(acc[m]||[]).filter(i=>!mine(i));if(by.length&&(!best||by.length>best.by.length))best={m,by};}
  if(!best)return null;
  let tgt=-1,bn=0;for(const k in acc){const t=+k;if(mine(t))continue;const c=acc[t].length;if(c>bn){bn=c;tgt=t;}}
  if(tgt<0){const y=best.by.find(i=>st.alive[i]);tgt=y==null?-1:y;}
  return{m:best.m,by:best.by,tgt};}
// 倒鉤的狼：隊友已經被兩個以上的人盯上（救不回來）才可以切割他。回傳可以切割的隊友，沒有回傳 -1
const wwCut=(st,s,dg)=>st.strat&&st.strat[s]==='hook'&&dg&&dg.by.length>=2?dg.m:-1;
const WW_POS=/不像狼|不是狼|不會是狼|是好人|像好人|金水|沒什麼問題|沒問題|沒毛病|相信|我保|保他|保一手|站邊|跟著|認他|信他|[不別]要?(?:急著)?(?:投|出|歸票)|不能(?:投|出)/g;
const WW_NEG=/狼|假|悍跳|咬|踩|投|出|歸票|心虛|刻意|洗白|可疑|懷疑|問題|滑|亂|騙|崩|怪|節奏|不對|裝|急|漏洞|查殺|盯|小心|髒|黑|划水|甩鍋|不信|解釋|自證|兇|蹭|硬|不通|經不起|憑啥|憑什麼|太好了吧|藏著|膩|下水|藉口|牽強|有洞/;
// 模型寫的發言先過這一關：提到隊友又在講他壞話的句子整句拿掉，票投隊友就改成不表態（投票時再照掩護規則投）。拿到沒話可說就回傳錯誤（重寫）
function wwTalkCover(st,seat,p){
  if(!p||!wwKnower(st,seat))return null;const cut=wwCut(st,seat,wwDanger(st,seat)),keep=wwMates(st,seat).filter(i=>i!==cut);if(!keep.length)return null;
  const hit=t=>keep.some(k=>wwNoRe(k).test(t))&&WW_NEG.test(t.replace(WW_POS,''));
  const lines=p.lines.map(l=>l.split(/(?<=[。！？!?])/).filter(c=>!hit(c)).join('').trim()).filter(Boolean);
  if(!lines.length)return'狼人打隊友';
  p.lines=lines;p.speech=lines.join('');if(keep.includes(p.vote))p.vote=-1;return null;}
// 幫隊友講話：隊友今天被點名、自己的發言還沒提到他，就補一句替他說話的（同一個隊友一天只有一隻狼出來保，免得太明顯）
const WW_BACK=[(x,y)=>`${x}號的發言我聽下來沒什麼問題，${y}號咬得太急了。`,(x,y)=>`我覺得${x}號不像狼，${y}號反而比較可疑。`,(x,y)=>`${y}號一直踩${x}號，理由我聽不太下去。`,
  (x,y)=>`${x}號那邊我先保一手，今天別急著動他。`,(x,y)=>`大家別被${y}號帶著走，${x}號目前看起來是好人。`,(x,y)=>`${x}號真有問題不會這樣聊，我比較想聽${y}號再解釋。`,
  (x,y)=>`${y}號點${x}號那段太牽強，我站${x}號這邊。`,(x,y)=>`${x}號我覺得可以先放著，${y}號的邏輯才有洞。`];
function wwTalkBack(st,seat,p){
  if(st.phase!=='speak'||!wwKnower(st,seat))return;const dg=wwDanger(st,seat);if(!dg||dg.m===seat||wwCut(st,seat,dg)===dg.m)return;
  st.cover=st.cover||{};const key=st.day+':'+dg.m;if(st.cover[key]!=null||wwNoRe(dg.m).test(p.speech)||p.lines.length>=3||Math.random()<.2)return;
  const y=dg.by.find(i=>st.alive[i]);if(y==null)return;const used=st.cover.used=st.cover.used||[],left=WW_BACK.map((f,i)=>i).filter(i=>!used.includes(i));if(!left.length)return;   // 同一局每種說法只用一次
  const bi=wwPick(left),line=WW_BACK[bi](dg.m+1,y+1);if(p.speech.length+line.length>120)return;
  used.push(bi);st.cover[key]=seat;p.lines.push(line);p.speech+=line;
  if(p.vote<0&&dg.tgt>=0&&st.alive[dg.tgt]&&!wwTalkClaims(p.speech).wolf.length&&!wwTalkStated(p.speech).length)p.vote=dg.tgt;}
// 記下電腦說的話，投票時照著投
function wwTalkApply(st,seat,p){p.lines.slice(0,3).forEach(l=>wwMsg(st,'all',l.slice(0,120),seat));
  if(st.phase==='speak'&&p.vote>=0)st.intent[seat]={day:st.day,t:p.vote};st.seq++;}

if(typeof module!=='undefined')module.exports={wwSetTalk,wwTalkMemErr,wwTalkGround,WW_GROUND,wwTalkTic,wwTalkNewb,wwTalkCopy,wwTalkCover,wwTalkBack,wwAccuse,wwDanger,wwMates,wwTalkPrompt,wwTalkPromptV1,wwTalkReorder,wwRuleLine,wwKeyLine,wwSeen,wwMineLines,wwTalkParse,wwTalkCheck,wwTalkStated,wwTalkClaims,WW_STYLE,wwNew,wwAct,wwTick,wwView,wwJudge,wwBelief,wwCanned,wwMind,wwSay,wwDefends,wwClaimsOf,WW_MW,WW_AI,WW_PRESET,wwCfgFor,wwCfgErr,wwVil,WW_ROLES,wwCfgFix};
