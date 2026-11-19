/* ===== 八國聯軍：規則引擎＋電腦玩家（十字形方格地圖：中央一塊空地，上、左、右、下四邊各貼一塊；清軍照象棋走、聯軍 8 國照西洋棋走） ===== */
// 地圖 40×34：中央 32×16；上面那塊 32×2 站四國；左右各一塊 4×16，各站兩國；下面那塊 20×16 是清軍（左右各內縮 6 格）；四個角落沒有格子。每國是一整副西洋棋（8 格寬、2 排）
// 通用化（0.19.0）：BG_W、BG_H、BG_VALID、BG_NATIONS、BG_KIND、BG_RIVER、bgPalm、bgHome、BGR 是「目前這一場戰役」的設定，
// 預設是八國聯軍；二次大戰（w2）開局前用 bgUse('w2') 換成自己的地圖與規則，回到八國聯軍時 bgUse('bg') 換回來。移動規則 bgMoves 與電腦 bgAI 兩場共用。
const BG_AW=4,BG_CW=32,BG_TH=2,BG_CH=16,BG_QH=16,BG0_W=BG_AW*2+BG_CW,BG0_H=BG_TH+BG_CH+BG_QH,BG_PY=BG_TH+BG_CH,BG_PX=BG_AW+6,BG_PW=BG_CW-12;   // 清軍腹地左右各比中央內縮 6 格
let BG_W=BG0_W,BG_H=BG0_H;
const BG_NAT0=[   // 名稱、主色、字色、位置（side：l 左 t 上 r 右；at：沿著那一邊的起點）
  {n:'俄國',c:'#f4f4f2',fg:'#1b1b1b',side:'l',at:8,g:'塔夫列利'},{n:'日本',c:'#e2557a',fg:'#ffffff',side:'l',at:0,g:'將棋',d:3},
  {n:'英國',c:'#c62828',fg:'#ffffff',side:'t',at:0,g:'西洋棋'},{n:'美國',c:'#00897b',fg:'#ffffff',side:'t',at:8,g:'菲舍爾任意制'},
  {n:'法國',c:'#1e4fd8',fg:'#ffffff',side:'t',at:16,g:'西洋棋'},{n:'德國',c:'#2b2b2f',fg:'#f2d25c',side:'t',at:24,g:'信使棋'},
  {n:'義大利',c:'#2e7d32',fg:'#ffffff',side:'r',at:0,g:'義式西洋棋'},{n:'奧匈',c:'#e0a516',fg:'#1b1b1b',side:'r',at:8,g:'維也納棋'}];
let BG_NATIONS=BG_NAT0;
const BG_QN={R:'車',H:'馬',C:'炮',P:'兵',A:'士',E:'相',G:'將',X:'慈',Y:'禧'};
// 聯軍各國用自己國家的棋。棋種：k 國王 q 皇后 r 城堡 b 主教 n 騎士 p 士兵｜俄國 o 王前兵（升變成 e 赫爾吉＝皇后＋騎士）
// ｜德國信使棋 c 信使 m 謀士 f 小后 w 弄臣 a 弓手｜日本將棋 g 金 s 銀 j 桂 l 香 u 歩，升變 d 龍 y 馬 t 成金
const BG_CG={k:'♚',q:'♛',r:'♜',b:'♝',n:'♞',p:'♟',o:'♟',e:'勇',c:'信',m:'謀',f:'后',w:'弄',a:'弓',g:'金',s:'銀',j:'桂',l:'香',u:'歩',d:'龍',y:'馬',t:'と'};
const BG_CN={k:'國王',q:'皇后',r:'城堡',b:'主教',n:'騎士',p:'士兵',o:'王前兵',e:'赫爾吉',c:'信使',m:'謀士',f:'小后',w:'弄臣',a:'弓手',g:'金將',s:'銀將',j:'桂馬',l:'香車',u:'步兵',d:'龍王',y:'龍馬',t:'成金'};
const BG_JP={k:'王',r:'飛',b:'角'},BG_JPN={k:'王將',r:'飛車',b:'角行'},BG_JPUP={r:'d',b:'y',s:'t',j:'t',l:'t',u:'t'};   // 日本的王、飛、角用漢字；走進清軍腹地升變
// 可以選的棋種；BG_OWN 是各國的代表棋（順序同 BG_NATIONS：俄 日 英 美 法 德 義 奧）；BG_KIND 是這一局各國實際用的棋（可在選單設定，不會下的可以換成西洋棋）
const BG_KINDS={ch:'西洋棋',f9:'菲舍爾任意制',vi:'維也納棋',co:'信使棋',sh:'將棋',ta:'塔夫列利'},BG_OWN=['ta','sh','ch','f9','ch','co','ch','vi'];
let BG_KIND=BG_OWN.slice();
const bgKindsOk=k=>Array.isArray(k)&&k.length===8&&k.every(x=>typeof x==='string'&&BG_KINDS.hasOwnProperty(x));
// 信使棋特有的棋用圖示（信使＝信封、謀士＝人像、小后＝小皇冠、弄臣＝小丑帽、弓手＝弓箭）
const BG_SVG={c:'<path d="M3 6h18v12H3z" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/><path d="M3.5 6.5l8.5 7 8.5-7" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/>',
  m:'<circle cx="12" cy="7.5" r="4.2" fill="currentColor"/><path d="M3.5 21c0-5.5 3.6-8 8.5-8s8.5 2.5 8.5 8z" fill="currentColor"/>',
  f:'<path d="M4 18l-1.5-9.5 5 4L12 5l4.5 7.5 5-4L20 18z" fill="currentColor"/><rect x="4" y="19" width="16" height="2.4" rx="1" fill="currentColor"/>',
  w:'<path d="M4 17c0-4 1-9 3.5-11.5C8.5 8 10 9 12 9s3.5-1 4.5-3.5C19 8 20 13 20 17z" fill="currentColor"/><circle cx="7.4" cy="4.6" r="1.7" fill="currentColor"/><circle cx="16.6" cy="4.6" r="1.7" fill="currentColor"/><circle cx="12" cy="7" r="1.7" fill="currentColor"/><rect x="3.5" y="18" width="17" height="2.6" rx="1.2" fill="currentColor"/>',
  a:'<path d="M7 3c8 3 8 15 0 18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/><path d="M7 3v18" stroke="currentColor" stroke-width="1.2"/><path d="M3 12h16" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M16 8.5l5 3.5-5 3.5z" fill="currentColor"/>'};
const bgJP=p=>BG_KIND[p.n]==='sh',bgGlyph=p=>(bgJP(p)&&BG_JP[p.t])||BG_CG[p.t],bgCName=p=>(bgJP(p)&&BG_JPN[p.t])||BG_CN[p.t];
const bgIdx=(x,y)=>y*BG_W+x;
const BG_ROWS=y=>y<BG_TH?[BG_AW,BG_AW+BG_CW-1]:y<BG_PY?[0,BG_W-1]:[BG_PX,BG_PX+BG_PW-1];   // 每一列有格子的範圍
const BG0_VALID=(()=>{const v=new Uint8Array(BG_W*BG_H);for(let y=0;y<BG_H;y++){const[a,b]=BG_ROWS(y);for(let x=a;x<=b;x++)v[bgIdx(x,y)]=1;}return v;})();
let BG_VALID=BG0_VALID;
const bgIn=(x,y)=>x>=0&&y>=0&&x<BG_W&&y<BG_H&&BG_VALID[bgIdx(x,y)]===1;
const bgPalm0=(x,y)=>y>=BG_PY&&y<BG_H&&x>=BG_PX&&x<BG_PX+BG_PW;   // 清軍腹地：將、士、相、慈、禧只能在這裡
let bgPalm=bgPalm0;   // 二次大戰換成中華民國的陣地（帥、仕、相只能在這裡）
// 每國士兵前進方向（上方六國往下、俄國往右、奧匈往左；二次大戰下方的國家 b 往上），走到地圖盡頭升變
const bgDir=n=>{const s=BG_NATIONS[n].side;return s==='t'?[0,1]:s==='l'?[1,0]:s==='b'?[0,-1]:[-1,0];};
// 每國陣地的左上角與大小
const bgHome0=n=>{const N=BG_NATIONS[n],d=BG_KIND[n]==='sh'?3:2;return N.side==='t'?{x:BG_AW+N.at,y:0,w:8,h:d}:N.side==='l'?{x:0,y:BG_TH+N.at,w:d,h:8}:{x:BG_W-d,y:BG_TH+N.at,w:d,h:8};};   // 將棋有三排
let bgHome=bgHome0;
const BG_QX=BG_PX,BG_QY=BG_PY,BG_RIVER0=BG_QY-1;let BG_RIVER=BG_RIVER0;   // 象棋的兵走到這一列（含）以上算過河，可以橫走
// 清軍陣形（20 格寬、16 格深）：兩排將貼著腹地最前緣、空一排、炮馬炮（炮左右各內縮兩格，都是隔一格一顆、交錯）、空四排、三排車貼在最邊邊（左右各兩層）；
// 最後三排相連：最左、最右兩層都是車；中間照 馬炮相車 重複、每排錯開兩格，馬正前方的相拿掉（不會被拐腳），最後一排的馬往前跳的落點也空出來；左右對稱，最後一排中間是士與慈、禧（兩個都被吃才算輸）
const BG_QING=(()=>{const rev=t=>[...t].reverse().join(''),mir=h=>h+rev(h),E='.'.repeat(20),edge='RR'+'.'.repeat(16)+'RR',C='..'+'C.'.repeat(8)+'..';
  return['G.'.repeat(10),'.G'.repeat(10),E,C,'.H'.repeat(10),C,E,E,E,E,edge,edge,edge,mir('RRH..RH..R'),mir('RR.RHC.RHA'),mir('RRHCERHAX.').replace('X..X','X..Y')];})();
const bgShuffle=a=>{for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;};
// 各種棋的開局：塔夫列利（王前兵升變成赫爾吉）、將棋（九路縮成八路，少一隻桂；三排）、西洋棋、菲舍爾任意制（底線隨機：主教一黑一白、國王在兩城堡之間）、
// 信使棋（城堡 弓手 信使 謀士 國王 小后 弄臣 城堡）、維也納棋（底線自由擺，只要求主教一黑一白）
function bgRanks(n){const P='pppppppp',k=BG_KIND[n];
  if(k==='ta')return['rnbqkbnr','ppppoppp'];if(k==='sh')return['ljsgkgsl','.r....b.','uuuuuuuu'];if(k==='co')return['racmkfwr',P];
  if(k==='f9'||k==='vi')for(;;){const s=bgShuffle([...'rnbqkbnr']).join('');if((s.indexOf('b')+s.lastIndexOf('b'))%2!==1)continue;if(k==='vi'||(s.indexOf('r')<s.indexOf('k')&&s.indexOf('k')<s.lastIndexOf('r')))return[s,P];}
  return['rnbqkbnr',P];}
// 輪流方式（0.20.0 起，只有八國聯軍）：rr 為真時是「八國各一步、清軍連三步」——聯軍那一輪每個還活著的國家各走一步（順序自選，st.mv[n] 記這輪走過了沒），
// 清軍那一輪連走 BG_RR_Q 步（st.ql 是這輪還可以走幾步）。舊規則（一步換一步）的局面沒有 rr／ql／mv 這三個欄位，行為完全不變。
const BG_RR_Q=3,BG_RR_NOC=5;   // BG_RR_NOC：新輪流方式拿掉的那排炮（清軍陣形第 6 排，馬後面）
function bgNew(kinds,rr){
  if(bgKindsOk(kinds))BG_KIND=kinds.slice();
  const b=Array(BG_W*BG_H).fill(null);
  BG_QING.forEach((row,ry)=>{if(rr&&ry===BG_RR_NOC)return;[...row].forEach((ch,rx)=>{if(ch!=='.')b[bgIdx(BG_QX+rx,BG_QY+ry)]={s:'Q',t:ch,n:-1};});});   // 新輪流方式：清軍少一排炮（馬後面那排）
  BG_NATIONS.forEach((N,n)=>{const ranks=bgRanks(n);
    for(let d=0;d<ranks.length;d++)for(let a=0;a<8;a++){const t=ranks[d][a];if(t==='.')continue;let x,y;
      if(N.side==='t'){x=BG_AW+N.at+a;y=d;}else if(N.side==='l'){x=d;y=BG_TH+N.at+a;}else{x=BG_W-1-d;y=BG_TH+N.at+a;}
      b[bgIdx(x,y)]={s:'A',t,n};}});
  const st={b,turn:'Q',over:null,last:null,seq:0,dead:Array(8).fill(false),log:[]};
  if(rr){st.rr=1;st.ql=BG_RR_Q;st.mv=Array(8).fill(false);}
  return st;}
// 一顆棋子能走到的格子（不檢查自己的王會不會被吃；王被吃就輸）
function bgMoves(st,i,capsOnly){
  const b=st.b,p=b[i];if(!p)return[];const x=i%BG_W,y=(i/BG_W)|0,out=[];
  const enemy=q=>q&&q.s!==p.s;
  const add=(xx,yy)=>{if(!bgIn(xx,yy))return false;const q=b[bgIdx(xx,yy)];if(q&&q.s===p.s)return false;if(capsOnly&&!q)return!q;out.push(bgIdx(xx,yy));return!q;};
  const slide=dirs=>{for(const[dx,dy]of dirs){let xx=x+dx,yy=y+dy;while(bgIn(xx,yy)){const q=b[bgIdx(xx,yy)];if(!q){if(!capsOnly)out.push(bgIdx(xx,yy));}else{if(enemy(q))out.push(bgIdx(xx,yy));break;}xx+=dx;yy+=dy;}}};
  const D4=[[1,0],[-1,0],[0,1],[0,-1]],DG=[[1,1],[1,-1],[-1,1],[-1,-1]],KN=[[1,2],[2,1],[-1,2],[-2,1],[1,-2],[2,-1],[-1,-2],[-2,-1]];
  if(p.t>='a'){   // 小寫：西洋棋系（各國）；大寫：象棋系（清軍、二次大戰的中華民國）
    switch(p.t){
      case 'k':for(const[dx,dy]of[...D4,...DG])add(x+dx,y+dy);break;
      case 'q':slide([...D4,...DG]);break;case 'r':slide(D4);break;case 'b':slide(DG);break;
      case 'n':for(const[dx,dy]of KN)add(x+dx,y+dy);break;
      case 'e':slide([...D4,...DG]);for(const[dx,dy]of KN)add(x+dx,y+dy);break;   // 俄國赫爾吉：皇后＋騎士
      case 'c':slide(DG);break;case 'm':for(const[dx,dy]of[...D4,...DG])add(x+dx,y+dy);break;   // 德國：信使（斜走）、謀士（八方向一步）
      case 'f':for(const[dx,dy]of DG)add(x+dx,y+dy);break;case 'w':for(const[dx,dy]of D4)add(x+dx,y+dy);break;   // 小后（斜一步）、弄臣（直一步）
      case 'a':for(const[dx,dy]of DG)add(x+2*dx,y+2*dy);break;   // 弓手：斜跳兩格，可以越子
      case 'd':slide(D4);for(const[dx,dy]of DG)add(x+dx,y+dy);break;case 'y':slide(DG);for(const[dx,dy]of D4)add(x+dx,y+dy);break;   // 日本：龍、馬
      case 'g':case 't':case 's':case 'j':case 'l':case 'u':{const[dx,dy]=bgDir(p.n),R=(f,sd)=>[x+f*dx+sd*dy,y+f*dy+sd*dx];   // f 往前幾格、sd 往旁邊幾格
        if(p.t==='l'){slide([[dx,dy]]);break;}
        const L=p.t==='u'?[[1,0]]:p.t==='j'?[[2,1],[2,-1]]:p.t==='s'?[[1,0],[1,1],[1,-1],[-1,1],[-1,-1]]:[[1,0],[1,1],[1,-1],[0,1],[0,-1],[-1,0]];
        for(const[f,sd]of L){const[xx,yy]=R(f,sd);add(xx,yy);}break;}
      case 'p':case 'o':{const[dx,dy]=bgDir(p.n),fx=x+dx,fy=y+dy;
        if(!capsOnly&&bgIn(fx,fy)&&!b[bgIdx(fx,fy)]){out.push(bgIdx(fx,fy));if(!p.m&&BG_KIND[p.n]!=='co'&&bgIn(fx+dx,fy+dy)&&!b[bgIdx(fx+dx,fy+dy)])out.push(bgIdx(fx+dx,fy+dy));}   // 信使棋的兵第一步不能走兩格
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
function bgAll(st,side,capsOnly){const out=[],skip=st.rr&&side==='A'&&st.turn==='A'?st.mv:null;   // 新輪流方式：聯軍這輪已經走過的國家不能再走
  for(let i=0;i<st.b.length;i++){const p=st.b[i];if(p&&p.s===side&&!(skip&&skip[p.n]))for(const t of bgMoves(st,i,capsOnly))out.push([i,t]);}return out;}
// 新輪流方式：走完一步後決定下一步輪到誰（清軍三步走完或沒棋可走→換聯軍；聯軍還沒走、還有棋可走的國家都走完→換清軍）
function bgRoundNext(st,p){
  if(st.turn==='Q'){st.ql--;if(st.ql>0&&bgAll(st,'Q',false).length)return;st.turn='A';st.mv=Array(8).fill(false);st.ql=BG_RR_Q;return;}
  st.mv[p.n]=true;if(bgAll(st,'A',false).length)return;
  st.turn='Q';st.ql=BG_RR_Q;st.mv=Array(8).fill(false);}
// 新輪流方式：聯軍這一輪還沒走的國家（活著、還沒走；has 為真時只算現在有棋可走的）
function bgRoundLeft(st,has){if(!st.rr||st.turn!=='A')return[];const ok=new Set();if(has)for(const[f]of bgAll(st,'A',false))ok.add(st.b[f].n);
  return BG_NATIONS.map((N,n)=>n).filter(n=>!st.dead[n]&&!st.mv[n]&&(!has||ok.has(n)));}
// 走一步（會改 st）；回傳這步的說明
function bgApply(st,f,t){
  const b=st.b,p=b[f],q=b[t];let note='';
  b[t]=p;b[f]=null;
  if(p.s==='A'){p.m=1;const[dx,dy]=bgDir(p.n),x=t%BG_W,y=(t/BG_W)|0,end=!bgIn(x+dx,y+dy);
    if((p.t==='p'||p.t==='o')&&end){b[t]={...p,t:p.t==='o'?'e':BG_KIND[p.n]==='co'?'f':'q'};note='升變'+BG_CN[b[t].t];}   // 走到地圖盡頭升變：俄國王前兵變赫爾吉、信使棋的兵變小后、其餘變皇后
    else if(bgJP(p)&&BG_JPUP[p.t]&&(bgPalm(x,y)||end)){b[t]={...p,t:BG_JPUP[p.t]};note='升變'+BG_CN[b[t].t];}}   // 日本：走進清軍腹地（或走到盡頭）升變
  if(q&&q.s==='A'&&q.t==='k'){st.dead[q.n]=true;for(let i=0;i<b.length;i++)if(b[i]&&b[i].s==='A'&&b[i].n===q.n)b[i]=null;note=BG_NATIONS[q.n].n+'國王被吃，整隊撤退';}
  st.last={f,t};if(st.rr)bgRoundNext(st,p);else st.turn=st.turn==='Q'?'A':'Q';st.seq++;
  const gens=b.filter(x=>x&&x.s==='Q'&&(x.t==='X'||x.t==='Y')).length,kings=st.dead.filter(d=>!d).length;
  if(!gens)st.over={win:'A',why:'慈、禧都被吃了'};
  else if(!kings)st.over={win:'Q',why:'八國的國王全部被吃了'};
  else if(!bgAll(st,st.turn,false).length)st.over={win:st.turn==='Q'?'A':'Q',why:(st.turn==='Q'?'清軍':'聯軍')+'沒有棋可以走'};
  return{p,q,note};}
function bgClone(st){const c={b:st.b.map(p=>p&&{...p}),turn:st.turn,over:st.over,last:st.last,seq:st.seq,dead:st.dead.slice(),log:st.log};if(st.rr){c.rr=1;c.ql=st.ql;c.mv=st.mv.slice();}return c;}
// 電腦：每一步看自己吃到什麼、對方下一步最多能吃回什麼，再加一點往前推進的分數
const BG_V={k:0,q:9,r:5,b:3.2,n:3,p:1,o:1.3,e:12,c:3.2,m:3,f:1.5,w:1.2,a:1.5,g:2.6,s:2.3,j:1.6,l:1.8,u:1,d:7,y:5.2,t:2.6,R:9,H:4,C:4.5,P:1,A:2,E:2,G:1.6,X:30,Y:30};
function bgNationVal(st,n){let v=12;for(const p of st.b)if(p&&p.s==='A'&&p.n===n&&p.t!=='k')v+=BG_V[p.t];return v;}
function bgVal(st,p,i){if(p.s==='A')return p.t==='k'?bgNationVal(st,p.n):BG_V[p.t];
  if(p.t==='X'||p.t==='Y'){const g=st.b.filter(x=>x&&x.s==='Q'&&(x.t==='X'||x.t==='Y')).length;return g<=1?500:30;}
  if(p.t==='P'&&((i/BG_W)|0)<=BG_RIVER)return 2;return BG_V[p.t];}
function bgThreat(st,side){let best=0;for(const[f,t]of bgAll(st,side,true)){const q=st.b[t];if(q){const v=BGR.val(st,q,t);if(v>best)best=v;}}return best;}
function bgTargets(st,side){const out=[];st.b.forEach((p,i)=>{if(p&&p.s!==side&&(p.t==='X'||p.t==='Y'||p.t==='k'))out.push(i);});return out;}
const bgDist=(a,b2)=>Math.abs(a%BG_W-b2%BG_W)+Math.abs(((a/BG_W)|0)-((b2/BG_W)|0));
// 目前戰役的規則掛鉤：apply 走一步、val 棋子價值、targets 對方的「王」、still 不加推進分的棋、king 國王（動了扣一點分）
const BG_RULES={apply:bgApply,val:bgVal,targets:bgTargets,still:p=>p.t==='X'||p.t==='Y'||p.t==='k'||p.t==='A'||p.t==='E',king:p=>p.t==='k'};
let BGR=BG_RULES;
function bgAI(st,opts){
  const side=st.turn,moves=bgAll(st,side,false).filter(([f])=>!opts||!opts.only||opts.only(st.b[f]));if(!moves.length)return null;
  const tg=BGR.targets(st,side),near=i=>tg.length?Math.min(...tg.map(t=>bgDist(i,t))):0;
  let best=null,bs=-1e9;
  for(const[f,t]of moves){const p=st.b[f],q=st.b[t];let s=q?BGR.val(st,q,t)*1.02:0;
    const c=bgClone(st);BGR.apply(c,f,t);
    if(c.over&&c.over.win===side)return[f,t];
    if(st.rr&&c.turn===side){s-=0.9*bgThreat(c,side==='Q'?'A':'Q');s+=0.3*bgThreat(c,side);}   // 新輪流方式：同一方還要再走，扣對方下一輪能吃的、加一點自己接著能吃的
    else s-=0.9*bgThreat(c,c.turn);
    if(!BGR.still(p))s+=(near(f)-near(t))*0.06;
    if(BGR.king(p))s-=0.3;
    s+=Math.random()*0.05;
    if(s>bs){bs=s;best=[f,t];}}
  return best;}
if(typeof module!=='undefined')module.exports={bgNew,bgMoves,bgAll,bgApply,bgAI,bgIn,bgClone,bgRoundLeft,BG_RR_Q,BG_W,BG_H,BG_VALID,bgIdx,BG_NATIONS,BG_OWN,BG_KINDS};
