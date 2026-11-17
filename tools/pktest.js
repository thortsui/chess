const E=require('./pk_engine.js');const {b2Combo:C,b2Beats:B}=E;
const card=(r,s)=>(r-1)*4+s;   // s:0♣1♦2♥3♠
let fail=0;const ok=(cond,msg)=>{if(!cond){fail++;console.log('FAIL',msg);}};
// 牌型
ok(C([card(3,0)]).name==='單張','single');ok(C([card(5,0),card(5,3)]).name==='對子','pair');ok(!C([card(5,0),card(6,3)]),'bad pair');
ok(C([card(3,0),card(4,1),card(5,2),card(6,3),card(7,0)]).name==='順子','straight');
ok(C([card(2,0),card(4,0),card(9,0),card(11,0),card(13,0)]).name==='同花','flush');
ok(C([card(9,0),card(9,1),card(9,2),card(4,3),card(4,0)]).name==='葫蘆','full');
ok(C([card(9,0),card(9,1),card(9,2),card(9,3),card(4,0)]).name==='鐵支','quads');
ok(C([card(3,2),card(4,2),card(5,2),card(6,2),card(7,2)]).name==='同花順','sf');
ok(!C([card(3,0),card(4,1),card(5,2),card(6,3)]),'4 cards invalid');
ok(!C([card(11,0),card(12,1),card(13,2),card(1,3),card(2,0)]),'JQKA2 not straight');
// 大小
ok(B(C([card(2,0)]),C([card(1,3)])),'2 beats A');ok(B(C([card(3,3)]),C([card(3,2)])),'♠3 > ♥3');ok(!B(C([card(3,0)]),C([card(3,1)])),'♣3 < ♦3');
const s23456=C([card(2,0),card(3,1),card(4,2),card(5,3),card(6,0)]),sA2345=C([card(1,0),card(2,1),card(3,2),card(4,3),card(5,0)]),s10A=C([card(10,0),card(11,1),card(12,2),card(13,3),card(1,0)]);
ok(B(s23456,sA2345)&&B(sA2345,s10A),'straight order 23456>A2345>10JQKA');
ok(B(C([card(9,0),card(9,1),card(9,2),card(4,3),card(4,0)]),C([card(2,0),card(4,0),card(9,0),card(11,0),card(13,0)])),'full beats flush');
ok(!B(C([card(5,0),card(5,3)]),C([card(5,0)])),'pair cannot beat single');
const quads=C([card(9,0),card(9,1),card(9,2),card(9,3),card(4,0)]),sf=C([card(3,2),card(4,2),card(5,2),card(6,2),card(7,2)]);
ok(B(quads,C([card(2,3)]))&&B(quads,C([card(2,0),card(2,3)])),'鐵支壓單張、對子');ok(B(sf,quads)&&!B(quads,sf),'同花順壓鐵支');
ok(!B(C([card(2,3)]),quads)&&!B(C([card(9,0),card(9,1),card(9,2),card(4,3),card(4,0)]),quads),'一般牌壓不過鐵支');
// AI 自動對局
let turns=0;const t0=Date.now();
for(let g=0;g<300;g++){const st=E.b2New();let n=0;while(!st.over&&n++<500){const a=E.b2AI(st,st.turn);const e=E.b2Act(st,st.turn,a);if(e){fail++;console.log('b2 AI illegal',e,JSON.stringify(a));break;}}if(!st.over){fail++;console.log('b2 no end');}turns+=n;
  const tot=st.hands.reduce((x,h)=>x+h.length,0);}
console.log('大老二 300 局 平均手數',(turns/300).toFixed(1),'ms',Date.now()-t0);
for(let g=0;g<300;g++){const st=E.omNew();let n=0;while(!st.over&&n++<3000){const e=E.omAct(st,st.turn,E.omAI(st,st.turn));if(e){fail++;console.log('om illegal',e);break;}}
  if(!st.over){fail++;console.log('om no end');}else if(!st.hands[st.over.loser].includes(52)){fail++;console.log('om loser lacks joker');}}
console.log('抽鬼牌 300 局 OK');
let hhEnd=0;for(let g=0;g<300;g++){const st=E.hhNew();let n=0;while(!st.over&&n++<20000){
  if(st.match){[0,1,2,3].sort(()=>Math.random()-.5).slice(0,Math.random()<.5?4:3).forEach(i=>E.hhAct(st,i,{type:'slap'}));if(st.match)E.hhResolve(st);}
  else E.hhAct(st,st.turn,{type:'flip'});
  const tot=st.piles.reduce((x,p)=>x+p.length,0)+st.center.length;if(tot!==52){fail++;console.log('hh card count',tot);break;}}
  if(st.over)hhEnd++;}
console.log('心臟病 300 局 結束',hhEnd);
console.log(fail?'失敗 '+fail:'全部通過');
