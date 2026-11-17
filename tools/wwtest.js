// 狼人殺規則測試：node tools/wwtest.js
const E=require('./ww_engine.js');
let fail=0;const ok=(c,msg)=>{if(!c){fail++;console.log('FAIL',msg);}};
for(let n=5;n<=12;n++){const c=E.wwCfgFor(n);if(n===5){c.roles={wolf:1,seer:1,witch:1,hunter:0,guard:0,idiot:0};}ok(!E.wwCfgErr(c),'preset '+n+' '+E.wwCfgErr(c));}
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
 ok(st.phase==='night','night min time');E.wwTick(st,12000);ok(st.phase==='witch','to witch '+st.phase);
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
console.log(fail?'失敗 '+fail:'全部通過');
