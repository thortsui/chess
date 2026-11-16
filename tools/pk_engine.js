/* ===== 撲克牌：規則引擎（大老二、心臟病、抽鬼牌）＋電腦玩家。全部在房主（或單機）端運算 ===== */
// 牌：0..51，花色 s=c%4（0♣ 1♦ 2♥ 3♠），點數 r=(c>>2)+1（1=A … 13=K）；52＝鬼牌
const PK_SU=['♣','♦','♥','♠'],PK_RN=['','A','2','3','4','5','6','7','8','9','10','J','Q','K'];
const pkS=c=>c%4,pkR=c=>(c>>2)+1,pkRed=c=>c!==52&&(c%4===1||c%4===2);
const pkName=c=>c===52?'鬼牌':PK_SU[pkS(c)]+PK_RN[pkR(c)];
function pkShuffle(a){for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
function pkDeck(joker){const d=[];for(let i=0;i<52;i++)d.push(i);if(joker)d.push(52);return pkShuffle(d);}
const pkNext=s=>(s+1)%4;

/* ---------- 大老二 ---------- */
// 大小：3 < 4 < … < K < A < 2；同點數 ♠ > ♥ > ♦ > ♣
const b2v=c=>((pkR(c)+10)%13)*4+pkS(c);
const b2sort=h=>h.sort((a,b)=>b2v(a)-b2v(b));
const B2_KIND=['','順子','同花','葫蘆','鐵支','同花順'];
// 順子大小（台灣常見）：34567 最小 … 10JQKA，再來 A2345，最大 23456
const B2_STR=(()=>{const m={};const key=a=>a.slice().sort((x,y)=>x-y).join(',');
  for(let lo=3;lo<=9;lo++)m[key([lo,lo+1,lo+2,lo+3,lo+4])]=lo-3;m[key([10,11,12,13,1])]=7;m[key([1,2,3,4,5])]=8;m[key([2,3,4,5,6])]=9;return{m,key};})();
function b2Combo(cards){
  const n=cards.length;if(!n)return null;const cs=cards.slice().sort((a,b)=>b2v(a)-b2v(b)),top=b2v(cs[n-1]);
  if(n===1)return{n,k:0,v:top,name:'單張'};
  if(n===2)return pkR(cs[0])===pkR(cs[1])?{n,k:0,v:top,name:'對子'}:null;
  if(n!==5)return null;
  const rs=cs.map(pkR),cnt={};rs.forEach(r=>cnt[r]=(cnt[r]||0)+1);const groups=Object.entries(cnt).sort((a,b)=>b[1]-a[1]);
  const flush=cs.every(c=>pkS(c)===pkS(cs[0])),so=B2_STR.m[B2_STR.key(rs)];
  const rIdx=r=>(+r+10)%13;
  if(so!==undefined&&flush)return{n,k:5,v:so*4+pkS(cs[4]),name:'同花順'};
  if(groups[0][1]===4)return{n,k:4,v:rIdx(groups[0][0]),name:'鐵支'};
  if(groups[0][1]===3&&groups[1][1]===2)return{n,k:3,v:rIdx(groups[0][0]),name:'葫蘆'};
  if(flush)return{n,k:2,v:top,name:'同花'};
  if(so!==undefined)return{n,k:1,v:so*4+pkS(cs[4]),name:'順子'};
  return null;
}
function b2Beats(a,b){if(!b)return true;if(a.n!==b.n)return false;if(a.n===5&&a.k!==b.k)return a.k>b.k;return a.v>b.v;}
function b2New(){const d=pkDeck(false),hands=[[],[],[],[]];d.forEach((c,i)=>hands[i%4].push(c));hands.forEach(b2sort);
  const turn=hands.findIndex(h=>h.includes(8));   // 梅花 3（點數 3、花色 ♣ → 牌 8）
  return{g:'b2',hands,turn,lead:null,passes:0,first:true,over:null,log:[],seq:0};}
// 檢查並套用動作；回傳錯誤訊息字串（合法則回傳 null）
function b2Act(st,seat,a){
  if(st.over)return'這局已經結束';if(seat!==st.turn)return'還沒輪到你';
  if(a.type==='pass'){if(!st.lead)return'你是這一輪第一個出牌的，不能過';
    st.passes++;st.log.push({seat,pass:true});st.turn=pkNext(seat);
    if(st.passes>=3){st.turn=st.lead.seat;st.lead=null;st.passes=0;}st.seq++;return null;}
  const cards=Array.isArray(a.cards)?a.cards:[];const h=st.hands[seat];
  if(!cards.length||new Set(cards).size!==cards.length||!cards.every(c=>h.includes(c)))return'選的牌不在手上';
  const cb=b2Combo(cards);if(!cb)return'這幾張牌不能一起出（可出：單張、對子、順子、同花、葫蘆、鐵支、同花順）';
  if(st.first&&!cards.includes(8))return'第一手要包含梅花 3';
  if(st.lead&&!b2Beats(cb,st.lead.combo))return st.lead.combo.n!==cb.n?`要出 ${st.lead.combo.n} 張`:'壓不過上一手';
  st.hands[seat]=h.filter(c=>!cards.includes(c));st.first=false;st.lead={seat,cards:b2sort(cards.slice()),combo:cb};st.passes=0;
  st.log.push({seat,cards:st.lead.cards,name:cb.name});
  if(!st.hands[seat].length){st.over={winner:seat,left:st.hands.map(x=>x.length)};}else st.turn=pkNext(seat);
  st.seq++;return null;
}
// 列出手上所有可出的牌型
function b2All(h){
  const out=[];h=b2sort(h.slice());h.forEach(c=>out.push([c]));
  for(let i=0;i<h.length;i++)for(let j=i+1;j<h.length;j++)if(pkR(h[i])===pkR(h[j]))out.push([h[i],h[j]]);
  const n=h.length;if(n>=5)for(let a=0;a<n;a++)for(let b=a+1;b<n;b++)for(let c=b+1;c<n;c++)for(let d=c+1;d<n;d++)for(let e=d+1;e<n;e++){const x=[h[a],h[b],h[c],h[d],h[e]];if(b2Combo(x))out.push(x);}
  return out.map(cards=>({cards,cb:b2Combo(cards)}));
}
// 電腦：先手出最小的多張牌型（能一次清掉多張），跟牌出剛好壓得過的最小牌；對手快沒牌時改出大牌
function b2AI(st,seat){
  const h=st.hands[seat],all=b2All(h),danger=st.hands.some((x,i)=>i!==seat&&x.length<=2);
  const score=o=>o.cb.n===5?o.cb.k*100+o.cb.v:o.cb.v;
  if(!st.lead){let c=all;if(st.first)c=c.filter(o=>o.cards.includes(8));
    const five=c.filter(o=>o.cb.n===5),two=c.filter(o=>o.cb.n===2),one=c.filter(o=>o.cb.n===1);
    const pick=five.length?five.sort((a,b)=>score(a)-score(b))[0]:two.length?two.sort((a,b)=>score(a)-score(b))[0]:one.sort((a,b)=>(danger?score(b)-score(a):score(a)-score(b)))[0];
    return{type:'play',cards:pick.cards};}
  const ok=all.filter(o=>b2Beats(o.cb,st.lead.combo)).sort((a,b)=>score(a)-score(b));
  if(!ok.length)return{type:'pass'};
  // 不急著拆掉 2：手牌還多、對手也沒威脅時，有一定機率保留大牌
  const pick=danger?ok[ok.length-1]:ok[0];
  if(!danger&&h.length>6&&pick.cb.n===1&&pkR(pick.cards[0])===2&&Math.random()<.5)return{type:'pass'};
  return{type:'play',cards:pick.cards};
}
// 提示：給玩家一組可出的牌
function b2Hint(st,seat){const all=b2All(st.hands[seat]);let c=all;if(st.first)c=c.filter(o=>o.cards.includes(8));
  if(st.lead)c=c.filter(o=>b2Beats(o.cb,st.lead.combo));const sc=o=>o.cb.n===5?o.cb.k*100+o.cb.v:o.cb.v;
  c.sort((a,b)=>(st.lead?0:b.cb.n-a.cb.n)||sc(a)-sc(b));return c.length?c[0].cards:null;}

/* ---------- 心臟病 ---------- */
// 輪流翻牌並依序喊 1～13；翻出的牌和喊的數字一樣時大家搶著拍，最後拍的（或拍錯的人）收走整疊；先把自己的牌出完的人贏
function hhNew(){const d=pkDeck(false),piles=[[],[],[],[]];d.forEach((c,i)=>piles[i%4].push(c));
  return{g:'hh',piles,center:[],turn:Math.floor(Math.random()*4),call:1,shown:null,match:false,slaps:[],over:null,log:[],seq:0,mt:0};}
function hhActive(st){return[0,1,2,3].filter(i=>st.piles[i].length||!st.over);}
function hhNextTurn(st,s){for(let k=1;k<=4;k++){const n=(s+k)%4;if(st.piles[n].length)return n;}return s;}
function hhAct(st,seat,a){
  if(st.over)return'這局已經結束';
  if(a.type==='flip'){if(st.match)return'先拍！';if(seat!==st.turn)return'還沒輪到你';if(!st.piles[seat].length)return'你沒有牌了';
    const c=st.piles[seat].shift();st.center.push(c);const said=st.call;st.call=st.call%13+1;st.shown={c,said,seat};
    st.match=pkR(c)===said;st.slaps=[];st.mt=st.match?Date.now():0;st.log.push({seat,c,said});
    if(!st.match&&!st.piles[seat].length){st.over={winner:seat};}else if(!st.match)st.turn=hhNextTurn(st,seat);
    st.seq++;return null;}
  if(a.type==='slap'){if(st.slaps.includes(seat))return'已經拍過了';
    if(!st.match){if(!st.center.length)return'桌上沒有牌';hhTake(st,seat,'拍錯了');st.seq++;return null;}
    st.slaps.push(seat);if(st.slaps.length>=4)hhResolve(st);st.seq++;return null;}
  return'不認得的動作';
}
// 時間到還沒拍的人收牌；都拍了就由最後一個拍的收
function hhResolve(st){if(!st.match)return;const miss=[0,1,2,3].filter(i=>!st.slaps.includes(i));
  const loser=miss.length?miss[Math.floor(Math.random()*miss.length)]:st.slaps[st.slaps.length-1];
  const why=miss.length?'沒拍到':'最後一個拍';hhTake(st,loser,why);}
function hhTake(st,seat,why){const n=st.center.length;st.piles[seat].push(...st.center);st.center=[];st.match=false;st.taken={seat,n,why};
  const flipper=st.shown?st.shown.seat:seat;
  // 剛把牌翻完的人如果沒有收到牌就贏了
  const w=[0,1,2,3].find(i=>!st.piles[i].length);if(w!==undefined)st.over={winner:w};
  else st.turn=hhNextTurn(st,flipper);}   // 繼續由翻牌者的下一位翻

/* ---------- 抽鬼牌 ---------- */
// 52 張加一張鬼牌，湊成同點數的一對就丟掉；輪流從下一位玩家手中抽一張；最後拿著鬼牌的人輸
function omPairs(h){const by={},keep=[],out=[];h.forEach(c=>{if(c===52){keep.push(c);return;}const r=pkR(c);(by[r]=by[r]||[]).push(c);});
  for(const r in by){const a=by[r];while(a.length>=2)out.push(a.splice(0,2));keep.push(...a);}return{keep:pkShuffle(keep),out};}
function omNew(){const d=pkDeck(true),hands=[[],[],[],[]];d.forEach((c,i)=>hands[i%4].push(c));const discards=[];
  for(let i=0;i<4;i++){const r=omPairs(hands[i]);hands[i]=r.keep;discards.push(...r.out.flat());}
  const st={g:'om',hands,turn:Math.floor(Math.random()*4),out:[false,false,false,false],place:[],over:null,discards,last:null,log:[],seq:0};
  omCheckOut(st);if(!st.over&&!st.hands[st.turn].length)st.turn=omNextActive(st,st.turn);return st;}
function omNextActive(st,s){for(let k=1;k<=4;k++){const n=(s+k)%4;if(!st.out[n])return n;}return s;}
const omFrom=(st,s)=>omNextActive(st,s);   // 從下一位還有牌的玩家手中抽
function omCheckOut(st){for(let i=0;i<4;i++)if(!st.out[i]&&!st.hands[i].length){st.out[i]=true;st.place.push(i);}
  const left=[0,1,2,3].filter(i=>!st.out[i]);if(left.length<=1){st.over={loser:left.length?left[0]:st.hands.findIndex(h=>h.includes(52)),place:st.place.slice()};}}
function omAct(st,seat,a){
  if(st.over)return'這局已經結束';if(a.type!=='draw')return'不認得的動作';if(seat!==st.turn)return'還沒輪到你';
  const from=omFrom(st,seat);if(from===seat)return'沒有人可以抽';const fh=st.hands[from],i=a.i|0;if(i<0||i>=fh.length)return'選的牌不存在';
  const c=fh.splice(i,1)[0],mh=st.hands[seat];let paired=null;
  if(c!==52){const j=mh.findIndex(x=>x!==52&&pkR(x)===pkR(c));if(j>=0){paired=[mh[j],c];mh.splice(j,1);st.discards.push(...paired);}}
  if(!paired)mh.push(c);
  st.last={seat,from,c,paired:!!paired};st.log.push(st.last);
  // 被抽的人如果是電腦會重新洗手牌，抽的人把牌插回去也打亂
  pkShuffle(st.hands[from]);
  omCheckOut(st);if(!st.over)st.turn=st.out[seat]?omNextActive(st,seat):omNextActive(st,seat);
  st.seq++;return null;
}
function omAI(st,seat){const from=omFrom(st,seat);return{type:'draw',i:Math.floor(Math.random()*st.hands[from].length)};}

/* ---------- 共用：給每位玩家看的畫面資料（只含自己的手牌） ---------- */
function pkView(st,seat){
  if(st.g==='b2')return{g:'b2',seq:st.seq,me:seat,hand:st.hands[seat].slice(),counts:st.hands.map(h=>h.length),turn:st.turn,lead:st.lead,passes:st.passes,first:st.first,over:st.over,
    last:st.log.slice(-4),reveal:st.over?st.hands.map(h=>h.slice()):null};
  if(st.g==='hh')return{g:'hh',seq:st.seq,me:seat,counts:st.piles.map(p=>p.length),center:st.center.length,top:st.center[st.center.length-1]??null,turn:st.turn,call:st.call,
    shown:st.shown,match:st.match,slapped:st.slaps.slice(),taken:st.taken||null,over:st.over};
  return{g:'om',seq:st.seq,me:seat,hand:st.hands[seat].slice(),counts:st.hands.map(h=>h.length),turn:st.turn,from:st.over?null:omFrom(st,st.turn),out:st.out.slice(),
    last:st.last?{seat:st.last.seat,from:st.last.from,paired:st.last.paired,c:(st.last.seat===seat||st.last.from===seat||st.last.paired)?st.last.c:null}:null,
    discards:st.discards.length,over:st.over,place:st.place.slice(),reveal:st.over?st.hands.map(h=>h.slice()):null};
}
const PK_GAMES={b2:{n:'大老二',neu:b2New,act:b2Act},hh:{n:'心臟病',neu:hhNew,act:hhAct},om:{n:'抽鬼牌',neu:omNew,act:omAct}};
if(typeof module!=='undefined')module.exports={PK_GAMES,b2Combo,b2Beats,b2All,b2AI,b2Hint,b2New,b2Act,hhNew,hhAct,hhResolve,omNew,omAct,omAI,pkView,pkR,pkS,b2v,pkName};
