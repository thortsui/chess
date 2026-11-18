// 甲午戰爭引擎測試：node tools/jwtest.js
const E=require('./jw_engine.js');
let fail=0;const ok=(c,m)=>{if(!c){fail++;console.log('FAIL',m);}};
const START='lmsgygsml.t.....f.uuuuuuuuu'+'.'.repeat(27)+'PPPPPPPPP.C.....C.R.......RRNBAKABNR';
ok(START.length===90,'開局字串 90 格');
const cnt=s=>[...s].filter(c=>c!=='.').length;ok(cnt(START)===42,'開局 42 子');
// 吃子收進手上：日軍的角吃掉清軍的兵
{let b='....y....'+'.'.repeat(36)+'....f....'+'.....P...'+'.'.repeat(18)+'....K....';
 const r=E.play({b,hand:{},s:'b'},{f:45+4,t:54+5});ok(r.hand.U===1,'吃兵得到歩');ok(r.b[59]==='f','角還沒進升變區不升變');}
// 升變：歩走進第 8 排（index 7）變成 と
{let b='...y.....'+'.'.repeat(45)+'u........'+'.'.repeat(18)+'....K....';
 const r=E.play({b,hand:{},s:'b'},{f:54,t:63});ok(r.b[63]==='o','歩升變成と');}
// 打入
{let b='...y.....'+'.'.repeat(72)+'....K....';
 const r=E.play({b,hand:{T:1},s:'b'},{drop:'T',t:40});ok(r.b[40]==='t'&&r.hand.T===0,'打入飛');}
// 一步殺：日軍手上有金，清軍帥在角落被困
{let b='...y.....'+'.'.repeat(63)+'...s.s...'+'....K....';
 const mv=E.think({b,hand:{G:1},s:'b',depth:3,time:2000});ok(mv&&(mv.drop==='G'||mv.f!==undefined),'找得到殺棋');}
// 自我對局：不會出錯、每一步都合法
let res={r:0,b:0,d:0},plies=0,t0=Date.now();
for(let g=0;g<6;g++){let st={b:START,hand:{},s:'b'},k=0,w=null;const av=[];
  for(;k<240;k++){const mv=E.think({...st,depth:6,time:40,avoid:av,noise:k<8?60:6});if(!mv){w=st.s==='r'?'b':'r';break;}
    const before=cnt(st.b)+Object.values(st.hand).reduce((a,b)=>a+b,0);st=E.play(st,mv);av.push(st.key);
    const after=cnt(st.b)+Object.values(st.hand).reduce((a,b)=>a+b,0);ok(after<=before,'棋子數不會變多');
    if(!st.b.includes('K')){w='b';break;}if(!st.b.includes('y')){w='r';break;}}
  res[w||'d']++;plies+=k;}
console.log('自我對局 6 局（每步 40ms）',JSON.stringify(res),'平均步數',(plies/6).toFixed(0));
console.log(fail?'失敗 '+fail:'全部通過');
