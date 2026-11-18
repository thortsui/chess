// 八國聯軍規則測試：node tools/bgtest.js
const E=require('./bg_engine.js');
let fail=0;const ok=(c,msg)=>{if(!c){fail++;console.log('FAIL',msg);}};
// 地圖
const st0=E.bgNew();let cnt={Q:0,A:0};st0.b.forEach((p,i)=>{if(p){cnt[p.s]++;ok(E.BG_VALID[i],'piece off map '+i);}});
console.log('格子',E.BG_VALID.reduce((a,b)=>a+b,0),'清軍',cnt.Q,'聯軍',cnt.A,'地圖',E.BG_W+'x'+E.BG_H);
ok(cnt.Q===104&&cnt.A===128,'counts');
// 畫出地圖
let s='';for(let y=0;y<E.BG_H;y++){let r='';for(let x=0;x<E.BG_W;x++){const i=E.bgIdx(x,y),p=st0.b[i];r+=!E.BG_VALID[i]?' ':p?(p.s==='Q'?p.t:String(p.n)):'·';}s+=r+'\n';}console.log(s);
console.log('慈禧',st0.b.filter(p=>p&&(p.t==='X'||p.t==='Y')).length,'將',st0.b.filter(p=>p&&p.t==='G').length);console.log('開局清軍可走',E.bgAll(st0,'Q',false).length,'聯軍可走',E.bgAll({...st0,turn:'A'},'A',false).length);
// 自動對局
const res={Q:0,A:0,d:0};let t0=Date.now(),plies=0;
for(let g=0;g<6;g++){const st=E.bgNew();let k=0;
  for(;k<600&&!st.over;k++){const mv=E.bgAI(st);if(!mv)break;const p=st.b[mv[0]],q=st.b[mv[1]];
    ok(p&&p.s===st.turn,'wrong side');ok(!q||q.s!==p.s,'captured own');E.bgApply(st,mv[0],mv[1]);}
  if(st.over)res[st.over.win]++;else res.d++;plies+=k;console.log('局',g,st.over?st.over.win+' '+st.over.why:'未分勝負',k,'步','陣亡國',st.dead.filter(x=>x).length);}
console.log(JSON.stringify(res),'平均每步 ms',((Date.now()-t0)/plies).toFixed(1));
console.log(fail?'失敗 '+fail:'全部通過');
// 開局清軍每隻馬都要有地方走
{const st=E.bgNew();st.b.forEach((p,i)=>{if(p&&p.s==='Q'&&p.t==='H')ok(E.bgMoves(st,i,false).length>0,'馬開局動不了 '+i);});}
console.log(fail?'失敗 '+fail:'馬檢查通過');
// 清軍陣形要符合使用者的描述（0.14.8）
{const st=E.bgNew(),W=E.BG_W,Q=[];for(let y=18;y<E.BG_H;y++){let r='';for(let x=0;x<W;x++){const i=E.bgIdx(x,y);if(E.BG_VALID[i])r+=st.b[i]?st.b[i].t:'.';}Q.push(r);}
 ok(Q.length===16&&Q.every(r=>r.length===20),'腹地 20×16');
 ok(/^(G\.)+$/.test(Q[0])&&/^(\.G)+$/.test(Q[1]),'將兩排貼最前緣');
 ok(Q[3]===Q[5]&&/^\.\.(C\.)+\.\.$/.test(Q[3]),'炮兩排、左右內縮兩格');ok(/^(\.H)+$/.test(Q[4]),'馬一排');
 ok([10,11,12,13,14,15].every(i=>Q[i].startsWith('RR')&&Q[i].endsWith('RR')),'最左最右兩層車');
 ok([13,14,15].every(i=>{const r=Q[i].replace('Y','X');return r===[...r].reverse().join('');}),'後三排左右對稱');
 st.b.forEach((p,i)=>{if(p&&p.s==='Q'&&p.t==='H')ok(!st.b[i-W],'馬正前方有棋 '+i);});
 const A=[0,0,0,0,0,0,0,0];st.b.forEach(p=>{if(p&&p.s==='A')A[p.n]++;});ok(A.every(n=>n===16),'八國各一整副西洋棋');}
console.log(fail?'失敗 '+fail:'陣形檢查通過');
