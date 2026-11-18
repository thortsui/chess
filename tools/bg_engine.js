/* ===== 八國聯軍：規則引擎＋電腦玩家（漏斗形方格地圖：八國的路匯合到同一個交會口；清軍照象棋走、聯軍 8 國照西洋棋走） ===== */
// 地圖 24×24：最上面六國並排（各 4 格寬、3 排），往下像漏斗一階一階收窄；第 7～10 列是交會口（中間 8 格），俄國、奧匈從左右兩側橫著進來；第 11 列以下是清軍的腹地（20 格寬）
const BG_W=24,BG_H=24,BG_NY=7,BG_PY=11,BG_PX=2,BG_PW=20;
const BG_NATIONS=[   // 名稱、主色、字色、位置（side：l 左 t 上 r 右；at：上方國家的左邊界）
  {n:'俄國',c:'#f4f4f2',fg:'#1b1b1b',side:'l',at:0},{n:'日本',c:'#e2557a',fg:'#ffffff',side:'t',at:0},
  {n:'英國',c:'#c62828',fg:'#ffffff',side:'t',at:4},{n:'美國',c:'#00897b',fg:'#ffffff',side:'t',at:8},
  {n:'法國',c:'#1e4fd8',fg:'#ffffff',side:'t',at:12},{n:'德國',c:'#2b2b2f',fg:'#f2d25c',side:'t',at:16},
  {n:'義大利',c:'#2e7d32',fg:'#ffffff',side:'t',at:20},{n:'奧匈',c:'#e0a516',fg:'#1b1b1b',side:'r',at:0}];
const BG_QN={R:'車',H:'馬',C:'炮',P:'兵',A:'士',E:'相',G:'將',X:'慈',Y:'禧'},BG_CG={k:'♚',q:'♛',r:'♜',b:'♝',n:'♞',p:'♟'},BG_CN={k:'國王',q:'皇后',r:'城堡',b:'主教',n:'騎士',p:'士兵'};
const bgIdx=(x,y)=>y*BG_W+x;
const BG_ROWS=y=>y<4?[0,23]:y===4?[2,21]:y===5?[4,19]:y===6?[6,17]:[BG_PX,BG_PX+BG_PW-1];   // 每一列有格子的範圍
const BG_VALID=(()=>{const v=new Uint8Array(BG_W*BG_H);for(let y=0;y<BG_H;y++){const[a,b]=BG_ROWS(y);for(let x=a;x<=b;x++)v[bgIdx(x,y)]=1;}return v;})();
const bgIn=(x,y)=>x>=0&&y>=0&&x<BG_W&&y<BG_H&&BG_VALID[bgIdx(x,y)]===1;
const bgPalm=(x,y)=>y>=BG_PY&&y<BG_H&&x>=BG_PX&&x<BG_PX+BG_PW;   // 清軍腹地：將、士、相、慈、禧只能在這裡
// 每國士兵前進方向（上方六國往下、俄國往右、奧匈往左）
const bgDir=n=>{const s=BG_NATIONS[n].side;return s==='t'?[0,1]:s==='l'?[1,0]:[-1,0];};
// 每國陣地的左上角與大小
const bgHome=n=>{const N=BG_NATIONS[n];return N.side==='t'?{x:N.at,y:0,w:4,h:3}:N.side==='l'?{x:BG_PX,y:BG_NY,w:3,h:4}:{x:BG_PX+BG_PW-3,y:BG_NY,w:3,h:4};};
const BG_QX=BG_PX,BG_QY=BG_PY+1,BG_RIVER=BG_QY-1;
// 清軍陣形（20 格寬）：前兩排 8 個將、炮馬炮、三排車靠地圖最邊邊；最後三排整排填滿 車相馬車相馬車…，中間是士相與慈、禧（兩個都被吃才算輸）
const BG_QING=(()=>{const pad=r=>'......'+r+'......',L='REHREHR',R='RHERHER',edge='R'+'.'.repeat(18)+'R';
  return[pad('G.G.G.G.'),pad('.G.G.G.G'),pad('........'),pad('C.C.C.C.'),pad('.H.H.H.H'),pad('C.C.C.C.'),edge,edge,edge,L+'HEAAEH'+R,L+'HA..AH'+R,L+'AX..YA'+R];})();
function bgNew(){
  const b=Array(BG_W*BG_H).fill(null);
  BG_QING.forEach((row,ry)=>[...row].forEach((ch,rx)=>{if(ch!=='.')b[bgIdx(BG_QX+rx,BG_QY+ry)]={s:'Q',t:ch,n:-1};}));
  BG_NATIONS.forEach((N,n)=>{const ranks=['rnnr','bkqb','pppp'];
    for(let d=0;d<3;d++)for(let a=0;a<4;a++){const t=ranks[d][a];let x,y;
      if(N.side==='t'){x=N.at+a;y=d;}else if(N.side==='l'){x=BG_PX+d;y=BG_NY+a;}else{x=BG_PX+BG_PW-1-d;y=BG_NY+a;}
      b[bgIdx(x,y)]={s:'A',t,n};}});
  return{b,turn:'Q',over:null,last:null,seq:0,dead:Array(8).fill(false),log:[]};}
// 一顆棋子能走到的格子（不檢查自己的王會不會被吃；王被吃就輸）
function bgMoves(st,i,capsOnly){
  const b=st.b,p=b[i];if(!p)return[];const x=i%BG_W,y=(i/BG_W)|0,out=[];
  const enemy=q=>q&&q.s!==p.s;
  const add=(xx,yy)=>{if(!bgIn(xx,yy))return false;const q=b[bgIdx(xx,yy)];if(q&&q.s===p.s)return false;if(capsOnly&&!q)return!q;out.push(bgIdx(xx,yy));return!q;};
  const slide=dirs=>{for(const[dx,dy]of dirs){let xx=x+dx,yy=y+dy;while(bgIn(xx,yy)){const q=b[bgIdx(xx,yy)];if(!q){if(!capsOnly)out.push(bgIdx(xx,yy));}else{if(enemy(q))out.push(bgIdx(xx,yy));break;}xx+=dx;yy+=dy;}}};
  const D4=[[1,0],[-1,0],[0,1],[0,-1]],DG=[[1,1],[1,-1],[-1,1],[-1,-1]],KN=[[1,2],[2,1],[-1,2],[-2,1],[1,-2],[2,-1],[-1,-2],[-2,-1]];
  if(p.s==='A'){
    switch(p.t){
      case 'k':for(const[dx,dy]of[...D4,...DG])add(x+dx,y+dy);break;
      case 'q':slide([...D4,...DG]);break;case 'r':slide(D4);break;case 'b':slide(DG);break;
      case 'n':for(const[dx,dy]of KN)add(x+dx,y+dy);break;
      case 'p':{const[dx,dy]=bgDir(p.n),fx=x+dx,fy=y+dy;
        if(!capsOnly&&bgIn(fx,fy)&&!b[bgIdx(fx,fy)]){out.push(bgIdx(fx,fy));if(!p.m&&bgIn(fx+dx,fy+dy)&&!b[bgIdx(fx+dx,fy+dy)])out.push(bgIdx(fx+dx,fy+dy));}
        // 漏斗的斜邊：往下走的士兵前面是牆時，可以往中間橫移一格
        if(!capsOnly&&dy&&!bgIn(fx,fy)&&y<BG_H-1){const sx=x+(x<BG_W/2?1:-1);if(bgIn(sx,y)&&!b[bgIdx(sx,y)])out.push(bgIdx(sx,y));}
        for(const s of[-1,1]){const cx=fx+(dy?s:0),cy=fy+(dx?s:0);if(bgIn(cx,cy)&&enemy(b[bgIdx(cx,cy)]))out.push(bgIdx(cx,cy));}break;}
    }
  }else{
    switch(p.t){
      case 'R':slide(D4);break;
      case 'C':for(const[dx,dy]of D4){let xx=x+dx,yy=y+dy,j=false;while(bgIn(xx,yy)){const q=b[bgIdx(xx,yy)];
          if(!j){if(!q){if(!capsOnly)out.push(bgIdx(xx,yy));}else j=true;}else if(q){if(enemy(q))out.push(bgIdx(xx,yy));break;}xx+=dx;yy+=dy;}}break;
      case 'H':for(const[dx,dy]of KN){const lx=Math.abs(dx)===2?x+dx/2:x,ly=Math.abs(dy)===2?y+dy/2:y;if(bgIn(lx,ly)&&!b[bgIdx(lx,ly)])add(x+dx,y+dy);}break;
      case 'P':add(x,y-1);if(y<=BG_RIVER){add(x-1,y);add(x+1,y);}break;
      case 'G':case 'X':case 'Y':for(const[dx,dy]of D4)if(bgPalm(x+dx,y+dy))add(x+dx,y+dy);break;
      case 'A':for(const[dx,dy]of DG)if(bgPalm(x+dx,y+dy))add(x+dx,y+dy);break;
      case 'E':for(const[dx,dy]of DG){const xx=x+2*dx,yy=y+2*dy;if(bgPalm(xx,yy)&&bgIn(x+dx,y+dy)&&!b[bgIdx(x+dx,y+dy)])add(xx,yy);}break;
    }
  }
  return out;}
function bgAll(st,side,capsOnly){const out=[];for(let i=0;i<st.b.length;i++){const p=st.b[i];if(p&&p.s===side)for(const t of bgMoves(st,i,capsOnly))out.push([i,t]);}return out;}
// 走一步（會改 st）；回傳這步的說明
function bgApply(st,f,t){
  const b=st.b,p=b[f],q=b[t];let note='';
  b[t]=p;b[f]=null;
  if(p.s==='A'){p.m=1;if(p.t==='p'){const[dx,dy]=bgDir(p.n),x=t%BG_W,y=(t/BG_W)|0;if(!bgIn(x+dx,y+dy)&&(dx||y===BG_H-1)){b[t]={...p,t:'q'};note='升變皇后';}}}
  if(q&&q.s==='A'&&q.t==='k'){st.dead[q.n]=true;for(let i=0;i<b.length;i++)if(b[i]&&b[i].s==='A'&&b[i].n===q.n)b[i]=null;note=BG_NATIONS[q.n].n+'國王被吃，整隊撤退';}
  st.last={f,t};st.turn=st.turn==='Q'?'A':'Q';st.seq++;
  const gens=b.filter(x=>x&&x.s==='Q'&&(x.t==='X'||x.t==='Y')).length,kings=st.dead.filter(d=>!d).length;
  if(!gens)st.over={win:'A',why:'慈、禧都被吃了'};
  else if(!kings)st.over={win:'Q',why:'八國的國王全部被吃了'};
  else if(!bgAll(st,st.turn,false).length)st.over={win:st.turn==='Q'?'A':'Q',why:(st.turn==='Q'?'清軍':'聯軍')+'沒有棋可以走'};
  return{p,q,note};}
function bgClone(st){return{b:st.b.map(p=>p&&{...p}),turn:st.turn,over:st.over,last:st.last,seq:st.seq,dead:st.dead.slice(),log:st.log};}
// 電腦：每一步看自己吃到什麼、對方下一步最多能吃回什麼，再加一點往前推進的分數
const BG_V={k:0,q:9,r:5,b:3.2,n:3,p:1,R:9,H:4,C:4.5,P:1,A:2,E:2,G:1.6,X:30,Y:30};
function bgNationVal(st,n){let v=12;for(const p of st.b)if(p&&p.s==='A'&&p.n===n&&p.t!=='k')v+=BG_V[p.t];return v;}
function bgVal(st,p,i){if(p.s==='A')return p.t==='k'?bgNationVal(st,p.n):BG_V[p.t];
  if(p.t==='X'||p.t==='Y'){const g=st.b.filter(x=>x&&x.s==='Q'&&(x.t==='X'||x.t==='Y')).length;return g<=1?500:30;}
  if(p.t==='P'&&((i/BG_W)|0)<=BG_RIVER)return 2;return BG_V[p.t];}
function bgThreat(st,side){let best=0;for(const[f,t]of bgAll(st,side,true)){const q=st.b[t];if(q){const v=bgVal(st,q,t);if(v>best)best=v;}}return best;}
function bgTargets(st,side){const out=[];st.b.forEach((p,i)=>{if(p&&p.s!==side&&(p.t==='X'||p.t==='Y'||p.t==='k'))out.push(i);});return out;}
const bgDist=(a,b2)=>Math.abs(a%BG_W-b2%BG_W)+Math.abs(((a/BG_W)|0)-((b2/BG_W)|0));
function bgAI(st,opts){
  const side=st.turn,moves=bgAll(st,side,false).filter(([f])=>!opts||!opts.only||opts.only(st.b[f]));if(!moves.length)return null;
  const tg=bgTargets(st,side),near=i=>tg.length?Math.min(...tg.map(t=>bgDist(i,t))):0;
  let best=null,bs=-1e9;
  for(const[f,t]of moves){const p=st.b[f],q=st.b[t];let s=q?bgVal(st,q,t)*1.02:0;
    const c=bgClone(st);bgApply(c,f,t);
    if(c.over&&c.over.win===side)return[f,t];
    s-=0.9*bgThreat(c,c.turn);
    if(!(p.t==='X'||p.t==='Y'||p.t==='k'||p.t==='A'||p.t==='E'))s+=(near(f)-near(t))*0.06;
    if(p.t==='k')s-=0.3;
    s+=Math.random()*0.05;
    if(s>bs){bs=s;best=[f,t];}}
  return best;}
if(typeof module!=='undefined')module.exports={bgNew,bgMoves,bgAll,bgApply,bgAI,bgIn,BG_W,BG_H,BG_VALID,bgIdx,BG_NATIONS};
