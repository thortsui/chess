
/* ===== 甲午戰爭：象棋（清軍）對將棋（日軍）的 AI。棋盤 90 點，紅方為正數、黑方（日軍）為負數；日軍可以把吃到的棋子打回棋盤 ===== */
var jwEngine=(function(){
  // 1車 2馬 3相 4仕 5帥 6炮 7兵 ｜ 8飛 10角 12王 14金 15銀 16桂 17香 18歩 19龍 20馬(龍馬) 21成銀 22成桂 23成香 24と
  const LET={R:1,N:2,B:3,A:4,K:5,C:6,P:7,T:8,F:10,Y:12,G:14,S:15,M:16,L:17,U:18,Z:19,X:20,Q:21,J:22,E:23,O:24};
  const VAL=[0,900,400,200,200,0,450,100,950,0,750,0,0,0,520,450,320,300,100,1250,1050,520,520,520,520];
  const PROMO={8:19,10:20,15:21,16:22,17:23,18:24};
  const HT=[18,17,16,15,14,8],HL=['U','L','M','S','G','T'],CAP={1:5,2:2,3:3,4:4,6:1,7:0};   // 手上的棋種；吃到清軍的棋變成哪一種（車→飛、馬→桂、相→銀、仕→金、炮→香、兵→歩）
  const MATE=100000,KING=t=>t===5||t===12,DROP=8100;
  const D4=[[1,0],[-1,0],[0,1],[0,-1]],DG=[[1,1],[1,-1],[-1,1],[-1,-1]],D8=[...D4,...DG],KN=[[2,1],[2,-1],[-2,1],[-2,-1],[1,2],[1,-2],[-1,2],[-1,-2]];
  const GOLD=[[1,0],[1,1],[1,-1],[0,1],[0,-1],[-1,0]],SILV=[[1,0],[1,1],[1,-1],[-1,1],[-1,-1]];
  let B=new Int8Array(90),H=new Int8Array(6),deadline=0,nodes=0,stopped=false;
  const inb=(r,c)=>r>=0&&r<10&&c>=0&&c<9;
  function gen(side,capsOnly,drops){
    const out=[];let kr=-1,kc=-1,jr=-1,jc=-1;
    for(let i=0;i<90;i++){const p=B[i];if(p===5){kr=(i/9)|0;kc=i%9;}else if(p===-12){jr=(i/9)|0;jc=i%9;}
      if(!p||(p>0?1:-1)!==side)continue;const t=p>0?p:-p,r=(i/9)|0,c=i%9;
      const add=(rr,cc)=>{if(!inb(rr,cc))return;const j=rr*9+cc,q=B[j];if(q&&(q>0?1:-1)===side)return;if(capsOnly&&!q)return;out.push(i*90+j);};
      const slide=dirs=>{for(const[dr,dc]of dirs){let rr=r+dr,cc=c+dc;while(inb(rr,cc)){const q=B[rr*9+cc];if(!q){if(!capsOnly)out.push(i*90+rr*9+cc);}else{if((q>0?1:-1)!==side)out.push(i*90+rr*9+cc);break;}rr+=dr;cc+=dc;}}};
      const pal=(rr,cc)=>cc>=3&&cc<=5&&rr>=7&&rr<=9;
      switch(t){
        case 1:case 8:slide(D4);break;
        case 10:slide(DG);break;
        case 19:slide(D4);for(const[dr,dc]of DG)add(r+dr,c+dc);break;
        case 20:slide(DG);for(const[dr,dc]of D4)add(r+dr,c+dc);break;
        case 6:for(const[dr,dc]of D4){let rr=r+dr,cc=c+dc,j=false;while(inb(rr,cc)){const q=B[rr*9+cc];
            if(!j){if(!q){if(!capsOnly)out.push(i*90+rr*9+cc);}else j=true;}else if(q){if((q>0?1:-1)!==side)out.push(i*90+rr*9+cc);break;}rr+=dr;cc+=dc;}}break;
        case 2:for(const[dr,dc]of KN){const lr=Math.abs(dr)===2?r+dr/2:r,lc=Math.abs(dc)===2?c+dc/2:c;if(inb(lr,lc)&&!B[lr*9+lc])add(r+dr,c+dc);}break;
        case 3:for(const[dr,dc]of DG){const rr=r+2*dr,cc=c+2*dc;if(!inb(rr,cc)||rr<5||B[(r+dr)*9+c+dc])continue;add(rr,cc);}break;
        case 4:for(const[dr,dc]of DG)if(pal(r+dr,c+dc))add(r+dr,c+dc);break;
        case 5:for(const[dr,dc]of D4)if(pal(r+dr,c+dc))add(r+dr,c+dc);break;
        case 12:for(const[dr,dc]of D8)add(r+dr,c+dc);break;
        case 7:add(r-1,c);if(r<=4){add(r,c-1);add(r,c+1);}break;
        case 14:case 21:case 22:case 23:case 24:for(const[dr,dc]of GOLD)add(r+dr,c+dc);break;   // 日軍在上方，往下（列數變大）是前進
        case 15:for(const[dr,dc]of SILV)add(r+dr,c+dc);break;
        case 16:add(r+2,c-1);add(r+2,c+1);break;
        case 17:{let rr=r+1;while(rr<10){const q=B[rr*9+c];if(!q){if(!capsOnly)out.push(i*90+rr*9+c);}else{if(q>0)out.push(i*90+rr*9+c);break;}rr++;}break;}
        case 18:add(r+1,c);break;
      }
      // 王見王：同一直線中間沒有子時可以「吃」對方的王（也就是不准走成這樣）
      if(t===5||t===12){for(const dr of[-1,1]){let rr=r+dr;while(rr>=0&&rr<10){const q=B[rr*9+c];if(q){if((q>0?1:-1)!==side&&KING(q>0?q:-q))out.push(i*90+rr*9+c);break;}rr+=dr;}}}
    }
    if(side<0&&drops&&!capsOnly){   // 打入：drops=2 全部空格；drops=1 只考慮兩個王附近
      let pawnCol=0;for(let i=0;i<90;i++)if(B[i]===-18)pawnCol|=1<<(i%9);
      for(let k=0;k<6;k++){if(!H[k])continue;const t=HT[k];
        for(let j=0;j<90;j++){if(B[j])continue;const r=(j/9)|0,c=j%9;
          if((t===18||t===17)&&r===9)continue;if(t===16&&r>=8)continue;if(t===18&&(pawnCol>>c&1))continue;
          if(drops===1&&!((Math.abs(r-kr)<=2&&Math.abs(c-kc)<=2)||(Math.abs(r-jr)<=1&&Math.abs(c-jc)<=1)))continue;
          out.push(DROP+k*90+j);}}}
    return out;}
  // 走一步；回傳 [被吃的棋, 原本的棋]
  function make(m){
    if(m>=DROP){const k=((m-DROP)/90)|0,t=(m-DROP)%90;H[k]--;B[t]=-HT[k];return 0;}
    const f=(m/90)|0,t=m%90,p=B[f],cap=B[t];B[t]=p;B[f]=0;
    if(p<0){const a=-p;if(PROMO[a]&&(t>=63||f>=63))B[t]=-PROMO[a];if(cap>0&&CAP[cap]!==undefined)H[CAP[cap]]++;}
    return cap;}
  function unmake(m,cap,p){
    if(m>=DROP){const k=((m-DROP)/90)|0,t=(m-DROP)%90;H[k]++;B[t]=0;return;}
    const f=(m/90)|0,t=m%90;B[f]=p;B[t]=cap;if(p<0&&cap>0&&CAP[cap]!==undefined)H[CAP[cap]]--;}
  function evalPos(){let e=0,kr=9,kc=4,jr=0,jc=4;
    for(let i=0;i<90;i++){const p=B[i];if(p===5){kr=(i/9)|0;kc=i%9;}else if(p===-12){jr=(i/9)|0;jc=i%9;}}
    for(let i=0;i<90;i++){const p=B[i];if(!p)continue;const s=p>0?1:-1,t=p>0?p:-p,r=(i/9)|0,c=i%9;let v=VAL[t];
      if(t!==5&&t!==12&&t!==3&&t!==4){const d=s>0?Math.abs(r-jr)+Math.abs(c-jc):Math.abs(r-kr)+Math.abs(c-kc);v+=(16-d)*3;}   // 往對方的王靠近
      if(t===7){if(r<=4)v+=90+(4-r)*10;if(c===4)v+=10;}
      else if(t===18){v+=r*8;}
      else if(t===2){v+=12-Math.abs(c-4)*3-Math.abs(r-4.5)*2;}
      else if(t===14||t===15||t===16||t===17){v+=r*6;}
      else if(t===12){v+=(r<=1?20:-r*8);}
      e+=s*v;}
    for(let k=0;k<6;k++)if(H[k])e-=H[k]*VAL[HT[k]]*1.12;
    return e;}
  function attacked(side){const ms=gen(-side,true,0);for(const m of ms){const q=B[m%90];if(q&&(q>0?1:-1)===side&&KING(q>0?q:-q))return true;}return false;}
  const ord=m=>{if(m>=DROP)return 5;const q=B[m%90],p=B[(m/90)|0];return q?(VAL[q>0?q:-q]+(KING(q>0?q:-q)?50000:0))*10-VAL[p>0?p:-p]/10:0;};
  function qs(side,alpha,beta,d){
    if((++nodes&2047)===0&&Date.now()>deadline)stopped=true;
    const sp=side*evalPos();if(sp>=beta)return sp;if(sp>alpha)alpha=sp;if(d>6)return sp;
    const ms=gen(side,true,0).sort((a,b)=>ord(b)-ord(a));
    for(const m of ms){const q=B[m%90];if(KING(q>0?q:-q))return MATE;const p=B[(m/90)|0],cap=make(m);const v=-qs(-side,-beta,-alpha,d+1);unmake(m,cap,p);
      if(stopped)return alpha;if(v>=beta)return v;if(v>alpha)alpha=v;}
    return alpha;}
  const killers=[];
  function search(depth,side,alpha,beta,ply){
    if((++nodes&2047)===0&&Date.now()>deadline)stopped=true;if(stopped)return 0;
    if(depth<=0)return qs(side,alpha,beta,0);
    const ms=gen(side,false,1);const k=killers[ply]||-1;
    ms.sort((a,b)=>(ord(b)+(b===k?5000:0))-(ord(a)+(a===k?5000:0)));
    let best=-MATE-1,any=false;
    for(const m of ms){if(m<DROP){const q=B[m%90];if(q&&KING(q>0?q:-q))return MATE-ply;}
      const p=m<DROP?B[(m/90)|0]:0,cap=make(m);const v=-search(depth-1,-side,-beta,-alpha,ply+1);unmake(m,cap,p);
      if(stopped)return 0;any=true;
      if(v>best)best=v;if(v>alpha)alpha=v;if(alpha>=beta){if(!cap)killers[ply]=m;break;}}
    if(!any)return-(MATE-ply);
    return best;}
  function load(d){const s=d.b;for(let i=0;i<90;i++){const ch=s[i];if(ch==='.'){B[i]=0;continue;}const t=LET[ch.toUpperCase()]||0;B[i]=ch===ch.toUpperCase()?t:-t;}
    for(let k=0;k<6;k++)H[k]=(d.hand&&d.hand[HL[k]])|0;}
  function think(d){
    load(d);const side=d.s==='b'?-1:1;deadline=Date.now()+(d.time||1500);stopped=false;nodes=0;killers.length=0;
    // 只留合法的走法（走完自己的王不能被吃）
    const root=gen(side,false,2).filter(m=>{const p=m<DROP?B[(m/90)|0]:0,cap=make(m);const bad=attacked(side);unmake(m,cap,p);return!bad;});
    if(!root.length)return null;
    let best=root[0],bestV=-Infinity;const avoid=d.avoid&&d.avoid.length?new Set(d.avoid):null;
    root.sort((a,b)=>ord(b)-ord(a));
    for(let depth=1;depth<=(d.depth||40);depth++){
      let curBest=null,curV=-Infinity,alpha=-MATE-1;
      for(const m of root){const p=m<DROP?B[(m/90)|0]:0,cap=make(m);let v=-search(depth-1,-side,-MATE-1,-alpha,1);if(avoid&&v<MATE-200&&avoid.has(B.join()))v-=250;unmake(m,cap,p);   // 少走會回到重複局面的棋
        if(stopped)break;if(d.noise)v+=Math.random()*d.noise;if(v>curV){curV=v;curBest=m;}if(v>alpha)alpha=v;}
      if(stopped&&curBest===null)break;
      if(curBest!==null&&(!stopped||curV>bestV)){best=curBest;bestV=curV;}
      if(stopped)break;
      root.sort((a,b)=>a===best?-1:b===best?1:0);
      if(bestV>=MATE-50)break;}
    if(best>=DROP)return{drop:HL[((best-DROP)/90)|0],t:(best-DROP)%90,v:bestV};
    return{f:(best/90)|0,t:best%90,v:bestV};}
  // 測試與自我對局用：在引擎裡直接走一步，回傳新的局面
  function play(d,mv){load(d);const m=mv.drop?DROP+HL.indexOf(mv.drop)*90+mv.t:mv.f*90+mv.t;make(m);
    const key=B.join();const L=Object.keys(LET),name=t=>L.find(k=>LET[k]===t);let b='';for(let i=0;i<90;i++){const p=B[i];b+=!p?'.':p>0?name(p):name(-p).toLowerCase();}
    const hand={};HL.forEach((k,i)=>hand[k]=H[i]);return{b,hand,s:d.s==='b'?'r':'b',key};}
  return{think,play};
})();
if(typeof module!=='undefined')module.exports=jwEngine;
