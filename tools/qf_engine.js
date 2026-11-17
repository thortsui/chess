
/* ===== 清法戰爭：象棋（清軍）對西洋棋（法軍）的 AI。棋盤 90 點，紅方為正數、黑方為負數 ===== */
var qfEngine=(function(){
  // 1車 2馬 3相 4仕 5帥 6炮 7兵 ｜ 8城堡 9騎士 10主教 11皇后 12國王 13士兵
  const LET={R:1,N:2,B:3,A:4,K:5,C:6,P:7,T:8,H:9,F:10,D:11,Y:12,I:13};
  const VAL=[0,900,400,200,200,0,450,100,900,430,420,1500,0,110];
  const MATE=100000,KING=t=>t===5||t===12;
  const D4=[[1,0],[-1,0],[0,1],[0,-1]],DG=[[1,1],[1,-1],[-1,1],[-1,-1]],D8=[...D4,...DG],KN=[[2,1],[2,-1],[-2,1],[-2,-1],[1,2],[1,-2],[-1,2],[-1,-2]];
  let B=new Int8Array(90),deadline=0,nodes=0,stopped=false;
  const inb=(r,c)=>r>=0&&r<10&&c>=0&&c<9;
  function gen(side,capsOnly){
    const out=[];
    for(let i=0;i<90;i++){const p=B[i];if(!p||(p>0?1:-1)!==side)continue;const t=p>0?p:-p,r=(i/9)|0,c=i%9;
      const add=(rr,cc)=>{if(!inb(rr,cc))return;const j=rr*9+cc,q=B[j];if(q&&(q>0?1:-1)===side)return;if(capsOnly&&!q)return;out.push(i*90+j);};
      const slide=dirs=>{for(const[dr,dc]of dirs){let rr=r+dr,cc=c+dc;while(inb(rr,cc)){const q=B[rr*9+cc];if(!q){if(!capsOnly)out.push(i*90+rr*9+cc);}else{if((q>0?1:-1)!==side)out.push(i*90+rr*9+cc);break;}rr+=dr;cc+=dc;}}};
      const pal=(rr,cc)=>cc>=3&&cc<=5&&(side>0?rr>=7&&rr<=9:rr>=0&&rr<=2);
      switch(t){
        case 1:case 8:slide(D4);break;
        case 10:slide(DG);break;
        case 11:slide(D8);break;
        case 6:for(const[dr,dc]of D4){let rr=r+dr,cc=c+dc,j=false;while(inb(rr,cc)){const q=B[rr*9+cc];
            if(!j){if(!q){if(!capsOnly)out.push(i*90+rr*9+cc);}else j=true;}else if(q){if((q>0?1:-1)!==side)out.push(i*90+rr*9+cc);break;}rr+=dr;cc+=dc;}}break;
        case 2:for(const[dr,dc]of KN){const lr=Math.abs(dr)===2?r+dr/2:r,lc=Math.abs(dc)===2?c+dc/2:c;if(inb(lr,lc)&&!B[lr*9+lc])add(r+dr,c+dc);}break;
        case 9:for(const[dr,dc]of KN)add(r+dr,c+dc);break;
        case 3:for(const[dr,dc]of DG){const rr=r+2*dr,cc=c+2*dc;if(!inb(rr,cc)||(side>0?rr<5:rr>4)||B[(r+dr)*9+c+dc])continue;add(rr,cc);}break;
        case 4:for(const[dr,dc]of DG)if(pal(r+dr,c+dc))add(r+dr,c+dc);break;
        case 5:for(const[dr,dc]of D4)if(pal(r+dr,c+dc))add(r+dr,c+dc);break;
        case 12:for(const[dr,dc]of D8)add(r+dr,c+dc);break;
        case 7:{const f=side>0?-1:1;add(r+f,c);if(side>0?r<=4:r>=5){add(r,c-1);add(r,c+1);}break;}
        case 13:{const f=side>0?-1:1,rr=r+f;
          if(inb(rr,c)&&!B[rr*9+c]){if(!capsOnly)out.push(i*90+rr*9+c);
            const start=side>0?r===7:r===2;
            if(start&&inb(rr+f,c)&&!B[(rr+f)*9+c]&&!capsOnly)out.push(i*90+(rr+f)*9+c);}
          for(const dc of[-1,1])if(inb(rr,c+dc)){const q=B[rr*9+c+dc];if(q&&(q>0?1:-1)!==side)out.push(i*90+rr*9+c+dc);}
          break;}
      }
      // 王見王：同一直線中間沒有子時可以「吃」對方的王（也就是不准走成這樣）
      if(t===5||t===12){for(const dr of[-1,1]){let rr=r+dr;while(rr>=0&&rr<10){const q=B[rr*9+c];if(q){if((q>0?1:-1)!==side&&KING(q>0?q:-q))out.push(i*90+rr*9+c);break;}rr+=dr;}}}
    }
    return out;}
  function make(m){const f=(m/90)|0,t=m%90,p=B[f],cap=B[t];B[t]=p;B[f]=0;
    const a=p>0?p:-p;if(a===13&&((p>0&&t<9)||(p<0&&t>=81)))B[t]=p>0?11:-11;return cap;}
  function unmake(m,cap,p){const f=(m/90)|0,t=m%90;B[f]=p;B[t]=cap;}
  function evalPos(){let e=0;
    for(let i=0;i<90;i++){const p=B[i];if(!p)continue;const s=p>0?1:-1,t=p>0?p:-p,r=(i/9)|0,c=i%9;let v=VAL[t];
      if(t===7){if(s>0?r<=4:r>=5)v+=90+(s>0?4-r:r-5)*10;if(c===4)v+=10;}
      else if(t===13){v+=(s>0?6-r:r-3)*14;}
      else if(t===2||t===9||t===10){v+=12-Math.abs(c-4)*3-Math.abs(r-4.5)*2;}
      else if(t===12){v+=(s<0?(r<=1?20:-r*6):(r>=8?20:-(9-r)*6));}
      e+=s*v;}
    return e;}
  function attacked(side){ // side 的王是否能被對方吃
    const ms=gen(-side,true);for(const m of ms){const q=B[m%90];if(q&&(q>0?1:-1)===side&&KING(q>0?q:-q))return true;}return false;}
  const ord=m=>{const q=B[m%90],p=B[(m/90)|0];return q?(VAL[q>0?q:-q]+(KING(q>0?q:-q)?50000:0))*10-VAL[p>0?p:-p]/10:0;};
  function qs(side,alpha,beta,d){
    if((++nodes&2047)===0&&Date.now()>deadline)stopped=true;
    const sp=side*evalPos();if(sp>=beta)return sp;if(sp>alpha)alpha=sp;if(d>6)return sp;
    const ms=gen(side,true).sort((a,b)=>ord(b)-ord(a));
    for(const m of ms){const q=B[m%90];if(KING(q>0?q:-q))return MATE;const p=B[(m/90)|0],cap=make(m);const v=-qs(-side,-beta,-alpha,d+1);unmake(m,cap,p);
      if(stopped)return alpha;if(v>=beta)return v;if(v>alpha)alpha=v;}
    return alpha;}
  const killers=[];
  function search(depth,side,alpha,beta,ply){
    if((++nodes&2047)===0&&Date.now()>deadline)stopped=true;if(stopped)return 0;
    if(depth<=0)return qs(side,alpha,beta,0);
    const ms=gen(side,false);const k=killers[ply]||-1;
    ms.sort((a,b)=>(ord(b)+(b===k?5000:0))-(ord(a)+(a===k?5000:0)));
    let best=-MATE-1,any=false;
    for(const m of ms){const q=B[m%90];if(q&&KING(q>0?q:-q))return MATE-ply;
      const p=B[(m/90)|0],cap=make(m);const v=-search(depth-1,-side,-beta,-alpha,ply+1);unmake(m,cap,p);
      if(stopped)return 0;any=true;
      if(v>best)best=v;if(v>alpha)alpha=v;if(alpha>=beta){if(!cap)killers[ply]=m;break;}}
    if(!any)return-(MATE-ply);
    return best;}
  function think(d){
    const s=d.b;for(let i=0;i<90;i++){const ch=s[i];if(ch==='.'){B[i]=0;continue;}const t=LET[ch.toUpperCase()]||0;B[i]=ch===ch.toUpperCase()?t:-t;}
    const side=d.s==='b'?-1:1;deadline=Date.now()+(d.time||1500);stopped=false;nodes=0;killers.length=0;
    // 只留合法的走法（走完自己的王不能被吃）
    const root=gen(side,false).filter(m=>{const p=B[(m/90)|0],cap=make(m);const bad=attacked(side);unmake(m,cap,p);return!bad;});
    if(!root.length)return null;
    let best=root[0],bestV=-Infinity;
    root.sort((a,b)=>ord(b)-ord(a));
    for(let depth=1;depth<=(d.depth||40);depth++){
      let curBest=null,curV=-Infinity,alpha=-MATE-1;
      for(const m of root){const p=B[(m/90)|0],cap=make(m);const v=-search(depth-1,-side,-MATE-1,-alpha,1);unmake(m,cap,p);
        if(stopped)break;if(v>curV){curV=v;curBest=m;}if(v>alpha)alpha=v;}
      if(stopped&&curBest===null)break;
      if(curBest!==null&&(!stopped||curV>bestV)){best=curBest;bestV=curV;}
      if(stopped)break;
      root.sort((a,b)=>a===best?-1:b===best?1:0);
      if(bestV>=MATE-50)break;}
    // 同分時加一點隨機，避免每局都一樣
    return{f:(best/90)|0,t:best%90,v:bestV};}
  return{think,gen,_B:()=>B};
})();
if(typeof module!=='undefined')module.exports=qfEngine;
