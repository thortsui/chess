// 狼人殺規則測試：node tools/wwtest.js
const E=require('./ww_engine.js');
let fail=0;const ok=(c,msg)=>{if(!c){fail++;console.log('FAIL',msg);}};
for(let n=5;n<=12;n++){const c=E.wwCfgFor(n);if(n===5){c.roles.wolf=1;}ok(!E.wwCfgErr(c),'preset '+n+' '+E.wwCfgErr(c));}
// 全電腦自動對局
const wins={good:0,wolf:0};let days=0,maxSteps=0;
for(let g=0;g<600;g++){const n=6+g%7,cfg=E.wwCfgFor(n);if(g%3===0)cfg.win='all';const st=E.wwNew(cfg,Array(n).fill(true),0);let t=0,steps=0;
  while(!st.over&&steps<20000){t+=300;E.wwTick(st,t);steps++;
    // 不變量
    if(st.phase==='speak'&&!st.alive[st.cur]){fail++;console.log('dead speaker');break;}}
  if(!st.over){fail++;console.log('no end',n,st.phase,st.day);break;}
  wins[st.over.win]++;days+=st.day;maxSteps=Math.max(maxSteps,steps);
  const w=st.roles.filter((r,i)=>r==='wolf'&&st.alive[i]).length;if(st.over.win==='good'&&w){fail++;console.log('good win with wolves');}
  if(st.over.win==='wolf'&&!w&&!st.over.both){fail++;console.log('wolf win without wolves');}
  const v=E.wwView(st,0,t);if(!v.roles){fail++;console.log('no reveal');}}
console.log('600 局',JSON.stringify(wins),'平均天數',(days/600).toFixed(1),'最長步數',maxSteps);
// 規則細節
{const cfg=E.wwCfgFor(9);const st=E.wwNew(cfg,Array(9).fill(false),0);const R=r=>st.roles.indexOf(r),W=st.roles.map((r,i)=>r==='wolf'?i:-1).filter(i=>i>=0);
 const vic=st.roles.indexOf('villager');
 ok(E.wwAct(st,R('seer'),{type:'night',t:R('seer')},1000),'seer cannot check self');
 ok(!E.wwAct(st,R('seer'),{type:'night',t:W[0]},1000),'seer check');ok(E.wwView(st,R('seer'),1000).seerRes[W[0]]===true,'seer sees wolf');
 ok(E.wwView(st,vic,1000).seerRes===null,'villager no seer info');ok(E.wwView(st,vic,1000).msgs.every(m=>m.to!=='wolf'),'villager cannot see wolf chat');
 ok(E.wwAct(st,vic,{type:'say',txt:'hi'},1000),'villager cannot talk at night');ok(!E.wwAct(st,W[0],{type:'say',txt:'殺誰'},1000),'wolf talks');
 W.forEach(w=>E.wwAct(st,w,{type:'night',t:vic},2000));
 ok(st.phase==='witch','全部行動完直接到女巫 '+st.phase);
 ok(E.wwView(st,R('witch'),12000).witch.kill===vic,'witch sees kill');
 ok(!E.wwAct(st,R('witch'),{type:'witch',use:'save'},12500),'witch save');ok(st.phase==='last'||st.phase==='speak'||st.phase==='hunter','day '+st.phase);
 ok(st.alive[vic],'saved alive');ok(st.msgs.some(m=>m.txt.includes('平安夜')),'peaceful night');
 ok(st.phase==='speak','speak phase');const sp=st.cur;ok(E.wwAct(st,(sp+1)%9,{type:'say',txt:'x'},13000),'not your turn');ok(!E.wwAct(st,sp,{type:'say',txt:'我是好人'},13000),'speaker talks');
 for(let i=0;i<9;i++)E.wwAct(st,st.cur,{type:'endSpeak'},14000+i);ok(st.phase==='vote','vote '+st.phase);
 // 全部投給一隻狼
 for(let s=0;s<9;s++)E.wwAct(st,s,{type:'vote',t:W[0]},20000);ok(!st.alive[W[0]],'voted out');ok(st.phase==='last'&&st.cur===W[0],'last words');}
// 同守同救
{const cfg={n:10,roles:{wolf:3,seer:1,witch:1,hunter:1,guard:1,idiot:0},win:'side',speak:60};let st;do{st=E.wwNew(cfg,Array(10).fill(false),0);}while(false);
 const R=r=>st.roles.indexOf(r),W=st.roles.map((r,i)=>r==='wolf'?i:-1).filter(i=>i>=0),v=R('villager');
 W.forEach(w=>E.wwAct(st,w,{type:'night',t:v},1000));E.wwAct(st,R('seer'),{type:'night',t:v},1000);E.wwAct(st,R('guard'),{type:'night',t:v},1000);E.wwTick(st,12000);
 E.wwAct(st,R('witch'),{type:'witch',use:'save'},12100);ok(!st.alive[v],'同守同救 dies');
 ok(st.phase==='last'&&st.cur===v,'first night last words');}
// 獵人被毒不能開槍
{const cfg={n:8,roles:{wolf:2,seer:1,witch:1,hunter:1,guard:0,idiot:0},win:'side',speak:60};const st=E.wwNew(cfg,Array(8).fill(false),0);
 const R=r=>st.roles.indexOf(r),W=st.roles.map((r,i)=>r==='wolf'?i:-1).filter(i=>i>=0);
 W.forEach(w=>E.wwAct(st,w,{type:'night',t:-1},1000));E.wwAct(st,R('seer'),{type:'night',t:W[0]},1000);E.wwTick(st,12000);
 E.wwAct(st,R('witch'),{type:'witch',use:'poison',t:R('hunter')},12100);ok(!st.alive[R('hunter')],'hunter poisoned');ok(st.phase==='last','last words not hunter '+st.phase);
 E.wwAct(st,R('hunter'),{type:'endSpeak'},12200);ok(st.phase==='speak','no hunter shot after poison '+st.phase);}
// 白痴
{const cfg={n:12,roles:{wolf:4,seer:1,witch:1,hunter:1,guard:0,idiot:1},win:'side',speak:60};const st=E.wwNew(cfg,Array(12).fill(false),0);
 const R=r=>st.roles.indexOf(r),W=st.roles.map((r,i)=>r==='wolf'?i:-1).filter(i=>i>=0),id=R('idiot');
 W.forEach(w=>E.wwAct(st,w,{type:'night',t:-1},1000));E.wwAct(st,R('seer'),{type:'night',t:W[0]},1000);E.wwTick(st,12000);E.wwAct(st,R('witch'),{type:'witch',use:'none'},12100);
 for(let i=0;i<12&&st.phase==='speak';i++)E.wwAct(st,st.cur,{type:'endSpeak'},13000);for(let s=0;s<12;s++)E.wwAct(st,s,{type:'vote',t:id},14000);
 ok(st.alive[id]&&st.idiotUp.includes(id),'idiot survives');ok(st.phase==='night','to night');}

// 女巫自救
{const cfg=E.wwCfgFix({n:8,roles:{wolf:2,seer:1,witch:1}});const st=E.wwNew(cfg,Array(8).fill(false),0);const R=r=>st.roles.indexOf(r),W=st.roles.map((r,i)=>r==='wolf'?i:-1).filter(i=>i>=0);
 W.forEach(w=>E.wwAct(st,w,{type:'night',t:R('witch')},1000));E.wwAct(st,R('seer'),{type:'night',t:W[0]},1000);ok(st.phase==='witch','witch');
 ok(!E.wwAct(st,R('witch'),{type:'witch',use:'save'},1100),'witch self save');ok(st.alive[R('witch')],'witch alive');}
// 女巫不在：直接天亮（不等）
{const cfg=E.wwCfgFix({n:6,roles:{wolf:2,seer:1}});const st=E.wwNew(cfg,Array(6).fill(false),0);const R=r=>st.roles.indexOf(r),W=st.roles.map((r,i)=>r==='wolf'?i:-1).filter(i=>i>=0);
 W.forEach(w=>E.wwAct(st,w,{type:'night',t:R('villager')},500));E.wwAct(st,R('seer'),{type:'night',t:W[0]},600);ok(st.phase==='last','no witch -> dawn '+st.phase);}
// 新身份
const all={n:12,roles:{wolf:1,wolfKing:1,whiteWolf:1,hiddenWolf:1,seer:1,witch:1,hunter:1,guard:0,idiot:0,knight:1,gravekeeper:1,crow:1,bear:1}};
ok(!E.wwCfgErr(E.wwCfgFix(all)),'all roles cfg '+E.wwCfgErr(E.wwCfgFix(all)));
ok(E.wwCfgErr(E.wwCfgFix({n:8,roles:{hiddenWolf:1,seer:1}})),'hidden wolf alone invalid');
{const st=E.wwNew(E.wwCfgFix(all),Array(12).fill(false),0);const R=r=>st.roles.indexOf(r);const killers=['wolf','wolfKing','whiteWolf'].map(R);
 ok(!E.wwView(st,R('hiddenWolf'),0).killer,'hidden wolf not killer');ok(E.wwView(st,R('hiddenWolf'),0).msgs.every(m=>m.to!=='wolf'),'hidden wolf no wolf chat');
 ok(E.wwView(st,R('wolfKing'),0).wolves.length===3,'killers see 3');
 E.wwAct(st,R('seer'),{type:'night',t:R('hiddenWolf')},100);ok(st.seerRes[R('hiddenWolf')]===false,'seer sees hidden wolf as good');
 E.wwAct(st,R('crow'),{type:'night',t:R('villager')},100);killers.forEach(k=>E.wwAct(st,k,{type:'night',t:R('gravekeeper')},200));
 ok(st.phase==='witch','witch2 '+st.phase);E.wwAct(st,R('witch'),{type:'witch',use:'none'},300);
 ok(!st.alive[R('gravekeeper')],'gk dead');ok(st.msgs.some(m=>m.txt.includes('烏鴉詛咒')),'crow announce');ok(st.msgs.some(m=>m.txt.includes('熊')),'bear msg');
 // 遺言結束後進入發言
 E.wwAct(st,R('gravekeeper'),{type:'endSpeak'},400);ok(st.phase==='speak','speak '+st.phase);
 // 騎士決鬥狼王 → 狼王開槍
 ok(!E.wwAct(st,R('knight'),{type:'duel',t:R('wolfKing')},500),'duel');ok(!st.alive[R('wolfKing')],'wolfKing dead');ok(st.phase==='hunter'&&st.cur===R('wolfKing'),'wolfKing shoots '+st.phase);
 ok(E.wwAct(st,R('knight'),{type:'duel',t:R('wolf')},500),'duel once');
 E.wwAct(st,R('wolfKing'),{type:'hunter',t:R('hunter')},600);ok(st.phase==='hunter'&&st.cur===R('hunter'),'chain hunter '+st.phase);E.wwAct(st,R('hunter'),{type:'hunter',t:-1},700);
 ok(st.phase==='night','to night after duel '+st.phase);}
{const st=E.wwNew(E.wwCfgFix(all),Array(12).fill(false),0);const R=r=>st.roles.indexOf(r);const killers=['wolf','wolfKing','whiteWolf'].map(R);
 killers.forEach(k=>E.wwAct(st,k,{type:'night',t:-1},200));E.wwAct(st,R('seer'),{type:'night',t:R('wolf')},100);E.wwAct(st,R('crow'),{type:'night',t:R('villager')},100);E.wwAct(st,R('witch'),{type:'witch',use:'none'},300);
 ok(st.phase==='speak','speak3 '+st.phase);ok(!E.wwAct(st,R('whiteWolf'),{type:'boom',t:R('seer')},400),'boom');ok(!st.alive[R('seer')]&&!st.alive[R('whiteWolf')],'boom deaths');ok(st.phase==='night','boom night');
 // 隱狼：其他狼都出局後成為殺手
 st.alive[R('wolf')]=false;st.alive[R('wolfKing')]=false;ok(E.wwView(st,R('hiddenWolf'),500).killer,'hidden wolf becomes killer');}
// 烏鴉多一票
{const cfg=E.wwCfgFix({n:7,roles:{wolf:2,seer:1,crow:1}});const st=E.wwNew(cfg,Array(7).fill(false),0);const R=r=>st.roles.indexOf(r),W=st.roles.map((r,i)=>r==='wolf'?i:-1).filter(i=>i>=0);
 const vs=st.roles.map((r,i)=>r==='villager'?i:-1).filter(i=>i>=0);
 W.forEach(w=>E.wwAct(st,w,{type:'night',t:-1},100));E.wwAct(st,R('seer'),{type:'night',t:W[0]},100);E.wwAct(st,R('crow'),{type:'night',t:vs[0]},100);
 for(let i=0;i<7&&st.phase==='speak';i++)E.wwAct(st,st.cur,{type:'endSpeak'},200);
 // 一半投 W[0]、一半投 vs[0]，烏鴉讓 vs[0] 多一票
 const al=[...Array(7).keys()];al.forEach((s,i)=>E.wwAct(st,s,{type:'vote',t:i<3?W[0]:i<6?vs[0]:-1},300));ok(!st.alive[vs[0]],'crow +1 decides');}

// 狼人打掩護、不能說自己是新手（0.24.0）
{ok(!E.WW_STYLE.some(x=>/新手/.test(x)),'風格不能有新手');
 ok(E.wwTalkParse('我新手第一次玩，今天先看7號怎麼自證。\n投:棄').speech==='今天先看7號怎麼自證。','新手那句拿掉');
 ok(E.wwTalkParse('我是新手啦。\n投:棄')===null,'只剩新手就沒話說');
 const cfg=E.wwCfgFix({n:9,roles:{wolf:3,seer:1,witch:1,hunter:1}});const st=E.wwNew(cfg,[false].concat(Array(8).fill(true)),0);
 const W=st.roles.map((r,i)=>r==='wolf'?i:-1).filter(i=>i>=0),G=st.roles.map((r,i)=>r!=='wolf'?i:-1).filter(i=>i>=0);const no=i=>(i+1)+'號';
 W.forEach(w=>st.strat[w]='vil');st.night.acted={};st.phase='speak';st.day=1;st.cur=G[0];
 let p=E.wwTalkParse(`${no(W[1])}這發言太假了，明顯是狼。我覺得${no(G[1])}比較怪。\n投:${W[1]+1}`);
 ok(E.wwTalkCover(st,W[0],p)===null&&!p.speech.includes(no(W[1]))&&p.vote===-1,'咬隊友的句子拿掉、不投隊友 '+p.speech+p.vote);
 p=E.wwTalkParse(`今天投${no(W[1])}。\n投:${W[1]+1}`);ok(E.wwTalkCover(st,W[0],p)==='狼人打隊友','整段都在打隊友就重寫');
 p=E.wwTalkParse(`我覺得${no(W[1])}不像狼。\n投:棄`);ok(E.wwTalkCover(st,W[0],p)===null&&p.speech.includes(no(W[1])),'幫隊友說話留著');
 p=E.wwTalkParse(`${no(W[1])}這發言太假了，明顯是狼。\n投:${W[1]+1}`);ok(E.wwTalkCover(st,G[2],p)===null&&p.vote===W[1],'好人不受影響');
 // 好人點名狼隊友 → 沒表態的狼把票集中到別人身上、有一隻狼出來保
 st.msgs.push({id:++st.mid,to:'all',seat:G[0],txt:`我覺得${no(W[1])}是狼，今天投${no(W[1])}。`,day:1});
 const dg=E.wwDanger(st,W[0]);ok(dg&&dg.m===W[1]&&dg.tgt===G[0],'隊友被盯上 '+JSON.stringify(dg));ok(E.wwDanger(st,G[1])===null,'好人沒有隊友');
 let n=0;for(let k=0;k<40;k++){delete st.cover;p=E.wwTalkParse('這局水很深。\n投:棄');E.wwTalkBack(st,W[0],p);if(p.lines.length===2){n++;ok(p.speech.includes(no(W[1]))&&p.vote===G[0]&&!E.wwTalkCheck(st,W[0],{...p}),'保隊友的話要合格 '+p.speech);}}
 ok(n>20,'會出來保隊友 '+n);do{delete st.cover;p=E.wwTalkParse('這局水很深。\n投:棄');E.wwTalkBack(st,W[0],p);}while(p.lines.length<2);p=E.wwTalkParse('這局水很深。\n投:棄');E.wwTalkBack(st,W[2],p);ok(p.lines.length===1,'同一個隊友一天只有一隻狼保');
 st.phase='vote';st.votes={};st.dl=1e12;let t=1e6;while(st.phase==='vote'&&t<2e6){t+=300;E.wwTick(st,t);if(st.phase==='vote')W.forEach(w=>{if(w in st.votes)ok(st.votes[w]===G[0],'狼的票集中到點名的人 '+st.votes[w]);});}
 }
// 勝負結算的時機（0.25.0 重寫）
{const mk=(roles,n)=>{const st=E.wwNew(E.wwCfgFix({n:n||6,roles,win:'side'}),Array(n||6).fill(false),0);return{st,R:r=>st.roles.indexOf(r),V:st.roles.map((r,i)=>r==='villager'?i:-1).filter(i=>i>=0)};};
 // 獵人是最後一個神職、夜裡被刀：先遺言、開槍，開完才判
 {const {st,R}=mk({wolf:1,hunter:1});E.wwAct(st,R('wolf'),{type:'night',t:R('hunter')},100);
  ok(!st.over&&st.phase==='last'&&st.cur===R('hunter'),'最後一神被刀：還沒結束，先遺言 '+st.phase);E.wwAct(st,R('hunter'),{type:'endSpeak'},200);ok(!st.over&&st.phase==='hunter','再開槍 '+st.phase);
  E.wwAct(st,R('hunter'),{type:'hunter',t:R('wolf')},300);ok(st.over&&st.over.win==='good'&&st.over.both,'獵人帶走最後一隻狼：好人贏 '+JSON.stringify(st.over));}
 {const {st,R}=mk({wolf:1,hunter:1});E.wwAct(st,R('wolf'),{type:'night',t:R('hunter')},100);E.wwAct(st,R('hunter'),{type:'endSpeak'},200);
  E.wwAct(st,R('hunter'),{type:'hunter',t:-1},300);ok(st.over&&st.over.win==='wolf'&&st.over.why==='神職全部出局','獵人不開槍：狼人贏 '+JSON.stringify(st.over));}
 {const {st,R,V}=mk({wolf:1,hunter:1});E.wwAct(st,R('wolf'),{type:'night',t:R('hunter')},100);E.wwAct(st,R('hunter'),{type:'endSpeak'},200);
  E.wwAct(st,R('hunter'),{type:'hunter',t:V[0]},300);ok(st.over&&st.over.win==='wolf','獵人打錯人：狼人贏');}
 {const {st,R}=mk({wolf:1,hunter:1});E.wwAct(st,R('wolf'),{type:'night',t:R('hunter')},100);E.wwTick(st,1e6);ok(!st.over&&st.phase==='hunter','遺言時間到 → 開槍 '+st.phase);
  E.wwTick(st,2e6);ok(st.over&&st.over.win==='wolf','開槍時間到沒開：狼人贏');}
 // 同一晚：狼刀最後一個平民、女巫毒最後一隻狼 → 狼刀在先，狼人贏
 {const {st,R,V}=mk({wolf:1,witch:1,seer:1});st.alive[V[1]]=st.alive[V[2]]=false;E.wwAct(st,R('wolf'),{type:'night',t:V[0]},100);E.wwAct(st,R('seer'),{type:'night',t:V[0]},100);
  ok(st.phase==='witch','女巫 '+st.phase);E.wwAct(st,R('witch'),{type:'witch',use:'poison',t:R('wolf')},200);
  ok(st.over&&st.over.win==='wolf'&&st.over.both&&/狼刀在先/.test(st.over.why),'狼刀在先 '+JSON.stringify(st.over));}
 // 同一晚：狼刀沒有造成屠邊、女巫毒死最後一隻狼 → 好人贏
 {const {st,R,V}=mk({wolf:1,witch:1,seer:1});E.wwAct(st,R('wolf'),{type:'night',t:V[0]},100);E.wwAct(st,R('seer'),{type:'night',t:V[0]},100);E.wwAct(st,R('witch'),{type:'witch',use:'poison',t:R('wolf')},200);
  ok(st.over&&st.over.win==='good'&&!st.over.both,'毒死最後一隻狼 '+JSON.stringify(st.over));}
 // 狼王是最後一隻狼、被投出局：先遺言、開槍；帶走最後一個平民＝狼人贏，不開槍＝好人贏
 for(const shoot of [true,false]){const {st,R,V}=mk({wolfKing:1,seer:1});V.slice(1).forEach(v=>st.alive[v]=false);const wk=R('wolfKing');
  E.wwAct(st,wk,{type:'night',t:-1},100);E.wwAct(st,R('seer'),{type:'night',t:wk},100);for(let i=0;i<6&&st.phase==='speak';i++)E.wwAct(st,st.cur,{type:'endSpeak'},200);
  ok(st.phase==='vote','投票 '+st.phase);[wk,R('seer'),V[0]].forEach(s=>E.wwAct(st,s,{type:'vote',t:wk},300));
  ok(!st.over&&st.phase==='last'&&st.cur===wk,'最後一隻狼是狼王：先遺言 '+st.phase);E.wwAct(st,wk,{type:'endSpeak'},400);ok(st.phase==='hunter','狼王開槍 '+st.phase);
  E.wwAct(st,wk,{type:'hunter',t:shoot?V[0]:-1},500);ok(st.over&&st.over.win===(shoot?'wolf':'good')&&!!st.over.both===shoot,'狼王最後一槍 '+shoot+JSON.stringify(st.over));}
 // 白狼王是最後一隻狼，自爆帶走最後一個平民 → 狼人贏
 {const {st,R,V}=mk({whiteWolf:1,seer:1});V.slice(1).forEach(v=>st.alive[v]=false);E.wwAct(st,R('whiteWolf'),{type:'night',t:-1},100);E.wwAct(st,R('seer'),{type:'night',t:V[0]},100);
  ok(st.phase==='speak','發言 '+st.phase);E.wwAct(st,R('whiteWolf'),{type:'boom',t:V[0]},200);ok(st.over&&st.over.win==='wolf'&&st.over.both,'自爆同歸於盡 '+JSON.stringify(st.over));}
}
// 比人數（0.25.0 起的預設）：狼人數追平或超過好人數才算狼贏，平民或神職全滅不算
{ok(E.wwCfgFor(9).win==='num'&&E.wwCfgFix({n:9,roles:{wolf:3},win:'side'}).win==='side','預設比人數');
 const st=E.wwNew(E.wwCfgFor(9),Array(9).fill(false),0);const W=st.roles.map((r,i)=>r==='wolf'?i:-1).filter(i=>i>=0),V=st.roles.map((r,i)=>r==='villager'?i:-1).filter(i=>i>=0),R=r=>st.roles.indexOf(r);
 ok(E.wwJudge(st)===null,'開局 3 狼 6 好人：繼續');V.forEach(v=>st.alive[v]=false);const j=E.wwJudge(st);ok(j&&j.win==='wolf','3 狼 3 好人＝追平，狼人贏 '+JSON.stringify(j));}
{const st=E.wwNew(E.wwCfgFor(9),Array(9).fill(false),0);const W=st.roles.map((r,i)=>r==='wolf'?i:-1).filter(i=>i>=0),V=st.roles.map((r,i)=>r==='villager'?i:-1).filter(i=>i>=0);
 st.alive[V[0]]=st.alive[V[1]]=false;st.alive[W[0]]=false;ok(E.wwJudge(st)===null,'2 狼 4 好人：繼續');
 st.alive[V[2]]=false;ok(E.wwJudge(st)===null,'平民全滅、2 狼 3 神：比人數下還沒結束');
 st.alive[st.roles.indexOf('seer')]=false;const j=E.wwJudge(st);ok(j&&j.win==='wolf'&&/追平/.test(j.why),'2 狼 2 好人：狼人贏 '+JSON.stringify(j));
 W.forEach(w=>st.alive[w]=false);ok(E.wwJudge(st).win==='good','狼全滅：好人贏');}
// 電腦好人的判斷：預言家沒有發言模型也會報查驗；被查殺的人知道對方是假的；夜裡被殺的預言家大家都信
{const st=E.wwNew(E.wwCfgFor(9),Array(9).fill(true),0);const R=r=>st.roles.indexOf(r),W=st.roles.map((r,i)=>r==='wolf'?i:-1).filter(i=>i>=0),V=st.roles.map((r,i)=>r==='villager'?i:-1).filter(i=>i>=0),se=R('seer');
 st.strat[se]='seerJump';st.seerRes[W[0]]=true;st.phase='speak';st.cur=se;const line=E.wwCanned(st,se);
 ok(/我是預言家/.test(line)&&line.includes(`查驗${W[0]+1}號是狼人`)&&line.includes(`投${W[0]+1}號`),'預言家報查驗 '+line);
 ok(E.wwCanned(st,V[0])===null,'平民沒有模型就說過');
 ok(!E.wwAct(st,se,{type:'say',txt:line},0),'預言家發言');
 ok(st.pub.seer[se]!=null&&st.pub.rep[se].kill.includes(W[0]),'公開資訊記到查殺 '+JSON.stringify(st.pub));
 st.nd=[se];const B=E.wwBelief(st,V[0]);ok(B.trust===se&&B.kills.includes(W[0]),'夜裡被殺的預言家可信 '+JSON.stringify(B));
 // 狼悍跳查殺平民：那位平民認定他是假的
 st.cur=W[1];ok(!E.wwAct(st,W[1],{type:'say',txt:`我才是預言家，查驗${V[1]+1}號是狼人，今天投${V[1]+1}號。`},0),'狼悍跳發言');
 ok(E.wwBelief(st,V[1]).liars.includes(W[1]),'被查殺的好人知道對方是假預言家');ok(E.wwBelief(st,se).liars.includes(W[1]),'真預言家知道對跳的是假的');}
// 隱狼：預言家查驗一律是好人（其他狼都出局、隱狼開始殺人之後也一樣）；結束時標明並提醒查過他的預言家
{const st=E.wwNew(E.wwCfgFix({n:8,roles:{wolf:1,hiddenWolf:1,seer:1,witch:1},win:'num'}),Array(8).fill(false),0);const R=r=>st.roles.indexOf(r),hw=R('hiddenWolf'),w=R('wolf'),se=R('seer');
 E.wwAct(st,se,{type:'night',t:hw},100);ok(st.seerRes[hw]===false&&st.msgs.some(m=>m.to===se&&m.txt===`查驗結果：${hw+1} 號 是好人。`),'隱狼查驗是好人');
 st.alive[w]=false;ok(E.wwView(st,hw,0).killer,'隊友出局後隱狼變成會殺人');delete st.seerRes[hw];st.night.acted={};E.wwAct(st,se,{type:'night',t:hw},200);ok(st.seerRes[hw]===false,'會殺人之後查驗仍是好人');
 st.alive.forEach((a,i)=>{if(i!==hw&&i!==se)st.alive[i]=false;});E.wwTick(st,1e9);E.wwTick(st,2e9);
 ok(st.over&&st.over.win==='wolf','隱狼算狼人陣營 '+JSON.stringify(st.over));ok(st.msgs.some(m=>m.to==='all'&&m.txt.includes(`${hw+1} 號隱狼（狼人陣營，預言家查不出來）`)),'結束時標明隱狼');
 ok(st.msgs.some(m=>m.to===se&&/是隱狼：/.test(m.txt)),'提醒查過隱狼的預言家');}
// 查驗只知道好人／狼人，不知道職業；隱狼知道自己是狼，不咬自己懷疑是狼（可能是隊友）的人
{const st=E.wwNew(E.wwCfgFix({n:9,roles:{wolf:2,hiddenWolf:1,seer:1,witch:1,hunter:1},win:'num'}),Array(9).fill(true),0);const R=r=>st.roles.indexOf(r),se=R('seer'),hw=R('hiddenWolf'),W=st.roles.map((r,i)=>r==='wolf'?i:-1).filter(i=>i>=0);st.phase='speak';
 const chk=(s,txt)=>E.wwTalkCheck(st,s,E.wwTalkParse(txt+'\n投:棄'));st.seerRes[R('witch')]=false;
 ok(chk(se,`我是預言家，查驗${R('witch')+1}號是女巫。`)==='查驗報出職業','預言家不能報職業');ok(!chk(se,`我是預言家，查驗${R('witch')+1}號是好人。`),'報好人可以');
 ok(chk(se,`我是預言家，驗了${R('witch')+1}號，他是神。`)==='查驗報出職業','報神職也不行');
 ok(E.wwView(st,hw,0).msgs.some(m=>m.to===hw&&/身份是「隱狼」：狼人陣營/.test(m.txt)),'隱狼知道自己是狼人陣營');
 // 隱狼知道狼隊友（0.26.4），隊友不知道他；隱狼看不到狼隊頻道
 const vh=E.wwView(st,hw,0);ok(!vh.killer&&W.every(w=>vh.wolves.includes(w))&&vh.msgs.every(m=>m.to!=='wolf'),'隱狼看得到隊友、看不到狼隊頻道');
 ok(vh.msgs.some(m=>m.to===hw&&/^你的狼隊友：/.test(m.txt)),'隱狼收到隊友名單');ok(W.every(w=>!E.wwView(st,w,0).wolves.includes(hw)),'隊友不知道隱狼');
 ok(/狼隊友：/.test(E.wwTalkPrompt(st,hw)),'隱狼的提示有狼隊友');
 const p=E.wwTalkParse(`${W[0]+1}號這發言太假了，明顯是狼。我覺得${R('witch')+1}號比較怪。
投:${W[0]+1}`);st.phase='speak';
 ok(E.wwTalkCover(st,hw,p)===null&&!p.speech.includes((W[0]+1)+'號這')&&p.vote===-1,'隱狼也不咬隊友 '+p.speech);
 st.phase='vote';st.votes={};st.dl=1e12;st.cur=-1;for(let k=0;k<200;k++){E.wwTick(st,1e6+k*300);if(hw in st.votes)break;}
 ok(hw in st.votes&&!W.includes(st.votes[hw])&&st.votes[hw]!==hw,'隱狼不投隊友 '+st.votes[hw]);}
// 記憶從源頭隔開（0.27.1）：給模型的提示只由「這個人看得到的東西」組成。把他不知道的人的身份全部洗牌、把他看不到的訊息全部刪掉，提示必須一字不差；
// 而且提示的前半段（到「存活：」之前，模型會沿用快取的那段）只有公開內容，同一時間每個人都一樣
{let checked=0,diff=0,pubDiff=0;
 for(let g=0;g<30;g++){const n=7+g%6,cfg=E.wwCfgFix({n,roles:{wolf:2+(n>9),hiddenWolf:g%3===0?1:0,seer:1,witch:1,hunter:1,guard:n>9?1:0,gravekeeper:g%2,crow:g%4===1?1:0}});const st=E.wwNew(cfg,Array(n).fill(true),0);let t=0,k=0;
  while(!st.over&&k++<30000){t+=300;E.wwTick(st,t);if(k%41||st.over)continue;
    const pubs=new Set();
    for(let s=0;s<n;s++){if(!st.alive[s])continue;const p=E.wwTalkPrompt(st,s);pubs.add(p.slice(0,p.indexOf('\n存活：')));
      const v=E.wwView(st,s,t),known=new Set([s,...(v.wolves||[])]);   // 他確定知道身份的：自己、知道的狼隊友
      const c=JSON.parse(JSON.stringify(st)),free=c.roles.map((r,i)=>i).filter(i=>!known.has(i)),pool=free.map(i=>c.roles[i]);
      for(let i=pool.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[pool[i],pool[j]]=[pool[j],pool[i]];}
      free.forEach((i,j)=>c.roles[i]=pool[j]);
      if(!free.some(i=>E.WW_ROLES[c.roles[i]].side==='wolf'&&st.roles[i]!=='hiddenWolf'&&c.roles[i]!=='hiddenWolf'&&E.WW_ROLES[st.roles[i]].side!=='wolf')){   // 洗牌後「誰是會殺人的狼」不能變，否則他看得到的狼隊頻道會不同
        c.msgs=c.msgs.filter(m=>m.to==='all'||m.to===s||(m.to==='wolf'&&v.killer));   // 他看不到的訊息全部刪掉
        if(st.roles[s]!=='seer')c.seerRes={};
        checked++;if(E.wwTalkPrompt(c,s)!==p){diff++;if(diff<3)console.log('提示用到別人的資訊',s,st.roles[s]);}}}
    if(pubs.size>1)pubDiff++;}}
 ok(checked>300&&!diff,`提示從源頭隔開：檢查 ${checked} 次、不一樣 ${diff} 次`);ok(!pubDiff,`快取那段只有公開內容、每個人都一樣（不一樣 ${pubDiff} 次）`);}
// 記憶不互通（0.26.0）：每位電腦的懷疑只能用他自己看得到的東西。把他不該知道的人的身份洗牌，算出來的懷疑要一模一樣
{let checked=0,diff=0;
 for(let g=0;g<40;g++){const n=7+g%6,cfg=E.wwCfgFix({n,roles:{wolf:2+(n>9),seer:1,witch:1,hunter:1,guard:n>9?1:0,gravekeeper:g%2,knight:g%3===0?1:0}});const st=E.wwNew(cfg,Array(n).fill(true),0);let t=0,k=0;
  while(!st.over&&k++<30000){t+=300;E.wwTick(st,t);
    if(k%37||st.over)continue;
    for(let s=0;s<n;s++){if(!st.alive[s]||E.wwView(st,s,t).killer||st.roles[s]==='hiddenWolf')continue;
      const a=E.wwMind(st,s);
      // 他確定知道的：自己；別人的身份一律洗牌（但要維持「會殺人的狼」那幾個座位不變，否則法官的流程會不同）
      const free=st.roles.map((r,i)=>i).filter(i=>i!==s);const c=JSON.parse(JSON.stringify(st));const pool=free.map(i=>c.roles[i]);
      for(let i=pool.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[pool[i],pool[j]]=[pool[j],pool[i]];}
      free.forEach((i,j)=>c.roles[i]=pool[j]);c.seerRes=st.roles[s]==='seer'?st.seerRes:{};
      const b=E.wwMind(c,s);checked++;if(a.sus.some((x,i)=>Math.abs(x-b.sus[i])>1e-9)){diff++;if(diff<3)console.log('記憶外洩',s,st.roles[s],a.sus.map(x=>x.toFixed(1)).join(','),'|',b.sus.map(x=>x.toFixed(1)).join(','));}}}}
 ok(checked>200&&!diff,`記憶不互通：檢查 ${checked} 次、不一樣 ${diff} 次`);}
// 誰都可以偽裝：好人可以說自己是別的神職或平民，但不能假跳預言家；說過一個神職就不能換另一個
{const st=E.wwNew(E.wwCfgFor(10),Array(10).fill(false),0);const R=r=>st.roles.indexOf(r),V=st.roles.map((r,i)=>r==='villager'?i:-1).filter(i=>i>=0);st.phase='speak';
 const chk=(s,txt)=>E.wwTalkCheck(st,s,E.wwTalkParse(txt+'\n投:棄'));
 ok(!chk(V[0],'我是女巫，昨晚沒用藥。'),'平民可以假裝女巫');ok(!chk(R('hunter'),'我是平民。'),'獵人可以藏成平民');ok(!chk(R('witch'),'我是守衛。'),'女巫可以假裝守衛');
 ok(!chk(V[0],'我是預言家，查驗'+(V[2]+1)+'號是好人。'),'好人可以冒充預言家報假查驗（0.27.2）');ok(chk(V[0],'我是狼人。')==='好人說自己是狼','好人不說自己是狼');
 {const W0=st.roles.indexOf('wolf');ok(!chk(W0,'我是預言家，查驗'+(V[2]+1)+'號是狼人。'),'沒分配悍跳的狼也可以跳預言家');ok(chk(W0,'我是狼人。')==='狼人自曝','狼人不自曝');}
 st.seerRes={};st.seerRes[V[2]]=false;ok(chk(R('seer'),'我是預言家，查驗'+(V[2]+1)+'號是狼人。')==='預言家報假查殺','真預言家報的查驗要是真的');
 st.pub={seer:{},rep:{},claim:{[V[1]]:['獵人']}};ok(!chk(V[1],'我是守衛。'),'前後說法不一也可以（說謊正常）');
 ok(E.wwClaimsOf('我其實是獵人，3號是狼').join()==='獵人'&&E.wwClaimsOf('我只是個平民').join()==='平民','身份宣稱解析');
 ok(E.wwDefends('3號不像狼，5號是狼').join()==='2','護航解析 '+E.wwDefends('3號不像狼，5號是狼'));}
// 懷疑分高低：有人說他是我的身份＝高度懷疑；點名我＝中度
{const st=E.wwNew(E.wwCfgFor(9),Array(9).fill(true),0);const R=r=>st.roles.indexOf(r),V=st.roles.map((r,i)=>r==='villager'?i:-1).filter(i=>i>=0),h=R('hunter');
 st.gut={};st.roles.forEach((r,i)=>st.gut[i]=Array(9).fill(0));st.phase='speak';st.day=1;
 st.cur=V[0];E.wwAct(st,V[0],{type:'say',txt:'我是獵人，大家相信我。'},0);st.cur=V[1];E.wwAct(st,V[1],{type:'say',txt:`我覺得${h+1}號就是狼，今天投${h+1}號。`},0);
 const M=E.wwMind(st,h);ok(M.lv(V[0])==='高'&&M.lv(V[1])==='中'&&M.rank[0]===V[0],'獵人的懷疑 '+M.sus.map(x=>x.toFixed(1)));
 const M2=E.wwMind(st,R('witch'));ok(M2.lv(V[0])==='低'&&M2.lv(V[1])==='低','女巫不知道誰是真獵人 '+M2.sus.map(x=>x.toFixed(1)));}
// 隨機身份組合的全電腦對局（含騎士、白狼王由測試隨機觸發）
{let done=0,tries=0;const keys=['wolfKing','whiteWolf','hiddenWolf','seer','witch','hunter','guard','idiot','knight','gravekeeper','crow','bear'];
 while(done<400&&tries<5000){tries++;const n=6+Math.floor(Math.random()*7),roles={wolf:1+Math.floor(Math.random()*2)};keys.forEach(k=>{if(Math.random()<.45)roles[k]=1;});
  const cfg=E.wwCfgFix({n,roles,win:['num','side','all'][done%3]});if(E.wwCfgErr(cfg))continue;done++;
  const st=E.wwNew(cfg,Array(n).fill(true),0);let t=0,steps=0;
  while(!st.over&&steps<30000){t+=300;
    if(st.phase==='speak'&&Math.random()<.01){const k=st.roles.indexOf('knight'),w=st.roles.indexOf('whiteWolf'),al=st.alive.map((a,i)=>a?i:-1).filter(i=>i>=0);
      if(k>=0&&st.alive[k]&&Math.random()<.5)E.wwAct(st,k,{type:'duel',t:al[Math.floor(Math.random()*al.length)]},t);else if(w>=0&&st.alive[w])E.wwAct(st,w,{type:'boom',t:al[Math.floor(Math.random()*al.length)]},t);}
    E.wwTick(st,t);steps++;if(['speak','last','hunter'].includes(st.phase)&&!st.ai[st.cur]){fail++;break;}}
  if(!st.over){fail++;console.log('random no end',JSON.stringify(cfg),st.phase);break;}
  const w=st.roles.filter((r,i)=>E.WW_ROLES[r].side==='wolf'&&st.alive[i]).length;if(st.over.win==='good'?w!==0:(w===0&&!st.over.both)){fail++;console.log('bad win',st.over,w);}}
 console.log('隨機身份',done,'局');}
console.log(fail?'失敗 '+fail:'全部通過');
