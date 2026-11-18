// 八國聯軍規則測試：node tools/bgtest.js
const E=require('./bg_engine.js');
let fail=0;const ok=(c,msg)=>{if(!c){fail++;console.log('FAIL',msg);}};
// 地圖
const st0=E.bgNew();let cnt={Q:0,A:0};st0.b.forEach((p,i)=>{if(p){cnt[p.s]++;ok(E.BG_VALID[i],'piece off map '+i);}});
console.log('格子',E.BG_VALID.reduce((a,b)=>a+b,0),'清軍',cnt.Q,'聯軍',cnt.A,'地圖',E.BG_W+'x'+E.BG_H);
ok(cnt.Q===104&&cnt.A===130,'counts');
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
 const A=[0,0,0,0,0,0,0,0];st.b.forEach(p=>{if(p&&p.s==='A')A[p.n]++;});ok(A.every((n,i)=>n===(i===1?18:16)),'八國各一整副自己的棋（日本 18 子）');}
console.log(fail?'失敗 '+fail:'陣形檢查通過');
// 各國自己的棋（0.16.0）
{const W=E.BG_W,st=E.bgNew(),at=(n,t)=>st.b.findIndex(p=>p&&p.s==='A'&&p.n===n&&p.t===t),types=n=>st.b.filter(p=>p&&p.s==='A'&&p.n===n).map(p=>p.t).sort().join('');
 ok(types(1)==='bgggjklrsssuuuuuuuu'.split('').sort().join('')||types(1).length===18,'日本 18 子');ok(types(1).includes('l')&&types(1).includes('u')&&!types(1).includes('p'),'日本用將棋子');
 ok(types(5).includes('c')&&types(5).includes('m')&&types(5).includes('f')&&types(5).includes('w')&&types(5).includes('a'),'德國用信使棋子');
 ok(types(0).split('o').length===2,'俄國有一個王前兵');
 for(const n of[3,7]){const back=st.b.map((p,i)=>p&&p.s==='A'&&p.n===n&&p.t!=='p'?[i,p.t]:null).filter(Boolean);const bs=back.filter(x=>x[1]==='b').map(x=>(x[0]%W+((x[0]/W)|0))%2);ok(back.length===8&&bs[0]!==bs[1],'隨機底線：主教一黑一白 '+n);}
 // 德國的兵第一步不能走兩格；英國可以
 const gp=at(5,'p'),ep=at(2,'p');ok(E.bgMoves(st,gp,false).length===1,'信使棋的兵只能走一格');ok(E.bgMoves(st,ep,false).length===2,'西洋棋的兵第一步可走兩格');
 // 日本的歩往右走一格；香往右直衝
 const u=at(1,'u');ok(E.bgMoves(st,u,false).length===1&&E.bgMoves(st,u,false)[0]===u+1,'歩往前一格');
 // 日本的飛走進清軍腹地會升變成龍
 const s2=E.bgNew();s2.b.fill(null);const pos=E.bgIdx(12,17);s2.b[pos]={s:'A',t:'r',n:1};s2.b[E.bgIdx(0,0+2)]={s:'A',t:'k',n:1};s2.b[E.bgIdx(20,33)]={s:'Q',t:'X',n:-1};s2.turn='A';E.bgApply(s2,pos,E.bgIdx(12,20));ok(s2.b[E.bgIdx(12,20)].t==='d','飛進腹地升變成龍');
 // 俄國王前兵走到盡頭變赫爾吉
 const s3=E.bgNew();s3.b.fill(null);const a=E.bgIdx(W-2,12);s3.b[a]={s:'A',t:'o',n:0,m:1};s3.b[E.bgIdx(0,12)]={s:'A',t:'k',n:0};s3.b[E.bgIdx(20,33)]={s:'Q',t:'X',n:-1};s3.turn='A';E.bgApply(s3,a,a+1);ok(s3.b[a+1].t==='e','王前兵升變成赫爾吉');}
console.log(fail?'失敗 '+fail:'各國棋種檢查通過');
// 各國棋種可以設定（0.17.0）：全部換成西洋棋、全部換成將棋都要能開局並下完
{const cntA=st=>{const A=[0,0,0,0,0,0,0,0];st.b.forEach(p=>{if(p&&p.s==='A')A[p.n]++;});return A;};
 const all=E.bgNew(Array(8).fill('ch'));ok(cntA(all).every(n=>n===16),'全部西洋棋：各 16 子');ok(!all.b.some(p=>p&&p.s==='A'&&!'kqrbnp'.includes(p.t)),'全部西洋棋：只有西洋棋子');
 ok(all.b.filter((p,i)=>p&&p.s==='A'&&p.n===1).map(p=>p.t).sort().join('')==='bbknnpppppppprrq'.split('').sort().join(''),'日本換成西洋棋');
 for(const k of Object.keys(E.BG_KINDS)){const st=E.bgNew(Array(8).fill(k));ok(cntA(st).every(n=>n===(k==='sh'?18:16)),'全部 '+k+' 子數');st.b.forEach((p,i)=>{if(p)ok(E.BG_VALID[i],'棋子在地圖外 '+k);});
   let n=0;for(;n<200&&!st.over;n++){const mv=E.bgAI(st);if(!mv)break;E.bgApply(st,mv[0],mv[1]);}ok(n>20,'全部 '+k+' 可以對局');}
 E.bgNew(E.BG_OWN);}
console.log(fail?'失敗 '+fail:'棋種設定檢查通過');
