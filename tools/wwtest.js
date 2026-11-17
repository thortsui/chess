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
  if(st.over.win==='wolf'&&!w){fail++;console.log('wolf win without wolves');}
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

// 隨機身份組合的全電腦對局（含騎士、白狼王由測試隨機觸發）
{let done=0,tries=0;const keys=['wolfKing','whiteWolf','hiddenWolf','seer','witch','hunter','guard','idiot','knight','gravekeeper','crow','bear'];
 while(done<400&&tries<5000){tries++;const n=6+Math.floor(Math.random()*7),roles={wolf:1+Math.floor(Math.random()*2)};keys.forEach(k=>{if(Math.random()<.45)roles[k]=1;});
  const cfg=E.wwCfgFix({n,roles,win:Math.random()<.5?'all':'side'});if(E.wwCfgErr(cfg))continue;done++;
  const st=E.wwNew(cfg,Array(n).fill(true),0);let t=0,steps=0;
  while(!st.over&&steps<30000){t+=300;
    if(st.phase==='speak'&&Math.random()<.01){const k=st.roles.indexOf('knight'),w=st.roles.indexOf('whiteWolf'),al=st.alive.map((a,i)=>a?i:-1).filter(i=>i>=0);
      if(k>=0&&st.alive[k]&&Math.random()<.5)E.wwAct(st,k,{type:'duel',t:al[Math.floor(Math.random()*al.length)]},t);else if(w>=0&&st.alive[w])E.wwAct(st,w,{type:'boom',t:al[Math.floor(Math.random()*al.length)]},t);}
    E.wwTick(st,t);steps++;if(['speak','last','hunter'].includes(st.phase)&&!st.ai[st.cur]){fail++;break;}}
  if(!st.over){fail++;console.log('random no end',JSON.stringify(cfg),st.phase);break;}
  const w=st.roles.filter((r,i)=>E.WW_ROLES[r].side==='wolf'&&st.alive[i]).length;if((st.over.win==='good')!==(w===0)){fail++;console.log('bad win',st.over,w);}}
 console.log('隨機身份',done,'局');}
console.log(fail?'失敗 '+fail:'全部通過');
