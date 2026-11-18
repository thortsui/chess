/* ===== 八國聯軍：規則引擎＋電腦玩家（手掌形方格地圖；清軍照象棋走、聯軍 8 國照西洋棋走） ===== */
// 地圖：掌心 21×18 在下方中間；上方 4 根、左右各 2 根指頭，每根 4 格寬、7 格長，指尖 4×4 放一整隊西洋棋
const BG_FL=7,BG_PW=21,BG_PH=18,BG_W=BG_FL*2+BG_PW,BG_H=BG_FL+BG_PH;
const BG_NATIONS=[   // 名稱、主色、字色、指頭（side：l 左 t 上 r 右；at：在掌心的相對位置）
  {n:'俄國',c:'#f4f4f2',fg:'#1b1b1b',side:'l',at:6},{n:'日本',c:'#e2557a',fg:'#ffffff',side:'l',at:1},
  {n:'英國',c:'#c62828',fg:'#ffffff',side:'t',at:1},{n:'美國',c:'#00897b',fg:'#ffffff',side:'t',at:6},
  {n:'法國',c:'#1e4fd8',fg:'#ffffff',side:'t',at:11},{n:'德國',c:'#2b2b2f',fg:'#f2d25c',side:'t',at:16},
  {n:'義大利',c:'#2e7d32',fg:'#ffffff',side:'r',at:1},{n:'奧匈',c:'#e0a516',fg:'#1b1b1b',side:'r',at:6}];
const BG_QN={R:'車',H:'馬',C:'炮',P:'兵',A:'士',E:'相',G:'將',X:'慈',Y:'禧'},BG_CG={k:'♚',q:'♛',r:'♜',b:'♝',n:'♞',p:'♟'},BG_CN={k:'國王',q:'皇后',r:'城堡',b:'主教',n:'騎士',p:'士兵'};
const bgIdx=(x,y)=>y*BG_W+x;
const BG_VALID=(()=>{const v=new Uint8Array(BG_W*BG_H),set=(x,y)=>{v[bgIdx(x,y)]=1;};
  for(let y=BG_FL;y<BG_H;y++)for(let x=BG_FL;x<BG_FL+BG_PW;x++)set(x,y);
  BG_NATIONS.forEach(N=>{for(let a=0;a<4;a++)for(let b=0;b<BG_FL;b++){
    if(N.side==='t')set(BG_FL+N.at+a,b);else if(N.side==='l')set(b,BG_FL+N.at+a);else set(BG_FL+BG_PW+b,BG_FL+N.at+a);}});
  return v;})();
const bgIn=(x,y)=>x>=0&&y>=0&&x<BG_W&&y<BG_H&&BG_VALID[bgIdx(x,y)]===1;
const bgPalm=(x,y)=>x>=BG_FL&&x<BG_FL+BG_PW&&y>=BG_FL&&y<BG_H;
// 每國士兵前進方向（往掌心）
const bgDir=n=>{const s=BG_NATIONS[n].side;return s==='t'?[0,1]:s==='l'?[1,0]:[-1,0];};
const BG_QX=BG_FL+6,BG_QY=BG_FL+6,BG_RIVER=BG_QY-1;   // 清軍陣地左上角；兵走到這一列（含）以上才能橫走
const BG_QING=['G.G.G.G.','.G.G.G.G','........','C.C.C.C.','.H.H.H.H','C.C.C.C.','R......R','R......R','R......R','RHEAAEHR','RHA..AHR','RAX..YAR'];   // 慈、禧（原本兩個將的位置）兩個都被吃才算輸；最前面兩排是 8 個將
function bgNew(){
  const b=Array(BG_W*BG_H).fill(null);
  BG_QING.forEach((row,ry)=>[...row].forEach((ch,rx)=>{if(ch!=='.')b[bgIdx(BG_QX+rx,BG_QY+ry)]={s:'Q',t:ch,n:-1};}));
  BG_NATIONS.forEach((N,n)=>{const ranks=['rnnr','bkqb','pppp','pppp'];
    for(let d=0;d<4;d++)for(let a=0;a<4;a++){const t=ranks[d][a];let x,y;
      if(N.side==='t'){x=BG_FL+N.at+a;y=d;}else if(N.side==='l'){x=d;y=BG_FL+N.at+a;}else{x=BG_W-1-d;y=BG_FL+N.at+a;}
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
  if(p.s==='A'){p.m=1;if(p.t==='p'){const[dx,dy]=bgDir(p.n),x=t%BG_W,y=(t/BG_W)|0;if(!bgIn(x+dx,y+dy)){b[t]={...p,t:'q'};note='升變皇后';}}}
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
